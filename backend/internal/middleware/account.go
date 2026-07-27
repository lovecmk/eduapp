package middleware

import (
	"context"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// accountCacheTTL 은 계정 상태를 다시 조회하지 않고 믿어 주는 시간이다.
//
// 값의 의미가 곧 "정지 처분이 늦게 반영되는 최대 시간"이다. 0 으로 두면 요청마다
// 저장소를 왕복해 가장 정확하지만 학습 화면처럼 연속 호출이 잦은 경로가 느려진다.
// 15초면 관리자가 정지 버튼을 누르고 화면을 확인하는 사이에 이미 반영된다.
const accountCacheTTL = 15 * time.Second

// accountCacheMax 는 캐시 항목 수 상한. 넘으면 만료분을 훑어 정리한다.
const accountCacheMax = 10000

type accountEntry struct {
	active    bool
	checkedAt time.Time
}

// AccountGate 는 "이 계정이 아직 쓸 수 있는가"를 짧게 캐시해 두고 답한다.
//
// 액세스 토큰은 스테이트리스라 한 번 나가면 회수할 수 없다. 그래서 정지된 계정도
// 토큰이 만료될 때까지(ACCESS_TTL) 계속 통과했다. 매 요청 저장소를 보는 대신
// 짧은 TTL 캐시를 두면, 비용은 거의 그대로 두고 반영 지연만 분 단위에서 초 단위로 줄인다.
type AccountGate struct {
	users ports.UserRepository
	now   func() time.Time

	mu      sync.Mutex
	entries map[string]accountEntry
}

// NewAccountGate 는 계정 상태 게이트를 만든다. users 가 nil 이면 nil 을 돌려주고,
// 호출부는 검사 없이 통과시킨다(저장소가 없는 조립에서 배선 실수로 죽지 않게).
func NewAccountGate(users ports.UserRepository) *AccountGate {
	if users == nil {
		return nil
	}
	return &AccountGate{users: users, now: time.Now, entries: map[string]accountEntry{}}
}

// Active 는 계정이 이용 가능한 상태인지 답한다.
// 저장소 조회에 실패하면 true 를 돌려준다 — DB 가 잠깐 흔들렸다고 로그인한 사용자
// 전원을 쫓아내는 것이 정지 반영이 몇 초 늦는 것보다 훨씬 나쁘다.
func (g *AccountGate) Active(ctx context.Context, userID string) bool {
	if g == nil || userID == "" {
		return true
	}
	if e, ok := g.lookup(userID); ok {
		return e
	}
	u, err := g.users.FindByID(ctx, userID)
	if err != nil {
		// 계정이 실제로 사라진 경우도 여기로 온다. 그 상황은 RequireAuth 다음 단계나
		// /api/auth/me 에서 걸러지므로, 여기서는 저장소 오류와 구분하지 않고 통과시킨다.
		return true
	}
	g.store(userID, u.Active())
	return u.Active()
}

func (g *AccountGate) lookup(userID string) (bool, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	e, ok := g.entries[userID]
	if !ok || g.now().Sub(e.checkedAt) >= accountCacheTTL {
		return false, false
	}
	return e.active, true
}

func (g *AccountGate) store(userID string, active bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.entries) >= accountCacheMax {
		g.pruneLocked()
	}
	g.entries[userID] = accountEntry{active: active, checkedAt: g.now()}
}

func (g *AccountGate) pruneLocked() {
	cutoff := g.now().Add(-accountCacheTTL)
	for id, e := range g.entries {
		if e.checkedAt.Before(cutoff) {
			delete(g.entries, id)
		}
	}
	// 전부 신선해서 안 줄었다면 통째로 버린다. 캐시일 뿐이라 다시 채우면 그만이고,
	// 상한을 넘긴 채 계속 자라는 쪽이 훨씬 위험하다.
	if len(g.entries) >= accountCacheMax {
		g.entries = map[string]accountEntry{}
	}
}

// RequireActiveAccount 는 RequireAuth 를 통과한 요청의 계정 상태를 확인한다.
// gate 가 nil 이면 아무것도 하지 않는다.
func RequireActiveAccount(gate *AccountGate) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if gate == nil {
			return c.Next()
		}
		userID, _ := c.Locals("userID").(string)
		if !gate.Active(c.Context(), userID) {
			return fiber.NewError(fiber.StatusForbidden, "이용이 정지된 계정입니다. 관리자에게 문의해주세요")
		}
		return c.Next()
	}
}
