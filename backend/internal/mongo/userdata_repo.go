package mongo

import (
	"context"
	"errors"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserDataRepo 는 ports.UserDataRepository 의 MongoDB 구현.
type UserDataRepo struct {
	srs        *mongo.Collection
	history    *mongo.Collection
	attendance *mongo.Collection
	engagement *mongo.Collection
	reports    *mongo.Collection
	notifs     *mongo.Collection
	learning   *mongo.Collection
	plans      *mongo.Collection
}

// NewUserDataRepo 는 개인 데이터 어댑터를 만든다.
func NewUserDataRepo(db *mongo.Database) *UserDataRepo {
	return &UserDataRepo{
		srs:        db.Collection("srs_state"),
		history:    db.Collection("learn_history"),
		attendance: db.Collection("attendance"),
		engagement: db.Collection("engagement"),
		reports:    db.Collection("reports"),
		notifs:     db.Collection("notifications"),
		learning:   db.Collection("learning_daily"),
		plans:      db.Collection("daily_assignment"),
	}
}

// EnsureIndexes 는 "하루 1회", "같은 신고는 한 건" 같은 규칙을 실제로 강제한다.
// 애플리케이션 코드만으로는 동시 요청을 막을 수 없다.
func (r *UserDataRepo) EnsureIndexes(ctx context.Context) error {
	specs := []struct {
		col  *mongo.Collection
		keys bson.D
		name string
	}{
		{r.srs, bson.D{{Key: "user_id", Value: 1}, {Key: "card_id", Value: 1}}, "srs_user_card"},
		{r.history, bson.D{{Key: "user_id", Value: 1}, {Key: "day_key", Value: 1}, {Key: "card_id", Value: 1}}, "history_unique"},
		{r.attendance, bson.D{{Key: "user_id", Value: 1}, {Key: "day_key", Value: 1}}, "attendance_daily"},
		{r.engagement, bson.D{{Key: "user_id", Value: 1}, {Key: "card_id", Value: 1}, {Key: "kind", Value: 1}}, "engagement_unique"},
		{r.reports, bson.D{{Key: "user_id", Value: 1}, {Key: "card_id", Value: 1}, {Key: "reason", Value: 1}}, "report_unique"},
		// 하루 상한도 규칙이다 — (사용자, 날짜)가 두 줄이 되면 누계가 갈라져
		// 어느 쪽을 읽느냐에 따라 상한이 달라진다.
		{r.learning, bson.D{{Key: "user_id", Value: 1}, {Key: "day_key", Value: 1}}, "learning_daily_unique"},
		// 하루에 한 벌 — 두 기기가 동시에 앱을 열어도 오늘의 목록이 갈리지 않게 한다.
		{r.plans, bson.D{{Key: "user_id", Value: 1}, {Key: "day_key", Value: 1}}, "daily_assignment_unique"},
	}
	for _, s := range specs {
		if _, err := s.col.Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys:    s.keys,
			Options: options.Index().SetName(s.name).SetUnique(true),
		}); err != nil {
			return err
		}
	}
	_, err := r.notifs.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}},
		Options: options.Index().SetName("notif_user_recent"),
	})
	return err
}

