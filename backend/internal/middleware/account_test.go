package middleware

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// fakeUsers 는 조회 횟수를 세는 최소 저장소. AccountGate 가 정말로 캐시를 쓰는지
// 확인하려면 "몇 번 물어봤는가"를 봐야 한다.
type fakeUsers struct {
	ports.UserRepository
	mu     sync.Mutex
	user   domain.User
	err    error
	lookps int
}

func (f *fakeUsers) FindByID(_ context.Context, _ string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lookps++
	if f.err != nil {
		return nil, f.err
	}
	u := f.user
	return &u, nil
}

func (f *fakeUsers) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lookps
}

func (f *fakeUsers) setStatus(s string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.user.StatusCd = s
}

func newGate(users ports.UserRepository, clock *time.Time) *AccountGate {
	g := NewAccountGate(users)
	g.now = func() time.Time { return *clock }
	return g
}

func TestAccountGateCachesWithinTTL(t *testing.T) {
	now := time.Now()
	users := &fakeUsers{user: domain.User{ID: "u-1", StatusCd: "A"}}
	g := newGate(users, &now)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		if !g.Active(ctx, "u-1") {
			t.Fatal("활성 계정인데 막혔다")
		}
	}
	if users.calls() != 1 {
		t.Fatalf("저장소 조회 %d회, want 1 — 캐시가 동작하지 않는다", users.calls())
	}
}

func TestAccountGateReflectsSuspensionAfterTTL(t *testing.T) {
	now := time.Now()
	users := &fakeUsers{user: domain.User{ID: "u-1", StatusCd: "A"}}
	g := newGate(users, &now)
	ctx := context.Background()

	if !g.Active(ctx, "u-1") {
		t.Fatal("처음엔 활성이어야 한다")
	}

	users.setStatus("I") // 관리자가 정지시켰다

	// TTL 안에는 캐시를 믿는다. 이게 정지 반영이 늦어지는 최대 시간이다.
	if !g.Active(ctx, "u-1") {
		t.Fatal("TTL 안에서는 캐시된 값을 써야 한다")
	}

	now = now.Add(accountCacheTTL + time.Second)
	if g.Active(ctx, "u-1") {
		t.Fatalf("TTL(%s)이 지나면 정지가 반영되어야 한다", accountCacheTTL)
	}
}

func TestAccountGateFailsOpenOnStorageError(t *testing.T) {
	now := time.Now()
	users := &fakeUsers{err: errors.New("db down")}
	g := newGate(users, &now)

	// DB 가 흔들렸다고 로그인한 사용자 전원을 쫓아내는 것이,
	// 정지 반영이 몇 초 늦는 것보다 훨씬 나쁘다.
	if !g.Active(context.Background(), "u-1") {
		t.Fatal("저장소 오류에는 통과시켜야 한다(fail-open)")
	}
}

func TestAccountGateNilIsNoop(t *testing.T) {
	// Users 미주입 조립에서도 죽지 않아야 한다.
	var g *AccountGate
	if !g.Active(context.Background(), "u-1") {
		t.Fatal("게이트가 없으면 통과시켜야 한다")
	}
	if NewAccountGate(nil) != nil {
		t.Fatal("저장소가 없으면 게이트를 만들지 않는다")
	}
}

func TestAccountGatePrunesWhenFull(t *testing.T) {
	now := time.Now()
	users := &fakeUsers{user: domain.User{StatusCd: "A"}}
	g := newGate(users, &now)
	ctx := context.Background()

	// 상한을 넘겨 밀어 넣어도 캐시가 무한히 자라면 안 된다.
	for i := 0; i < accountCacheMax+50; i++ {
		g.Active(ctx, "u-"+string(rune('a'+i%26))+string(rune('a'+i/26%26))+string(rune('a'+i/676%26)))
	}
	g.mu.Lock()
	size := len(g.entries)
	g.mu.Unlock()
	if size > accountCacheMax {
		t.Fatalf("캐시 크기 %d > 상한 %d", size, accountCacheMax)
	}
}
