package service

import (
	"strings"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 처방의 값어치는 정확도가 아니라 **반박 가능성**에 있다.
//
// "이 사람에게 전기 교육을 하세요"만 뜨면 담당자는 둘 중 하나를 한다 —
// 그대로 믿거나(위험), 무시하거나(무의미). 근거가 붙어 있어야 세 번째가 생긴다:
// 읽고 따져 본 뒤 하거나 안 하거나. 그래서 아래 테스트의 절반은 "근거가 붙어
// 있는가"를 본다. 근거 없는 처방이 하나라도 새어 나가면 화면 전체가 지시가 된다.

// assertEvidenceComplete 는 근거 한 줄이 검증 가능한 형태인지 본다.
func assertEvidenceComplete(t *testing.T, where string, ev []Evidence) {
	t.Helper()
	if len(ev) == 0 {
		t.Fatalf("%s: 근거 없는 처방은 지시일 뿐이다", where)
	}
	for i, e := range ev {
		if e.Fact == "" {
			t.Errorf("%s 근거[%d]: 무엇을 관측했는지 없다", where, i)
		}
		if e.Observed == "" {
			t.Errorf("%s 근거[%d]: 관측값이 없으면 따져 볼 수가 없다", where, i)
		}
		if e.Rule == "" {
			t.Errorf("%s 근거[%d]: 어떤 기준을 넘어 처방이 됐는지 없다", where, i)
		}
		if e.Source == "" {
			t.Errorf("%s 근거[%d]: 원본을 찾아갈 수 없으면 반박도 못 한다", where, i)
		}
		switch e.Strength {
		case "strong", "moderate", "weak":
		default:
			t.Errorf("%s 근거[%d]: 알 수 없는 세기 %q", where, i, e.Strength)
		}
	}
}

func findPrescription(ps []Prescription, id string) (Prescription, bool) {
	for _, p := range ps {
		if p.ID == id {
			return p, true
		}
	}
	return Prescription{}, false
}

// weakCategoryInput 은 'ELEC 분야가 이 사람만의 약점'인 상황을 만든다.
// reps 로 표본 크기를 조절해 근거의 세기를 확인한다.
func weakCategoryInput(cardCount, repsPerCard, lapsesPerCard int) LearnerInput {
	states := map[string]domain.SrsState{}
	cards := []domain.Card{}
	peers := map[string]ports.CardLearningStat{}
	for i := 0; i < cardCount; i++ {
		id := string(rune('a'+i)) + "1"
		states[id] = srs(0, repsPerCard, lapsesPerCard, "again", testNow)
		cards = append(cards, choiceCard(id, "ELEC", 1))
		// 또래는 10%만 틀린다 — 문제가 어려운 게 아니다.
		peers[id] = ports.CardLearningStat{
			CardID: id, Learners: 30, Reps: 300, Lapses: 30, Mastered: 24,
		}
	}
	return learnerInput(states, cards, peers)
}

// ─────────────────────────────────────────────────────────────────────────────
// 불변식: 어떤 처방도 근거 없이 나오지 않는다
// ─────────────────────────────────────────────────────────────────────────────

func TestEveryPrescriptionCarriesEvidence(t *testing.T) {
	// 상황을 바꿔 가며 나오는 모든 처방을 훑는다. 규칙을 새로 넣을 때
	// 근거를 빼먹으면 여기서 걸려야 한다.
	cases := map[string]LearnerInput{
		"약점 분야": weakCategoryInput(4, 10, 7),
		"학습 없음": learnerInput(map[string]domain.SrsState{}, nil, nil),
		"끊긴 학습": func() LearnerInput {
			in := weakCategoryInput(4, 10, 7)
			old := testNow.AddDate(0, 0, -40)
			for id, st := range in.States {
				st.LastReviewedAt = &old
				in.States[id] = st
			}
			return in
		}(),
		"공통 난제": func() LearnerInput {
			in := weakCategoryInput(4, 10, 7)
			for id, p := range in.PeerStats {
				p.Lapses = 240 // 또래도 80% 틀린다
				in.PeerStats[id] = p
			}
			return in
		}(),
	}

	for name, in := range cases {
		got := BuildLearnerDiagnosis(in)
		if len(got.Prescriptions) == 0 {
			t.Errorf("%s: 처방이 하나는 나와야 한다", name)
		}
		for _, p := range got.Prescriptions {
			assertEvidenceComplete(t, name+"/"+p.ID, p.Evidence)
			if p.Why == "" {
				t.Errorf("%s/%s: '왜 이 사람인가'가 비어 있다", name, p.ID)
			}
			if p.Action == "" {
				t.Errorf("%s/%s: 무엇을 할지 없으면 처방이 아니다", name, p.ID)
			}
			if p.Expect == "" {
				t.Errorf("%s/%s: 기대 변화가 없으면 나중에 검증할 수 없다", name, p.ID)
			}
		}
	}
}

func TestPrescriptionEvidenceQuotesTheSameNumbersAsTheTable(t *testing.T) {
	// 표에는 70% 라고 쓰여 있는데 근거 문장이 68% 라고 하면 관리자는 둘 다 안 믿는다.
	got := BuildLearnerDiagnosis(weakCategoryInput(4, 10, 7))
	p, ok := findPrescription(got.Prescriptions, "category:ELEC")
	if !ok {
		t.Fatalf("분야 처방이 나와야 한다: %+v", got.Prescriptions)
	}

	var w CategoryWeakness
	for _, cw := range got.Weakness {
		if cw.Category == "ELEC" {
			w = cw
		}
	}
	mine, peer := pctText(w.LapseRate), pctText(w.PeerRate)
	if !strings.Contains(p.Evidence[0].Observed, mine) {
		t.Errorf("근거가 표와 다른 본인 실패율을 말한다: %q vs %q", p.Evidence[0].Observed, mine)
	}
	if !strings.Contains(p.Evidence[0].Compared, peer) {
		t.Errorf("근거가 표와 다른 또래 실패율을 말한다: %q vs %q", p.Evidence[0].Compared, peer)
	}
	if !strings.Contains(p.Why, peer) || !strings.Contains(p.Why, mine) {
		t.Errorf("'왜'에 비교 대상 숫자가 함께 있어야 한다: %q", p.Why)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 표본이 모자라면 처방하지 않는다
// ─────────────────────────────────────────────────────────────────────────────

func TestNoCategoryPrescriptionFromTooFewCards(t *testing.T) {
	// 두 장 틀린 걸로 '이 분야가 약하다'고 하면 그 분야 전체를 오해하게 된다.
	got := BuildLearnerDiagnosis(weakCategoryInput(2, 10, 9))
	if _, ok := findPrescription(got.Prescriptions, "category:ELEC"); ok {
		t.Errorf("표본이 모자라면 분야 처방을 내면 안 된다: %+v", got.Prescriptions)
	}
}

func TestNoCategoryPrescriptionFromTooFewAttempts(t *testing.T) {
	// 분야당 시도 3회(1회 × 3장)는 그날 컨디션이지 실력이 아니다.
	got := BuildLearnerDiagnosis(weakCategoryInput(3, 1, 1))
	if _, ok := findPrescription(got.Prescriptions, "category:ELEC"); ok {
		t.Errorf("시도가 모자라면 분야 처방을 내면 안 된다: %+v", got.Prescriptions)
	}
}

func TestConfidenceDropsWithSmallSample(t *testing.T) {
	// 같은 결론이라도 6회짜리 관측과 200회짜리 관측을 같은 무게로 두면 안 된다.
	small, _ := findPrescription(
		BuildLearnerDiagnosis(weakCategoryInput(3, 2, 2)).Prescriptions, "category:ELEC")
	large, _ := findPrescription(
		BuildLearnerDiagnosis(weakCategoryInput(6, 40, 28)).Prescriptions, "category:ELEC")

	if small.ID == "" || large.ID == "" {
		t.Fatalf("두 경우 모두 분야 처방이 나와야 비교가 된다: %q / %q", small.ID, large.ID)
	}
	if large.Confidence != "high" {
		t.Errorf("표본이 크면 확신도가 높아야 한다: %q", large.Confidence)
	}
	if small.Confidence == "high" {
		t.Errorf("표본이 작은데 확신도가 높으면 근거를 과장한 것이다: %q", small.Confidence)
	}
}

func TestUnknownSignalCardsNeverBecomeCoaching(t *testing.T) {
	// 또래 표본이 없어 판단을 보류한 문제를 개인 코칭으로 올리면
	// 없는 약점을 만들어 시간을 버린다.
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 10, 9, "again", testNow)},
		[]domain.Card{choiceCard("c1", "ELEC", 1)},
		map[string]ports.CardLearningStat{"c1": {Learners: 2, Reps: 20, Lapses: 2}},
	)
	got := BuildLearnerDiagnosis(in)
	if _, ok := findPrescription(got.Prescriptions, "cards:personal"); ok {
		t.Errorf("비교 못 한 문제로 코칭을 처방하면 안 된다: %+v", got.Prescriptions)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 개인 약점 vs 콘텐츠 문제 — 처방이 갈려야 한다
// ─────────────────────────────────────────────────────────────────────────────

func TestSharedDifficultyBecomesContentFixNotCoaching(t *testing.T) {
	// 다들 틀리는 문제를 개인 코칭으로 처방하면, 같은 설명을 사람 수만큼 반복하게 된다.
	in := weakCategoryInput(4, 10, 8)
	for id, p := range in.PeerStats {
		p.Lapses = 240 // 또래 80%
		in.PeerStats[id] = p
	}
	got := BuildLearnerDiagnosis(in)

	if _, ok := findPrescription(got.Prescriptions, "cards:personal"); ok {
		t.Errorf("공통 난제를 개인 코칭으로 돌리면 안 된다: %+v", got.Prescriptions)
	}
	if _, ok := findPrescription(got.Prescriptions, "category:ELEC"); ok {
		t.Errorf("공통 난제 분야를 개인 재교육으로 돌리면 안 된다: %+v", got.Prescriptions)
	}
	content, ok := findPrescription(got.Prescriptions, "content")
	if !ok {
		t.Fatalf("문제·자료를 손보라는 처방이 나와야 한다: %+v", got.Prescriptions)
	}
	if content.Priority == "now" {
		t.Errorf("급하긴 해도 '이 사람'의 일이 아니다 — 개인 처방과 같은 급으로 두면 안 된다: %q", content.Priority)
	}
}

func TestCategoryPrescriptionExcludesSharedCards(t *testing.T) {
	// 분야는 약점이 맞지만, 그 안에 섞인 '다들 틀리는 문제'까지 코칭하면
	// 개인 코칭 시간이 콘텐츠 문제로 새어 나간다.
	in := weakCategoryInput(4, 10, 7)
	in.States["hard"] = srs(0, 10, 9, "again", testNow)
	in.Cards = append(in.Cards, choiceCard("hard", "ELEC", 1))
	in.PeerStats["hard"] = ports.CardLearningStat{Learners: 30, Reps: 300, Lapses: 240}

	got := BuildLearnerDiagnosis(in)
	p, ok := findPrescription(got.Prescriptions, "category:ELEC")
	if !ok {
		t.Fatalf("분야 처방이 나와야 한다: %+v", got.Prescriptions)
	}
	for _, c := range p.Cards {
		if c.CardID == "hard" {
			t.Errorf("다들 틀리는 문제가 개인 코칭 목록에 들어갔다: %+v", p.Cards)
		}
	}
}

// scatteredWeaknessInput 은 '분야로 묶이지 않는 낱장 약점'을 만든다.
// 분야당 2장뿐이라 분야 처방의 최소 표본에 못 미친다 — 낱장 코칭만 남아야 한다.
func scatteredWeaknessInput() LearnerInput {
	states := map[string]domain.SrsState{}
	cards := []domain.Card{}
	peers := map[string]ports.CardLearningStat{}
	for _, cat := range []string{"ELEC", "FIRE"} {
		for j := 0; j < 2; j++ {
			id := cat + string(rune('a'+j))
			states[id] = srs(0, 10, 8, "again", testNow)
			cards = append(cards, choiceCard(id, cat, 1))
			peers[id] = ports.CardLearningStat{
				CardID: id, Learners: 30, Reps: 300, Lapses: 30, Mastered: 24,
			}
		}
	}
	return learnerInput(states, cards, peers)
}

func TestCategoryPrescriptionAbsorbsItsCards(t *testing.T) {
	// 같은 여섯 장이 '분야 재교육'과 '개별 코칭'에 나란히 뜨면, 담당자는 그걸
	// 48분짜리 일로 읽는다. 실제로는 한 가지 일이다.
	got := BuildLearnerDiagnosis(weakCategoryInput(4, 10, 7))
	cat, ok := findPrescription(got.Prescriptions, "category:ELEC")
	if !ok {
		t.Fatalf("분야 처방이 나와야 한다: %+v", got.Prescriptions)
	}
	in := map[string]bool{}
	for _, c := range cat.Cards {
		in[c.CardID] = true
	}

	if solo, ok := findPrescription(got.Prescriptions, "cards:personal"); ok {
		for _, c := range solo.Cards {
			if in[c.CardID] {
				t.Errorf("같은 문제가 두 처방에 겹쳐 있다: %s", c.CardID)
			}
		}
	}
}

func TestPrescribedCardSaysWhyItWasPicked(t *testing.T) {
	// 목록만 주면 순서의 뜻이 사라진다. 한 장 한 장에 이유가 붙어야 한다.
	got := BuildLearnerDiagnosis(scatteredWeaknessInput())
	p, ok := findPrescription(got.Prescriptions, "cards:personal")
	if !ok {
		t.Fatalf("개인 오답 코칭이 나와야 한다: %+v", got.Prescriptions)
	}
	if len(p.Cards) == 0 {
		t.Fatal("코칭할 문제를 지목해야 한다")
	}
	for _, c := range p.Cards {
		if c.Reason == "" {
			t.Errorf("왜 이 문제가 뽑혔는지 없다: %+v", c)
		}
		if !strings.Contains(c.Reason, peerWord) {
			t.Errorf("비교 대상이 빠지면 '어려운 문제'와 구분이 안 된다: %q", c.Reason)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 순서 — 교육이 성립하기 위한 선행 조건이 먼저다
// ─────────────────────────────────────────────────────────────────────────────

func TestComingBackOutranksContentTeaching(t *testing.T) {
	// 아무리 정확히 짚어도 학습 화면에 오지 않으면 전달되지 않는다.
	in := weakCategoryInput(6, 10, 7)
	old := testNow.AddDate(0, 0, -40)
	for id, st := range in.States {
		st.LastReviewedAt = &old
		in.States[id] = st
	}
	got := BuildLearnerDiagnosis(in)

	if len(got.Prescriptions) == 0 {
		t.Fatal("처방이 있어야 한다")
	}
	if got.Prescriptions[0].Kind != "engagement" {
		t.Errorf("복귀가 1순위여야 한다: %s(%s)",
			got.Prescriptions[0].ID, got.Prescriptions[0].Kind)
	}
	if got.Prescriptions[0].Rank != 1 {
		t.Errorf("순위가 1부터 매겨져야 한다: %d", got.Prescriptions[0].Rank)
	}
}

func TestOnboardingIsTheOnlyPrescriptionForUntouchedLearner(t *testing.T) {
	// 측정된 적이 없는 것은 '약점 없음'도 '약점 있음'도 아니다.
	// 여기서 내용 교육을 배정하면 그게 바로 근거 없는 배정이다.
	got := BuildLearnerDiagnosis(learnerInput(map[string]domain.SrsState{}, nil, nil))
	if len(got.Prescriptions) != 1 {
		t.Fatalf("진입 안내 하나만 나와야 한다: %+v", got.Prescriptions)
	}
	if got.Prescriptions[0].Kind != "onboarding" {
		t.Errorf("가입만 한 사람에게 약점을 지어내면 안 된다: %q", got.Prescriptions[0].Kind)
	}
}

func TestRanksAreSequentialAndBounded(t *testing.T) {
	in := weakCategoryInput(8, 20, 16)
	// 다른 분야까지 약하게 만들어 처방이 상한을 넘도록 한다.
	for _, cat := range []string{"FIRE", "CHEM", "GAS", "MECH", "HEIGHT"} {
		id := cat + "1"
		for i := 0; i < 3; i++ {
			cid := id + string(rune('a'+i))
			in.States[cid] = srs(0, 10, 8, "again", testNow)
			in.Cards = append(in.Cards, choiceCard(cid, cat, 1))
			in.PeerStats[cid] = ports.CardLearningStat{Learners: 30, Reps: 300, Lapses: 30}
		}
	}
	got := BuildLearnerDiagnosis(in)

	if len(got.Prescriptions) > maxPrescriptions {
		t.Fatalf("우선순위가 없는 목록은 안 읽힌다 — %d개는 너무 많다", len(got.Prescriptions))
	}
	for i, p := range got.Prescriptions {
		if p.Rank != i+1 {
			t.Errorf("순위가 이어지지 않는다: [%d] rank=%d", i, p.Rank)
		}
		if i > 0 && got.Prescriptions[i-1].Score < p.Score {
			t.Errorf("점수 내림차순이 깨졌다: %v < %v", got.Prescriptions[i-1].Score, p.Score)
		}
	}
}

func TestPrescriptionsAreDeterministic(t *testing.T) {
	// map 을 훑어 만들기 때문에 정렬이 약하면 새로고침마다 순서가 바뀐다.
	// 순서가 흔들리는 화면은 "어제 1순위였던 게 사라졌다"로 읽힌다.
	var first []string
	for i := 0; i < 8; i++ {
		got := BuildLearnerDiagnosis(weakCategoryInput(6, 10, 7))
		ids := make([]string, 0, len(got.Prescriptions))
		for _, p := range got.Prescriptions {
			ids = append(ids, p.ID)
		}
		if i == 0 {
			first = ids
			continue
		}
		if strings.Join(ids, ",") != strings.Join(first, ",") {
			t.Fatalf("같은 입력에 다른 순서가 나왔다: %v vs %v", first, ids)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 문제가 없으면 만들어 내지 않는다
// ─────────────────────────────────────────────────────────────────────────────

func TestNoPrescriptionForHealthyLearner(t *testing.T) {
	// 억지로 교육을 배정하면 관리자는 이 화면 전체를 믿지 않게 된다.
	states := map[string]domain.SrsState{}
	cards := []domain.Card{}
	peers := map[string]ports.CardLearningStat{}
	for i := 0; i < 12; i++ {
		id := "ok" + string(rune('a'+i))
		states[id] = srs(5, 10, 0, "easy", testNow)
		cards = append(cards, choiceCard(id, "ELEC", 1))
		peers[id] = ports.CardLearningStat{Learners: 30, Reps: 300, Lapses: 30, Mastered: 24}
	}
	in := learnerInput(states, cards, peers)
	in.Days = map[string]struct{}{}
	for i := 0; i < habitActiveDays+1; i++ {
		in.Days[DayKey(testNow.AddDate(0, 0, -i))] = struct{}{}
	}

	got := BuildLearnerDiagnosis(in)
	if len(got.Prescriptions) != 0 {
		t.Errorf("가르칠 것이 없으면 없다고 해야 한다: %+v", got.Prescriptions)
	}
	if got.Needs != "지금 배정할 교육 없음" {
		t.Errorf("목록 화면에도 '없음'이 그대로 보여야 한다: %q", got.Needs)
	}
}

func TestRetentionPrescriptionWhenLearningDoesNotStick(t *testing.T) {
	// 새 문제는 푸는데 남지 않는 사람에게 새 분야를 더 배정하면 흘러가기만 한다.
	states := map[string]domain.SrsState{}
	cards := []domain.Card{}
	peers := map[string]ports.CardLearningStat{}
	for i := 0; i < 12; i++ {
		id := "r" + string(rune('a'+i))
		// 상자 1 — 계속 풀지만 쌓이지 않는다. 실패율 자체는 또래와 비슷하다.
		states[id] = srs(1, 10, 1, "hard", testNow)
		cards = append(cards, choiceCard(id, "ELEC", 1))
		peers[id] = ports.CardLearningStat{Learners: 30, Reps: 300, Lapses: 30, Mastered: 24}
	}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))

	p, ok := findPrescription(got.Prescriptions, "retention")
	if !ok {
		t.Fatalf("복습 주기 처방이 나와야 한다: %+v", got.Prescriptions)
	}
	assertEvidenceComplete(t, "retention", p.Evidence)
	if len(p.Cards) != 0 {
		t.Errorf("복습 주기는 특정 문제의 일이 아니다: %+v", p.Cards)
	}
}

func TestRetentionStaysQuietWhenAContentGapExplainsIt(t *testing.T) {
	// 이 처방은 "내용은 아는데 복습 시점을 놓쳐 되돌아간다"고 주장한다.
	// 약한 분야가 이미 잡혔다면 그 주장은 사실이 아니다 — 숙달률이 낮은 이유가
	// 바로 그 분야를 계속 틀려서다. 근거가 서지 않는 처방은 내지 않는다.
	got := BuildLearnerDiagnosis(weakCategoryInput(12, 10, 8))

	if _, ok := findPrescription(got.Prescriptions, "category:ELEC"); !ok {
		t.Fatalf("분야 처방이 있어야 이 검사가 의미 있다: %+v", got.Prescriptions)
	}
	if _, ok := findPrescription(got.Prescriptions, "retention"); ok {
		t.Errorf("약점이 설명하는 숙달률 저하를 복습 주기 탓으로 돌리면 안 된다: %+v", got.Prescriptions)
	}
}

func TestNeedsSummarisesWithoutOpeningDetail(t *testing.T) {
	// 목록 화면에서 상세를 열지 않고도 "뭐가 필요한 사람인지"가 보여야 쓸모 있다.
	got := BuildLearnerDiagnosis(weakCategoryInput(6, 20, 15))
	if got.Needs == "" || got.Needs == "지금 배정할 교육 없음" {
		t.Fatalf("필요한 교육이 있는데 한 줄 요약이 비었다: %q", got.Needs)
	}
	if !strings.Contains(got.Needs, got.Prescriptions[0].Title) {
		t.Errorf("1순위 처방이 요약에 없다: %q", got.Needs)
	}
}

func TestSummarizeNeedsCountsTheRest(t *testing.T) {
	// 두 개만 보여 주고 나머지를 숨기면 "이게 전부"로 읽힌다.
	ps := []Prescription{{Title: "가"}, {Title: "나"}, {Title: "다"}, {Title: "라"}}
	got := summarizeNeeds(ps)
	if !strings.Contains(got, "가 · 나") || !strings.Contains(got, "외 2건") {
		t.Errorf("남은 건수를 밝혀야 한다: %q", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 도우미 규칙
// ─────────────────────────────────────────────────────────────────────────────

func TestFoldConfidenceNeedsTwoAnglesForHigh(t *testing.T) {
	// 강한 근거 하나는 우연일 수 있다. 서로 다른 각도의 관측이 같은 결론을
	// 가리킬 때 비로소 '높음'이라고 말할 수 있다.
	cases := []struct {
		name string
		ev   []Evidence
		want string
	}{
		{"강 2", []Evidence{{Strength: "strong"}, {Strength: "strong"}}, "high"},
		{"강 1", []Evidence{{Strength: "strong"}, {Strength: "weak"}}, "medium"},
		{"중 2", []Evidence{{Strength: "moderate"}, {Strength: "moderate"}}, "medium"},
		{"중 1", []Evidence{{Strength: "moderate"}, {Strength: "weak"}}, "low"},
		{"없음", []Evidence{}, "low"},
	}
	for _, tc := range cases {
		if got := foldConfidence(tc.ev); got != tc.want {
			t.Errorf("%s: %q, 기대 %q", tc.name, got, tc.want)
		}
	}
}

func TestPriorityRisesWithTheSizeOfTheGap(t *testing.T) {
	// 임계를 갓 넘긴 것과 두 배로 넘긴 것을 같은 급으로 두면 순서가 사라진다.
	if got := priorityByGap(personalGapThreshold); got != "soon" {
		t.Errorf("갓 넘긴 격차: %q", got)
	}
	if got := priorityByGap(personalGapThreshold * 2); got != "now" {
		t.Errorf("두 배로 벌어진 격차: %q", got)
	}
}

func TestPrescriptionMinutesAreEstimated(t *testing.T) {
	// 소요 시간을 모르면 목록이 아무리 정확해도 "다음에 하자"가 된다.
	got := BuildLearnerDiagnosis(weakCategoryInput(6, 20, 15))
	for _, p := range got.Prescriptions {
		if p.Minutes <= 0 {
			t.Errorf("%s: 예상 소요 시간이 없다", p.ID)
		}
	}
}

func TestPrescriptionsNeverNil(t *testing.T) {
	// 프런트에서 null.map 으로 죽는다.
	got := BuildLearnerDiagnosis(learnerInput(map[string]domain.SrsState{}, nil, nil))
	if got.Prescriptions == nil {
		t.Error("빈 배열이어야 하고 null 이면 안 된다")
	}
	for _, p := range got.Prescriptions {
		if p.Cards == nil {
			t.Errorf("%s: Cards 가 null 이다", p.ID)
		}
	}
}
