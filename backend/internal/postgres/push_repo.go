package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// PushTokenRepo 는 ports.PushTokenRepository 의 PostgreSQL 구현.
// token 을 PK 로 두어 같은 기기의 재등록이 자연스럽게 업서트된다(created_at 은 보존).
type PushTokenRepo struct{ pool *pgxpool.Pool }

// NewPushTokenRepo 는 push_tokens 테이블 어댑터를 만든다.
func NewPushTokenRepo(pool *pgxpool.Pool) *PushTokenRepo { return &PushTokenRepo{pool: pool} }

func (r *PushTokenRepo) Save(ctx context.Context, t domain.PushToken) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO push_tokens (token, platform, user_id, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (token) DO UPDATE
		   SET platform=EXCLUDED.platform, user_id=EXCLUDED.user_id, updated_at=EXCLUDED.updated_at`,
		t.Token, t.Platform, t.UserID, t.CreatedAt, t.UpdatedAt)
	return err
}

func (r *PushTokenRepo) All(ctx context.Context) ([]domain.PushToken, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT token, platform, user_id, created_at, updated_at FROM push_tokens`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.PushToken
	for rows.Next() {
		var t domain.PushToken
		if err := rows.Scan(&t.Token, &t.Platform, &t.UserID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *PushTokenRepo) Delete(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM push_tokens WHERE token=$1`, token)
	return err
}
