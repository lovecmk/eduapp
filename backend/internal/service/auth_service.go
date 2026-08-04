package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// ErrInvalidCredentials 는 로그인 실패 오류.
var ErrInvalidCredentials = errors.New("invalid credentials")

// ErrAccountDisabled 는 정지(I)·삭제(D) 처리된 계정으로 접근했을 때의 오류.
//
// 자격증명 오류와 구분하는 이유: 비밀번호는 맞는데 들어갈 수 없는 상황이라
// "비밀번호가 틀렸습니다" 로 안내하면 사용자가 비밀번호를 계속 바꿔 보게 된다.
// (계정 존재 여부가 새는 것은 문제되지 않는다 — 이미 비밀번호를 통과한 뒤다.)
var ErrAccountDisabled = errors.New("account disabled")

// ErrUsernameTaken / ErrNicknameTaken 은 회원가입/정보수정 시 중복 오류.
var (
	ErrUsernameTaken = errors.New("username already taken")
	ErrNicknameTaken = errors.New("nickname already taken")
)

// 비밀번호 정책 — 숫자는 "왜 이 값인가"를 설명할 수 있어야 한다.
const (
	// minPasswordRunes 는 최소 길이(공백 제외). 8자는 무차별 대입 방어의 실용적 하한선이다.
	minPasswordRunes = 8
	// maxPasswordBytes 는 bcrypt 가 처리할 수 있는 물리적 상한이다.
	// 이 값을 넘기면 bcrypt 가 오류를 내는데, 그것은 서버 장애가 아니라 입력 오류다.
	// 라이브러리의 한계를 도메인 규칙으로 끌어올려야 500 이 아니라 400 으로 답할 수 있다.
	maxPasswordBytes = 72
)

// ValidatePassword 는 비밀번호가 정책에 맞는지 확인한다.
//
// 카드에 ValidateCard 가 있듯 인증에도 검증 계층이 필요하다. 이것이 없던 동안
// 한 자리 비밀번호와 공백만 있는 비밀번호로 계정이 만들어졌고,
// 72바이트를 넘는 입력은 500 으로 새어 나갔다.
func ValidatePassword(pw string) error {
	if len([]byte(pw)) > maxPasswordBytes {
		return ErrInvalidInput{Reason: "비밀번호는 72바이트를 넘을 수 없습니다"}
	}
	// 공백을 벗겨 내고 센다 — "        " 는 8자처럼 보이지만 아무 비밀도 아니다.
	if utf8.RuneCountInString(strings.TrimSpace(pw)) < minPasswordRunes {
		return ErrInvalidInput{Reason: "비밀번호는 공백을 제외하고 8자 이상이어야 합니다"}
	}
	return nil
}

// dummyHash 는 존재하지 않는 계정에 대해서도 비교 연산을 수행하기 위한 미끼 해시다.
//
// 없는 아이디는 즉시 반환하고 있는 아이디만 bcrypt 를 돌리면, 응답 시간 차이만으로
// "이 아이디는 존재한다"가 새어 나간다(bcrypt 는 의도적으로 느리므로 차이가 크다).
// 없는 계정에도 같은 비용을 치르게 해 두 경로의 시간을 맞춘다.
var dummyHash = func() []byte {
	h, err := bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)
	if err != nil {
		return []byte("$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva")
	}
	return h
}()

// newID 는 추측할 수 없는 식별자를 만든다.
//
// 이전에는 나노초 타임스탬프를 36진수로 적었는데 두 가지가 문제였다.
// (1) 가입 시각을 알면 ID 를 좁힐 수 있다. (2) 같은 나노초에 두 건이 들어오면 겹친다.
// 난수 8바이트면 두 문제가 함께 사라진다.
func newID(prefix string) string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// 난수원이 죽는 일은 사실상 없지만, 그때도 ID 는 나와야 한다.
		return prefix + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return prefix + hex.EncodeToString(b[:])
}

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
		// 계정이 없어도 있을 때와 같은 비용을 치른다(타이밍으로 존재 여부가 새지 않게).
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return nil, "", "", ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return nil, "", "", ErrInvalidCredentials
	}
	// 관리 콘솔에서 정지(I)·삭제(D)한 계정은 여기서 막는다.
	// 이 검사가 없으면 '정지' 버튼이 아무 효과도 내지 못한다(그대로 재로그인 가능).
	if !u.Active() {
		return nil, "", "", ErrAccountDisabled
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
//
// 계정 상태를 여기서 다시 확인하는 것이 '정지'를 실효화하는 핵심이다.
// 액세스 토큰은 스테이트리스라 발급 후에는 회수할 수 없지만, 유효기간이 짧으므로
// (ACCESS_TTL, 기본 15분) 갱신 길목을 막으면 정지 처분이 그 시간 안에 반영된다.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (string, error) {
	userID, typ, err := s.tokens.Parse(refreshToken)
	if err != nil || typ != "refresh" {
		return "", ErrInvalidCredentials
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return "", ErrInvalidCredentials
	}
	if !u.Active() {
		return "", ErrAccountDisabled
	}
	return s.tokens.Access(userID)
}

// Me 는 userID 로 사용자를 조회한다.
// 정지된 계정은 살아 있는 액세스 토큰을 들고 있어도 세션 복구를 막는다 —
// 앱이 부팅할 때마다 호출하는 길목이라, 여기서 끊으면 다음 실행부터 로그인 화면으로 간다.
func (s *AuthService) Me(ctx context.Context, userID string) (*domain.User, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !u.Active() {
		return nil, ErrAccountDisabled
	}
	return u, nil
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
	// 앱은 축약된 정수 id 를, 관리 콘솔은 진짜 문자열 id 를 보낸다 — 둘 다 본인으로 본다.
	// 한쪽만 인정하면 앱의 '내 정보 수정'에서 닉네임을 그대로 둔 채로는 저장이 안 된다
	// (자기 닉네임이 자기 것과 충돌한다고 나온다). 자세한 내용은 publicid.go.
	if SameUser(u.ID, excludeID) {
		return false, nil
	}
	return true, nil
}

// Register 는 신규 계정을 만들고 (user, access, refresh) 를 반환한다.
func (s *AuthService) Register(ctx context.Context, in RegisterInput) (*domain.User, string, string, error) {
	loginID := strings.TrimSpace(in.Username)
	if err := ValidatePassword(in.Password); err != nil {
		return nil, "", "", err
	}
	// 아래 두 검사는 '친절한 사전 안내'다 — 대부분의 중복은 여기서 걸러 좋은 메시지를 준다.
	// 하지만 이 검사와 Create 사이에는 틈이 있어 동시 요청을 막지 못한다.
	// 실제 유일성은 저장소 제약이 보장하고, 그 위반은 아래에서 ErrConflict 로 받는다.
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
		ID:           newID("u_"),
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
		// 사전 검사를 통과했는데도 저장소가 충돌을 알렸다면, 그 틈으로 동시 요청이
		// 들어온 것이다. 저장소의 판정이 최종이므로 그대로 중복 오류로 옮긴다.
		var conflict ports.ErrConflict
		if errors.As(err, &conflict) {
			if conflict.Field == "nickname" {
				return nil, "", "", ErrNicknameTaken
			}
			return nil, "", "", ErrUsernameTaken
		}
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
		ID:           newID("u_admin_"),
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
