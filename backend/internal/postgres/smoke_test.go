package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// TestPostgresAdapterSmoke 는 실제 PostgreSQL 에 대해 세 저장소 포트의 왕복을 검증한다.
// DATABASE_URL_TEST 가 없으면 건너뛴다(일반 CI/무DB 환경 안전).
func TestPostgresAdapterSmoke(t *testing.T) {
	url := os.Getenv("DATABASE_URL_TEST")
	if url == "" {
		t.Skip("DATABASE_URL_TEST 미설정 — Postgres 스모크 테스트 생략")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := EnsureSchema(ctx, pool); err != nil {
		t.Fatalf("schema: %v", err)
	}
	// 반복 실행 가능하도록 정리.
	_, _ = pool.Exec(ctx, "TRUNCATE users, cards, progress, push_tokens")

	// --- User ---
	ur := NewUserRepo(pool)
	u := &domain.User{ID: "u1", LoginID: "alice", UserNm: "Alice", Nickname: "AliceN",
		MembershipCd: domain.Premium, PasswordHash: "hash", CreatedAt: time.Now().UTC(), StatusCd: "A"}
	if err := ur.Create(ctx, u); err != nil {
		t.Fatalf("user create: %v", err)
	}
	if got, err := ur.FindByLoginID(ctx, "alice"); err != nil || got.MembershipCd != domain.Premium {
		t.Fatalf("find login: %v %+v", err, got)
	}
	if got, err := ur.FindByNickname(ctx, "alicen"); err != nil || got.ID != "u1" { // 대소문자 무시
		t.Fatalf("find nickname ci: %v %+v", err, got)
	}
	if _, err := ur.FindByLoginID(ctx, "ghost"); err == nil {
		t.Fatalf("expected ErrNotFound for ghost")
	} else if _, ok := err.(ports.ErrNotFound); !ok {
		t.Fatalf("expected ports.ErrNotFound, got %T", err)
	}
	u.JobTitle = "Engineer"
	if err := ur.Update(ctx, u); err != nil {
		t.Fatalf("user update: %v", err)
	}
	if n, _ := ur.Count(ctx); n != 1 {
		t.Fatalf("count=%d", n)
	}

	// --- Card (text[] keywords/choices, *int answer_index) ---
	cr := NewCardRepo(pool)
	idx := 2
	cards := []domain.Card{
		{ID: "c1", CategoryCd: "FIRE", Keywords: []string{"소화", "안전"},
			CardTypeCd: domain.Choice, DifficultyCd: domain.Hard,
			Choices: []string{"A", "B", "C"}, AnswerIndex: &idx, StudySeconds: 180},
		{ID: "c2", CategoryCd: "GAS", CardTypeCd: domain.Explanation}, // nil 슬라이스/ nil 인덱스
	}
	if err := cr.InsertCards(ctx, cards); err != nil {
		t.Fatalf("insert cards: %v", err)
	}
	if err := cr.InsertCards(ctx, cards); err != nil { // ON CONFLICT DO NOTHING 멱등
		t.Fatalf("insert cards (idempotent): %v", err)
	}
	if n, _ := cr.CountCards(ctx); n != 2 {
		t.Fatalf("card count=%d (멱등 실패?)", n)
	}
	all, err := cr.AllCards(ctx)
	if err != nil || len(all) != 2 {
		t.Fatalf("all cards: %v n=%d", err, len(all))
	}
	for _, c := range all {
		switch c.ID {
		case "c1":
			if len(c.Keywords) != 2 || len(c.Choices) != 3 || c.AnswerIndex == nil || *c.AnswerIndex != 2 {
				t.Fatalf("c1 roundtrip mismatch: %+v", c)
			}
		case "c2":
			if c.Keywords != nil || c.Choices != nil || c.AnswerIndex != nil {
				t.Fatalf("c2 nil roundtrip mismatch: kw=%v ch=%v ai=%v", c.Keywords, c.Choices, c.AnswerIndex)
			}
		}
	}

	// --- Progress upsert ---
	due := time.Now().Add(24 * time.Hour).UTC()
	if err := cr.UpsertProgress(ctx, domain.Progress{UserID: "u1", CardID: "c1", Status: domain.StatusLearning, DueAt: &due}); err != nil {
		t.Fatalf("upsert progress: %v", err)
	}
	if err := cr.UpsertProgress(ctx, domain.Progress{UserID: "u1", CardID: "c1", Status: domain.StatusMastered}); err != nil {
		t.Fatalf("upsert progress 2: %v", err)
	}
	pm, err := cr.ProgressFor(ctx, "u1")
	if err != nil || len(pm) != 1 || pm["c1"].Status != domain.StatusMastered || pm["c1"].DueAt != nil {
		t.Fatalf("progress for: %v %+v", err, pm)
	}

	// --- Push token upsert (created_at 보존) ---
	pr := NewPushTokenRepo(pool)
	t0 := time.Now().Add(-time.Hour).UTC()
	if err := pr.Save(ctx, domain.PushToken{Token: "tok", Platform: "ios", UserID: "u1", CreatedAt: t0, UpdatedAt: t0}); err != nil {
		t.Fatalf("push save: %v", err)
	}
	t1 := time.Now().UTC()
	if err := pr.Save(ctx, domain.PushToken{Token: "tok", Platform: "android", UserID: "u1", CreatedAt: t1, UpdatedAt: t1}); err != nil {
		t.Fatalf("push save 2: %v", err)
	}
	toks, err := pr.All(ctx)
	if err != nil || len(toks) != 1 || toks[0].Platform != "android" {
		t.Fatalf("push all: %v %+v", err, toks)
	}
	if toks[0].CreatedAt.Sub(t0).Abs() > time.Second {
		t.Fatalf("created_at 보존 실패: %v vs %v", toks[0].CreatedAt, t0)
	}
	if err := pr.Delete(ctx, "tok"); err != nil {
		t.Fatalf("push delete: %v", err)
	}
	if toks, _ := pr.All(ctx); len(toks) != 0 {
		t.Fatalf("push delete residual: %d", len(toks))
	}
}
