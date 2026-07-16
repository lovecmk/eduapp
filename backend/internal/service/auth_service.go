package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// ErrInvalidCredentials 는 로그인 실패 오류.
var ErrInvalidCredentials = errors.New("invalid credentials")

// AuthService 는 로그인/토큰 갱신/세션 복구를 담당한다.
type AuthService struct {
	users  ports.UserRepository
	tokens *token.Manager
}

// NewAuthService 는 인증 서비스를 만든다.
func NewAuthService(users ports.UserRepository, tokens *token.Manager) *AuthService {
	return &AuthService{users: users, tokens: tokens}
}

// Login 은 loginID/password 를 검증하고 (user, access, refresh) 를 반환한다.
func (s *AuthService) Login(ctx context.Context, loginID, password string) (*domain.User, string, string, error) {
	u, err := s.users.FindByLoginID(ctx, strings.TrimSpace(loginID))
	if err != nil {
		return nil, "", "", ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return nil, "", "", ErrInvalidCredentials
	}
	access, err := s.tokens.Access(u.ID)
	if err != nil {
		return nil, "", "", err
	}
	refresh, err := s.tokens.Refresh(u.ID)
	if err != nil {
		return nil, "", "", err
	}
	return u, access, refresh, nil
}

// Refresh 는 유효한 리프레시 토큰으로 새 액세스 토큰을 발급한다.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (string, error) {
	userID, typ, err := s.tokens.Parse(refreshToken)
	if err != nil || typ != "refresh" {
		return "", ErrInvalidCredentials
	}
	if _, err := s.users.FindByID(ctx, userID); err != nil {
		return "", ErrInvalidCredentials
	}
	return s.tokens.Access(userID)
}

// Me 는 userID 로 사용자를 조회한다.
func (s *AuthService) Me(ctx context.Context, userID string) (*domain.User, error) {
	return s.users.FindByID(ctx, userID)
}

// EnsureDemoUser 는 개발/데모 편의를 위해 사용자가 하나도 없으면 기본 계정을 만든다.
// (loginID: demo / password: demo1234)
func (s *AuthService) EnsureDemoUser(ctx context.Context) error {
	n, err := s.users.Count(ctx)
	if err != nil || n > 0 {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("demo1234"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.users.Create(ctx, &domain.User{
		ID:           "u_demo",
		LoginID:      "demo",
		UserNm:       "데모 학습자",
		EmailAddr:    "demo@eduapp.local",
		OrgNm:        "안전관리팀",
		JobTitle:     "안전점검원",
		MembershipCd: domain.Premium,
		PasswordHash: string(hash),
		CreatedAt:    time.Now(),
		StatusCd:     "A",
	})
}
