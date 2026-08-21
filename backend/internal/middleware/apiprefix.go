package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// InternalAPIPrefix 는 서버가 라우트를 등록하는 **내부 표준 경로**다.
//
// 핸들러 주석, 점검 모드 예외 목록(maintenanceExempt), 지표 집계, 테스트가 모두
// 이 경로를 기준으로 쓰여 있다. 게이트웨이 규칙이 바뀔 때마다 이 한 벌을 통째로
// 고치면 그때마다 같은 실수를 반복하게 되므로, 바뀌는 쪽(바깥 접두사)을 문 앞에서
// 이 값으로 맞춘다.
const InternalAPIPrefix = "/api"

// APIPrefix 는 게이트웨이가 붙여 보내는 외부 접두사를 내부 표준 경로로 바꾼다.
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// 사내 게이트웨이의 로케이션 블록이 `/api` 에서 `/inner/api/v1` 로 바뀌었다.
// 게이트웨이가 경로를 그대로 넘기므로(권장 설정) 서버에는 이제
// `/inner/api/v1/auth/login` 이 도착한다. 서버 라우트는 `/api/auth/login` 이라
// 이 변환이 없으면 **모든 요청이 404** 가 된다 — 앱은 404 를 '아직 배포되지 않은
// 기능'으로 읽고 조용히 목업으로 떨어지므로, 장애가 로그에도 잘 드러나지 않는다.
//
// ── 왜 라우트를 두 벌 등록하지 않는가 ──────────────────────────────────────
// 같은 트리를 두 접두사에 각각 붙이면 속도 제한 카운터·멱등 키·지표가 경로별로
// 갈라진다(같은 사람이 두 배를 시도할 수 있다는 뜻이다). 문 앞에서 경로 하나만
// 고쳐 주면 그 뒤의 모든 미들웨어는 여전히 한 벌의 경로만 본다.
//
// ── 구형 경로 ─────────────────────────────────────────────────────────────
// 이미 배포된 앱·스크립트(backend/scripts/demo-data.mjs, 관리 콘솔)는 백엔드를
// 직접 부를 때 `/api/...` 를 쓴다. 그 경로는 내부 표준 경로 그대로이므로 아무것도
// 하지 않아도 계속 동작한다 — 이 미들웨어는 바깥 접두사가 붙은 요청만 건드린다.
//
// prefix 가 비었거나 내부 표준 경로와 같으면 아무 일도 하지 않는 미들웨어를
// 돌려준다(로컬에서 게이트웨이 없이 직접 부르는 경우).
func APIPrefix(prefix string) fiber.Handler {
	p := NormalizeAPIPrefix(prefix)
	if p == "" || p == InternalAPIPrefix {
		return func(c *fiber.Ctx) error { return c.Next() }
	}
	return func(c *fiber.Ctx) error {
		if rewritten, ok := stripAPIPrefix(c.Path(), p); ok {
			// c.Path(...) 는 이후 라우팅이 볼 경로까지 바꾼다(Fiber 의 rewrite 방식).
			// 지표·점검 모드가 이 미들웨어 **뒤에** 서 있어야 표준 경로를 본다.
			c.Path(rewritten)
		}
		return c.Next()
	}
}

// NormalizeAPIPrefix 는 운영자가 적어 넣는 값의 흔들림을 흡수한다.
// `inner/api/v1`, `/inner/api/v1/`, ` /inner/api/v1 ` 모두 같은 값으로 본다.
func NormalizeAPIPrefix(prefix string) string {
	p := strings.TrimSpace(prefix)
	p = strings.TrimRight(p, "/")
	if p == "" {
		return ""
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return p
}

// stripAPIPrefix 는 외부 접두사를 내부 표준 경로로 바꾼 결과를 돌려준다.
// 접두사가 붙지 않은 요청(구형 `/api/...`, `/health`)은 그대로 둔다.
func stripAPIPrefix(path, prefix string) (string, bool) {
	// 경계(`/`)까지 확인한다. 이것이 없으면 `/inner/api/v1x/...` 같은 남의 경로를
	// 이 서비스의 것으로 오인한다.
	if path != prefix && !strings.HasPrefix(path, prefix+"/") {
		return path, false
	}
	rest := strings.TrimPrefix(path, prefix)

	// 접두사 뒤에 이미 `/api` 가 붙어 온 경우(`/inner/api/v1/api/cards`)는 그대로 쓴다.
	//
	// 앱과 관리 콘솔은 코드에 `/api/...` 를 박아 두고 주소만 환경변수로 받는다.
	// 그래서 운영에서 base URL 을 `https://호스트/inner/api/v1` 로 주면 이 모양이
	// 만들어진다 — 접두사를 기계적으로 덧붙이면 `/api/api/cards` 가 되어 404 다.
	// 여기서 한 겹을 접어 주면 **프런트 코드를 고치지 않고** 배포 환경변수만으로
	// 새 게이트웨이 경로에 붙을 수 있다.
	if rest == InternalAPIPrefix || strings.HasPrefix(rest, InternalAPIPrefix+"/") {
		return rest, true
	}
	return InternalAPIPrefix + rest, true
}
