package service

import (
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 이 진단의 값어치는 전부 한 가지 구분에 달려 있다:
// **이 사람의 약점인가, 원래 어려운 문제인가.**
// 그걸 못 나누면 관리자는 어려운 문제 순서대로 코칭하게 되고, 그건 헛수고다.

func srs(box, reps, lapses int, grade string, reviewed time.Time) domain.SrsState {
	s := domain.SrsState{Box: box, Ease: 2.3, Reps: reps, Lapses: lapses, LastGrade: grade}
	if !reviewed.IsZero() {
		s.LastReviewedAt = &reviewed
	}
	return s
}

func choiceCard(id, cat string, answerIdx int) domain.Card {
	i := answerIdx
	return domain.Card{
		ID: id, CategoryCd: cat, TitleTxt: id + " 제목", QuestionTxt: id + " 질문은?",
		DifficultyCd: domain.Medium, PrincipleTxt: id + " 원리",
		Choices: []string{"틀린보기", id + " 정답", "다른보기"}, AnswerIndex: &i,
	}
}

func learnerInput(states map[string]domain.SrsState, cards []domain.Card, peers map[string]ports.CardLearningStat) LearnerInput {
	return LearnerInput{
		Now:       testNow,
		User:      domain.User{ID: "u1", Nickname: "원진섭", OrgNm: "1공장"},
		States:    states,
		Days:      map[string]struct{}{},
		Cards:     cards,
		PeerStats: peers,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 핵심: 개인 약점 vs 공통 난제
// ─────────────────────────────────────────────────────────────────────────────

func TestMissedCardMarksPersonalWeakness(t *testing.T) {
	// 남들은 10%만 틀리는데 이 사람은 80% 틀린다 → 가르쳐야 할 사람이다.
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 10, 8, "again", testNow)},
		[]domain.Card{choiceCard("c1", "ELEC", 1)},
		map[string]ports.CardLearningStat{"c1": {CardID: "c1", Learners: 40, Reps: 400, Lapses: 40}},
	)
	got := BuildLearnerDiagnosis(in)
	if len(got.Missed) != 1 {
		t.Fatalf("오답 1건: %+v", got.Missed)
	}
	if got.Missed[0].Signal != "personal" {
		t.Errorf("이 사람만의 약점이어야 한다: %q (또래 %v)", got.Missed[0].Signal, got.Missed[0].PeerRate)
	}
}

func TestMissedCardMarksSharedDifficulty(t *testing.T) {
	// 다들 70% 틀리는 문제다 → 이 사람 잘못이 아니다. 콘텐츠를 손봐야 한다.
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 10, 8, "again", testNow)},
		[]domain.Card{choiceCard("c1", "ELEC", 1)},
		map[string]ports.CardLearningStat{"c1": {CardID: "c1", Learners: 40, Reps: 400, Lapses: 280}},
	)
	got := BuildLearnerDiagnosis(in)
	if got.Missed[0].Signal != "shared" {
		t.Errorf("모두 어려워하는 문제여야 한다: %q", got.Missed[0].Signal)
	}
}

func TestMissedCardWithoutPeersStaysUnknown(t *testing.T) {
	// 두 사람이 푼 문제로 '남들은 잘한다'를 말할 수 없다.
	// 여기서 personal 로 단정하면 없는 약점을 만들어 코칭 시간을 버린다.
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 10, 9, "again", testNow)},
		[]domain.Card{choiceCard("c1", "ELEC", 1)},
		map[string]ports.CardLearningStat{"c1": {CardID: "c1", Learners: 2, Reps: 20, Lapses: 2}},
	)
	got := BuildLearnerDiagnosis(in)
	if got.Missed[0].Signal != "unknown" {
		t.Errorf("판단을 보류해야 한다: %q", got.Missed[0].Signal)
	}
}