func (r *UserDataRepo) LoadSync(ctx context.Context, userID string) (domain.SyncSnapshot, error) {
	out := domain.SyncSnapshot{
		Cards:      map[string]domain.SrsState{},
		History:    map[string][]string{},
		Attendance: map[string]time.Time{},
	}
	var newest time.Time

	cur, err := r.srs.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return out, err
	}
	var states []struct {
		domain.SrsState `bson:",inline"`
		UpdatedAt       time.Time `bson:"updated_at"`
	}
	if err := cur.All(ctx, &states); err != nil {
		return out, err
	}
	for _, s := range states {
		out.Cards[s.CardID] = s.SrsState
		if s.UpdatedAt.After(newest) {
			newest = s.UpdatedAt
		}
	}

	hCur, err := r.history.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return out, err
	}
	var hist []struct {
		DayKey string `bson:"day_key"`
		CardID string `bson:"card_id"`
	}
	if err := hCur.All(ctx, &hist); err != nil {
		return out, err
	}
	for _, h := range hist {
		out.History[h.DayKey] = append(out.History[h.DayKey], h.CardID)
	}
	// 순서를 고정한다 — 저장소 순서에 기대면 같은 요청이 매번 다른 순서로 답한다.
	for day := range out.History {
		sort.Strings(out.History[day])
	}

	aCur, err := r.attendance.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return out, err
	}
	var atts []struct {
		DayKey   string    `bson:"day_key"`
		MarkedAt time.Time `bson:"marked_at"`
	}
	if err := aCur.All(ctx, &atts); err != nil {
		return out, err
	}
	for _, a := range atts {
		out.Attendance[a.DayKey] = a.MarkedAt
		if a.MarkedAt.After(newest) {
			newest = a.MarkedAt
		}
	}

	if !newest.IsZero() {
		out.UpdatedAt = &newest
	}
	return out, nil
}

func (r *UserDataRepo) SaveSrs(ctx context.Context, s domain.SrsState, day string) error {
	if _, err := r.srs.UpdateOne(ctx,
		bson.M{"user_id": s.UserID, "card_id": s.CardID},
		bson.M{"$set": bson.M{
			"user_id": s.UserID, "card_id": s.CardID,
			"box": s.Box, "ease": s.Ease, "due_at": s.DueAt,
			"reps": s.Reps, "lapses": s.Lapses,
			"last_grade": s.LastGrade, "last_reviewed_at": s.LastReviewedAt,
			"updated_at": time.Now(),
		}},
		options.Update().SetUpsert(true),
	); err != nil {
		return err
	}
	if day == "" {
		return nil
	}
	// 유니크 인덱스 덕에 같은 날 같은 카드는 한 줄만 남는다.
	_, err := r.history.UpdateOne(ctx,
		bson.M{"user_id": s.UserID, "day_key": day, "card_id": s.CardID},
		bson.M{"$setOnInsert": bson.M{"user_id": s.UserID, "day_key": day, "card_id": s.CardID}},
		options.Update().SetUpsert(true),
	)
	return ignoreDuplicate(err)
}

func (r *UserDataRepo) MarkAttendance(ctx context.Context, userID, day string, at time.Time) error {
	// $setOnInsert 만 쓴다 — 이미 찍힌 날의 시각을 덮어쓰면 재전송 때마다
	// 체크인 시각이 뒤로 밀려 "몇 시에 시작했나"가 왜곡된다.
	_, err := r.attendance.UpdateOne(ctx,
		bson.M{"user_id": userID, "day_key": day},
		bson.M{"$setOnInsert": bson.M{"user_id": userID, "day_key": day, "marked_at": at}},
		options.Update().SetUpsert(true),
	)
	return ignoreDuplicate(err)
}

