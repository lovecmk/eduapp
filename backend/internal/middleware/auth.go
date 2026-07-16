// Package middleware 는 Fiber 미들웨어를 제공한다.
package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/token"
)

// RequireAuth 는 Authorization: Bearer <access-token> 을 검증하고
// c.Locals("userID") 에 사용자 ID 를 주입한다.
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
		c.Locals("userID", userID)
		return c.Next()
	}
}
