package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserRepo 는 ports.UserRepository 의 PostgreSQL 구현.
type UserRepo struct{ pool *pgxpool.Pool }

// NewUserRepo 는 users 테이블 어댑터를 만든다.
func NewUserRepo(pool *pgxpool.Pool) *UserRepo { return &UserRepo{pool: pool} }

const userCols = `id, login_id, user_nm, nickname, email_addr, org_nm, job_title, membership_cd, password_hash, created_at, status_cd`

// scanUser 는 조회 결과 한 행을 도메인 User 로 매핑한다. 없으면 ports.ErrNotFound.
func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.LoginID, &u.UserNm, &u.Nickname, &u.EmailAddr,
		&u.OrgNm, &u.JobTitle, &u.MembershipCd, &u.PasswordHash, &u.CreatedAt, &u.StatusCd)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ports.ErrNotFound{Entity: "user"}
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) FindByLoginID(ctx context.Context, loginID string) (*domain.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE login_id=$1`, loginID))
}

func (r *UserRepo) FindByNickname(ctx context.Context, nickname string) (*domain.User, error) {
	// 대소문자 무시 정확 매칭(부분 인덱스 users_nickname_lower_idx 사용).
	return scanUser(r.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE nickname <> '' AND LOWER(nickname)=LOWER($1) LIMIT 1`, nickname))
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id=$1`, id))
}

func (r *UserRepo) Create(ctx context.Context, u *domain.User) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (`+userCols+`) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		u.ID, u.LoginID, u.UserNm, u.Nickname, u.EmailAddr,
		u.OrgNm, u.JobTitle, u.MembershipCd, u.PasswordHash, u.CreatedAt, u.StatusCd)
	return err
}

func (r *UserRepo) Update(ctx context.Context, u *domain.User) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET login_id=$2, user_nm=$3, nickname=$4, email_addr=$5, org_nm=$6,
		 job_title=$7, membership_cd=$8, password_hash=$9, created_at=$10, status_cd=$11 WHERE id=$1`,
		u.ID, u.LoginID, u.UserNm, u.Nickname, u.EmailAddr,
		u.OrgNm, u.JobTitle, u.MembershipCd, u.PasswordHash, u.CreatedAt, u.StatusCd)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ports.ErrNotFound{Entity: "user"}
	}
	return nil
}

func (r *UserRepo) Count(ctx context.Context) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}
