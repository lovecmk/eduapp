package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserRepo 는 ports.UserRepository 의 PostgreSQL 구현.
type UserRepo struct{ pool *pgxpool.Pool }

// NewUserRepo 는 users 테이블 어댑터를 만든다.
func NewUserRepo(pool *pgxpool.Pool) *UserRepo { return &UserRepo{pool: pool} }

const userCols = `id, login_id, user_nm, nickname, email_addr, org_nm, job_title, membership_cd, role_cd, password_hash, created_at, status_cd`

// scanUser 는 조회 결과 한 행을 도메인 User 로 매핑한다. 없으면 ports.ErrNotFound.
func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.LoginID, &u.UserNm, &u.Nickname, &u.EmailAddr,
		&u.OrgNm, &u.JobTitle, &u.MembershipCd, &u.RoleCd, &u.PasswordHash, &u.CreatedAt, &u.StatusCd)
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
		`INSERT INTO users (`+userCols+`) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		u.ID, u.LoginID, u.UserNm, u.Nickname, u.EmailAddr,
		u.OrgNm, u.JobTitle, u.MembershipCd, u.Role(), u.PasswordHash, u.CreatedAt, u.StatusCd)
	return err
}

func (r *UserRepo) Update(ctx context.Context, u *domain.User) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET login_id=$2, user_nm=$3, nickname=$4, email_addr=$5, org_nm=$6,
		 job_title=$7, membership_cd=$8, role_cd=$9, password_hash=$10, created_at=$11, status_cd=$12 WHERE id=$1`,
		u.ID, u.LoginID, u.UserNm, u.Nickname, u.EmailAddr,
		u.OrgNm, u.JobTitle, u.MembershipCd, u.Role(), u.PasswordHash, u.CreatedAt, u.StatusCd)
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

// --- 관리 콘솔 ---------------------------------------------------------------

// buildUserFilter 는 UserQuery 를 WHERE 절 + 인자 목록으로 바꾼다.
// 검색어는 반드시 placeholder 로만 넘긴다(문자열 결합 시 SQL 인젝션이 열린다).
func buildUserFilter(q ports.UserQuery) (string, []any) {
	where := " WHERE 1=1"
	args := []any{}
	add := func(clause string, v any) {
		args = append(args, v)
		where += fmt.Sprintf(clause, len(args))
	}
	if s := strings.TrimSpace(q.Search); s != "" {
		// ILIKE 는 대소문자 무시 부분 일치. % 와 _ 는 사용자가 넣어도
		// 검색 결과가 넓어질 뿐 권한을 넘지 않으므로 그대로 둔다.
		add(` AND (user_nm ILIKE '%%' || $%d || '%%' OR nickname ILIKE '%%' || $%[1]d || '%%'
		         OR login_id ILIKE '%%' || $%[1]d || '%%' OR email_addr ILIKE '%%' || $%[1]d || '%%'
		         OR org_nm ILIKE '%%' || $%[1]d || '%%')`, s)
	}
	if q.Role != "" {
		// 기존 데이터의 빈 role_cd 는 USER 로 취급한다(도메인 Role() 과 같은 규칙).
		add(` AND COALESCE(NULLIF(role_cd, ''), 'USER') = $%d`, q.Role)
	}
	if q.Status != "" {
		add(` AND status_cd = $%d`, q.Status)
	}
	if q.Membership != "" {
		add(` AND membership_cd = $%d`, q.Membership)
	}
	return where, args
}

func (r *UserRepo) List(ctx context.Context, q ports.UserQuery) ([]domain.User, int64, error) {
	where, args := buildUserFilter(q)

	var total int64
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := q.Offset
	if offset < 0 {
		offset = 0
	}
	// 정렬 컬럼은 ParseSortField 로 좁혀진 상수만 들어오므로 문자열 결합이 안전하다
	// (외부 입력을 그대로 붙이면 정렬 파라미터가 SQL 인젝션 통로가 된다).
	// 동률에 대비해 id 를 최종 정렬 키로 둔다(페이지 간 중복/누락 방지).
	dir := "ASC"
	if q.Desc {
		dir = "DESC"
	}
	col := string(ports.ParseSortField(string(q.Sort)))
	sql := `SELECT ` + userCols + ` FROM users` + where +
		fmt.Sprintf(` ORDER BY %s %s, id %s LIMIT $%d OFFSET $%d`,
			col, dir, dir, len(args)+1, len(args)+2)
	rows, err := r.pool.Query(ctx, sql, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []domain.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *u)
	}
	return out, total, rows.Err()
}

func (r *UserRepo) CountByRole(ctx context.Context) (map[string]int64, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT COALESCE(NULLIF(role_cd, ''), 'USER') AS role, COUNT(*) FROM users GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{string(domain.RoleUser): 0, string(domain.RoleAdmin): 0}
	for rows.Next() {
		var role string
		var n int64
		if err := rows.Scan(&role, &n); err != nil {
			return nil, err
		}
		out[role] = n
	}
	return out, rows.Err()
}

func (r *UserRepo) CountCreatedSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE created_at > $1`, since).Scan(&n)
	return n, err
}
