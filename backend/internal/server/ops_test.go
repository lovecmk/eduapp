package server_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// 신고 처리 워크플로
// ─────────────────────────────────────────────────────────────────────────────

// fileReport 는 일반 사용자로 신고를 한 건 접수하고 그 id 를 돌려준다.
func fileReport(t *testing.T, env *adminEnv, reason string) (reportID, cardID string) {
	t.Helper()
	userTok := loginToken(t, env.app, "demo", "demo1234")
	cardID = firstCardID(t, env.app, userTok)
	if res, b := doJSON(t, env.app, "POST", "/api/reports", userTok, map[string]any{
		"card_id": cardID, "reason": reason, "detail": "확인이 필요합니다",
	}); res.StatusCode != 201 {
		t.Fatalf("신고 접수: %d %s", res.StatusCode, b)
	}
	_, body := doJSON(t, env.app, "GET", "/api/admin/reports", env.adminToken, nil)
	var out struct {
		Items []struct {
			ID     string `json:"id"`
			Reason string `json:"reason"`
		} `json:"items"`
	}
	decode(t, body, &out)
	for _, it := range out.Items {
		if it.Reason == reason {
			return it.ID, cardID
		}
	}
	t.Fatalf("방금 접수한 신고를 목록에서 찾지 못했다: %s", body)
	return "", ""
}

// 신고를 처리하면 대시보드의 '신고' 숫자가 줄어야 한다.
//
// 이 숫자가 줄지 않으면 경고로서 죽는다 — 처리했는데도 계속 같은 수가 떠 있으면
// 운영자는 며칠 만에 그 숫자를 아예 보지 않게 된다.
func TestAdminResolveReportClearsDashboardCount(t *testing.T) {
	env := buildAdminApp(t)
	reportID, _ := fileReport(t, env, "설명 오류")

	if got := dashboardReports(t, env); got != 1 {
		t.Fatalf("접수 직후 미처리 신고=%d, want 1", got)
	}

	res, body := doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, env.adminToken,
		map[string]any{"status_cd": "RESOLVED", "resolution_txt": "해설을 고쳤습니다"})
	if res.StatusCode != 200 {
		t.Fatalf("신고 처리: %d %s", res.StatusCode, body)
	}
	var updated struct {
		StatusCd     string `json:"status_cd"`
		HandlerName  string `json:"handler_name"`
		Resolution   string `json:"resolution_txt"`
		HandledAt    string `json:"handled_at"`
		CardTitle    string `json:"card_title"`
		ReporterName string `json:"reporter_name"`
	}
	decode(t, body, &updated)
	if updated.StatusCd != string(domain.ReportResolved) {
		t.Errorf("처리 단계=%q, want RESOLVED", updated.StatusCd)
	}
	// 누가 처리했는지가 남지 않으면 나중에 되짚을 수 없다.
	if updated.HandlerName == "" || updated.HandledAt == "" {
		t.Errorf("처리자·처리시각이 비었다: %+v", updated)
	}
	if updated.Resolution != "해설을 고쳤습니다" {
		t.Errorf("처리 메모가 저장되지 않았다: %+v", updated)
	}
	// 화면은 이 응답으로 목록의 그 줄을 갈아 끼운다 — 목록과 같은 모양이 아니면
	// 처리 버튼을 누른 순간 카드 제목·신고자 이름이 그 줄에서 사라진다.
	if updated.CardTitle == "" || updated.ReporterName == "" {
		t.Errorf("처리 응답이 목록과 같은 모양이 아니다(제목·신고자 누락): %+v", updated)
	}

	if got := dashboardReports(t, env); got != 0 {
		t.Errorf("처리 후 미처리 신고=%d, want 0", got)
	}

	// 처리 이력은 감사 로그에도 남아야 한다.
	_, audit := doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	if !strings.Contains(string(audit), "report.review") {
		t.Errorf("신고 처리가 감사 로그에 남지 않았다: %s", audit)
	}
}

// 처리된 신고도 사라지지 않고 상태로 걸러 볼 수 있어야 한다.
func TestAdminReportStatusFilterAndCounts(t *testing.T) {
	env := buildAdminApp(t)
	reportID, _ := fileReport(t, env, "오탈자")

	doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, env.adminToken,
		map[string]any{"status_cd": "DOING"})

	// 미처리(OPEN)로 거르면 확인 중인 건은 빠진다.
	_, openBody := doJSON(t, env.app, "GET", "/api/admin/reports?status=OPEN", env.adminToken, nil)
	var openPage struct {
		Items   []map[string]any `json:"items"`
		Counts  map[string]int64 `json:"counts"`
		Pending int64            `json:"pending"`
	}
	decode(t, openBody, &openPage)
	if len(openPage.Items) != 0 {
		t.Errorf("OPEN 필터에 확인 중인 신고가 잡혔다: %s", openBody)
	}
	// 그래도 단계별 건수는 필터 바깥까지 세야 한다 — 그러지 않으면
	// 화면의 칩이 필터를 걸 때마다 0 으로 무너져 고를 값이 있는지 알 수 없다.
	if openPage.Counts[string(domain.ReportDoing)] != 1 {
		t.Errorf("DOING 건수=%v, want 1: %s", openPage.Counts, openBody)
	}
	if openPage.Pending != 1 {
		t.Errorf("미처리(OPEN+DOING) 합계=%d, want 1", openPage.Pending)
	}

	_, doingBody := doJSON(t, env.app, "GET", "/api/admin/reports?status=DOING", env.adminToken, nil)
	var doingPage struct {
		Items []map[string]any `json:"items"`
	}
	decode(t, doingBody, &doingPage)
	if len(doingPage.Items) != 1 {
		t.Errorf("DOING 필터 결과=%d건, want 1: %s", len(doingPage.Items), doingBody)
	}
}

