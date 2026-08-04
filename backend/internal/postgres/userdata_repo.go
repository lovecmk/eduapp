package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserDataRepo 는 ports.UserDataRepository 의 PostgreSQL 구현.
type UserDataRepo struct{ pool *pgxpool.Pool }

// NewUserDataRepo 는 개인 데이터 어댑터를 만든다.
func NewUserDataRepo(pool *pgxpool.Pool) *UserDataRepo { return &UserDataRepo{pool: pool} }

func (r *UserDataRepo) LoadSync(ctx context.Context, userID string) (domain.SyncSnapshot, error) {
	out := domain.SyncSnapshot{
		Cards:      map[string]domain.SrsState{},
		History:    map[string][]string{},
		Attendance: map[string]time.Time{},
	}

	rows, err := r.pool.Query(ctx,
		`SELECT card_id, box, ease, due_at, reps, lapses, last_grade, last_reviewed_at, updated_at
		 FROM srs_state WHERE user_id=$1`, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	var newest time.Time
	for rows.Next() {
		s := domain.SrsState{UserID: userID}
		var updated time.Time
		if err := rows.Scan(&s.CardID, &s.Box, &s.Ease, &s.DueAt, &s.Reps, &s.Lapses,
			&s.LastGrade, &s.LastReviewedAt, &updated); err != nil {
			return out, err
		}
		out.Cards[s.CardID] = s
		if updated.After(newest) {
			newest = updated
		}
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	hRows, err := r.pool.Query(ctx,
		`SELECT day_key, card_id FROM learn_history WHERE user_id=$1 ORDER BY day_key, card_id`, userID)
	if err != nil {
		return out, err
	}
	defer hRows.Close()
	for hRows.Next() {
		var day, cardID string
		if err := hRows.Scan(&day, &cardID); err != nil {
			return out, err
		}
		out.History[day] = append(out.History[day], cardID)
	}
	if err := hRows.Err(); err != nil {
		return out, err
	}

	aRows, err := r.pool.Query(ctx,
		`SELECT day_key, marked_at FROM attendance WHERE user_id=$1`, userID)
	if err != nil {
		return out, err
	}
	defer aRows.Close()
	for aRows.Next() {
		var day string
		var at time.Time
		if err := aRows.Scan(&day, &at); err != nil {
			return out, err
		}
		out.Attendance[day] = at
		if at.After(newest) {
			newest = at
		}
	}
	if err := aRows.Err(); err != nil {
		return out, err
	}

	if !newest.IsZero() {
		out.UpdatedAt = &newest
	}
	return out, nil
}

func (r *UserDataRepo) SaveSrs(ctx context.Context, s domain.SrsState, day string) error {
	// 한 트랜잭션으로 묶는다 — SRS 는 저장됐는데 이력이 빠지면
	// "복습은 밀렸는데 그날 공부한 기록은 없는" 어긋난 상태가 남는다.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`INSERT INTO srs_state (user_id, card_id, box, ease, due_at, reps, lapses, last_grade, last_reviewed_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
		 ON CONFLICT (user_id, card_id) DO UPDATE SET
		   box=EXCLUDED.box, ease=EXCLUDED.ease, due_at=EXCLUDED.due_at,
		   reps=EXCLUDED.reps, lapses=EXCLUDED.lapses, last_grade=EXCLUDED.last_grade,
		   last_reviewed_at=EXCLUDED.last_reviewed_at, updated_at=now()`,
		s.UserID, s.CardID, s.Box, s.Ease, s.DueAt, s.Reps, s.Lapses, s.LastGrade, s.LastReviewedAt); err != nil {
		return err
	}
	if day != "" {
		// 같은 날 같은 카드는 한 번만 — 기본키가 그것을 강제한다.
		if _, err := tx.Exec(ctx,
			`INSERT INTO learn_history (user_id, day_key, card_id) VALUES ($1,$2,$3)
			 ON CONFLICT DO NOTHING`, s.UserID, day, s.CardID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *UserDataRepo) MarkAttendance(ctx context.Context, userID, day string, at time.Time) error {
	// DO NOTHING 이 핵심이다. DO UPDATE 로 두면 재전송할 때마다 체크인 시각이
	// 뒤로 밀려 "몇 시에 학습을 시작했나"가 왜곡된다.
	_, err := r.pool.Exec(ctx,
		`INSERT INTO attendance (user_id, day_key, marked_at) VALUES ($1,$2,$3)
		 ON CONFLICT (user_id, day_key) DO NOTHING`, userID, day, at)
	return err
}

func (r *UserDataRepo) Engagement(ctx context.Context, userID string) (domain.EngagementSnapshot, error) {
	out := domain.EngagementSnapshot{LikedIDs: []string{}, BookmarkedIDs: []string{}}
	rows, err := r.pool.Query(ctx,
		`SELECT card_id, kind FROM engagement WHERE user_id=$1 ORDER BY card_id`, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var cardID, kind string
		if err := rows.Scan(&cardID, &kind); err != nil {
			return out, err
		}
		switch domain.EngagementKind(kind) {
		case domain.Liked:
			out.LikedIDs = append(out.LikedIDs, cardID)
		case domain.Bookmarked:
			out.BookmarkedIDs = append(out.BookmarkedIDs, cardID)
		}
	}
	return out, rows.Err()
}

func (r *UserDataRepo) SetEngagement(ctx context.Context, userID, cardID string, kind domain.EngagementKind, on bool) error {
	if !on {
		_, err := r.pool.Exec(ctx,
			`DELETE FROM engagement WHERE user_id=$1 AND card_id=$2 AND kind=$3`, userID, cardID, kind)
		return err
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO engagement (user_id, card_id, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
		userID, cardID, kind)
	return err
}

func (r *UserDataRepo) AddReport(ctx context.Context, rep domain.Report) error {
	// (user, card, reason) 유니크 — 재전송으로 같은 신고가 여러 건 쌓이지 않게 한다.
	_, err := r.pool.Exec(ctx,
		`INSERT INTO reports (id, user_id, card_id, reason, detail, created_at, status_cd)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, card_id, reason) DO NOTHING`,
		rep.ID, rep.UserID, rep.CardID, rep.Reason, rep.Detail, rep.CreatedAt, string(rep.Status()))
	return err
}

func (r *UserDataRepo) ReportedCardIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT card_id FROM reports WHERE user_id=$1 ORDER BY card_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// reportCols 는 신고 조회의 열 목록. 한 곳에 모아 두어 스캔 순서와 어긋나지 않게 한다.
const reportCols = `id, user_id, card_id, reason, detail, created_at,
	COALESCE(NULLIF(status_cd, ''), 'OPEN'), resolution_txt, handler_id, handler_name, handled_at`

func scanReport(row pgx.Row) (domain.Report, error) {
	var rep domain.Report
	err := row.Scan(&rep.ID, &rep.UserID, &rep.CardID, &rep.Reason, &rep.Detail, &rep.CreatedAt,
		&rep.StatusCd, &rep.ResolutionTxt, &rep.HandlerID, &rep.HandlerName, &rep.HandledAt)
	return rep, err
}

func (r *UserDataRepo) ListReports(ctx context.Context, q ports.ReportQuery) ([]domain.Report, error) {
	limit := q.Limit
	if limit <= 0 {
		limit = 100
	}
	// 조건은 반드시 placeholder 로 넘긴다(문자열 결합은 인젝션 통로가 된다).
	// $1/$2 에 빈 값을 주면 그 조건은 통과하도록 써, 분기마다 SQL 을 새로 쓰지 않는다.
	rows, err := r.pool.Query(ctx,
		`SELECT `+reportCols+` FROM reports
		 WHERE ($1 = '' OR COALESCE(NULLIF(status_cd, ''), 'OPEN') = $1)
		   AND ($2 = '' OR card_id = $2)
		 ORDER BY created_at DESC, id DESC LIMIT $3`,
		string(q.Status), q.CardID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Report{}
	for rows.Next() {
		rep, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	return out, rows.Err()
}

func (r *UserDataRepo) CountReportsByStatus(ctx context.Context) (map[string]int64, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT COALESCE(NULLIF(status_cd, ''), 'OPEN') AS st, COUNT(*) FROM reports GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{
		string(domain.ReportOpen): 0, string(domain.ReportDoing): 0,
		string(domain.ReportResolved): 0, string(domain.ReportRejected): 0,
	}
	for rows.Next() {
		var st string
		var n int64
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}

func (r *UserDataRepo) UpdateReport(ctx context.Context, id string, u ports.ReportUpdate) (*domain.Report, error) {
	// RETURNING 으로 갱신된 행을 그대로 받는다 — 갱신 후 다시 SELECT 하면
	// 그 사이 다른 관리자가 또 바꾼 값을 '내가 만든 결과'로 돌려주게 된다.
	rep, err := scanReport(r.pool.QueryRow(ctx,
		`UPDATE reports SET status_cd=$2, resolution_txt=$3, handler_id=$4, handler_name=$5, handled_at=$6
		 WHERE id=$1 RETURNING `+reportCols,
		id, string(u.Status), u.Resolution, u.HandlerID, u.HandlerName, u.HandledAt))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ports.ErrNotFound{Entity: "report"}
	}
	if err != nil {
		return nil, err
	}
	return &rep, nil
}

func (r *UserDataRepo) LoadAssignment(ctx context.Context, userID, day string) (*domain.DailyAssignment, error) {
	var a domain.DailyAssignment
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, day_key, card_ids, difficulty_cd, target_count, created_at
		 FROM daily_assignment WHERE user_id=$1 AND day_key=$2`, userID, day).
		Scan(&a.UserID, &a.DayKey, &a.CardIDs, &a.DifficultyCd, &a.TargetCount, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // 오늘 아직 안 열어 봤다 — 오류가 아니다
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *UserDataRepo) SaveAssignment(ctx context.Context, a domain.DailyAssignment) (*domain.DailyAssignment, error) {
	// DO NOTHING 이 핵심이다. 두 기기가 동시에 앱을 열면 둘 다 편성을 만들어 넣는데,
	// 나중 것이 이기면 먼저 화면에 뜬 목록과 저장된 것이 어긋난다.
	// RETURNING 은 충돌 시 아무것도 주지 않으므로, 넣은 뒤 항상 다시 읽는다.
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO daily_assignment (user_id, day_key, card_ids, difficulty_cd, target_count, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, day_key) DO NOTHING`,
		a.UserID, a.DayKey, a.CardIDs, string(a.DifficultyCd), a.TargetCount, a.CreatedAt); err != nil {
		return nil, err
	}
	stored, err := r.LoadAssignment(ctx, a.UserID, a.DayKey)
	if err != nil {
		return nil, err
	}
	if stored == nil {
		// 넣자마자 사라졌다 — 있을 수 없는 일이지만, 여기서 nil 을 흘리면
		// 호출부가 nil 역참조로 죽는다. 만든 값을 그대로 돌려준다.
		return &a, nil
	}
	return stored, nil
}

func (r *UserDataRepo) LearningCount(ctx context.Context, userID, day string) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT new_count FROM learning_daily WHERE user_id=$1 AND day_key=$2`, userID, day).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil // 오늘 아직 학습하지 않았다 — 오류가 아니다
	}
	return n, err
}

