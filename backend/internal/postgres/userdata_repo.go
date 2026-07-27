package postgres

import (
	"context"
	"time"

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
		`INSERT INTO reports (id, user_id, card_id, reason, detail, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, card_id, reason) DO NOTHING`,
		rep.ID, rep.UserID, rep.CardID, rep.Reason, rep.Detail, rep.CreatedAt)
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

func (r *UserDataRepo) ListReports(ctx context.Context, limit int) ([]domain.Report, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, card_id, reason, detail, created_at FROM reports
		 ORDER BY created_at DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Report{}
	for rows.Next() {
		var rep domain.Report
		if err := rows.Scan(&rep.ID, &rep.UserID, &rep.CardID, &rep.Reason, &rep.Detail, &rep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	return out, rows.Err()
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
