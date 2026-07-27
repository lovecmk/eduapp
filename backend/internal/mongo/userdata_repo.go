package mongo

import (
	"context"
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

func (r *UserDataRepo) ListReports(ctx context.Context, limit int) ([]domain.Report, error) {
	if limit <= 0 {
		limit = 100
	}
	cur, err := r.reports.Find(ctx, bson.M{},
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
