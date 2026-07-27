package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// AuditRepo 는 ports.AuditRepository 의 PostgreSQL 구현.
// 관리자 행위 이력은 사고 조사의 근거이므로 append-only 로만 다룬다
// (수정·삭제 메서드를 아예 두지 않는다).
type AuditRepo struct{ pool *pgxpool.Pool }

// NewAuditRepo 는 audit_logs 테이블 어댑터를 만든다.
func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo { return &AuditRepo{pool: pool} }

const auditCols = `id, actor_id, actor_name, action, target_type, target_id, summary, created_at`

func (r *AuditRepo) Append(ctx context.Context, l domain.AuditLog) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO audit_logs (`+auditCols+`) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		l.ID, l.ActorID, l.ActorName, l.Action, l.TargetType, l.TargetID, l.Summary, l.CreatedAt)
	return err
}

func (r *AuditRepo) List(ctx context.Context, limit int) ([]domain.AuditLog, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+auditCols+` FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.AuditLog{}
	for rows.Next() {
		var l domain.AuditLog
		if err := rows.Scan(&l.ID, &l.ActorID, &l.ActorName, &l.Action,
			&l.TargetType, &l.TargetID, &l.Summary, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
