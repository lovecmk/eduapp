package service

import (
	"context"
	"strings"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/memory"
)

func newCollectionSvc() *CollectionService {
	return NewCollectionService(memory.NewCollectionRepo())
}

func TestCollectionStartsEmpty(t *testing.T) {
	s := newCollectionSvc()
	c, err := s.Get(context.Background(), "u1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// '아직 없음'은 오류가 아니다 — 첫 실행이 전부 실패하면 안 된다.
	if c.PackBalance() != 0 || c.UniqueCount() != 0 || c.Owned == nil {
		t.Fatalf("빈 도감이 아님: %+v", c)
	}
}

func TestCollectionBalanceIsEarnedMinusSpent(t *testing.T) {
	c := domain.Collection{PacksEarned: 10, PacksOpened: 7, ShardsEarned: 300, ShardsSpent: 90}
	if got := c.PackBalance(); got != 3 {
		t.Fatalf("팩 잔액 3 이어야 함, got %d", got)
	}
	if got := c.ShardBalance(); got != 210 {
		t.Fatalf("조각 잔액 210 이어야 함, got %d", got)
	}
}

func TestCollectionBalanceNeverNegative(t *testing.T) {
	// 손상된 데이터가 들어와도 화면이 "-3팩"을 보여주지는 않게 한다.
	c := domain.Collection{PacksEarned: 1, PacksOpened: 9, ShardsEarned: 0, ShardsSpent: 50}
	if c.PackBalance() != 0 || c.ShardBalance() != 0 {
		t.Fatalf("음수 잔액이 새어 나옴: %+v", c)
	}
}

// 이 테스트가 이 파일의 핵심이다 — 잔액을 그대로 동기화했다면 반드시 깨지는 시나리오.
func TestCollectionMergeKeepsBothDevicesWork(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	// 기기A: 팩 5개를 벌어 3개를 열었다(잔액 2).
	a := domain.NewCollection("u1")
	a.PacksEarned, a.PacksOpened = 5, 3
	a.Owned["safety-helmet"] = 2
	if _, err := s.Sync(ctx, "u1", a); err != nil {
		t.Fatalf("Sync A: %v", err)
	}

	// 기기B: 같은 사용자가 다른 기기에서 팩 6개를 벌어 4개를 열었다.
	b := domain.NewCollection("u1")
	b.PacksEarned, b.PacksOpened = 6, 4
	b.Owned["safety-helmet"] = 1
	b.Owned["extinguisher"] = 1
	got, err := s.Sync(ctx, "u1", b)
	if err != nil {
		t.Fatalf("Sync B: %v", err)
	}

	// 적립·개봉 모두 큰 쪽이 남는다 → 어느 기기의 노동도 사라지지 않는다.
	if got.PacksEarned != 6 || got.PacksOpened != 4 {
		t.Fatalf("카운터 병합 실패: %+v", got)
	}
	// 카드는 카드별 최댓값 — A 의 2장이 B 의 1장에 덮이지 않는다.
	if got.Owned["safety-helmet"] != 2 || got.Owned["extinguisher"] != 1 {
		t.Fatalf("보유 카드 병합 실패: %+v", got.Owned)
	}
	if got.UniqueCount() != 2 {
		t.Fatalf("종수 2 여야 함, got %d", got.UniqueCount())
	}
}

func TestCollectionSyncIsIdempotent(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	in := domain.NewCollection("u1")
	in.PacksEarned, in.PacksOpened = 12, 5
	in.ShardsEarned, in.ShardsSpent = 400, 90
	in.Owned["elb"] = 3
	in.ClaimedRules["study-10"] = 1

	first, _ := s.Sync(ctx, "u1", in)
	second, _ := s.Sync(ctx, "u1", in)

	// 오프라인 큐가 같은 요청을 두 번 보내도 팩이 두 배가 되면 안 된다.
	if first.PacksEarned != second.PacksEarned || first.PacksOpened != second.PacksOpened {
		t.Fatalf("재전송에 값이 변함: %+v vs %+v", first, second)
	}
	if second.Owned["elb"] != 3 || second.ClaimedRules["study-10"] != 1 {
		t.Fatalf("재전송에 누적됨: %+v", second)
	}
}

func TestCollectionMergeOrderDoesNotMatter(t *testing.T) {
	ctx := context.Background()
	a := domain.NewCollection("u1")
	a.PacksEarned, a.StudyTotal = 9, 40
	a.Owned["goggles"] = 1

	b := domain.NewCollection("u1")
	b.PacksEarned, b.StudyTotal = 4, 90
	b.Owned["goggles"] = 5

	// 늦게 도착한 요청이 먼저 도착한 요청을 되돌리면 안 된다(순서 무관).
	s1 := newCollectionSvc()
	s1.Sync(ctx, "u1", a)
	ab, _ := s1.Sync(ctx, "u1", b)

	s2 := newCollectionSvc()
	s2.Sync(ctx, "u1", b)
	ba, _ := s2.Sync(ctx, "u1", a)

	if ab.PacksEarned != ba.PacksEarned || ab.StudyTotal != ba.StudyTotal || ab.Owned["goggles"] != ba.Owned["goggles"] {
		t.Fatalf("순서에 따라 결과가 달라짐: %+v vs %+v", ab, ba)
	}
}

func TestCollectionNeverGoesBackwards(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	big := domain.NewCollection("u1")
	big.PacksEarned, big.PacksOpened, big.StudyTotal = 100, 80, 500
	big.Owned["zero-accident"] = 4
	s.Sync(ctx, "u1", big)

	// 오래된 스냅샷을 들고 있던 기기가 뒤늦게 붙어도 기록을 되감지 못한다.
	stale := domain.NewCollection("u1")
	stale.PacksEarned, stale.PacksOpened, stale.StudyTotal = 3, 1, 10
	stale.Owned["zero-accident"] = 1
	got, _ := s.Sync(ctx, "u1", stale)

	if got.PacksEarned != 100 || got.PacksOpened != 80 || got.StudyTotal != 500 || got.Owned["zero-accident"] != 4 {
		t.Fatalf("오래된 스냅샷이 기록을 되돌림: %+v", got)
	}
}

func TestCollectionRedeemedCodesAreUnion(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	a := domain.NewCollection("u1")
	a.RedeemedCodes = []string{"WELCOME"}
	s.Sync(ctx, "u1", a)

	b := domain.NewCollection("u1")
	b.RedeemedCodes = []string{"SUMMER"}
	got, _ := s.Sync(ctx, "u1", b)

	// 한쪽 기기에서만 쓴 코드도 다시 쓸 수 없어야 한다.
	if len(got.RedeemedCodes) != 2 {
		t.Fatalf("코드가 합쳐지지 않음: %v", got.RedeemedCodes)
	}
}

func TestCollectionDailyPackKeepsLatestDay(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	a := domain.NewCollection("u1")
	a.LastDailyPack = "2026-08-07"
	s.Sync(ctx, "u1", a)

	// 다른 기기가 어제 날짜를 보내도 오늘 받은 사실이 지워지면 안 된다
	// (지워지면 기기를 옮겨 가며 같은 날 무료팩을 여러 번 받을 수 있다).
	b := domain.NewCollection("u1")
	b.LastDailyPack = "2026-08-06"
	got, _ := s.Sync(ctx, "u1", b)

	if got.LastDailyPack != "2026-08-07" {
		t.Fatalf("무료팩 수령일이 되감김: %q", got.LastDailyPack)
	}
}

func TestCollectionPityTakesLongerGap(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	a := domain.NewCollection("u1")
	a.SinceLegendary, a.SinceEpic = 30, 5
	s.Sync(ctx, "u1", a)

	// 천장은 '더 오래 못 받은 쪽'을 인정한다. 작은 값이 이기면 기기를 바꿔
	// 가며 천장을 초기화해 상위 등급을 계속 앞당길 수 있다.
	b := domain.NewCollection("u1")
	b.SinceLegendary, b.SinceEpic = 2, 1
	got, _ := s.Sync(ctx, "u1", b)

	if got.SinceLegendary != 30 || got.SinceEpic != 5 {
		t.Fatalf("천장이 초기화됨: %+v", got)
	}
}

func TestCollectionClampsAbsurdInput(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	in := domain.NewCollection("u1")
	in.PacksEarned = 1 << 40
	in.SinceLegendary = 99999
	in.Owned["x"] = -5
	in.Owned["ok"] = 1 << 30
	got, _ := s.Sync(ctx, "u1", in)

	if got.PacksEarned != maxCounterValue {
		t.Fatalf("팩 카운터가 잘리지 않음: %d", got.PacksEarned)
	}
	if got.SinceLegendary != maxPityValue {
		t.Fatalf("천장 값이 잘리지 않음: %d", got.SinceLegendary)
	}
	if _, ok := got.Owned["x"]; ok {
		t.Fatalf("음수 보유 장수가 저장됨: %+v", got.Owned)
	}
	if got.Owned["ok"] != maxCopiesPerCard {
		t.Fatalf("보유 장수가 잘리지 않음: %d", got.Owned["ok"])
	}
}

func TestCollectionRejectsOversizedIDs(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	in := domain.NewCollection("u1")
	in.Owned[strings.Repeat("z", maxCardIDLen+1)] = 1
	in.Owned["fine"] = 1
	got, _ := s.Sync(ctx, "u1", in)

	if len(got.Owned) != 1 || got.Owned["fine"] != 1 {
		t.Fatalf("과도한 길이의 id 가 통과함: %+v", got.Owned)
	}
}

func TestCollectionCapsEntryCount(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	in := domain.NewCollection("u1")
	for i := 0; i < maxOwnedEntries+500; i++ {
		in.Owned[itoa(i)] = 1
	}
	got, _ := s.Sync(ctx, "u1", in)

	// 한 요청으로 저장소를 가득 채울 수 없어야 한다.
	if len(got.Owned) != maxOwnedEntries {
		t.Fatalf("보유 카드 수 상한이 지켜지지 않음: %d", len(got.Owned))
	}
}

func TestCollectionIsolatedPerUser(t *testing.T) {
	ctx := context.Background()
	s := newCollectionSvc()

	mine := domain.NewCollection("u1")
	mine.PacksEarned = 50
	s.Sync(ctx, "u1", mine)

	other, _ := s.Get(ctx, "u2")
	if other.PacksEarned != 0 {
		t.Fatalf("남의 도감이 새어 나옴: %+v", other)
	}
}

func TestCollectionStoredCopyIsIndependent(t *testing.T) {
	ctx := context.Background()
	repo := memory.NewCollectionRepo()
	s := NewCollectionService(repo)

	in := domain.NewCollection("u1")
	in.Owned["elb"] = 1
	s.Sync(ctx, "u1", in)

	// 호출자가 들고 있던 맵을 나중에 고쳐도 저장소 안이 바뀌면 안 된다.
	in.Owned["elb"] = 999
	got, _ := s.Get(ctx, "u1")
	if got.Owned["elb"] != 1 {
		t.Fatalf("저장소가 호출자의 맵을 공유함: %d", got.Owned["elb"])
	}
}
