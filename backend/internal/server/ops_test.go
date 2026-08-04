package server_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
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
		DailyNewLimit int  `json:"daily_new_limit"`
	}
	decode(t, body, &s)
	if !s.SignupEnabled || s.DailyNewLimit != domain.DefaultDailyNewLimit {
		t.Fatalf("기본 설정이 어긋난다: %s", body)
	}

	// 상한만 바꾼다.
	if res, b := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken,
		map[string]any{"daily_new_limit": 2}); res.StatusCode != 200 {
		t.Fatalf("상한 변경: %d %s", res.StatusCode, b)
	}
	// 이번엔 공지 배너만 바꾼다 — 앞서 바꾼 상한이 살아 있어야 한다.
	_, after := doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken,
		map[string]any{"notice_txt": "오늘 오후 정전 예정", "notice_level": "WARN"})
	var s2 struct {
		DailyNewLimit int    `json:"daily_new_limit"`
		SignupEnabled bool   `json:"signup_enabled"`
		NoticeTxt     string `json:"notice_txt"`
		NoticeLevel   string `json:"notice_level"`
		UpdatedByName string `json:"updated_by_name"`
	}
	decode(t, after, &s2)
	if s2.DailyNewLimit != 2 {
		t.Errorf("보내지 않은 상한이 덮였다: %s", after)
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
		{"daily_new_limit": 0},
		{"daily_new_limit": 500},
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
	if q.Limit != domain.DefaultDailyNewLimit || q.Used != 0 || q.Remaining != q.Limit {
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

	// 관리자가 상한을 줄이면 앱이 보는 값도 따라 바뀐다 —
	// 이것이 안 되면 콘솔의 상한 설정은 아무 의미가 없다.
	doJSON(t, env.app, "PUT", "/api/admin/settings", env.adminToken, map[string]any{"daily_new_limit": 2})
	_, tightened := doJSON(t, env.app, "GET", "/api/learning/quota", userTok, nil)
	decode(t, tightened, &q)
	if q.Limit != 2 || q.Remaining != 0 {
		t.Errorf("바뀐 상한이 반영되지 않았다: %s", tightened)
	}
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

// 하루 학습 상한의 기본값은 앱 상수(DAILY_NEW_LIMIT=3)와 같아야 한다.
//
// 두 값이 갈리면, 서버에 닿은 기기와 아직 목업으로 떨어진 기기가 서로 다른
// 상한으로 돌아간다 — 같은 사람이 태블릿에서는 3장, 휴대폰에서는 5장을 배운다.
func TestDefaultDailyLimitMatchesApp(t *testing.T) {
	const appDailyNewLimit = 3 // src/constants/learning.ts
	if domain.DefaultDailyNewLimit != appDailyNewLimit {
		t.Errorf("서버 기본 상한=%d, 앱 상수=%d — 두 값은 같아야 한다",
			domain.DefaultDailyNewLimit, appDailyNewLimit)
	}
}
