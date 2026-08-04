// Package middleware 는 Fiber 미들웨어를 제공한다.
package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/token"
)

// LocalUserID 는 인증된 사용자 ID 가 담기는 컨텍스트 키.
// 문자열을 여기저기 다시 적으면 오타 하나로 조용히 빈 사용자로 동작한다.
const LocalUserID = "userID"

// UserID 는 인증된 사용자 ID 를 꺼낸다. 없으면 빈 문자열.
//
// 타입 단언을 감싸 두는 이유 — `c.Locals("userID").(string)` 은 값이 없으면
// **패닉**한다. RequireAuth 뒤에서는 늘 있으므로 평소엔 드러나지 않지만,
// 라우트를 옮기다 미들웨어가 빠지는 순간 그 경로 전체가 500 으로 죽는다.
// 빈 문자열이면 서비스가 "내 데이터가 없다"로 자연스럽게 답한다.
func UserID(c *fiber.Ctx) string {
	id, _ := c.Locals(LocalUserID).(string)
	return id
}

// RequireAuth 는 Authorization: Bearer <access-token> 을 검증하고
// c.Locals(LocalUserID) 에 사용자 ID 를 주입한다.
func RequireAuth(tm *token.Manager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			return fiber.NewError(fiber.StatusUnauthorized, "인증이 필요합니다")
		}
		raw := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		userID, typ, err := tm.Parse(raw)
		if err != nil || typ != "access" {
			return fiber.NewError(fiber.StatusUnauthorized, "인증이 만료되었습니다")
		}
		c.Locals(LocalUserID, userID)
		return c.Next()
	}
}
