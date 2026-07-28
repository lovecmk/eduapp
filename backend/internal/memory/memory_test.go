package memory

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// memory 저장소는 기본 구동 모드이고 모든 통합 테스트가 이 위에서 돈다.
// 그런데 정작 이 패키지에는 테스트가 하나도 없었다 — 여기가 틀리면
// 다른 곳의 테스트가 통과해도 실제로는 틀린 것을 검증한 셈이 된다.
//
// 특히 유일성은 저장소가 지켜야 한다. 서비스 계층의 "확인 → 생성"에는
// 두 호출 사이에 틈이 있어 동시 가입을 막지 못한다.

func user(id, loginID, nickname string) *domain.User {
	return &domain.User{ID: id, LoginID: loginID, Nickname: nickname}
}

func TestUserRepoCreateRejectsDuplicateLoginID(t *testing.T) {
	ctx := context.Background()
	r := NewUserRepo()

	if err := r.Create(ctx, user("u1", "same", "A")); err != nil {
		t.Fatalf("첫 생성은 성공해야 한다: %v", err)
	}

	err := r.Create(ctx, user("u2", "same", "B"))
	var conflict ports.ErrConflict
	if !asConflict(err, &conflict) {
		t.Fatalf("ErrConflict 를 기대했다: %v", err)
	}
	if conflict.Field != "login_id" {
		t.Errorf("어느 필드가 겹쳤는지 알려 줘야 한다: %q", conflict.Field)
	}
}

func TestUserRepoCreateRejectsDuplicateNicknameIgnoringCase(t *testing.T) {
	// FindByNickname 과 Postgres 유니크 인덱스가 대소문자를 무시하므로
	// 여기서만 구분하면 저장소마다 동작이 갈린다.
	ctx := context.Background()
	r := NewUserRepo()
	_ = r.Create(ctx, user("u1", "a", "Inspector"))

	err := r.Create(ctx, user("u2", "b", "inspector"))
	var conflict ports.ErrConflict
	if !asConflict(err, &conflict) || conflict.Field != "nickname" {
		t.Fatalf("닉네임 충돌을 기대했다: %v", err)
	}
}

func TestUserRepoCreateAllowsEmptyNicknames(t *testing.T) {
	// 닉네임은 나중에 정할 수 있다. 빈 값끼리 충돌하면 가입 자체가 막힌다.
	ctx := context.Background()
	r := NewUserRepo()
	if err := r.Create(ctx, user("u1", "a", "")); err != nil {
		t.Fatalf("첫 빈 닉네임: %v", err)
	}
	if err := r.Create(ctx, user("u2", "b", "")); err != nil {
		t.Fatalf("빈 닉네임끼리는 충돌하면 안 된다: %v", err)
	}
}

func TestUserRepoConcurrentCreateLetsExactlyOneWin(t *testing.T) {
	// 이 저장소가 존재하는 이유 그 자체 — 검사와 저장이 한 잠금 안에 있어야 한다.
	ctx := context.Background()
	r := NewUserRepo()

	const n = 50
	var wg sync.WaitGroup
	errs := make([]error, n)
	start := make(chan struct{})

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			errs[i] = r.Create(ctx, user(fmt.Sprintf("u%d", i), "race", ""))
		}(i)
	}
	close(start)
	wg.Wait()

	won := 0
	for _, err := range errs {
		if err == nil {
			won++
		}
	}
	if won != 1 {
		t.Fatalf("정확히 한 명만 성공해야 한다, 실제: %d", won)
	}

	count, _ := r.Count(ctx)
	if count != 1 {
		t.Fatalf("저장된 사용자도 한 명이어야 한다, 실제: %d", count)
	}
}

func TestUserRepoUpdateRemovesStaleLoginIndex(t *testing.T) {
	// 옛 색인이 남으면 바꾸기 전 아이디로도 로그인된다.
	ctx := context.Background()
	r := NewUserRepo()
	_ = r.Create(ctx, user("u1", "old", "A"))

	u := user("u1", "new", "A")
	if err := r.Update(ctx, u); err != nil {
		t.Fatalf("수정 실패: %v", err)
	}

	if _, err := r.FindByLoginID(ctx, "old"); err == nil {
		t.Error("바꾸기 전 아이디로는 찾히면 안 된다")
	}
	if got, err := r.FindByLoginID(ctx, "new"); err != nil || got.ID != "u1" {
		t.Errorf("새 아이디로 찾혀야 한다: %v %v", got, err)
	}
}

