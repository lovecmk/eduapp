package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CardRepo 는 ports.CardRepository 의 PostgreSQL 구현.
// 콘텐츠(cards)와 개인 진행(progress)을 별도 테이블로 분리해,
// 같은 카드를 여러 사용자가 공유하면서 각자의 진행만 갱신한다(Mongo 구현과 동형).
type CardRepo struct{ pool *pgxpool.Pool }

// NewCardRepo 는 cards/progress 테이블 어댑터를 만든다.
func NewCardRepo(pool *pgxpool.Pool) *CardRepo { return &CardRepo{pool: pool} }

const cardCols = `id, category_cd, sub_category_nm, topic_nm, keywords, title_txt, study_seconds,
	situation_txt, question_txt, image_url, principle_txt, process_txt, fire_triangle_txt,
	conclusion_txt, answer_image_url, source_txt, difficulty_cd, card_type_cd, choices, answer_index`

func scanCard(rows pgx.Rows) (domain.Card, error) {
	var c domain.Card
	err := rows.Scan(&c.ID, &c.CategoryCd, &c.SubCategoryNm, &c.TopicNm, &c.Keywords, &c.TitleTxt,
		&c.StudySeconds, &c.SituationTxt, &c.QuestionTxt, &c.ImageURL, &c.PrincipleTxt, &c.ProcessTxt,
		&c.FireTriangle, &c.ConclusionTxt, &c.AnswerImageURL, &c.SourceTxt, &c.DifficultyCd,
		&c.CardTypeCd, &c.Choices, &c.AnswerIndex)
	return c, err
}

func (r *CardRepo) AllCards(ctx context.Context) ([]domain.Card, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+cardCols+` FROM cards`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Card
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CardRepo) CountCards(ctx context.Context) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM cards`).Scan(&n)
	return n, err
}

func (r *CardRepo) InsertCards(ctx context.Context, cards []domain.Card) error {
	if len(cards) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, c := range cards {
		batch.Queue(
			`INSERT INTO cards (`+cardCols+`)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
			 ON CONFLICT (id) DO NOTHING`,
			c.ID, c.CategoryCd, c.SubCategoryNm, c.TopicNm, c.Keywords, c.TitleTxt, c.StudySeconds,
			c.SituationTxt, c.QuestionTxt, c.ImageURL, c.PrincipleTxt, c.ProcessTxt, c.FireTriangle,
			c.ConclusionTxt, c.AnswerImageURL, c.SourceTxt, c.DifficultyCd, c.CardTypeCd, c.Choices, c.AnswerIndex)
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()
	for range cards {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (r *CardRepo) ProgressFor(ctx context.Context, userID string) (map[string]domain.Progress, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT user_id, card_id, status_cd, due_at FROM progress WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]domain.Progress{}
	for rows.Next() {
		var p domain.Progress
		if err := rows.Scan(&p.UserID, &p.CardID, &p.Status, &p.DueAt); err != nil {
			return nil, err
		}
		out[p.CardID] = p
	}
	return out, rows.Err()
}

func (r *CardRepo) UpsertProgress(ctx context.Context, p domain.Progress) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO progress (user_id, card_id, status_cd, due_at)
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT (user_id, card_id) DO UPDATE SET status_cd=EXCLUDED.status_cd, due_at=EXCLUDED.due_at`,
		p.UserID, p.CardID, p.Status, p.DueAt)
	return err
}

// --- 관리 콘솔(문제 만들기·고치기) --------------------------------------------

func (r *CardRepo) FindCard(ctx context.Context, id string) (*domain.Card, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+cardCols+` FROM cards WHERE id=$1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, ports.ErrNotFound{Entity: "card"}
	}
	c, err := scanCard(rows)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CardRepo) UpdateCard(ctx context.Context, c domain.Card) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE cards SET category_cd=$2, sub_category_nm=$3, topic_nm=$4, keywords=$5, title_txt=$6,
		 study_seconds=$7, situation_txt=$8, question_txt=$9, image_url=$10, principle_txt=$11,
		 process_txt=$12, fire_triangle_txt=$13, conclusion_txt=$14, answer_image_url=$15,
		 source_txt=$16, difficulty_cd=$17, card_type_cd=$18, choices=$19, answer_index=$20
		 WHERE id=$1`,
		c.ID, c.CategoryCd, c.SubCategoryNm, c.TopicNm, c.Keywords, c.TitleTxt, c.StudySeconds,
		c.SituationTxt, c.QuestionTxt, c.ImageURL, c.PrincipleTxt, c.ProcessTxt, c.FireTriangle,
		c.ConclusionTxt, c.AnswerImageURL, c.SourceTxt, c.DifficultyCd, c.CardTypeCd, c.Choices, c.AnswerIndex)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ports.ErrNotFound{Entity: "card"}
	}
	return nil
}

// DeleteCard 는 카드와 딸린 진행 기록을 한 트랜잭션으로 지운다.
// 둘을 따로 지우면 중간에 실패했을 때 '카드 없는 진행 기록'이 남아 통계가 영구히 어긋난다.
func (r *CardRepo) DeleteCard(ctx context.Context, id string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // 커밋 성공 시 no-op

	if _, err := tx.Exec(ctx, `DELETE FROM progress WHERE card_id=$1`, id); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM cards WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ports.ErrNotFound{Entity: "card"}
	}
	return tx.Commit(ctx)
}

func (r *CardRepo) ProgressSummary(ctx context.Context) (map[string]int64, error) {
	return r.countProgress(ctx, `SELECT status_cd, COUNT(*) FROM progress GROUP BY 1`)
}

func (r *CardRepo) ProgressCountFor(ctx context.Context, userID string) (map[string]int64, error) {
	return r.countProgress(ctx, `SELECT status_cd, COUNT(*) FROM progress WHERE user_id=$1 GROUP BY 1`, userID)
}

func (r *CardRepo) countProgress(ctx context.Context, sql string, args ...any) (map[string]int64, error) {
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{
		string(domain.StatusNew):      0,
		string(domain.StatusLearning): 0,
		string(domain.StatusMastered): 0,
	}
	for rows.Next() {
		var status string
		var n int64
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		out[status] = n
	}
	return out, rows.Err()
}

func (r *CardRepo) CardProgressStats(ctx context.Context) (map[string]ports.CardStat, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT card_id,
		        COUNT(*) FILTER (WHERE status_cd='LEARNING') AS learning,
		        COUNT(*) FILTER (WHERE status_cd='MASTERED') AS mastered
		 FROM progress GROUP BY card_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ports.CardStat{}
	for rows.Next() {
		var id string
		var s ports.CardStat
		if err := rows.Scan(&id, &s.Learning, &s.Mastered); err != nil {
			return nil, err
		}
		out[id] = s
	}
	return out, rows.Err()
}