// 반려는 사유 없이 할 수 없다 — 근거가 없으면 같은 신고가 다시 왔을 때 되짚을 수 없다.
func TestAdminRejectReportRequiresReason(t *testing.T) {
	env := buildAdminApp(t)
	reportID, _ := fileReport(t, env, "부적절")

	if res, b := doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, env.adminToken,
		map[string]any{"status_cd": "REJECTED"}); res.StatusCode != 400 {
		t.Errorf("사유 없는 반려 -> %d, want 400: %s", res.StatusCode, b)
	}
	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, env.adminToken,
		map[string]any{"status_cd": "REJECTED", "resolution_txt": "신고 내용이 사실과 다릅니다"}); res.StatusCode != 200 {
		t.Errorf("사유 있는 반려 -> %d, want 200", res.StatusCode)
	}
	// 알 수 없는 단계는 거부한다.
	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, env.adminToken,
		map[string]any{"status_cd": "WHATEVER"}); res.StatusCode != 400 {
		t.Errorf("알 수 없는 단계 -> %d, want 400", res.StatusCode)
	}
	// 없는 신고는 404.
	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/reports/nope", env.adminToken,
		map[string]any{"status_cd": "RESOLVED"}); res.StatusCode != 404 {
		t.Errorf("없는 신고 처리 -> %d, want 404", res.StatusCode)
	}
	// 일반 사용자는 남의 신고를 처리할 수 없다.
	userTok := loginToken(t, env.app, "demo", "demo1234")
	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/reports/"+reportID, userTok,
		map[string]any{"status_cd": "RESOLVED"}); res.StatusCode != 403 {
		t.Errorf("일반 사용자의 신고 처리 -> %d, want 403", res.StatusCode)
	}
}

func dashboardReports(t *testing.T, env *adminEnv) int {
	t.Helper()
	_, body := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.adminToken, nil)
	var d struct {
		Content struct {
			Reports int `json:"reports"`
		} `json:"content"`
	}
	decode(t, body, &d)
	return d.Content.Reports
}

// ─────────────────────────────────────────────────────────────────────────────
// 운영 설정 · 점검 모드
// ─────────────────────────────────────────────────────────────────────────────

// 설정은 보낸 필드만 바뀌어야 한다.
//
// 값 타입으로 받으면 공지 문구 하나를 고치는 요청에 나머지가 false/0 으로 실려,
// 문구를 바꾸는 순간 점검 모드가 꺼지고 하루 상한이 0 이 된다.
func TestAdminSettingsPartialUpdate(t *testing.T) {
	env := buildAdminApp(t)

	res, body := doJSON(t, env.app, "GET", "/api/admin/settings", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("설정 조회: %d %s", res.StatusCode, body)
	}
	var s struct {
		SignupEnabled bool `json:"signup_enabled"`
		DailyMinCards int  `json:"daily_min_cards"`
		DailyMaxCards int  `json:"daily_max_cards"`
	}
	decode(t, body, &s)
	if !s.SignupEnabled || s.DailyMinCards != domain.DefaultDailyMinCards ||
		s.DailyMaxCards != domain.DefaultDailyMaxCards {
		t.Fatalf("기본 설정이 어긋난다: %s", body)
	}

	// 최소 출제량만 바꾼다.
	if res, b := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken,
		map[string]any{"daily_min_cards": 2}); res.StatusCode != 200 {
		t.Fatalf("출제량 변경: %d %s", res.StatusCode, b)
	}
	// 이번엔 공지 배너만 바꾼다 — 앞서 바꾼 상한이 살아 있어야 한다.
	_, after := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken,
		map[string]any{"notice_txt": "오늘 오후 정전 예정", "notice_level": "WARN"})
	var s2 struct {
		DailyMinCards int    `json:"daily_min_cards"`
		SignupEnabled bool   `json:"signup_enabled"`
		NoticeTxt     string `json:"notice_txt"`
		NoticeLevel   string `json:"notice_level"`
		UpdatedByName string `json:"updated_by_name"`
	}
	decode(t, after, &s2)
	if s2.DailyMinCards != 2 {
		t.Errorf("보내지 않은 출제량이 덮였다: %s", after)
	}
	if !s2.SignupEnabled {
		t.Errorf("보내지 않은 가입 개방이 꺼졌다: %s", after)
	}
	if s2.NoticeTxt != "오늘 오후 정전 예정" || s2.NoticeLevel != "WARN" {
		t.Errorf("공지 배너가 반영되지 않았다: %s", after)
	}
	if s2.UpdatedByName == "" {
		t.Errorf("누가 바꿨는지가 남지 않았다: %s", after)
	}

	// 범위를 벗어난 값은 거부한다.
	for _, bad := range []map[string]any{
		{"daily_min_cards": 0},
		{"daily_max_cards": 500},
		{"daily_min_cards": 5, "daily_max_cards": 3},
		{"notice_level": "LOUD"},
		{"notice_txt": strings.Repeat("가", 201)},
	} {
		if res, b := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken, bad); res.StatusCode != 400 {
			t.Errorf("%v -> %d, want 400: %s", bad, res.StatusCode, b)
		}
	}

	// 변경은 감사 로그에 남아야 한다 — 점검 모드는 전체 사용자를 막는 행위다.
	_, audit := doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	if !strings.Contains(string(audit), "settings.update") {
		t.Errorf("설정 변경이 감사 로그에 남지 않았다: %s", audit)
	}
	// 일반 사용자는 설정을 볼 수도 바꿀 수도 없다.
	userTok := loginToken(t, env.app, "demo", "demo1234")
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/settings", userTok, nil); res.StatusCode != 403 {
		t.Errorf("일반 사용자의 설정 조회 -> %d, want 403", res.StatusCode)
	}
}

