// Package postgres 는 ports 인터페이스의 PostgreSQL 구현(어댑터)이다.
//
// 서비스 계층은 ports 인터페이스에만 의존하므로, STORE=postgres 로 이 어댑터를
// 끼워 넣어도 핸들러·서비스·도메인 코드는 한 줄도 바뀌지 않는다(이식성).
//
// 관계형 데이터(user ↔ progress ↔ card, 집계 통계)에 맞고, pg_dump/psql 로
// 어떤 호스트(사내 폐쇄망·외부 VM·관리형 RDS/Cloud SQL/Supabase/Neon)로든
// 동일하게 이식된다 — "언제든 이식" 요구를 그대로 만족한다.
package postgres

import (
	"context"
	_ "embed"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// schemaSQL 은 바이너리에 임베드되는 스키마 정의(멱등). EnsureSchema 가 실행한다.
//
//go:embed schema.sql
var schemaSQL string

// Connect 는 커넥션 풀을 만들고 ping 으로 가용성을 확인한다.
// url 예: postgres://user:pass@host:5432/eduapp?sslmode=disable
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(cctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(cctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// EnsureSchema 는 임베드된 스키마를 적용한다(테이블/인덱스가 없으면 생성).
// 멱등이므로 매 부팅 호출해도 안전하다.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, schemaSQL)
	return err
}
