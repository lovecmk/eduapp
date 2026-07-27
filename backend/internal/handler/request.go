package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/utils"
)

// 요청에서 읽은 문자열은 반드시 복사해서 쓴다.
//
// Fiber 는 성능을 위해 fasthttp 의 요청 버퍼를 재사용한다. 그래서 c.Params/c.Query 가
// 돌려주는 문자열은 **버퍼를 그대로 가리키고 있고, 응답이 끝나면 그 자리에 다음 요청의
// 바이트가 덮인다**. 핸들러 안에서 쓰고 버리면 아무 문제가 없지만, 값을 저장소에
// 넘겨 오래 들고 있으면 나중에 내용이 조용히 바뀐다.
//
// 실제로 이런 일이 있었다: PATCH /api/cards/q1 로 학습 완료를 기록하면 진행 기록에
// CardID="q1" 이 저장되는데, 그 뒤 다른 요청이 한 번 지나가면 저장된 값이 "og" 같은
// 엉뚱한 문자열로 변해 있었다. 맵의 키("u_demo|q1")는 그대로인데 값 안의 CardID 만
// 바뀌므로, 학습 기록이 사라진 것처럼 보이고 통계가 0 으로 돌아간다.
// 오류도 로그도 남지 않아 추적이 매우 어렵다.
//
// 그래서 요청 → 서비스 경계에서 한 번 복사한다. 복사 비용은 문자열 하나 수준이고,
// 그 대가로 "저장된 값이 나중에 변한다"는 부류의 버그가 통째로 사라진다.

// param 은 경로 파라미터를 안전하게(복사해서) 읽는다.
func param(c *fiber.Ctx, key string) string {
	return utils.CopyString(c.Params(key))
}

// query 는 쿼리 파라미터를 안전하게(복사해서) 읽는다.
func query(c *fiber.Ctx, key string) string {
	return utils.CopyString(c.Query(key))
}