func TestMissedCardsPutPersonalWeaknessFirst(t *testing.T) {
	// 정렬이 뒤집히면 관리자는 '모두 어려운 문제'부터 코칭하게 된다.
	states := map[string]domain.SrsState{
		"shared":   srs(0, 10, 9, "again", testNow), // 많이 틀렸지만 다들 그렇다
		"personal": srs(0, 10, 5, "again", testNow), // 덜 틀렸지만 이 사람만 그렇다
	}
	cards := []domain.Card{choiceCard("shared", "ELEC", 1), choiceCard("personal", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{
		"shared":   {Learners: 40, Reps: 400, Lapses: 300}, // 75%
		"personal": {Learners: 40, Reps: 400, Lapses: 40},  // 10%
	}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if got.Missed[0].CardID != "personal" {
		t.Fatalf("개인 약점이 먼저 와야 한다: %s", got.Missed[0].CardID)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 코칭 재료
// ─────────────────────────────────────────────────────────────────────────────

func TestMissedCardCarriesAnswerAndExplanation(t *testing.T) {
	// 제목만 주면 관리자가 문제를 다시 찾아 열어야 하고, 그 수고 때문에 안 하게 된다.
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 4, 3, "again", testNow)},
		[]domain.Card{choiceCard("c1", "ELEC", 1)},
		map[string]ports.CardLearningStat{},
	)
	m := BuildLearnerDiagnosis(in).Missed[0]
	if m.Question == "" {
		t.Error("질문이 있어야 설명할 수 있다")
	}
	if m.Answer != "c1 정답" {
		t.Errorf("선택형은 정답 보기를 실어야 한다: %q", m.Answer)
	}
	if m.Explain != "c1 원리" {
		t.Errorf("해설이 코칭의 재료다: %q", m.Explain)
	}
}

func TestExplanationCardUsesConclusionAsAnswer(t *testing.T) {
	// 설명형 문제는 보기가 없다. 결론이 곧 답이다.
	card := domain.Card{
		ID: "c1", CategoryCd: "ELEC", QuestionTxt: "왜?",
		ConclusionTxt: "이렇게 해야 한다", PrincipleTxt: "원리",
	}
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 3, 2, "again", testNow)},
		[]domain.Card{card}, map[string]ports.CardLearningStat{},
	)
	if got := BuildLearnerDiagnosis(in).Missed[0].Answer; got != "이렇게 해야 한다" {
		t.Errorf("결론을 답으로 써야 한다: %q", got)
	}
}

func TestAnswerIndexOutOfRangeDoesNotPanic(t *testing.T) {
	// 잘못 등록된 문제(보기 3개인데 정답 인덱스 7)가 콘솔을 죽이면 안 된다.
	bad := 7
	card := domain.Card{
		ID: "c1", QuestionTxt: "왜?", ConclusionTxt: "결론",
		Choices: []string{"a", "b", "c"}, AnswerIndex: &bad,
	}
	in := learnerInput(
		map[string]domain.SrsState{"c1": srs(0, 3, 2, "again", testNow)},
		[]domain.Card{card}, map[string]ports.CardLearningStat{},
	)
	var got LearnerDiagnosis
	if func() (panicked bool) {
		defer func() { panicked = recover() != nil }()
		got = BuildLearnerDiagnosis(in)
		return false
	}() {
		t.Fatal("범위를 벗어난 정답 인덱스에 죽으면 안 된다")
	}
	if got.Missed[0].Answer != "결론" {
		t.Errorf("보기를 못 쓰면 결론으로 넘어가야 한다: %q", got.Missed[0].Answer)
	}
}

func TestMissedSkipsCorrectlyAnsweredCards(t *testing.T) {
	states := map[string]domain.SrsState{
		"ok":   srs(4, 6, 0, "good", testNow),
		"miss": srs(1, 6, 2, "hard", testNow),
	}
	cards := []domain.Card{choiceCard("ok", "ELEC", 1), choiceCard("miss", "ELEC", 1)}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, map[string]ports.CardLearningStat{}))
	if len(got.Missed) != 1 || got.Missed[0].CardID != "miss" {
		t.Fatalf("틀린 것만 나와야 한다: %+v", got.Missed)
	}
}