// 점검 모드는 일반 사용자를 막되, 관리자와 '왜 막혔는지 알리는 경로'는 통과시켜야 한다.
//
// 관리자까지 막히면 점검 모드를 켠 순간 그것을 끌 방법이 사라진다.
func TestMaintenanceModeBlocksUsersNotAdmins(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")

	if res, b := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken, map[string]any{
		"maintenance_yn": true, "maintenance_msg": "설비 교체 중입니다",
	}); res.StatusCode != 200 {
		t.Fatalf("점검 모드 켜기: %d %s", res.StatusCode, b)
	}

	res, body := doJSON(t, env.app, "GET", "/api/cards", userTok, nil)
	if res.StatusCode != 503 {
		t.Fatalf("점검 중 일반 사용자 요청 -> %d, want 503", res.StatusCode)
	}
	// 왜 막혔는지가 전달되어야 한다 — 빈 메시지는 앱에서 '알 수 없는 오류'로 보인다.
	if !strings.Contains(string(body), "설비 교체 중입니다") {
		t.Errorf("점검 안내 문구가 전달되지 않았다: %s", body)
	}

	// 관리자는 그대로 일한다.
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.adminToken, nil); res.StatusCode != 200 {
		t.Errorf("점검 중 관리자 대시보드 -> %d, want 200", res.StatusCode)
	}
	// 상태를 알리는 경로는 무인증으로도 열려 있어야 한다.
	if res, b := doJSON(t, env.app, "GET", "/api/config", "", nil); res.StatusCode != 200 ||
		!strings.Contains(string(b), "설비 교체 중입니다") {
		t.Errorf("점검 중 /api/config -> %d %s", res.StatusCode, b)
	}
	if res, _ := doJSON(t, env.app, "GET", "/api/health", "", nil); res.StatusCode != 200 {
		t.Errorf("점검 중 /api/health -> %d, want 200", res.StatusCode)
	}

	// 끄면 곧바로 돌아와야 한다(캐시가 만료를 기다리지 않는다).
	doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken, map[string]any{"maintenance_yn": false})
	if res, _ := doJSON(t, env.app, "GET", "/api/cards", userTok, nil); res.StatusCode != 200 {
		t.Errorf("점검 해제 후 -> %d, want 200", res.StatusCode)
	}
}