func TestUserRepoUpdateAllowsKeepingOwnValues(t *testing.T) {
	// 자기 아이디·닉네임을 그대로 두고 다른 필드만 고치는 것이 가장 흔한 수정이다.
	ctx := context.Background()
	r := NewUserRepo()
	_ = r.Create(ctx, user("u1", "a", "Nick"))

	if err := r.Update(ctx, user("u1", "a", "Nick")); err != nil {
		t.Fatalf("자기 값 유지는 충돌이 아니다: %v", err)
	}
}

func TestUserRepoUpdateRejectsTakenValues(t *testing.T) {
	ctx := context.Background()
	r := NewUserRepo()
	_ = r.Create(ctx, user("u1", "a", "A"))
	_ = r.Create(ctx, user("u2", "b", "B"))

	var conflict ports.ErrConflict
	if err := r.Update(ctx, user("u2", "a", "B")); !asConflict(err, &conflict) || conflict.Field != "login_id" {
		t.Errorf("남의 아이디로 못 바꿔야 한다: %v", err)
	}
	if err := r.Update(ctx, user("u2", "b", "a")); err == nil {
		t.Error("남의 닉네임으로 못 바꿔야 한다")
	}
}

func TestUserRepoUpdateUnknownUserIsNotFound(t *testing.T) {
	r := NewUserRepo()
	err := r.Update(context.Background(), user("ghost", "x", ""))
	var nf ports.ErrNotFound
	if !asNotFound(err, &nf) {
		t.Fatalf("ErrNotFound 를 기대했다: %v", err)
	}
}

func TestUserRepoFindReturnsCopyNotPointerIntoStore(t *testing.T) {
	// 내부 맵을 그대로 넘기면 호출자가 저장소를 몰래 바꾼다.
	ctx := context.Background()
	r := NewUserRepo()
	_ = r.Create(ctx, user("u1", "a", "A"))

	got, err := r.FindByID(ctx, "u1")
	if err != nil {
		t.Fatalf("조회 실패: %v", err)
	}
	got.Nickname = "해킹됨"

	again, _ := r.FindByID(ctx, "u1")
	if again.Nickname != "A" {
		t.Errorf("반환값을 고쳤더니 저장소가 바뀌었다: %q", again.Nickname)
	}
}

func TestUserRepoFindMissingReturnsNotFound(t *testing.T) {
	ctx := context.Background()
	r := NewUserRepo()
	for name, err := range map[string]error{
		"byID":       second(r.FindByID(ctx, "none")),
		"byLoginID":  second(r.FindByLoginID(ctx, "none")),
		"byNickname": second(r.FindByNickname(ctx, "none")),
	} {
		var nf ports.ErrNotFound
		if !asNotFound(err, &nf) {
			t.Errorf("%s: ErrNotFound 를 기대했다: %v", name, err)
		}
	}
}

func TestUserRepoListIsStableAcrossCalls(t *testing.T) {
	// 맵 순회는 무작위다. 정렬하지 않으면 같은 조건으로 두 번 물었을 때
	// 다른 페이지가 나와 관리 콘솔의 페이지 넘김이 어긋난다.
	ctx := context.Background()
	r := NewUserRepo()
	for i := 0; i < 12; i++ {
		_ = r.Create(ctx, user(fmt.Sprintf("u%02d", i), fmt.Sprintf("id%02d", i), ""))
	}

	first, total, err := r.List(ctx, ports.UserQuery{Limit: 5})
	if err != nil {
		t.Fatalf("목록 실패: %v", err)
	}
	if total != 12 {
		t.Errorf("전체 수는 잘라내기와 무관해야 한다: %d", total)
	}
	if len(first) != 5 {
		t.Fatalf("Limit 이 지켜져야 한다: %d", len(first))
	}

	for i := 0; i < 5; i++ {
		again, _, _ := r.List(ctx, ports.UserQuery{Limit: 5})
		for j := range first {
			if again[j].ID != first[j].ID {
				t.Fatalf("호출마다 순서가 달라진다: %s vs %s", again[j].ID, first[j].ID)
			}
		}
	}
}

func TestAuditRepoKeepsNewestWithinCap(t *testing.T) {
	ctx := context.Background()
	r := NewAuditRepo()

	// 상한(1000)을 넘겨 넣고, 오래된 것이 밀려나는지 본다.
	for i := 0; i < 1100; i++ {
		_ = r.Append(ctx, domain.AuditLog{Action: fmt.Sprintf("a%d", i)})
	}

	logs, err := r.List(ctx, 5)
	if err != nil {
		t.Fatalf("목록 실패: %v", err)
	}
	if len(logs) != 5 {
		t.Fatalf("limit 이 지켜져야 한다: %d", len(logs))
	}
	// 가장 최근 것이 먼저 나와야 감사 로그로 쓸 수 있다.
	if logs[0].Action != "a1099" {
		t.Errorf("최신순이어야 한다, 실제 선두: %q", logs[0].Action)
	}
}

