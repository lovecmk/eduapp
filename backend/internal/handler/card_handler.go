package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// CardHandler 는 카드 관련 HTTP 엔드포인트.
type CardHandler struct{ svc *service.CardService }

// NewCardHandler 는 카드 핸들러를 만든다.
func NewCardHandler(svc *service.CardService) *CardHandler { return &CardHandler{svc: svc} }

// All GET /api/cards
func (h *CardHandler) All(c *fiber.Ctx) error {
	userID := middleware.UserID(c)
	cards, err := h.svc.All(c.Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(toCardDTOList(cards))
}

// Today GET /api/cards/today
// 쿼리: ?difficulty=EASY|MEDIUM|HARD (선택), ?minutes=3 (선택)
// 개인에게 "3분 학습 분량"을 난이도 규칙에 따라 구성해 돌려준다.
func (h *CardHandler) Today(c *fiber.Ctx) error {
	userID := middleware.UserID(c)

	opt := service.SessionOptions{}
	if d := strings.ToUpper(strings.TrimSpace(query(c, "difficulty"))); d != "" {
		switch domain.Difficulty(d) {
		case domain.Easy, domain.Medium, domain.Hard:
			opt.Difficulty = domain.Difficulty(d)
		}
	}
	if m := strings.TrimSpace(query(c, "minutes")); m != "" {
		if n, err := strconv.Atoi(m); err == nil && n > 0 {
			opt.TargetSec = n * 60
		}
	}

	cards, err := h.svc.TodaySession(c.Context(), userID, opt)
	if err != nil {
		return err
	}
	return c.JSON(toCardDTOList(cards))
}

// createCardReq 는 프런트 draftToDTO(CardDraft.ts) 페이로드와 필드가 일치한다.
type createCardReq struct {
	CategoryCd    string   `json:"category_cd"`
	SubCategoryNm string   `json:"sub_category_nm"`
	TopicNm       string   `json:"topic_nm"`
	Keywords      []string `json:"keywords"`
	TitleTxt      string   `json:"title_txt"`
	DifficultyCd  string   `json:"difficulty_cd"`
	StudySeconds  int      `json:"study_seconds"`
	CardTypeCd    string   `json:"card_type_cd"`
	SituationTxt  string   `json:"situation_txt"`
	QuestionTxt   string   `json:"question_txt"`
	ImageURL      string   `json:"image_url"`
	Choices       []string `json:"choices"`
	AnswerIndex   *int     `json:"answer_index"`
	PrincipleTxt  string   `json:"principle_txt"`
	ProcessTxt    string   `json:"process_txt"`
	FireTriangle  string   `json:"fire_triangle_txt"`
	ConclusionTxt string   `json:"conclusion_txt"`
	AnswerImage   string   `json:"answer_image_url"`
	SourceTxt     string   `json:"source_txt"`
}

// Create POST /api/cards — 새 학습카드 등록(문제 등록 도구).
func (h *CardHandler) Create(c *fiber.Ctx) error {
	var req createCardReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if strings.TrimSpace(req.QuestionTxt) == "" || strings.TrimSpace(req.CategoryCd) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "필수 항목(문제·분류)이 비어 있습니다")
	}
	card := domain.Card{
		CategoryCd:     req.CategoryCd,
		SubCategoryNm:  req.SubCategoryNm,
		TopicNm:        req.TopicNm,
		Keywords:       req.Keywords,
		TitleTxt:       req.TitleTxt,
		StudySeconds:   req.StudySeconds,
		SituationTxt:   req.SituationTxt,
		QuestionTxt:    req.QuestionTxt,
		ImageURL:       req.ImageURL,
		PrincipleTxt:   req.PrincipleTxt,
		ProcessTxt:     req.ProcessTxt,
		FireTriangle:   req.FireTriangle,
		ConclusionTxt:  req.ConclusionTxt,
		AnswerImageURL: req.AnswerImage,
		SourceTxt:      req.SourceTxt,
		DifficultyCd:   domain.Difficulty(strings.ToUpper(strings.TrimSpace(req.DifficultyCd))),
		CardTypeCd:     domain.CardType(strings.ToUpper(strings.TrimSpace(req.CardTypeCd))),
		Choices:        req.Choices,
		AnswerIndex:    req.AnswerIndex,
	}
	created, err := h.svc.Create(c.Context(), card)
	if err != nil {
		return err
	}
	// 새 카드는 등록자 포함 아무 진행 상태가 없으므로 NEW 로 반환한다.
	return c.Status(fiber.StatusCreated).JSON(toCardDTO(domain.CardWithProgress{Card: *created, Status: domain.StatusNew}))
}

type markReq struct {
	StatusCd string `json:"status_cd"`
}

// Mark PATCH /api/cards/:id
func (h *CardHandler) Mark(c *fiber.Ctx) error {
	userID := middleware.UserID(c)
	id := param(c, "id")

	var req markReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	status := domain.CardStatus(strings.ToUpper(strings.TrimSpace(req.StatusCd)))
	switch status {
	case domain.StatusNew, domain.StatusLearning, domain.StatusMastered:
	default:
		return fiber.NewError(fiber.StatusBadRequest, "알 수 없는 status_cd 입니다")
	}

	card, err := h.svc.Mark(c.Context(), userID, id, status)
	if err != nil {
		var nf ports.ErrNotFound
		if errors.As(err, &nf) {
			return fiber.NewError(fiber.StatusNotFound, "카드를 찾을 수 없습니다")
		}
		return err
	}
	return c.JSON(toCardDTO(*card))
}
