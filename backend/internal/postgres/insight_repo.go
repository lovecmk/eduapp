package postgres

import (
	"context"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// PostgreSQL 분석 읽기 — ports.InsightRepository 구현.
//
// 집계는 전부 SQL 안에서 끝낸다. 행을 끌어와 Go 에서 합치면 데이터가 늘수록
// 네트워크로 전부 실어 나르게 되고, 인덱스도 못 쓴다.

// masteredBox 는 '충분히 익혔다'고 보는 기억 상자 기준(앱의 간격반복과 같은 값).
const masteredBox = 4

// maxUserDayRows 는 ActiveUserDays 가 한 번에 돌려주는 최대 행 수.
//
// 여기만 원재료를 그대로 주기 때문에 상한이 필요하다. 넘치면 오래된 날부터
// 잘리도록 최신순으로 뽑는다 — 리텐션·습관 판정은 모두 '최근'을 본다.
const maxUserDayRows = 500_000

func (r *UserDataRepo) CardLearning(ctx context.Context) ([]ports.CardLearningStat, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT card_id,
		       COUNT(*)                                   AS learners,
		       COALESCE(SUM(reps), 0)                     AS reps,
		       COALESCE(SUM(lapses), 0)                   AS lapses,
		       COALESCE(AVG(ease), 0)                     AS avg_ease,
		       COALESCE(AVG(box), 0)                      AS avg_box,
		       COUNT(*) FILTER (WHERE box >= $1)          AS mastered
		FROM srs_state
		GROUP BY card_id
		ORDER BY card_id`, masteredBox)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ports.CardLearningStat{}
	for rows.Next() {
		var s ports.CardLearningStat
		if err := rows.Scan(&s.CardID, &s.Learners, &s.Reps, &s.Lapses,
			&s.AvgEase, &s.AvgBox, &s.Mastered); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *UserDataRepo) LearnerLearning(ctx context.Context) ([]ports.LearnerStat, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT user_id,
		       COUNT(*)                                    AS cards,
		       COALESCE(SUM(reps), 0)                      AS reps,
		       COALESCE(SUM(lapses), 0)                    AS lapses,
		       COALESCE(AVG(box), 0)                       AS avg_box,
		       COALESCE(MAX(last_reviewed_at), 'epoch')    AS last_seen
		FROM srs_state
		GROUP BY user_id
		ORDER BY user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ports.LearnerStat{}
	for rows.Next() {
		var s ports.LearnerStat
		if err := rows.Scan(&s.UserID, &s.Cards, &s.Reps, &s.Lapses, &s.AvgBox, &s.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *UserDataRepo) ActiveUserDays(ctx context.Context) ([]ports.UserDay, error) {
	// DISTINCT 를 쓰는 이유: learn_history 는 (user, day, card) 가 기본키라
	// 하루에 5장을 공부하면 5줄이다. 여기서 필요한 것은 '그날 활동했다'는 사실뿐이다.
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT user_id, day_key
		FROM learn_history
		ORDER BY user_id, day_key
		LIMIT $1`, maxUserDayRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ports.UserDay{}
	for rows.Next() {
		var d ports.UserDay
		if err := rows.Scan(&d.UserID, &d.DayKey); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