func TestAuditRepoListHandlesLimitBeyondSize(t *testing.T) {
	ctx := context.Background()
	r := NewAuditRepo()
	_ = r.Append(ctx, domain.AuditLog{Action: "only"})

	logs, err := r.List(ctx, 100)
	if err != nil {
		t.Fatalf("한도가 크다고 실패하면 안 된다: %v", err)
	}
	if len(logs) != 1 {
		t.Errorf("있는 만큼만 돌려줘야 한다: %d", len(logs))
	}
}

func TestPushTokenRepoSaveIsIdempotent(t *testing.T) {
	// 앱은 실행할 때마다 토큰을 다시 보낸다. 매번 쌓이면 한 사람에게 여러 번 발송된다.
	ctx := context.Background()
	r := NewPushTokenRepo()

	_ = r.Save(ctx, domain.PushToken{Token: "t1", UserID: "u1"})
	_ = r.Save(ctx, domain.PushToken{Token: "t1", UserID: "u1"})

	all, err := r.All(ctx)
	if err != nil {
		t.Fatalf("조회 실패: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("같은 토큰은 한 번만 남아야 한다: %d", len(all))
	}

	if err := r.Delete(ctx, "t1"); err != nil {
		t.Fatalf("삭제 실패: %v", err)
	}
	all, _ = r.All(ctx)
	if len(all) != 0 {
		t.Errorf("삭제 후에는 비어야 한다: %d", len(all))
	}
}

func TestCardRepoUpdateAndDeleteUnknownCard(t *testing.T) {
	ctx := context.Background()
	r := NewCardRepo()

	if err := r.UpdateCard(ctx, domain.Card{ID: "ghost"}); err == nil {
		t.Error("없는 카드 수정은 실패해야 한다")
	}
	if err := r.DeleteCard(ctx, "ghost"); err == nil {
		t.Error("없는 카드 삭제는 실패해야 한다")
	}
}

func TestCardRepoProgressIsPerUser(t *testing.T) {
	// 진행도가 사용자별로 갈리지 않으면 남의 학습 상태가 내 화면에 보인다.
	ctx := context.Background()
	r := NewCardRepo()
	_ = r.InsertCards(ctx, []domain.Card{{ID: "c1"}, {ID: "c2"}})

	_ = r.UpsertProgress(ctx, domain.Progress{UserID: "u1", CardID: "c1", Status: "mastered"})
	_ = r.UpsertProgress(ctx, domain.Progress{UserID: "u2", CardID: "c2", Status: "learning"})

	p1, err := r.ProgressFor(ctx, "u1")
	if err != nil {
		t.Fatalf("조회 실패: %v", err)
	}
	if len(p1) != 1 {
		t.Fatalf("자기 것만 보여야 한다: %d", len(p1))
	}
	if _, leaked := p1["c2"]; leaked {
		t.Error("남의 진행도가 섞였다")
	}
}

func TestCardRepoUpsertProgressOverwrites(t *testing.T) {
	ctx := context.Background()
	r := NewCardRepo()
	_ = r.InsertCards(ctx, []domain.Card{{ID: "c1"}})

	_ = r.UpsertProgress(ctx, domain.Progress{UserID: "u1", CardID: "c1", Status: "learning"})
	_ = r.UpsertProgress(ctx, domain.Progress{UserID: "u1", CardID: "c1", Status: "mastered"})

	p, _ := r.ProgressFor(ctx, "u1")
	if len(p) != 1 {
		t.Fatalf("같은 카드는 한 줄이어야 한다: %d", len(p))
	}
	if p["c1"].Status != "mastered" {
		t.Errorf("나중 값이 이겨야 한다: %q", p["c1"].Status)
	}
}

// --- 작은 도우미 ------------------------------------------------------------

func asConflict(err error, out *ports.ErrConflict) bool {
	c, ok := err.(ports.ErrConflict)
	if ok {
		*out = c
	}
	return ok
}

func asNotFound(err error, out *ports.ErrNotFound) bool {
	n, ok := err.(ports.ErrNotFound)
	if ok {
		*out = n
	}
	return ok
}

func second[T any](_ T, err error) error { return err }
