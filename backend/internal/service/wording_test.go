package service

import (
	"strings"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 이 진단을 실제로 쓰는 사람은 데이터 분석가가 아니라 교육 담당자다.
// 분석 쪽에서 자연스러운 말이 그 사람에게는 벽이 되고, 벽이 하나라도 있으면
// 그 화면은 안 쓰이게 된다. 그래서 화면에 나가는 문장을 기계로 지킨다.

// bannedWords 는 화면에 내보내지 않기로 한 말과, 왜 안 되는지.
var bannedWords = map[string]string{
	"또래":     "같은 나이·같은 팀으로 오해된다 — '다른 직원'",
	"%p":     "퍼센트포인트를 %로 읽으면 뜻이 달라진다 — '%포인트'",
	"표본":     "통계 용어 — '비교에 쓴 기록'",
	"실패율":    "시험에 떨어진 비율처럼 읽힌다 — '틀린 비율'",
	"숙달률":    "무엇을 기준으로 숙달인지 알 수 없다 — '확실히 익힌 비율'",
	"간격반복":   "학습 이론 용어 — '복습'",
	"코호트":    "분석 용어",
	"리텐션":    "분석 용어",
	"학습자":    "이 콘솔의 대상은 직원이다 — '직원'",
	"콘텐츠":    "'문제'나 '자료'로 충분하다",
	"오답":     "'틀린 문제'가 더 쉽다",
	"낱장":     "낯선 말",
	"정황":     "낯선 말",
	"측정된 적이": "분석 어투",
}

// collectUserFacingText 는 화면에 그대로 나가는 문장을 전부 모은다.
//
// 필드를 하나하나 적는 이유: 새 필드를 늘렸을 때 여기 빠뜨리면 검사가 조용히
// 통과한다. 목록이 눈에 보여야 빠진 것을 알아챈다.
func collectUserFacingText(d LearnerDiagnosis) []string {
	out := []string{d.Needs}
	for _, v := range d.Verdict {
		out = append(out, v.Title, v.Detail, v.Metric)
	}
	for _, p := range d.Prescriptions {
		out = append(out, p.Title, p.Target, p.Why, p.Action, p.Expect)
		for _, e := range p.Evidence {
			out = append(out, e.Fact, e.Observed, e.Compared, e.Sample, e.Rule, e.Source)
		}
		for _, c := range p.Cards {
			out = append(out, c.Reason)
		}
	}
	return out
}

// diagnosisSamples 는 서로 다른 처방이 나오는 상황들을 만든다.
// 한 상황만 검사하면 다른 분기에 숨은 문장이 그대로 나간다.
func diagnosisSamples(t *testing.T) map[string]LearnerDiagnosis {
	t.Helper()
	samples := map[string]LearnerInput{
		"분야 약점":  weakCategoryInput(6, 20, 15),
		"낱장 약점":  scatteredWeaknessInput(),
		"학습 안 함": learnerInput(map[string]domain.SrsState{}, nil, nil),
	}

	away := weakCategoryInput(4, 10, 7)
	old := testNow.AddDate(0, 0, -40)
	for id, st := range away.States {
		st.LastReviewedAt = &old
		away.States[id] = st
	}
	samples["끊긴 학습"] = away

	shared := weakCategoryInput(4, 10, 8)
	for id, p := range shared.PeerStats {
		p.Lapses = 240
		shared.PeerStats[id] = p
	}
	samples["공통 난제"] = shared

	// 복습 주기 — 실패율은 또래와 같은데 익힌 비율만 낮은 상태.
	states := map[string]domain.SrsState{}
	cards := []domain.Card{}
	peers := map[string]ports.CardLearningStat{}
	for i := 0; i < 12; i++ {
		id := "r" + string(rune('a'+i))
		states[id] = srs(1, 10, 1, "hard", testNow)
		cards = append(cards, choiceCard(id, "ELEC", 1))
		peers[id] = ports.CardLearningStat{Learners: 30, Reps: 300, Lapses: 30, Mastered: 24}
	}
	samples["복습 주기"] = learnerInput(states, cards, peers)

	out := map[string]LearnerDiagnosis{}
	for name, in := range samples {
		out[name] = BuildLearnerDiagnosis(in)
	}
	return out
}

// collectInsightText 는 전체 분석 화면에 나가는 문장을 모은다.
func collectInsightText(in Insight) []string {
	out := []string{in.Coverage.Verdict}
	for _, h := range in.Headlines {
		out = append(out, h.Title, h.Detail, h.Metric)
	}
	for _, f := range in.Funnel {
		out = append(out, f.Stage)
	}
	return out
}

// insightSamples 는 서로 다른 헤드라인이 나오는 상황들을 만든다.
func insightSamples() map[string]Insight {
	users := []domain.User{
		{ID: "u1", Nickname: "김", OrgNm: "1공장", CreatedAt: testNow.AddDate(0, 0, -40)},
		{ID: "u2", Nickname: "이", OrgNm: "1공장", CreatedAt: testNow.AddDate(0, 0, -30)},
	}
	cards := []domain.Card{card("c1", "ELEC", "EASY"), card("c2", "FIRE", "EASY")}

	return map[string]Insight{
		"기록 없음": BuildInsight(InsightInput{Now: testNow}),
		"문제 있음": BuildInsight(InsightInput{
			Now:   testNow,
			Users: users,
			Cards: cards,
			// EASY 로 선언했는데 70% 가 틀린다 — 난이도 오표기 헤드라인.
			CardStat: []ports.CardLearningStat{stat("c1", 10, 100, 70, 0)},
			Learners: []ports.LearnerStat{
				// 40장 쌓고 30일 사라진 사람 — 이탈 헤드라인.
				{UserID: "u1", Cards: 40, LastSeen: testNow.AddDate(0, 0, -30)},
				{UserID: "u2", Cards: 5, LastSeen: testNow},
			},
			UserDays: []ports.UserDay{{UserID: "u2", DayKey: daysAgo(0)}},
		}),
	}
}

func TestInsightTextAvoidsJargon(t *testing.T) {
	// 학습자 진단과 전체 분석은 다른 파일에서 문장을 만든다. 한쪽만 쉬운 말로
	// 바꾸면 같은 화면에서 두 어투가 섞이고, 그건 어려운 말 하나보다 나쁘다.
	for name, in := range insightSamples() {
		for _, text := range collectInsightText(in) {
			if text == "" {
				continue
			}
			for word, why := range bannedWords {
				if strings.Contains(text, word) {
					t.Errorf("%s: %q 가 화면에 나갑니다(%s)\n  → %s", name, word, why, text)
				}
			}
		}
	}
}

func TestUserFacingTextAvoidsJargon(t *testing.T) {
	for name, d := range diagnosisSamples(t) {
		for _, text := range collectUserFacingText(d) {
			if text == "" {
				continue
			}
			for word, why := range bannedWords {
				if strings.Contains(text, word) {
					t.Errorf("%s: %q 가 화면에 나갑니다(%s)\n  → %s", name, word, why, text)
				}
			}
		}
	}
}

func TestUserFacingTextIsNotEmpty(t *testing.T) {
	// 위 검사는 빈 문자열을 그냥 넘긴다. 말을 쉽게 바꾸다가 문장을 통째로
	// 날려도 통과하면 안 된다.
	for name, d := range diagnosisSamples(t) {
		for _, p := range d.Prescriptions {
			if p.Why == "" || p.Action == "" || p.Expect == "" {
				t.Errorf("%s/%s: 문장이 비었다", name, p.ID)
			}
			for i, e := range p.Evidence {
				if e.Fact == "" || e.Observed == "" || e.Rule == "" || e.Source == "" {
					t.Errorf("%s/%s 근거[%d]: 문장이 비었다", name, p.ID, i)
				}
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────

func TestGapTextSaysPointsNotPercent(t *testing.T) {
	// '+58%p' 를 58% 로 읽으면 "절반 넘게 더 틀린다"가 "절반만큼 더 틀린다"가 된다.
	// 뜻이 달라지므로 % 와 구별되는 말을 써야 한다.
	if got := gapText(0.58); got != "58%포인트 더" {
		t.Errorf("양수 차이: %q", got)
	}
	if got := gapText(-0.34); got != "34%포인트 적게" {
		t.Errorf("음수 차이는 '적게'로 읽혀야 한다: %q", got)
	}
	if strings.Contains(gapText(0.25), "%p ") || strings.HasSuffix(gapText(0.25), "%p") {
		t.Errorf("%%p 표기가 남아 있다: %q", gapText(0.25))
	}
}

func TestTimesTextOnlyWhenItHelps(t *testing.T) {
	// 배수는 감이 빨리 오지만, 성립하지 않는 구간에서 억지로 만들면
	// 잘못된 비유가 된다 — 그럴 바엔 안 쓰는 게 낫다.
	if got := timesText(0.75, 0.17); got != "4.4배" {
		t.Errorf("4배 넘게 틀리면 그렇게 말해야 한다: %q", got)
	}
	if got := timesText(0.2, 0.17); got != "" {
		t.Errorf("차이가 미미하면 배수를 쓰지 않는다: %q", got)
	}
	if got := timesText(0.5, 0); got != "" {
		t.Errorf("기준이 0 이면 배수가 성립하지 않는다: %q", got)
	}
	if got := timesText(0.9, 0.01); got != "" {
		t.Errorf("90배 같은 값은 비유가 되지 못한다: %q", got)
	}
	if got := timesText(0.1, 0.5); got != "" {
		t.Errorf("더 잘하는 경우에는 쓰지 않는다: %q", got)
	}
}

func TestWhyCategoryGivesTwoWaysToReadTheGap(t *testing.T) {
	// 퍼센트가 낯선 사람에게는 '4.4배'가 훨씬 빨리 와닿는다.
	w := CategoryWeakness{Category: "ELEC", LapseRate: 0.75, PeerRate: 0.17, Gap: 0.58}
	got := whyCategory(w)
	for _, want := range []string{"17%", "75%", "4.4배", peerWord} {
		if !strings.Contains(got, want) {
			t.Errorf("%q 가 빠졌다: %s", want, got)
		}
	}
}

func TestWhyCategorySkipsTheRatioWhenItIsMisleading(t *testing.T) {
	// 또래가 0% 면 배수를 만들 수 없다. 그래도 문장은 성립해야 한다.
	w := CategoryWeakness{Category: "ELEC", LapseRate: 0.6, PeerRate: 0, Gap: 0.6}
	got := whyCategory(w)
	if strings.Contains(got, "배") {
		t.Errorf("성립하지 않는 배수를 쓰면 안 된다: %s", got)
	}
	if !strings.Contains(got, "60%") {
		t.Errorf("숫자는 남아 있어야 한다: %s", got)
	}
}

// 진단 자체가 흐려지지 않았는지 — 말을 쉽게 바꾸는 과정에서 숫자나 비교 대상이
// 사라지면 그건 내용을 버린 것이다.
func TestPlainWordingKeepsTheNumbers(t *testing.T) {
	d := BuildLearnerDiagnosis(weakCategoryInput(6, 20, 15))
	p, ok := findPrescription(d.Prescriptions, "category:ELEC")
	if !ok {
		t.Fatalf("분야 처방이 나와야 한다: %+v", d.Prescriptions)
	}

	first := p.Evidence[0]
	if !strings.Contains(first.Observed, "%") {
		t.Errorf("관측값에 수치가 남아 있어야 한다: %q", first.Observed)
	}
	if !strings.Contains(first.Compared, "%") {
		t.Errorf("비교 대상에 수치가 남아 있어야 한다: %q", first.Compared)
	}
	if first.Sample == "" {
		t.Error("몇 건을 근거로 했는지는 지우면 안 된다")
	}
	if !strings.Contains(first.Rule, "%") {
		t.Errorf("판단 기준의 수치가 남아 있어야 한다: %q", first.Rule)
	}
}