// 가입 차단은 회원가입만 막는다 — 쓰던 사람은 그대로 쓸 수 있어야 한다.
func TestSignupGate(t *testing.T) {
	env := buildAdminApp(t)
	doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken, map[string]any{"signup_enabled": false})

	if res, b := doJSON(t, env.app, "POST", "/api/auth/register", "", map[string]any{
		"username": "newbie", "password": "newbie1234", "name": "새사람", "email": "n@example.com",
	}); res.StatusCode != 403 {
		t.Errorf("가입 차단 중 회원가입 -> %d, want 403: %s", res.StatusCode, b)
	}
	// 기존 사용자의 로그인은 막히지 않는다.
	if res, _ := doJSON(t, env.app, "POST", "/api/auth/login", "",
		map[string]any{"id": "demo", "password": "demo1234"}); res.StatusCode != 200 {
		t.Errorf("가입 차단 중 기존 사용자 로그인 -> %d, want 200", res.StatusCode)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 하루 학습 상한
// ─────────────────────────────────────────────────────────────────────────────

// 앱이 오래전부터 부르던 두 경로가 실제로 서버에 있어야 하고,
// 상한 값은 관리자가 콘솔에서 바꾼 값을 따라야 한다.
func TestLearningQuotaFollowsSettings(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")

	res, body := doJSON(t, env.app, "GET", "/api/learning/quota", userTok, nil)
	if res.StatusCode != 200 {
		t.Fatalf("쿼터 조회: %d %s", res.StatusCode, body)
	}
	var q struct {
		Limit     int    `json:"limit"`
		Used      int    `json:"used"`
		Remaining int    `json:"remaining"`
		ResetsAt  string `json:"resets_at"`
	}
	decode(t, body, &q)
	// 처음 오는 사람은 쉬운 난이도 → 최대치(5장)를 받는다.
	// 상한이 '설정의 최대치'가 아니라 **오늘 실제로 배정된 수**라는 점이 핵심이다.
	if q.Limit != domain.DefaultDailyMaxCards || q.Used != 0 || q.Remaining != q.Limit {
		t.Fatalf("초기 쿼터가 어긋난다: %s", body)
	}
	if _, err := time.Parse(time.RFC3339, q.ResetsAt); err != nil {
		t.Errorf("resets_at 이 시각 형식이 아니다: %q", q.ResetsAt)
	}

	// 2장 학습을 보고한다.
	if res, b := doJSON(t, env.app, "POST", "/api/learning/complete", userTok,
		map[string]any{"count": 2}); res.StatusCode != 200 {
		t.Fatalf("완료 보고: %d %s", res.StatusCode, b)
	}
	_, after := doJSON(t, env.app, "GET", "/api/learning/quota", userTok, nil)
	decode(t, after, &q)
	if q.Used != 2 || q.Remaining != q.Limit-2 {
		t.Errorf("보고가 반영되지 않았다: %s", after)
	}

	// 관리자가 출제량을 줄이면 **다음 날부터** 반영된다.
	//
	// 오늘 것은 이미 배정돼 얼어 있다 — 풀던 문제가 도중에 사라지면 안 되기
	// 때문이다. 그래서 오늘의 상한은 그대로여야 한다.
	doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken,
		map[string]any{"daily_min_cards": 2, "daily_max_cards": 2})
	_, sameDay := doJSON(t, env.app, "GET", "/api/learning/quota", userTok, nil)
	decode(t, sameDay, &q)
	if q.Limit != domain.DefaultDailyMaxCards {
		t.Errorf("오늘 배정이 도중에 바뀌었다: %s", sameDay)
	}
}

// 오늘의 학습은 사람마다 다르게, 3~5장으로 편성되어야 한다.
func TestTodayPlanIsPersonalAndSized(t *testing.T) {
	env := buildAdminApp(t)

	first := todayPlan(t, env, loginToken(t, env.app, "demo", "demo1234"))
	if first.TargetCount < 3 || first.TargetCount > 5 {
		t.Errorf("목표 장수=%d — 3~5 여야 한다", first.TargetCount)
	}
	if len(first.Cards) != first.TargetCount {
		t.Errorf("배정 %d장 != 목표 %d장: %s", len(first.Cards), first.TargetCount, first.Day)
	}
	// 새 사용자는 쉬운 난이도부터.
	if first.DifficultyCd != string(domain.Easy) {
		t.Errorf("처음 오는 사람의 난이도=%s, want EASY", first.DifficultyCd)
	}

	// 다시 물어도 같은 목록이어야 한다 — 앱을 다시 열 때마다 문제가 바뀌면 뽑기다.
	again := todayPlan(t, env, loginToken(t, env.app, "demo", "demo1234"))
	if fmt.Sprint(cardIDsOf(again)) != fmt.Sprint(cardIDsOf(first)) {
		t.Errorf("같은 날인데 목록이 달라졌다:\n%v\n%v", cardIDsOf(first), cardIDsOf(again))
	}

	// 다른 사람은 다른 목록을 받아야 한다.
	other := todayPlan(t, env, registerUser(t, env, "learner1", "학습자", "현장5팀"))
	if fmt.Sprint(cardIDsOf(other)) == fmt.Sprint(cardIDsOf(first)) {
		t.Errorf("다른 사용자가 같은 목록을 받았다: %v", cardIDsOf(first))
	}
}

type todayPlanDTO struct {
	Day          string `json:"day"`
	DifficultyCd string `json:"difficulty_cd"`
	TargetCount  int    `json:"target_count"`
	DoneCount    int    `json:"done_count"`
	Cards        []struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
		Done bool   `json:"done"`
	} `json:"cards"`
}

func todayPlan(t *testing.T, env *adminEnv, tok string) todayPlanDTO {
	t.Helper()
	res, body := doJSON(t, env.app, "GET", "/api/learning/today", tok, nil)
	if res.StatusCode != 200 {
		t.Fatalf("오늘의 학습: %d %s", res.StatusCode, body)
	}
	var out todayPlanDTO
	decode(t, body, &out)
	return out
}

func cardIDsOf(p todayPlanDTO) []string {
	out := make([]string, 0, len(p.Cards))
	for _, c := range p.Cards {
		out = append(out, c.ID)
	}
	return out
}

