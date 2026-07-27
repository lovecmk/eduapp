package service

import (
	"context"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// ErrInvalidCredentials 는 로그인 실패 오류.
var ErrInvalidCredentials = errors.New("invalid credentials")

// ErrUsernameTaken / ErrNicknameTaken 은 회원가입/정보수정 시 중복 오류.
var (
	ErrUsernameTaken = errors.New("username already taken")
	ErrNicknameTaken = errors.New("nickname already taken")
)

// RegisterInput 은 회원가입 입력(프런트 SignupInput 과 일치).
type RegisterInput struct {
	Username string
	Password string
	Name     string
	Nickname string
	Email    string
	Org      string
}

// ProfilePatch 는 내 정보 수정 입력(넘긴 필드만 갱신).
type ProfilePatch struct {
	Name     *string
	Nickname *string
	Email    *string
	Org      *string
	JobTitle *string
}

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

// UsernameTaken 은 로그인 아이디 중복 여부를 반환한다.
func (s *AuthService) UsernameTaken(ctx context.Context, loginID string) (bool, error) {
	_, err := s.users.FindByLoginID(ctx, strings.TrimSpace(loginID))
	if err != nil {
		if isNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// NicknameTaken 은 닉네임 중복 여부를 반환한다. excludeID 본인은 제외한다.
func (s *AuthService) NicknameTaken(ctx context.Context, nickname, excludeID string) (bool, error) {
	u, err := s.users.FindByNickname(ctx, strings.TrimSpace(nickname))
	if err != nil {
		if isNotFound(err) {
			return false, nil
		}
		return false, err
	}
	if excludeID != "" && u.ID == excludeID {
		return false, nil
	}
	return true, nil
}

// Register 는 신규 계정을 만들고 (user, access, refresh) 를 반환한다.
func (s *AuthService) Register(ctx context.Context, in RegisterInput) (*domain.User, string, string, error) {
	loginID := strings.TrimSpace(in.Username)
	if taken, err := s.UsernameTaken(ctx, loginID); err != nil {
		return nil, "", "", err
	} else if taken {
		return nil, "", "", ErrUsernameTaken
	}
	nickname := strings.TrimSpace(in.Nickname)
	if nickname != "" {
		if taken, err := s.NicknameTaken(ctx, nickname, ""); err != nil {
			return nil, "", "", err
		} else if taken {
			return nil, "", "", ErrNicknameTaken
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", "", err
	}
	u := &domain.User{
		ID:           "u_" + strconv.FormatInt(time.Now().UnixNano(), 36),
		LoginID:      loginID,
		UserNm:       strings.TrimSpace(in.Name),
		Nickname:     nickname,
		EmailAddr:    strings.TrimSpace(in.Email),
		OrgNm:        strings.TrimSpace(in.Org),
		MembershipCd: domain.Basic,
		PasswordHash: string(hash),
		CreatedAt:    time.Now(),
		StatusCd:     "A",
	}
	if err := s.users.Create(ctx, u); err != nil {
		return nil, "", "", err
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

// UpdateProfile 은 내 정보를 부분 갱신하고 갱신된 사용자를 반환한다.
func (s *AuthService) UpdateProfile(ctx context.Context, userID string, p ProfilePatch) (*domain.User, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if p.Nickname != nil {
		nick := strings.TrimSpace(*p.Nickname)
		if nick != "" {
			if taken, err := s.NicknameTaken(ctx, nick, userID); err != nil {
				return nil, err
			} else if taken {
				return nil, ErrNicknameTaken
			}
		}
		u.Nickname = nick
	}
	if p.Name != nil {
		u.UserNm = strings.TrimSpace(*p.Name)
	}
	if p.Email != nil {
		u.EmailAddr = strings.TrimSpace(*p.Email)
	}
	if p.Org != nil {
		u.OrgNm = strings.TrimSpace(*p.Org)
	}
	if p.JobTitle != nil {
		u.JobTitle = strings.TrimSpace(*p.JobTitle)
	}
	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}
	return u, nil
}

func isNotFound(err error) bool {
	var nf ports.ErrNotFound
	return errors.As(err, &nf)
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
		Nickname:     "데모왕",
		EmailAddr:    "demo@eduapp.local",
		OrgNm:        "안전관리팀",
		JobTitle:     "안전점검원",
		MembershipCd: domain.Premium,
		PasswordHash: string(hash),
		CreatedAt:    time.Now(),
		StatusCd:     "A",
	})
}

// EnsureAdmin 은 관리 콘솔에 들어갈 수 있는 계정이 최소 한 개 있도록 보장한다.
//
// 설계 원칙: **기본 관리자 비밀번호를 코드에 박지 않는다.**
// 흔한 사고가 "기본 admin/admin1234 를 안 바꾸고 배포" 인데, 이 앱의 관리 콘솔은
// 전체 사용자 데이터를 볼 수 있으므로 그 사고의 대가가 크다. 그래서 자격증명은
// 반드시 환경변수로 주입받고, 없으면 계정을 만들지 않고 방법만 알린다.
//
// 동작:
//   - loginID/password 가 비면 → 아무것도 만들지 않는다. 관리자가 하나도 없으면 안내 로그.
//   - 해당 loginID 계정이 이미 있으면 → 비밀번호는 건드리지 않고 권한만 ADMIN 으로 승격.
//     (운영 중 재시작마다 비밀번호가 되돌아가면 오히려 위험하다)
//   - 없으면 → 새 관리자 계정을 만든다.
func (s *AuthService) EnsureAdmin(ctx context.Context, loginID, password string) error {
	loginID = strings.TrimSpace(loginID)

	if loginID == "" || password == "" {
		admins, _, err := s.users.List(ctx, ports.UserQuery{Role: string(domain.RoleAdmin), Status: "A", Limit: 1})
		if err != nil {
			return err
		}
		if len(admins) == 0 {
			log.Printf("[admin] 관리자 계정이 없습니다 — ADMIN_LOGIN_ID / ADMIN_PASSWORD 를 주입하고 재기동하세요")
		}
		return nil
	}

	existing, err := s.users.FindByLoginID(ctx, loginID)
	if err == nil {
		if existing.Role().IsAdmin() && existing.Active() {
			return nil // 이미 정상 관리자 — 손대지 않는다
		}
		existing.RoleCd = domain.RoleAdmin
		existing.StatusCd = "A"
		if err := s.users.Update(ctx, existing); err != nil {
			return err
		}
		log.Printf("[admin] 기존 계정 %q 를 관리자로 승격했습니다(비밀번호는 유지)", loginID)
		return nil
	}
	var notFound ports.ErrNotFound
	if !errors.As(err, &notFound) {
		return err
	}

	if len(password) < 8 {
		return errors.New("ADMIN_PASSWORD 는 8자 이상이어야 합니다")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.users.Create(ctx, &domain.User{
		ID:           "u_admin_" + strconv.FormatInt(time.Now().UnixNano(), 36),
		LoginID:      loginID,
		UserNm:       "관리자",
		Nickname:     "",
		EmailAddr:    "",
		OrgNm:        "",
		JobTitle:     "시스템 관리자",
		MembershipCd: domain.VIP,
		RoleCd:       domain.RoleAdmin,
		PasswordHash: string(hash),
		CreatedAt:    time.Now(),
		StatusCd:     "A",
	}); err != nil {
		return err
	}
	log.Printf("[admin] 관리자 계정 %q 를 생성했습니다", loginID)
	return nil
}
