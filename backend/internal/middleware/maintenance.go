package middleware

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// SettingsReader 는 점검 모드 판정에 필요한 최소한의 읽기다.
//
// 서비스 타입을 그대로 받지 않는 이유 — 미들웨어가 서비스 계층을 import 하면
// 의존 방향이 뒤집힌다(service → middleware 도 있으므로 순환이 생긴다).
// 필요한 것은 "지금 설정" 하나뿐이라 그 모양만 인터페이스로 받는다.
type SettingsReader interface {
	Get(ctx context.Context) domain.OpsSettings
}

// defaultMaintenanceMsg 는 운영자가 안내 문구를 비워 둔 채 점검 모드를 켰을 때
// 사용자에게 나가는 기본 문구. 빈 메시지는 앱에서 '알 수 없는 오류'로 보인다.
const defaultMaintenanceMsg = "서비스 점검 중입니다. 잠시 후 다시 이용해주세요"

// Maintenance 는 점검 모드일 때 일반 사용자의 요청을 503 으로 막는다.
//
// ── 무엇을 막지 않는가 ────────────────────────────────────────────────────
//   - 관리자(users 조회로 확인) — 점검 중에도 콘솔로 상태를 되돌릴 수 있어야 한다.
//     이 예외가 없으면 점검 모드를 켠 순간 그것을 끌 방법이 사라진다.
//   - 인증 경로(/api/auth/*) — 관리자가 로그인해서 들어와야 하므로 열어 둔다.
//   - /api/health, /api/config — 점검 중임을 **알리는** 경로다. 이것까지 막으면
//     앱은 "왜 안 되는지"를 표시하지 못하고 그냥 고장난 것처럼 보인다.
//
// 미들웨어를 라우팅 앞단에 두되 위 경로들을 건너뛰는 방식을 택한 이유는,
// 새 라우트가 추가될 때 기본이 '보호됨'이어야 하기 때문이다. 반대로 하면
// 점검 모드를 뚫는 경로가 조용히 늘어난다.
func Maintenance(settings SettingsReader, tm *token.Manager, users ports.UserRepository) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if settings == nil {
			return c.Next()
		}
		s := settings.Get(c.Context())
		if !s.MaintenanceYn {
			return c.Next()
		}
		if maintenanceExempt(c.Path()) {
			return c.Next()
		}
		if isAdminRequest(c, tm, users) {
			return c.Next()
		}
		msg := s.MaintenanceMsg
		if msg == "" {
			msg = defaultMaintenanceMsg
		}
		return fiber.NewError(fiber.StatusServiceUnavailable, msg)
	}
}

// RequireSignupOpen 은 신규 가입이 닫혀 있으면 회원가입만 거부한다.
//
// 점검 모드와 따로 두는 이유 — 이 둘은 전혀 다른 상황이다. 점검은 "지금
// 아무도 못 쓴다"이고, 가입 차단은 "쓰던 사람은 그대로 쓰되 새로 받지 않는다"다.
// 사내 배포에서 정원이 찼거나 계정을 수동 발급으로 돌릴 때 필요하다.
func RequireSignupOpen(settings SettingsReader) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if settings == nil || settings.Get(c.Context()).SignupEnabled {
			return c.Next()
		}
		return fiber.NewError(fiber.StatusForbidden, "지금은 신규 가입을 받지 않습니다. 관리자에게 문의해주세요")
	}
}

// maintenanceExempt 는 점검 중에도 열어 두는 경로인지 판정한다.
func maintenanceExempt(path string) bool {
	switch path {
	case "/health", "/api/health", "/api/config":
		return true
	}
	// 인증과 관리 API 는 통째로 연다 — 관리자가 들어와 점검을 끌 수 있어야 한다.
	// (관리 API 자체가 RequireAdmin 으로 막혀 있으므로 여기서 여는 것은 안전하다.)
	return strings.HasPrefix(path, "/api/auth/") || strings.HasPrefix(path, "/api/admin")
}

// isAdminRequest 는 이 요청이 관리자의 것인지 확인한다.
//
// 토큰을 여기서 직접 읽는 이유 — 이 미들웨어는 라우팅 **앞**에 서 있어야
// 새로 추가되는 경로도 기본으로 막힌다. 그런데 그 자리에서는 RequireAuth 가
// 아직 돌지 않아 c.Locals 가 비어 있다. 헤더를 한 번 더 파싱하는 비용은
// 점검 모드가 켜진 동안에만 발생한다(평상시에는 이 함수에 닿지 않는다).
func isAdminRequest(c *fiber.Ctx, tm *token.Manager, users ports.UserRepository) bool {
	if tm == nil || users == nil {
		return false
	}
	h := c.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return false
	}
	userID, typ, err := tm.Parse(strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")))
	if err != nil || typ != "access" {
		return false
	}
	u, err := users.FindByID(c.Context(), userID)
	if err != nil {
		return false
	}
	return u.Active() && u.Role().IsAdmin()
}
