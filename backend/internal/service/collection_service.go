package service

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CollectionService 는 안전 카드 도감의 서버 보관을 맡는다.
//
// ── 서버가 뽑지 않는다 ──────────────────────────────────────────────────
// 이 앱은 지하·철골 구조물 안에서 쓰인다 — 연결 없음이 예외가 아니라 일상이다.
// 그래서 카드팩 개봉은 기기에서 돌고(`src/domain/packDraw.ts`), 서버는
// **결과를 보관하고 병합**한다. 서버가 뽑아 주는 설계는 더 안전하지만,
// 오프라인에서 팩을 못 여는 앱이 되어 기능 자체가 죽는다.
//
// 대신 서버는 '말이 되는 범위'를 지킨다 — 아래 Sync 의 검증이 그것이다.
// 완전한 위·변조 방지는 이 구조에서 불가능하며, 그 사실을 숨기지 않는다.
//
// ── 병합 규칙 ───────────────────────────────────────────────────────────
// 모든 필드가 **줄어들지 않는 값**이라 병합이 max 하나로 끝난다.
// 덕분에 순서가 뒤바뀌어 도착해도, 같은 요청이 두 번 와도 결과가 같다.
type CollectionService struct {
	repo ports.CollectionRepository
	now  func() time.Time
}

// NewCollectionService 는 도감 서비스를 만든다.
func NewCollectionService(repo ports.CollectionRepository) *CollectionService {
	return &CollectionService{repo: repo, now: time.Now}
}

// Available 은 저장소가 주입됐는지. 라우터가 등록 여부를 정할 때 쓴다.
func (s *CollectionService) Available() bool { return s != nil && s.repo != nil }

// 입력 상한 — 클라이언트가 보내는 값은 반드시 자른다.
// 없으면 한 요청으로 저장소를 가득 채우거나 말도 안 되는 잔액을 만들 수 있다.
const (
	maxOwnedEntries   = 2000    // 도감 500종 + 여유(카탈로그가 늘어도 견디게)
	maxClaimedRules   = 200     // 규칙 테이블보다 넉넉히
	maxRedeemedCodes  = 500     //
	maxCardIDLen      = 64      //
	maxCopiesPerCard  = 9999    // 한 카드를 이만큼 넘게 가질 이유가 없다
	maxCounterValue   = 1000000 // 팩·조각·학습 누적의 상한
	maxPityValue      = 200     // 천장 진행도(하드 천장보다 넉넉히)
	maxDailyPackKeyLn = 10      // "2026-12-31"
)

// Get 은 사용자의 도감을 준다.
func (s *CollectionService) Get(ctx context.Context, userID string) (domain.Collection, error) {
	c, err := s.repo.LoadCollection(ctx, userID)
	if err != nil {
		return domain.NewCollection(userID), err
	}
	return normalize(userID, c), nil
}

// Sync 는 기기가 보낸 상태를 서버 상태와 병합해 저장하고, 병합 결과를 돌려준다.
//
// 앱은 이 응답을 그대로 자기 상태로 삼는다 — 그래야 두 기기가 결국 같은 값에
// 수렴한다. "보냈으니 됐다"로 두면 기기마다 다른 도감을 들고 영원히 갈라진다.
func (s *CollectionService) Sync(ctx context.Context, userID string, in domain.Collection) (domain.Collection, error) {
	stored, err := s.repo.LoadCollection(ctx, userID)
	if err != nil {
		return domain.NewCollection(userID), err
	}
	merged := merge(normalize(userID, stored), sanitize(userID, in))
	merged.UpdatedAt = s.now()
	if err := s.repo.SaveCollection(ctx, merged); err != nil {
		return domain.NewCollection(userID), err
	}
	return merged, nil
}

// normalize 는 저장소에서 읽은 값의 nil 맵을 채운다(호출부가 nil 검사를 안 하도록).
func normalize(userID string, c domain.Collection) domain.Collection {
	c.UserID = userID
	if c.Owned == nil {
		c.Owned = map[string]int{}
	}
	if c.ClaimedRules == nil {
		c.ClaimedRules = map[string]int{}
	}
	if c.RedeemedCodes == nil {
		c.RedeemedCodes = []string{}
	}
	return c
}