// 오프라인 큐가 같은 보고를 재전송해도 두 번 세면 안 된다.
func TestLearningCompleteIsIdempotent(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")

	for i := 0; i < 3; i++ {
		res, b := doJSONWithHeaders(t, env.app, "POST", "/api/learning/complete", userTok,
			map[string]any{"count": 1}, map[string]string{"Idempotency-Key": "learning-complete:same-key"})
		if res.StatusCode != 200 {
			t.Fatalf("완료 보고 %d회차: %d %s", i+1, res.StatusCode, b)
		}
	}
	_, body := doJSON(t, env.app, "GET", "/api/learning/quota", userTok, nil)
	var q struct {
		Used int `json:"used"`
	}
	decode(t, body, &q)
	if q.Used != 1 {
		t.Errorf("같은 키로 3번 보고했는데 used=%d — 1이어야 한다", q.Used)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 공지 센터 — 대상 지정과 발송 이력
// ─────────────────────────────────────────────────────────────────────────────

// 조직을 지정한 공지는 그 조직에게만 가야 한다.
func TestAnnounceToOrgOnly(t *testing.T) {
	env := buildAdminApp(t)
	insideTok := registerUser(t, env, "inside", "안쪽사람", "현장1팀")
	outsideTok := registerUser(t, env, "outside", "바깥사람", "현장2팀")

	// 보내기 전에 대상 규모를 확인할 수 있어야 한다 —
	// 되돌릴 수 없는 발송을 규모도 모른 채 누르게 두면 안 된다.
	_, preview := doJSON(t, env.app,
		"GET", "/api/admin/announcements/audience?audience_cd=ORG&audience_value=현장1팀", env.adminToken, nil)
	var p struct {
		Count int    `json:"count"`
		Label string `json:"label"`
	}
	decode(t, preview, &p)
	if p.Count != 1 {
		t.Fatalf("대상 미리보기=%d명, want 1: %s", p.Count, preview)
	}

	res, body := doJSON(t, env.app, "POST", "/api/admin/announcements", env.adminToken, map[string]any{
		"title_txt": "현장1팀 안전교육", "desc_txt": "내일 오전 9시",
		"audience_cd": "ORG", "audience_value": "현장1팀",
	})
	if res.StatusCode != 201 {
		t.Fatalf("공지 발송: %d %s", res.StatusCode, body)
	}
	var sent struct {
		Sent int `json:"sent"`
	}
	decode(t, body, &sent)
	if sent.Sent != 1 {
		t.Fatalf("수신자=%d명, want 1: %s", sent.Sent, body)
	}

	if got := notificationCount(t, env, insideTok); got != 1 {
		t.Errorf("대상 조직 사용자의 알림=%d건, want 1", got)
	}
	if got := notificationCount(t, env, outsideTok); got != 0 {
		t.Errorf("다른 조직 사용자에게 공지가 갔다(%d건)", got)
	}

	// 이력이 남아야 한다 — 공지는 되돌릴 수 없어 "보냈나요?"에 답할 수 있어야 한다.
	_, history := doJSON(t, env.app, "GET", "/api/admin/announcements", env.adminToken, nil)
	var h struct {
		Items []struct {
			TitleTxt      string `json:"title_txt"`
			AudienceCd    string `json:"audience_cd"`
			AudienceLabel string `json:"audience_label"`
			Recipients    int    `json:"recipients"`
			ActorName     string `json:"actor_name"`
		} `json:"items"`
	}
	decode(t, history, &h)
	if len(h.Items) != 1 {
		t.Fatalf("발송 이력=%d건, want 1: %s", len(h.Items), history)
	}
	got := h.Items[0]
	if got.TitleTxt != "현장1팀 안전교육" || got.AudienceCd != string(domain.AudienceOrg) ||
		got.Recipients != 1 || got.ActorName == "" || got.AudienceLabel == "" {
		t.Errorf("이력 내용이 어긋난다: %+v", got)
	}
}

// 대상 지정이 잘못되면 보내기 전에 막아야 한다.
func TestAnnounceAudienceValidation(t *testing.T) {
	env := buildAdminApp(t)
	cases := []struct {
		name string
		body map[string]any
	}{
		{"알 수 없는 대상", map[string]any{"title_txt": "제목", "audience_cd": "PLANET"}},
		{"조직 미지정", map[string]any{"title_txt": "제목", "audience_cd": "ORG"}},
		{"없는 조직", map[string]any{"title_txt": "제목", "audience_cd": "ORG", "audience_value": "없는팀"}},
		{"알 수 없는 등급", map[string]any{"title_txt": "제목", "audience_cd": "MEMBERSHIP", "audience_value": "GOLD"}},
		{"받는 사람 미지정", map[string]any{"title_txt": "제목", "audience_cd": "USER"}},
	}
	for _, tc := range cases {
		if res, b := doJSON(t, env.app, "POST", "/api/admin/announcements", env.adminToken, tc.body); res.StatusCode != 400 {
			t.Errorf("%s -> %d, want 400: %s", tc.name, res.StatusCode, b)
		}
	}
}

// 구형 user_id 형식도 계속 동작해야 한다 — 필드 하나 없앤 것 때문에
// 개별 공지가 조용히 전체 발송으로 바뀌면 사고가 된다.
func TestAnnounceLegacyUserIDStillTargetsOnePerson(t *testing.T) {
	env := buildAdminApp(t)
	oneTok := registerUser(t, env, "solo", "혼자", "현장3팀")
	otherTok := registerUser(t, env, "other", "다른이", "현장3팀")

	res, body := doJSON(t, env.app, "POST", "/api/admin/notifications", env.adminToken, map[string]any{
		"title_txt": "개별 안내", "user_id": userIDOf(t, env, "solo"),
	})
	if res.StatusCode != 201 {
		t.Fatalf("개별 공지: %d %s", res.StatusCode, body)
	}
	if got := notificationCount(t, env, oneTok); got != 1 {
		t.Errorf("지정한 사람의 알림=%d건, want 1", got)
	}
	if got := notificationCount(t, env, otherTok); got != 0 {
		t.Errorf("지정하지 않은 사람에게 공지가 갔다(%d건)", got)
	}
}

// userIDOf 는 관리 목록에서 로그인 아이디로 사용자의 내부 id 를 찾는다.
// (앱의 /api/auth/me 는 앱 계약에 맞춰 숫자 id 를 주므로 여기 쓸 수 없다.)
func userIDOf(t *testing.T, env *adminEnv, loginID string) string {
	t.Helper()
	_, body := doJSON(t, env.app, "GET", "/api/admin/users?search="+loginID, env.adminToken, nil)
	var page struct {
		Items []struct {
			ID      string `json:"id"`
			LoginID string `json:"login_id"`
		} `json:"items"`
	}
	decode(t, body, &page)
	for _, u := range page.Items {
		if u.LoginID == loginID {
			return u.ID
		}
	}
	t.Fatalf("사용자 %q 를 찾지 못했다: %s", loginID, body)
	return ""
}

// registerUser 는 조직이 있는 사용자를 만들고 액세스 토큰을 돌려준다.
func registerUser(t *testing.T, env *adminEnv, loginID, name, org string) string {
	t.Helper()
	res, body := doJSON(t, env.app, "POST", "/api/auth/register", "", map[string]any{
		"username": loginID, "password": loginID + "1234", "name": name,
		"email": loginID + "@example.com", "org": org, "nickname": name,
	})
	if res.StatusCode != 200 && res.StatusCode != 201 {
		t.Fatalf("회원가입 %s: %d %s", loginID, res.StatusCode, body)
	}
	var auth struct {
		AccessToken string `json:"access_token"`
	}
	decode(t, body, &auth)
	if auth.AccessToken == "" {
		t.Fatalf("회원가입 응답에 토큰이 없다: %s", body)
	}
	return auth.AccessToken
}

func notificationCount(t *testing.T, env *adminEnv, tok string) int {
	t.Helper()
	_, body := doJSON(t, env.app, "GET", "/api/notifications", tok, nil)
	var list []map[string]any
	decode(t, body, &list)
	return len(list)
}

// ─────────────────────────────────────────────────────────────────────────────
// 앱 ↔ 서버 계약
// ─────────────────────────────────────────────────────────────────────────────

// 앱이 보내는 exclude(축약된 정수 id)로도 본인이 인정되어야 한다.
//
// 앱의 `UserDTO.id` 는 number 라, 서버는 문자열 id 를 정수로 축약해 내보낸다.
// 그 값이 되돌아오는 유일한 경로가 내 정보 수정 화면의 닉네임 중복 검사다.
// 서버가 진짜 id 하고만 비교하면 절대 일치하지 않아, 닉네임을 그대로 둔 채
// 소속만 고치려 해도 "이미 사용 중인 닉네임입니다"가 뜬다 — 닉네임을 바꾸지
// 않는 한 자기 프로필을 저장할 수 없게 된다.
func TestNicknameExcludeAcceptsAppSideUserID(t *testing.T) {
	env := buildAdminApp(t)
	tok := registerUser(t, env, "keeper", "지킴이", "현장4팀")

	// 앱이 아는 내 id — 로그인 응답의 user.id 그대로(숫자).
	_, me := doJSON(t, env.app, "GET", "/api/auth/me", tok, nil)
	var profile struct {
		ID       int    `json:"id"`
		Nickname string `json:"nickname"`
	}
	decode(t, me, &profile)
	if profile.Nickname == "" {
		t.Fatalf("닉네임이 비었다: %s", me)
	}

	// exclude 없이 물으면 '사용 중'이다(내가 쓰고 있으니까).
	_, taken := doJSON(t, env.app, "GET",
		"/api/auth/nickname-available?nickname="+profile.Nickname, "", nil)
	if !strings.Contains(string(taken), `"taken":true`) {
		t.Fatalf("exclude 없이 -> %s, want taken=true", taken)
	}

	// 앱이 보내는 형태(숫자 id)로 exclude 하면 본인이므로 '사용 가능'이어야 한다.
	_, mine := doJSON(t, env.app, "GET",
		fmt.Sprintf("/api/auth/nickname-available?nickname=%s&exclude=%d", profile.Nickname, profile.ID),
		"", nil)
	if !strings.Contains(string(mine), `"taken":false`) {
		t.Errorf("앱 형식 exclude -> %s, want taken=false (본인 닉네임은 충돌이 아니다)", mine)
	}

	// 관리 콘솔이 보내는 형태(진짜 문자열 id)도 그대로 통해야 한다.
	_, byReal := doJSON(t, env.app, "GET",
		"/api/auth/nickname-available?nickname="+profile.Nickname+"&exclude="+userIDOf(t, env, "keeper"),
		"", nil)
	if !strings.Contains(string(byReal), `"taken":false`) {
		t.Errorf("콘솔 형식 exclude -> %s, want taken=false", byReal)
	}
}

// 앱과 짝을 이뤄야 하는 상수들 — 갈리면 두 쪽이 서로 다른 판단을 한다.
//
// 언어가 달라 컴파일러가 잡아 주지 못하는 자리라, 값이 바뀌면 여기서 걸리게 한다.
// (ARCHITECTURE.md 의 '상수의 짝' 표와 같은 목록이다.)

// 하루 출제량의 기본 범위는 앱 상수와 같아야 한다.
//
// 두 값이 갈리면, 서버에 닿은 기기와 아직 목업으로 떨어진 기기가 서로 다른
// 상한으로 돌아간다 — 같은 사람이 태블릿에서는 3장, 휴대폰에서는 5장을 배운다.
func TestDefaultDailyLimitMatchesApp(t *testing.T) {
	// src/constants/learning.ts — DAILY_NEW_LIMIT / DAILY_TOTAL_LIMIT
	const appMin, appMax = 3, 5
	if domain.DefaultDailyMinCards != appMin || domain.DefaultDailyMaxCards != appMax {
		t.Errorf("서버 기본 범위=%d~%d, 앱 상수=%d~%d — 같아야 한다",
			domain.DefaultDailyMinCards, domain.DefaultDailyMaxCards, appMin, appMax)
	}
}

// '숙달' 판정 박스도 앱과 같아야 한다.
//
// 갈리면 앱은 '숙달'로 보여 주는 카드를 서버는 아직 후보로 여겨 오늘의 학습에
// 또 내보낸다 — 사용자에게는 다 배운 문제가 계속 나오는 것으로 보인다.
func TestMasteredBoxMatchesApp(t *testing.T) {
	const appMasteredBox = 4 // src/domain/srs.ts — MASTERED_BOX
	if service.MasteredBoxLevel != appMasteredBox {
		t.Errorf("서버 숙달 기준=%d, 앱 상수=%d — 같아야 한다",
			service.MasteredBoxLevel, appMasteredBox)
	}
}

// 콘솔의 조회가 그 사람의 오늘 편성을 확정해서는 안 된다.
//
// 아직 앱을 열지도 않은 사람의 편성이 관리자의 조회 시각과 그때의 후보로 굳으면,
// 그날 새로 등록된 문제가 그 사람에게는 영영 나가지 않는다.
func TestAdminTodayViewDoesNotCreateAssignment(t *testing.T) {
	env := buildAdminApp(t)
	tok := registerUser(t, env, "quiet", "조용한사람", "현장6팀")
	id := userIDOf(t, env, "quiet")

	res, body := doJSON(t, env.app, "GET", "/api/admin/users/"+id+"/today", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("오늘 배정 조회: %d %s", res.StatusCode, body)
	}
	var before struct {
		Started bool `json:"started"`
	}
	decode(t, body, &before)
	if before.Started {
		t.Errorf("앱을 열지도 않았는데 편성이 만들어졌다: %s", body)
	}

	// 사용자가 앱을 열면 그때 편성된다.
	todayPlan(t, env, tok)

	_, after := doJSON(t, env.app, "GET", "/api/admin/users/"+id+"/today", env.adminToken, nil)
	var seen struct {
		Started bool `json:"started"`
		Plan    struct {
			Cards []map[string]any `json:"cards"`
		} `json:"plan"`
	}
	decode(t, after, &seen)
	if !seen.Started || len(seen.Plan.Cards) == 0 {
		t.Errorf("학습을 시작했는데 콘솔에 배정이 보이지 않는다: %s", after)
	}

	// 일반 사용자는 남의 배정을 볼 수 없다.
	if r, _ := doJSON(t, env.app, "GET", "/api/admin/users/"+id+"/today", tok, nil); r.StatusCode != 403 {
		t.Errorf("일반 사용자의 남의 배정 조회 -> %d, want 403", r.StatusCode)
	}
}

// 구형 경로와 새 경로가 **같은 문제**를 줘야 한다.
//
// `/api/cards/today` 는 오늘의 편성이 생기기 전부터 있었고 이미 배포된 앱이
// 부르고 있다. 예전 규칙(3분 시간 예산 패킹)을 그대로 두면 선택 엔진이 두 벌이
// 되어, 같은 사람이 어느 경로로 묻느냐에 따라 다른 문제를 받는다.
func TestLegacyTodayRouteServesSameAssignment(t *testing.T) {
	env := buildAdminApp(t)
	tok := loginToken(t, env.app, "demo", "demo1234")

	plan := todayPlan(t, env, tok)

	res, body := doJSON(t, env.app, "GET", "/api/cards/today", tok, nil)
	if res.StatusCode != 200 {
		t.Fatalf("구형 경로: %d %s", res.StatusCode, body)
	}
	var legacy []struct {
		ID       string `json:"id"`
		StatusCd string `json:"status_cd"`
	}
	decode(t, body, &legacy)

	got := make([]string, 0, len(legacy))
	for _, c := range legacy {
		got = append(got, c.ID)
	}
	if fmt.Sprint(got) != fmt.Sprint(cardIDsOf(plan)) {
		t.Errorf("두 경로가 다른 문제를 준다:\n구형 %v\n신형 %v", got, cardIDsOf(plan))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 안전 카드 도감 — 서버 보관
// ─────────────────────────────────────────────────────────────────────────────

// 도감은 지금까지 기기 로컬에만 있었다. 앱을 지우면 몇 달치 수집이 사라졌다.
func TestCollectionSurvivesAcrossDevices(t *testing.T) {
	env := buildAdminApp(t)

	// 기기A: 팩 5개를 벌어 3개를 열고 카드를 모았다.
	res, _ := doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, map[string]any{
		"packs_earned": 5, "packs_opened": 3,
		"owned":       map[string]int{"safety-helmet": 2},
		"study_total": 40,
	})
	if res.StatusCode != 200 {
		t.Fatalf("sync -> %d, want 200", res.StatusCode)
	}

	// 기기B(=앱을 지우고 다시 깐 상태): 빈 상태로 물어봐도 기록이 남아 있어야 한다.
	_, body := doJSON(t, env.app, "GET", "/api/collection", env.memberToken, nil)
	var got struct {
		PacksEarned  int            `json:"packs_earned"`
		PacksOpened  int            `json:"packs_opened"`
		PackBalance  int            `json:"pack_balance"`
		UniqueCount  int            `json:"unique_count"`
		Owned        map[string]int `json:"owned"`
		StudyTotal   int            `json:"study_total"`
		ShardBalance int            `json:"shard_balance"`
	}
	decode(t, body, &got)

	if got.PacksEarned != 5 || got.PacksOpened != 3 {
		t.Fatalf("카운터가 남지 않음: %s", body)
	}
	// 잔액은 서버가 계산해 준다 — 앱이 따로 세지 않아도 되게.
	if got.PackBalance != 2 {
		t.Errorf("팩 잔액 2 여야 함, got %d", got.PackBalance)
	}
	if got.Owned["safety-helmet"] != 2 || got.UniqueCount != 1 {
		t.Errorf("보유 카드가 남지 않음: %s", body)
	}
	if got.StudyTotal != 40 {
		t.Errorf("누적 학습이 남지 않음: %d", got.StudyTotal)
	}
}

// 오프라인 큐가 같은 요청을 두 번 보내도 팩이 두 배가 되면 안 된다.
func TestCollectionSyncIsSafeToRetry(t *testing.T) {
	env := buildAdminApp(t)
	payload := map[string]any{"packs_earned": 7, "packs_opened": 2, "owned": map[string]int{"elb": 1}}

	doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, payload)
	_, body := doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, payload)

	var got struct {
		PacksEarned int `json:"packs_earned"`
		PackBalance int `json:"pack_balance"`
	}
	decode(t, body, &got)
	if got.PacksEarned != 7 || got.PackBalance != 5 {
		t.Fatalf("재전송에 값이 불어남: %s", body)
	}
}

// 오래된 스냅샷을 들고 뒤늦게 붙은 기기가 기록을 되감으면 안 된다.
func TestCollectionSyncNeverRewinds(t *testing.T) {
	env := buildAdminApp(t)

	doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, map[string]any{
		"packs_earned": 40, "packs_opened": 30, "study_total": 300,
	})
	_, body := doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, map[string]any{
		"packs_earned": 2, "packs_opened": 1, "study_total": 5,
	})

	var got struct {
		PacksEarned int `json:"packs_earned"`
		StudyTotal  int `json:"study_total"`
	}
	decode(t, body, &got)
	if got.PacksEarned != 40 || got.StudyTotal != 300 {
		t.Fatalf("오래된 스냅샷이 기록을 되돌림: %s", body)
	}
}

