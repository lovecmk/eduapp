package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// Metrics 는 모든 요청의 경로·상태·지연을 수집기에 기록한다.
//
// 경로는 c.Path()(실제 URL) 가 아니라 c.Route().Path(등록된 라우트 패턴)를 쓴다.
// 실제 URL 을 쓰면 /api/admin/users/u-1, /api/admin/users/u-2 … 가 전부 다른 키가 되어
// 사용자 수만큼 집계 키가 늘어난다(카디널리티 폭발 → 메모리 증가). 패턴을 쓰면
// /api/admin/users/:id 하나로 모인다.
func Metrics(m *service.Metrics) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()

		// 핸들러가 에러를 반환하면 상태 코드는 아직 반영 전이다.
		// ErrorHandler 가 매길 코드를 여기서 미리 읽어 지표가 어긋나지 않게 한다.
		status := c.Response().StatusCode()
		if err != nil {
			if e, ok := err.(*fiber.Error); ok {
				status = e.Code
			} else {
				status = fiber.StatusInternalServerError
			}
		}

		path := c.Path()
		if r := c.Route(); r != nil && r.Path != "" {
			path = r.Path
		}

		userID, _ := c.Locals("userID").(string)
		m.Observe(service.RequestSample{
			At:       start,
			Method:   c.Method(),
			Path:     path,
			Status:   status,
			Duration: time.Since(start),
			UserID:   userID,
		})
		return err
	}
}
