package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/utils"
)

// 멱등 처리 — 같은 요청이 두 번 도착해도 한 번만 반영한다.
//
// 앱은 네트워크가 끊기면 쓰기를 오프라인 큐에 쌓았다가 나중에 다시 보낸다.
// 그래서 "보냈는데 응답을 못 받은" 요청이 실제로는 서버에 도달했을 수 있고,
// 재전송하면 출석이 두 번 찍히거나 신고가 중복 접수된다.
//
// 앱은 이를 막으려고 처음부터 모든 durable write 에 Idempotency-Key 를 실어 보냈고
// API 계약서에도 "중요"로 적혀 있었다. 그런데 **서버는 이 헤더를 읽은 적이 없었다.**
// 앱만 계약을 지키고 서버가 지키지 않으면 앱의 방어는 아무 효과가 없다.
//
// 구현은 단순하다. (사용자, 키) 로 최근 응답을 기억해 두고, 같은 조합이 다시 오면
// 핸들러를 부르지 않고 기억해 둔 응답을 그대로 돌려준다.

// idempotencyTTL 은 기억을 유지하는 시간.
// 오프라인 큐의 재전송은 길어야 몇 시간 안에 끝나므로 하루면 충분하다.
const idempotencyTTL = 24 * time.Hour

// idempotencyMax 는 기억할 최대 건수. 넘으면 만료분을 훑어 정리한다.
const idempotencyMax = 50_000

type idempotentResult struct {
	status   int
	body     []byte
	storedAt time.Time
}

// IdempotencyStore 는 (사용자, 키) → 응답을 짧게 기억한다.
type IdempotencyStore struct {
	now func() time.Time

	mu      sync.Mutex
	entries map[string]idempotentResult
}

// NewIdempotencyStore 는 멱등 저장소를 만든다.
func NewIdempotencyStore() *IdempotencyStore {
	return &IdempotencyStore{now: time.Now, entries: map[string]idempotentResult{}}
}

func (s *IdempotencyStore) lookup(k string) (idempotentResult, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[k]
	if !ok || s.now().Sub(e.storedAt) >= idempotencyTTL {
		return idempotentResult{}, false
	}
	return e, true
}

func (s *IdempotencyStore) store(k string, status int, body []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.entries) >= idempotencyMax {
		s.pruneLocked()
	}
	// 본문은 복사해서 보관한다 — 응답 버퍼는 요청이 끝나면 재사용된다.
	cp := make([]byte, len(body))
	copy(cp, body)
	s.entries[k] = idempotentResult{status: status, body: cp, storedAt: s.now()}
}

func (s *IdempotencyStore) pruneLocked() {
	cutoff := s.now().Add(-idempotencyTTL)
	for k, e := range s.entries {
		if e.storedAt.Before(cutoff) {
			delete(s.entries, k)
		}
	}
	// 전부 신선해서 안 줄었다면 통째로 버린다. 재전송 방어를 잠깐 잃는 것이,
	// 상한을 넘긴 채 계속 자라 서버가 죽는 것보다 낫다.
	if len(s.entries) >= idempotencyMax {
		s.entries = map[string]idempotentResult{}
	}
}

// Idempotent 는 Idempotency-Key 헤더가 있는 쓰기 요청을 한 번만 반영하게 한다.
//
// 헤더가 없으면 아무 일도 하지 않고 지나간다 — 이 헤더는 "이 요청은 재전송될 수 있다"는
// 클라이언트의 선언이고, 선언하지 않은 요청까지 서버가 기억할 이유는 없다.
func Idempotent(store *IdempotencyStore) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if store == nil {
			return c.Next()
		}
		key := utils.CopyString(c.Get("Idempotency-Key"))
		if key == "" {
			return c.Next()
		}
		// 사용자를 키에 섞는다. 섞지 않으면 A 가 만든 키를 B 가 그대로 보내
		// 남의 응답을 받아 볼 수 있다("attendance:2026-7-27" 같은 키는 쉽게 겹친다).
		userID, _ := c.Locals(LocalUserID).(string)
		full := userID + "\x00" + key

		if hit, ok := store.lookup(full); ok {
			// 재전송임을 클라이언트가 알 수 있게 표시한다(디버깅용 — 동작은 최초와 같다).
			c.Set("Idempotency-Replayed", "true")
			return c.Status(hit.status).Send(hit.body)
		}

		if err := c.Next(); err != nil {
			return err // 실패한 요청은 기억하지 않는다 — 다시 시도할 수 있어야 한다
		}
		// 성공(2xx)만 기억한다. 4xx/5xx 를 기억하면 일시적 실패가 영구히 굳는다.
		if status := c.Response().StatusCode(); status >= 200 && status < 300 {
			store.store(full, status, c.Response().Body())
		}
		return nil
	}
}