// 도감은 개인 데이터다 — 남의 것이 새어 나오면 안 된다.
func TestCollectionIsPrivate(t *testing.T) {
	env := buildAdminApp(t)

	doJSON(t, env.app, "POST", "/api/collection/sync", env.memberToken, map[string]any{"packs_earned": 9})

	// 관리자는 문의 대응을 위해 볼 수 있다.
	res, body := doJSON(t, env.app, "GET", "/api/admin/users/"+userIDOf(t, env, "demo")+"/collection", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("관리자 조회 -> %d, want 200", res.StatusCode)
	}
	var got struct {
		PacksEarned int `json:"packs_earned"`
	}
	decode(t, body, &got)
	if got.PacksEarned != 9 {
		t.Errorf("콘솔에 도감이 보이지 않음: %s", body)
	}

	// 일반 사용자는 남의 도감을 볼 수 없다.
	if r, _ := doJSON(t, env.app, "GET", "/api/admin/users/"+env.adminID+"/collection", env.memberToken, nil); r.StatusCode != 403 {
		t.Errorf("일반 사용자의 남의 도감 조회 -> %d, want 403", r.StatusCode)
	}
	// 토큰 없이도 안 된다.
	if r, _ := doJSON(t, env.app, "GET", "/api/collection", "", nil); r.StatusCode != 401 {
		t.Errorf("비로그인 도감 조회 -> %d, want 401", r.StatusCode)
	}
}
