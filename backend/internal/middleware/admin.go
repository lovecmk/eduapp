package middleware

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 요청 컨텍스트에 담기는 관리자 정보 키.
const (
	LocalAdminID   = "adminID"
	LocalAdminName = "adminName"
)

// RequireAdmin 은 RequireAuth 를 통과한 요청이 실제로 관리자인지 확인한다.
//
// 권한을 **토큰에 넣지 않고 매 요청 조회하는 이유**:
// 토큰에 role 을 박아두면 권한을 회수해도 그 토큰이 만료될 때까지(액세스 15분,
// 리프레시 30일) 계속 관리자로 통한다. 관리 권한은 회수가 즉시 반영되어야 하는
// 종류의 권한이므로, 저장소 조회 한 번을 감수하고 매번 확인한다.
// (관리 API 는 호출량이 적어 이 비용이 문제되지 않는다.)
func RequireAdmin(users ports.UserRepository) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, _ := c.Locals("userID").(string)
		if userID == "" {
			// RequireAuth 뒤에 놓이지 않았다는 뜻 — 배선 실수를 조용히 통과시키지 않는다.
			return fiber.NewError(fiber.StatusUnauthorized, "인증이 필요합니다")
		}

		u, err := users.FindByID(c.Context(), userID)
		if err != nil {
			// 계정이 사라졌는데 토큰만 살아 있는 경우도 여기로 온다.
			return fiber.NewError(fiber.StatusUnauthorized, "인증이 만료되었습니다")
		}
		// 정지·삭제된 계정은 권한이 남아 있어도 통과시키지 않는다.
		if !u.Active() {
			return fiber.NewError(fiber.StatusForbidden, "사용할 수 없는 계정입니다")
		}
		if !u.Role().IsAdmin() {
			// 존재 여부를 흘리지 않도록 404 가 아니라 403 으로 일관되게 답한다.
			return fiber.NewError(fiber.StatusForbidden, "관리자 권한이 필요합니다")
		}

		c.Locals(LocalAdminID, u.ID)
		c.Locals(LocalAdminName, adminDisplayName(*u))
		return c.Next()
	}
}

func adminDisplayName(u domain.User) string {
	for _, v := range []string{u.UserNm, u.Nickname, u.LoginID} {
		if v != "" {
			return v
		}
	}
	return u.ID
}
