package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// AuthHandler 는 인증 관련 HTTP 엔드포인트.
type AuthHandler struct{ svc *service.AuthService }

// NewAuthHandler 는 인증 핸들러를 만든다.
func NewAuthHandler(svc *service.AuthService) *AuthHandler { return &AuthHandler{svc: svc} }

type loginReq struct {
	ID       string `json:"id"`
	Password string `json:"password"`
}

// Login POST /api/auth/login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	u, access, refresh, err := h.svc.Login(c.Context(), req.ID, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return fiber.NewError(fiber.StatusUnauthorized, "아이디 또는 비밀번호가 올바르지 않습니다")
		}
		return err
	}
	return c.JSON(AuthResultDTO{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toUserDTO(u),
	})
}

// Logout POST /api/auth/logout — 스테이트리스 JWT 라 서버 상태 없음.
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"ok": true})
}

type registerReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Nickname string `json:"nickname"`
	Email    string `json:"email"`
	Org      string `json:"org"`
}

// Register POST /api/auth/register
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req registerReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if req.Username == "" || req.Password == "" {
		return fiber.NewError(fiber.StatusBadRequest, "아이디와 비밀번호는 필수입니다")
	}
	u, access, refresh, err := h.svc.Register(c.Context(), service.RegisterInput{
		Username: req.Username, Password: req.Password, Name: req.Name,
		Nickname: req.Nickname, Email: req.Email, Org: req.Org,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUsernameTaken):
			return fiber.NewError(fiber.StatusConflict, "이미 사용 중인 아이디입니다")
		case errors.Is(err, service.ErrNicknameTaken):
			return fiber.NewError(fiber.StatusConflict, "이미 사용 중인 닉네임입니다")
		default:
			return err
		}
	}
	return c.JSON(AuthResultDTO{AccessToken: access, RefreshToken: refresh, User: toUserDTO(u)})
}

// UsernameAvailable GET /api/auth/username-available?username=...
func (h *AuthHandler) UsernameAvailable(c *fiber.Ctx) error {
	taken, err := h.svc.UsernameTaken(c.Context(), c.Query("username"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"taken": taken})
}

// NicknameAvailable GET /api/auth/nickname-available?nickname=...&exclude=...
func (h *AuthHandler) NicknameAvailable(c *fiber.Ctx) error {
	taken, err := h.svc.NicknameTaken(c.Context(), c.Query("nickname"), c.Query("exclude"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"taken": taken})
}

type updateMeReq struct {
	Name     *string `json:"name"`
	Nickname *string `json:"nickname"`
	Email    *string `json:"email"`
	Org      *string `json:"org"`
	JobTitle *string `json:"jobTitle"`
}

// UpdateMe PATCH /api/auth/me (인증 필요)
func (h *AuthHandler) UpdateMe(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	var req updateMeReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	u, err := h.svc.UpdateProfile(c.Context(), userID, service.ProfilePatch{
		Name: req.Name, Nickname: req.Nickname, Email: req.Email, Org: req.Org, JobTitle: req.JobTitle,
	})
	if err != nil {
		if errors.Is(err, service.ErrNicknameTaken) {
			return fiber.NewError(fiber.StatusConflict, "이미 사용 중인 닉네임입니다")
		}
		return err
	}
	return c.JSON(toUserDTO(u))
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh POST /api/auth/refresh
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req refreshReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	access, err := h.svc.Refresh(c.Context(), req.RefreshToken)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "세션이 만료되었습니다")
	}
	return c.JSON(fiber.Map{"access_token": access})
}

// Me GET /api/auth/me (인증 필요)
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	u, err := h.svc.Me(c.Context(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "인증이 필요합니다")
	}
	return c.JSON(toUserDTO(u))
}
