package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// CollectionHandler 는 안전 카드 도감 동기화 HTTP 어댑터.
type CollectionHandler struct{ svc *service.CollectionService }

// NewCollectionHandler 는 도감 핸들러를 만든다.
func NewCollectionHandler(svc *service.CollectionService) *CollectionHandler {
	return &CollectionHandler{svc: svc}
}

// collectionDTO 는 앱과 주고받는 도감 표현.
//
// 잔액(balance)을 **응답에만** 넣고 요청에서는 읽지 않는다. 잔액은 카운터에서
// 계산되는 값이라 받아 봐야 쓸 데가 없고, 받아서 저장하면 카운터와 잔액이
// 어긋나는 순간 어느 쪽이 진실인지 알 수 없게 된다.
type collectionDTO struct {
	Owned          map[string]int `json:"owned"`
	PacksEarned    int            `json:"packs_earned"`
	PacksOpened    int            `json:"packs_opened"`
	ShardsEarned   int            `json:"shards_earned"`
	ShardsSpent    int            `json:"shards_spent"`
	StudyTotal     int            `json:"study_total"`
	ClaimedRules   map[string]int `json:"claimed_rules"`
	RedeemedCodes  []string       `json:"redeemed_codes"`
	LastDailyPack  string         `json:"last_daily_pack"`
	SinceEpic      int            `json:"since_epic"`
	SinceLegendary int            `json:"since_legendary"`

	// 아래 셋은 서버가 계산해 주는 읽기 전용 값(앱이 직접 안 세도 되게).
	PackBalance  int `json:"pack_balance"`
	ShardBalance int `json:"shard_balance"`
	UniqueCount  int `json:"unique_count"`
}

func toCollectionDTO(c domain.Collection) collectionDTO {
	owned := c.Owned
	if owned == nil {
		owned = map[string]int{}
	}
	rules := c.ClaimedRules
	if rules == nil {
		rules = map[string]int{}
	}
	codes := c.RedeemedCodes
	if codes == nil {
		codes = []string{}
	}
	return collectionDTO{
		Owned:          owned,
		PacksEarned:    c.PacksEarned,
		PacksOpened:    c.PacksOpened,
		ShardsEarned:   c.ShardsEarned,
		ShardsSpent:    c.ShardsSpent,
		StudyTotal:     c.StudyTotal,
		ClaimedRules:   rules,
		RedeemedCodes:  codes,
		LastDailyPack:  c.LastDailyPack,
		SinceEpic:      c.SinceEpic,
		SinceLegendary: c.SinceLegendary,
		PackBalance:    c.PackBalance(),
		ShardBalance:   c.ShardBalance(),
		UniqueCount:    c.UniqueCount(),
	}
}

func fromCollectionDTO(d collectionDTO) domain.Collection {
	return domain.Collection{
		Owned:          d.Owned,
		PacksEarned:    d.PacksEarned,
		PacksOpened:    d.PacksOpened,
		ShardsEarned:   d.ShardsEarned,
		ShardsSpent:    d.ShardsSpent,
		StudyTotal:     d.StudyTotal,
		ClaimedRules:   d.ClaimedRules,
		RedeemedCodes:  d.RedeemedCodes,
		LastDailyPack:  d.LastDailyPack,
		SinceEpic:      d.SinceEpic,
		SinceLegendary: d.SinceLegendary,
	}
}

// Get 은 GET /api/collection — 내 도감을 준다.
func (h *CollectionHandler) Get(c *fiber.Ctx) error {
	uid := middleware.UserID(c)
	got, err := h.svc.Get(c.Context(), uid)
	if err != nil {
		return err
	}
	return c.JSON(toCollectionDTO(got))
}

// Sync 는 POST /api/collection/sync — 기기 상태를 병합하고 병합 결과를 돌려준다.
//
// 응답을 그대로 앱의 새 상태로 삼도록 만든 것이 요점이다. "보냈으니 됐다"로
// 두면 두 기기가 각자 다른 도감을 들고 영원히 갈라진다.
func (h *CollectionHandler) Sync(c *fiber.Ctx) error {
	var req collectionDTO
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	uid := middleware.UserID(c)
	got, err := h.svc.Sync(c.Context(), uid, fromCollectionDTO(req))
	if err != nil {
		return err
	}
	return c.JSON(toCollectionDTO(got))
}

// AdminGet 은 GET /api/admin/users/:id/collection — 운영자가 보는 사용자 도감.
//
// 문의 대응에 필요하다("팩이 사라졌어요"). 읽기 전용이며 지급 기능은 두지 않았다 —
// 콘솔에서 팩을 찍어낼 수 있으면 그때부터 도감 경제에 감사 추적이 필요해진다.
func (h *CollectionHandler) AdminGet(c *fiber.Ctx) error {
	got, err := h.svc.Get(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(toCollectionDTO(got))
}
