// Package config 는 환경변수 기반 설정을 한 곳에서 로드한다.
// 서버 이식(다른 호스트/클라우드)이 쉽도록 모든 외부 의존성 주소·비밀은
// 코드가 아니라 환경변수로만 주입된다.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config 는 서버 구동에 필요한 모든 설정값의 집합이다.
type Config struct {
	Port            string        // HTTP 포트
	Version         string        // 배포된 서버 빌드 식별자 — /health 응답에 실려 배포 확인에 쓰인다
	Store           string        // 저장소 종류: "mongo"(기본) | "postgres" | "memory"(무DB 로컬/데모)
	MongoURI        string        // MongoDB 연결 문자열
	MongoDB         string        // 데이터베이스 이름
	DatabaseURL     string        // PostgreSQL 연결 문자열(STORE=postgres 일 때)
	JWTSecret       []byte        // 액세스/리프레시 토큰 서명 키
	AccessTTL       time.Duration // 액세스 토큰 유효기간
	RefreshTTL      time.Duration // 리프레시 토큰 유효기간
	CORSOrigins     string        // 허용 Origin (","로 구분, "*" 가능)
	SeedOnStart     bool          // 부팅 시 카드 시드 자동 주입 여부
	StudySessionSec int           // 개인별 1회 학습 세션 목표 시간(초) — 기본 180(3분)

	// --- 관리 콘솔(Vue) ---
	// 부팅 시 이 자격증명으로 관리자 계정을 보장한다. 둘 다 비면 아무것도 만들지 않는다.
	// 기본 관리자 비밀번호를 코드에 박지 않기 위한 의도적 설계 —
	// 관리 콘솔은 전체 사용자 데이터를 볼 수 있어 기본 비밀번호 사고의 대가가 크다.
	AdminLoginID  string
	AdminPassword string

	// --- 원격 푸시(Expo) ---
	ExpoPushURL string // Expo 푸시 게이트웨이 주소(비면 서비스 기본값)

	// --- 텔레그램 제어(추후 API 키 주입) ---
	TelegramBotToken     string  // 봇 토큰 — 비면 텔레그램 연동 비활성
	TelegramAPIBase      string  // 텔레그램 API 주소(테스트/프록시용, 비면 기본값)
	TelegramAllowedChats []int64 // 명령 허용 chat_id 화이트리스트(비면 전체 허용)
	TelegramPoll         bool    // long-polling 자동 시작 여부(기본 true)
}

// InsecureJWTSecret 은 무설정 로컬 실행용 기본 서명키다.
//
// 이 값은 저장소에 공개돼 있어 서명 위조를 막지 못한다. 상수로 빼 둔 이유는
// 기동 시점에 "이 값이면 뜨지 않는다"를 확실히 비교하기 위해서다 —
// 문자열을 두 곳에 따로 적어 두면 한쪽만 바뀌어 검사가 조용히 무력해진다.
const InsecureJWTSecret = "dev-insecure-secret-change-me"

// Load 는 환경변수(및 합리적 기본값)로부터 Config 를 구성한다.
func Load() Config {
	return Config{
		Port:            getEnv("PORT", "8080"),
		Version:         getEnv("APP_VERSION", "dev"),
		Store:           getEnv("STORE", "mongo"),
		MongoURI:        getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:         getEnv("MONGO_DB", "eduapp"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://eduapp:eduapp@localhost:5432/eduapp?sslmode=disable"),
		JWTSecret:       []byte(getEnv("JWT_SECRET", InsecureJWTSecret)),
		AccessTTL:       getDuration("ACCESS_TTL", 15*time.Minute),
		RefreshTTL:      getDuration("REFRESH_TTL", 30*24*time.Hour),
		CORSOrigins:     getEnv("CORS_ORIGINS", "*"),
		SeedOnStart:     getBool("SEED_ON_START", true),
		StudySessionSec: getInt("STUDY_SESSION_SEC", 180),

		AdminLoginID:  getEnv("ADMIN_LOGIN_ID", ""),
		AdminPassword: getEnv("ADMIN_PASSWORD", ""),

		ExpoPushURL: getEnv("EXPO_PUSH_URL", ""),

		TelegramBotToken:     getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramAPIBase:      getEnv("TELEGRAM_API_BASE", ""),
		TelegramAllowedChats: getInt64CSV("TELEGRAM_ALLOWED_CHATS"),
		TelegramPoll:         getBool("TELEGRAM_POLL", true),
	}
}

// getInt64CSV 는 "123,-456" 형태의 환경변수를 []int64 로 파싱한다(빈 값이면 nil).
func getInt64CSV(key string) []int64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	var out []int64
	for _, part := range strings.Split(raw, ",") {
		if n, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil {
			out = append(out, n)
		}
	}
	return out
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