func (r *UserDataRepo) AddLearningCount(ctx context.Context, userID, day string, n int) (int, error) {
	if n <= 0 {
		return r.LearningCount(ctx, userID, day)
	}
	// 더하기를 SQL 안에서 한다 — 읽고 더해서 쓰면 동시 요청 하나가 조용히 사라진다.
	var total int
	err := r.pool.QueryRow(ctx,
		`INSERT INTO learning_daily (user_id, day_key, new_count, updated_at) VALUES ($1,$2,$3, now())
		 ON CONFLICT (user_id, day_key) DO UPDATE
		   SET new_count = learning_daily.new_count + EXCLUDED.new_count, updated_at = now()
		 RETURNING new_count`, userID, day, n).Scan(&total)
	return total, err
}

func (r *UserDataRepo) Notifications(ctx context.Context, userID string) ([]domain.Notification, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, type_cd, title_txt, desc_txt, category_nm, created_at, read_yn
		 FROM notifications WHERE user_id=$1 ORDER BY created_at DESC, id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Notification{}
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.TypeCd, &n.TitleTxt, &n.DescTxt,
			&n.CategoryNm, &n.CreatedAt, &n.ReadYn); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *UserDataRepo) MarkNotificationRead(ctx context.Context, userID, id string) error {
	// user_id 를 조건에 반드시 넣는다 — 없으면 남의 알림 id 를 보내 읽음 처리할 수 있다.
	_, err := r.pool.Exec(ctx,
		`UPDATE notifications SET read_yn=TRUE WHERE user_id=$1 AND id=$2`, userID, id)
	return err
}

func (r *UserDataRepo) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE notifications SET read_yn=TRUE WHERE user_id=$1 AND read_yn=FALSE`, userID)
	return err
}

var _ ports.UserDataRepository = (*UserDataRepo)(nil)

func (r *UserDataRepo) AddNotifications(ctx context.Context, list []domain.Notification) error {
	if len(list) == 0 {
		return nil
	}
	// 한 트랜잭션으로 넣는다 — 공지가 절반만 전달되면 "나만 못 받았다"가 된다.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, n := range list {
		if _, err := tx.Exec(ctx,
			`INSERT INTO notifications (id, user_id, type_cd, title_txt, desc_txt, category_nm, created_at, read_yn)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) ON CONFLICT (id) DO NOTHING`,
			n.ID, n.UserID, n.TypeCd, n.TitleTxt, n.DescTxt, n.CategoryNm, n.CreatedAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