func TestMissedSkipsDeletedCards(t *testing.T) {
	// 지워진 문제는 가르칠 수 없다. 제목 없는 빈 줄만 남으면 목록이 더러워진다.
	in := learnerInput(
		map[string]domain.SrsState{"ghost": srs(0, 5, 4, "again", testNow)},
		[]domain.Card{}, map[string]ports.CardLearningStat{},
	)
	if got := BuildLearnerDiagnosis(in); len(got.Missed) != 0 {
		t.Fatalf("없는 문제는 빼야 한다: %+v", got.Missed)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 요약 — 또래와 나란히
// ─────────────────────────────────────────────────────────────────────────────

func TestSummaryComparesAgainstCardsThisPersonActuallySolved(t *testing.T) {
	// 전체 평균과 비교하면 쉬운 문제만 푼 사람이 늘 우수해 보인다.
	// 또래 기준은 '이 사람이 푼 문제들'로만 만들어야 한다.
	states := map[string]domain.SrsState{"hard1": srs(0, 10, 5, "again", testNow)}
	cards := []domain.Card{choiceCard("hard1", "ELEC", 1), choiceCard("easy1", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{
		"hard1": {Learners: 20, Reps: 200, Lapses: 80}, // 40% — 이 사람이 푼 문제
		"easy1": {Learners: 20, Reps: 200, Lapses: 2},  // 1%  — 안 푼 문제(섞이면 안 된다)
	}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if got.Summary.PeerLapse != 0.4 {
		t.Errorf("푼 문제 기준 또래 실패율 0.4 여야 한다: %v", got.Summary.PeerLapse)
	}
	if got.Summary.LapseRate != 0.5 {
		t.Errorf("본인 실패율 0.5: %v", got.Summary.LapseRate)
	}
}

func TestSummaryHandlesNoActivity(t *testing.T) {
	got := BuildLearnerDiagnosis(learnerInput(map[string]domain.SrsState{}, nil, nil))
	if got.Summary.LapseRate != 0 || got.Summary.MasteryRate != 0 {
		t.Errorf("0 으로 나누지 않아야 한다: %+v", got.Summary)
	}
	if got.Summary.DaysAway != 9999 {
		t.Errorf("기록이 없으면 '방금 활동함'으로 읽히면 안 된다: %d", got.Summary.DaysAway)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 분야 약점
// ─────────────────────────────────────────────────────────────────────────────

func TestWeaknessFlagsCategoryWherePersonTrailsPeers(t *testing.T) {
	states := map[string]domain.SrsState{
		"e1": srs(0, 10, 7, "again", testNow),
		"f1": srs(4, 10, 1, "good", testNow),
	}
	cards := []domain.Card{choiceCard("e1", "ELEC", 1), choiceCard("f1", "FIRE", 1)}
	peers := map[string]ports.CardLearningStat{
		"e1": {Learners: 30, Reps: 300, Lapses: 30}, // 또래 10%, 본인 70% → 약점
		"f1": {Learners: 30, Reps: 300, Lapses: 30}, // 또래 10%, 본인 10% → 정상
	}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if got.Weakness[0].Category != "ELEC" || got.Weakness[0].Verdict != "weak" {
		t.Fatalf("ELEC 이 약점으로 맨 위에 와야 한다: %+v", got.Weakness)
	}
	for _, w := range got.Weakness {
		if w.Category == "FIRE" && w.Verdict != "ok" {
			t.Errorf("또래와 같으면 약점이 아니다: %+v", w)
		}
	}
}

func TestWeaknessDoesNotBlamePersonForHardCategory(t *testing.T) {
	// 다들 60% 틀리는 분야는 이 사람의 약점이 아니다.
	states := map[string]domain.SrsState{"e1": srs(0, 10, 7, "again", testNow)}
	cards := []domain.Card{choiceCard("e1", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{"e1": {Learners: 30, Reps: 300, Lapses: 180}}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if got.Weakness[0].Verdict != "shared" {
		t.Errorf("공통 난이도로 봐야 한다: %+v", got.Weakness[0])
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 결론 문장
// ─────────────────────────────────────────────────────────────────────────────

func TestVerdictLeadsWithPersonalWeakness(t *testing.T) {
	states := map[string]domain.SrsState{"c1": srs(0, 10, 8, "again", testNow)}
	cards := []domain.Card{choiceCard("c1", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{"c1": {Learners: 40, Reps: 400, Lapses: 40}}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if len(got.Verdict) == 0 || got.Verdict[0].Severity != "critical" {
		t.Fatalf("개인 약점이 가장 급하다: %+v", got.Verdict)
	}
	if got.Verdict[0].Detail == "" {
		t.Error("무엇부터 설명할지 예를 들어야 행동으로 이어진다")
	}
}

func TestVerdictTellsAdminToFixContentNotPerson(t *testing.T) {
	// 다들 틀리는 문제만 틀린 사람에게 개인 코칭을 시키면 시간을 버린다.
	states := map[string]domain.SrsState{"c1": srs(0, 10, 8, "again", testNow)}
	cards := []domain.Card{choiceCard("c1", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{"c1": {Learners: 40, Reps: 400, Lapses: 300}}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))

	var found bool
	for _, v := range got.Verdict {
		if v.Link == "cards" {
			found = true
			if v.Severity == "critical" {
				t.Errorf("콘텐츠 문제를 개인 위기로 올리면 안 된다: %+v", v)
			}
		}
	}
	if !found {
		t.Errorf("문제를 손보라고 안내해야 한다: %+v", got.Verdict)
	}
}

func TestVerdictSaysStartLearningWhenNothingDone(t *testing.T) {
	got := BuildLearnerDiagnosis(learnerInput(map[string]domain.SrsState{}, nil, nil))
	if len(got.Verdict) != 1 || got.Verdict[0].Severity != "info" {
		t.Fatalf("가입만 한 사람에게 약점을 지어내면 안 된다: %+v", got.Verdict)
	}
}

func TestVerdictPrioritisesComingBackOverContent(t *testing.T) {
	// 무엇을 가르치든 오지 않으면 소용없다.
	long := testNow.AddDate(0, 0, -40)
	states := map[string]domain.SrsState{"c1": srs(2, 10, 1, "good", long)}
	cards := []domain.Card{choiceCard("c1", "ELEC", 1)}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, map[string]ports.CardLearningStat{}))

	var away bool
	for _, v := range got.Verdict {
		if v.Title == "학습이 끊겼습니다" {
			away = true
			if v.Severity != "critical" {
				t.Errorf("40일이면 급한 상태다: %q", v.Severity)
			}
		}
	}
	if !away {
		t.Errorf("끊긴 학습을 말해야 한다: %+v", got.Verdict)
	}
}

func TestVerdictStaysQuietForHealthyLearner(t *testing.T) {
	// 억지로 문제를 만들어 내면 관리자는 이 화면을 믿지 않게 된다.
	states := map[string]domain.SrsState{"c1": srs(5, 10, 0, "easy", testNow)}
	cards := []domain.Card{choiceCard("c1", "ELEC", 1)}
	peers := map[string]ports.CardLearningStat{"c1": {Learners: 30, Reps: 300, Lapses: 15}}
	got := BuildLearnerDiagnosis(learnerInput(states, cards, peers))
	if len(got.Verdict) != 1 || got.Verdict[0].Severity != "good" {
		t.Fatalf("문제가 없으면 없다고 해야 한다: %+v", got.Verdict)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 리듬
// ─────────────────────────────────────────────────────────────────────────────

func TestRhythmMarksOnlyDaysThisPersonStudied(t *testing.T) {
	in := learnerInput(map[string]domain.SrsState{}, nil, nil)
	in.Days = map[string]struct{}{DayKey(testNow): {}, DayKey(testNow.AddDate(0, 0, -3)): {}}
	got := BuildLearnerDiagnosis(in)

	if len(got.Rhythm) != activityTrendDay {
		t.Fatalf("%d일치여야 한다: %d", activityTrendDay, len(got.Rhythm))
	}
	last := got.Rhythm[len(got.Rhythm)-1]
	if last.Users != 1 {
		t.Errorf("오늘 학습했으면 1: %+v", last)
	}
	if got.Rhythm[len(got.Rhythm)-2].Users != 0 {
		t.Error("어제는 학습하지 않았으므로 0 이어야 한다")
	}
	var total int64
	for _, p := range got.Rhythm {
		total += p.Users
	}
	if total != 2 {
		t.Errorf("학습한 날은 이틀뿐이다: %d", total)
	}
}

func TestDiagnosisNeverReturnsNilSlices(t *testing.T) {
	// 프런트에서 null.map 으로 죽는다.
	got := BuildLearnerDiagnosis(learnerInput(map[string]domain.SrsState{}, nil, nil))
	if got.Missed == nil || got.Weakness == nil || got.Rhythm == nil || got.Verdict == nil {
		t.Errorf("빈 배열이어야 하고 null 이면 안 된다: %+v", got)
	}
}