func (r *UserDataRepo) Engagement(ctx context.Context, userID string) (domain.EngagementSnapshot, error) {
	out := domain.EngagementSnapshot{LikedIDs: []string{}, BookmarkedIDs: []string{}}
	cur, err := r.engagement.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return out, err
	}
	var rows []struct {
		CardID string `bson:"card_id"`
		Kind   string `bson:"kind"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return out, err
	}
	for _, e := range rows {
		switch domain.EngagementKind(e.Kind) {
		case domain.Liked:
			out.LikedIDs = append(out.LikedIDs, e.CardID)
		case domain.Bookmarked:
			out.BookmarkedIDs = append(out.BookmarkedIDs, e.CardID)
		}
	}
	sort.Strings(out.LikedIDs)
	sort.Strings(out.BookmarkedIDs)
	return out, nil
}

func (r *UserDataRepo) SetEngagement(ctx context.Context, userID, cardID string, kind domain.EngagementKind, on bool) error {
	filter := bson.M{"user_id": userID, "card_id": cardID, "kind": string(kind)}
	if !on {
		_, err := r.engagement.DeleteOne(ctx, filter)
		return err
	}
	_, err := r.engagement.UpdateOne(ctx, filter,
		bson.M{"$setOnInsert": filter}, options.Update().SetUpsert(true))
	return ignoreDuplicate(err)
}

func (r *UserDataRepo) AddReport(ctx context.Context, rep domain.Report) error {
	_, err := r.reports.UpdateOne(ctx,
		bson.M{"user_id": rep.UserID, "card_id": rep.CardID, "reason": rep.Reason},
		bson.M{"$setOnInsert": bson.M{
			"_id": rep.ID, "user_id": rep.UserID, "card_id": rep.CardID,
			"reason": rep.Reason, "detail": rep.Detail, "created_at": rep.CreatedAt,
			"status_cd": string(rep.Status()),
		}},
		options.Update().SetUpsert(true),
	)
	return ignoreDuplicate(err)
}

func (r *UserDataRepo) ReportedCardIDs(ctx context.Context, userID string) ([]string, error) {
	raw, err := r.reports.Distinct(ctx, "card_id", bson.M{"user_id": userID})
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (r *UserDataRepo) ListReports(ctx context.Context, q ports.ReportQuery) ([]domain.Report, error) {
	limit := q.Limit
	if limit <= 0 {
		limit = 100
	}
	filter := bson.M{}
	if q.Status != "" {
		filter["status_cd"] = statusFilter(q.Status)
	}
	if q.CardID != "" {
		filter["card_id"] = q.CardID
	}
	cur, err := r.reports.Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
			SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	out := []domain.Report{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// statusFilter 는 처리 단계 조건을 만든다.
// OPEN 은 상태가 없던 시절의 문서(필드 자체가 없거나 빈 값)까지 포함해야 한다 —
// 그러지 않으면 예전 신고가 어느 칩에도 잡히지 않고 목록에서 사라진다.
func statusFilter(s domain.ReportStatus) any {
	if s != domain.ReportOpen {
		return string(s)
	}
	return bson.M{"$in": []any{string(domain.ReportOpen), "", nil}}
}

func (r *UserDataRepo) CountReportsByStatus(ctx context.Context) (map[string]int64, error) {
	out := map[string]int64{
		string(domain.ReportOpen): 0, string(domain.ReportDoing): 0,
		string(domain.ReportResolved): 0, string(domain.ReportRejected): 0,
	}
	for st := range out {
		n, err := r.reports.CountDocuments(ctx, bson.M{"status_cd": statusFilter(domain.ReportStatus(st))})
		if err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, nil
}

func (r *UserDataRepo) UpdateReport(ctx context.Context, id string, u ports.ReportUpdate) (*domain.Report, error) {
	var out domain.Report
	// After 로 갱신된 문서를 그대로 받는다 — 갱신 후 다시 조회하면 그 사이의
	// 다른 변경을 '내가 만든 결과'로 돌려주게 된다.
	err := r.reports.FindOneAndUpdate(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{
			"status_cd": string(u.Status), "resolution_txt": u.Resolution,
			"handler_id": u.HandlerID, "handler_name": u.HandlerName, "handled_at": u.HandledAt,
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ports.ErrNotFound{Entity: "report"}
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *UserDataRepo) LoadAssignment(ctx context.Context, userID, day string) (*domain.DailyAssignment, error) {
	var a domain.DailyAssignment
	err := r.plans.FindOne(ctx, bson.M{"user_id": userID, "day_key": day}).Decode(&a)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil // 오늘 아직 안 열어 봤다 — 오류가 아니다
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *UserDataRepo) SaveAssignment(ctx context.Context, a domain.DailyAssignment) (*domain.DailyAssignment, error) {
	// $setOnInsert 만 쓴다 — 먼저 저장된 것이 그날의 답이다. $set 으로 두면
	// 나중에 연 기기가 목록을 덮어써, 먼저 화면에 뜬 것과 어긋난다.
	var out domain.DailyAssignment
	err := r.plans.FindOneAndUpdate(ctx,
		bson.M{"user_id": a.UserID, "day_key": a.DayKey},
		bson.M{"$setOnInsert": bson.M{
			"user_id": a.UserID, "day_key": a.DayKey, "card_ids": a.CardIDs,
			"difficulty_cd": string(a.DifficultyCd), "target_count": a.TargetCount,
			"created_at": a.CreatedAt,
		}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&out)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// 두 요청이 같은 순간에 들어왔다 — 상대가 넣은 것을 읽어 돌려준다.
			return r.LoadAssignment(ctx, a.UserID, a.DayKey)
		}
		return nil, err
	}
	return &out, nil
}

func (r *UserDataRepo) LearningCount(ctx context.Context, userID, day string) (int, error) {
	var row struct {
		NewCount int `bson:"new_count"`
	}
	err := r.learning.FindOne(ctx, bson.M{"user_id": userID, "day_key": day}).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return 0, nil // 오늘 아직 학습하지 않았다 — 오류가 아니다
	}
	return row.NewCount, err
}

func (r *UserDataRepo) AddLearningCount(ctx context.Context, userID, day string, n int) (int, error) {
	if n <= 0 {
		return r.LearningCount(ctx, userID, day)
	}
	var row struct {
		NewCount int `bson:"new_count"`
	}
	// $inc 로 저장소가 더하게 한다 — 읽고 더해서 쓰면 동시 요청 하나가 조용히 사라진다.
	err := r.learning.FindOneAndUpdate(ctx,
		bson.M{"user_id": userID, "day_key": day},
		bson.M{
			"$inc": bson.M{"new_count": n},
			"$set": bson.M{"user_id": userID, "day_key": day, "updated_at": time.Now()},
		},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&row)
	return row.NewCount, err
}

func (r *UserDataRepo) Notifications(ctx context.Context, userID string) ([]domain.Notification, error) {
	cur, err := r.notifs.Find(ctx, bson.M{"user_id": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Notification{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *UserDataRepo) MarkNotificationRead(ctx context.Context, userID, id string) error {
	// user_id 를 조건에 반드시 넣는다 — 없으면 남의 알림 id 로 읽음 처리가 된다.
	_, err := r.notifs.UpdateOne(ctx,
		bson.M{"_id": id, "user_id": userID},
		bson.M{"$set": bson.M{"read_yn": true}})
	return err
}

func (r *UserDataRepo) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	_, err := r.notifs.UpdateMany(ctx,
		bson.M{"user_id": userID, "read_yn": false},
		bson.M{"$set": bson.M{"read_yn": true}})
	return err
}

// ignoreDuplicate 는 upsert 경합으로 생기는 중복 키 오류를 성공으로 본다.
// 두 요청이 동시에 같은 것을 넣으려 한 상황이고, 결과(한 건 존재)는 원하던 그대로다.
func ignoreDuplicate(err error) error {
	if err != nil && mongo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}

var _ ports.UserDataRepository = (*UserDataRepo)(nil)

func (r *UserDataRepo) AddNotifications(ctx context.Context, list []domain.Notification) error {
	if len(list) == 0 {
		return nil
	}
	docs := make([]any, 0, len(list))
	for _, n := range list {
		docs = append(docs, n)
	}
	// ordered=false — 한 건이 중복 키로 실패해도 나머지는 계속 넣는다.
	// 공지는 "일부라도 최대한 전달"이 맞다.
	_, err := r.notifs.InsertMany(ctx, docs, options.InsertMany().SetOrdered(false))
	return ignoreDuplicate(err)
}