// sanitize 는 클라이언트 입력을 말이 되는 범위로 자른다.
//
// 여기서 거절하지 않고 '자르는' 이유 — 오프라인 큐가 며칠 뒤에 보내는 요청까지
// 400 으로 떨구면 그 기간의 학습 기록이 통째로 사라진다. 이상한 값은 깎아서
// 받아들이고, 정상 범위의 기록은 살린다.
func sanitize(userID string, c domain.Collection) domain.Collection {
	out := domain.NewCollection(userID)

	// 도감 — id 길이와 장수를 자르고, 개수 상한을 넘으면 버린다.
	if len(c.Owned) > 0 {
		ids := make([]string, 0, len(c.Owned))
		for id := range c.Owned {
			ids = append(ids, id)
		}
		// 상한을 넘을 때 어떤 것을 남길지가 임의로 정해지면(맵 순회 순서)
		// 같은 입력이 매번 다른 결과를 낸다. 정렬해서 결정적으로 만든다.
		sort.Strings(ids)
		for _, id := range ids {
			if len(out.Owned) >= maxOwnedEntries {
				break
			}
			if id == "" || len(id) > maxCardIDLen {
				continue
			}
			if n := clampInt(c.Owned[id], 0, maxCopiesPerCard); n > 0 {
				out.Owned[id] = n
			}
		}
	}

	// 규칙 수령 횟수.
	if len(c.ClaimedRules) > 0 {
		ids := make([]string, 0, len(c.ClaimedRules))
		for id := range c.ClaimedRules {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			if len(out.ClaimedRules) >= maxClaimedRules {
				break
			}
			if id == "" || len(id) > maxCardIDLen {
				continue
			}
			if n := clampInt(c.ClaimedRules[id], 0, maxCopiesPerCard); n > 0 {
				out.ClaimedRules[id] = n
			}
		}
	}

	// 사용한 코드 — 중복 제거 후 정렬해서 담는다.
	seen := map[string]bool{}
	for _, code := range c.RedeemedCodes {
		code = strings.ToUpper(strings.TrimSpace(code))
		if code == "" || len(code) > maxCardIDLen || seen[code] {
			continue
		}
		if len(out.RedeemedCodes) >= maxRedeemedCodes {
			break
		}
		seen[code] = true
		out.RedeemedCodes = append(out.RedeemedCodes, code)
	}
	sort.Strings(out.RedeemedCodes)

	out.PacksEarned = clampInt(c.PacksEarned, 0, maxCounterValue)
	out.PacksOpened = clampInt(c.PacksOpened, 0, maxCounterValue)
	out.ShardsEarned = clampInt(c.ShardsEarned, 0, maxCounterValue)
	out.ShardsSpent = clampInt(c.ShardsSpent, 0, maxCounterValue)
	out.StudyTotal = clampInt(c.StudyTotal, 0, maxCounterValue)
	out.SinceEpic = clampInt(c.SinceEpic, 0, maxPityValue)
	out.SinceLegendary = clampInt(c.SinceLegendary, 0, maxPityValue)

	if len(c.LastDailyPack) <= maxDailyPackKeyLn {
		out.LastDailyPack = strings.TrimSpace(c.LastDailyPack)
	}
	return out
}

// merge 는 두 도감을 합친다 — 모든 값이 단조 증가라 필드별 최댓값이 곧 정답이다.
func merge(a, b domain.Collection) domain.Collection {
	out := domain.NewCollection(a.UserID)

	for id, n := range a.Owned {
		out.Owned[id] = n
	}
	for id, n := range b.Owned {
		if n > out.Owned[id] {
			out.Owned[id] = n
		}
	}

	for id, n := range a.ClaimedRules {
		out.ClaimedRules[id] = n
	}
	for id, n := range b.ClaimedRules {
		if n > out.ClaimedRules[id] {
			out.ClaimedRules[id] = n
		}
	}

	// 코드는 합집합 — 한쪽에서만 쓴 코드도 다시 쓸 수 없어야 한다.
	seen := map[string]bool{}
	for _, code := range append(append([]string{}, a.RedeemedCodes...), b.RedeemedCodes...) {
		if !seen[code] {
			seen[code] = true
			out.RedeemedCodes = append(out.RedeemedCodes, code)
		}
	}
	sort.Strings(out.RedeemedCodes)

	out.PacksEarned = maxOf(a.PacksEarned, b.PacksEarned)
	out.PacksOpened = maxOf(a.PacksOpened, b.PacksOpened)
	out.ShardsEarned = maxOf(a.ShardsEarned, b.ShardsEarned)
	out.ShardsSpent = maxOf(a.ShardsSpent, b.ShardsSpent)
	out.StudyTotal = maxOf(a.StudyTotal, b.StudyTotal)

	// 천장은 '더 오래 못 받은 쪽'을 인정한다. 반대로 잡으면 기기를 바꿔 가며
	// 천장을 초기화해 상위 등급을 계속 앞당길 수 있다.
	out.SinceEpic = maxOf(a.SinceEpic, b.SinceEpic)
	out.SinceLegendary = maxOf(a.SinceLegendary, b.SinceLegendary)

	// 무료팩 수령일은 '더 나중 날'. 날짜 키가 YYYY-MM-DD 고정폭이라 문자열
	// 비교가 곧 날짜 비교다. 이래야 기기를 옮겨 같은 날 두 번 받을 수 없다.
	out.LastDailyPack = a.LastDailyPack
	if b.LastDailyPack > out.LastDailyPack {
		out.LastDailyPack = b.LastDailyPack
	}

	out.UpdatedAt = a.UpdatedAt
	if b.UpdatedAt.After(out.UpdatedAt) {
		out.UpdatedAt = b.UpdatedAt
	}
	return out
}

func maxOf(a, b int) int {
	if a > b {
		return a
	}
	return b
}
