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
	Store           string        // 저장소 종류: "mongo"(기본) | "memory"(무DB 로컬/데모)
	MongoURI        string        // MongoDB 연결 문자열
	MongoDB         string        // 데이터베이스 이름
	JWTSecret       []byte        // 액세스/리프레시 토큰 서명 키
	AccessTTL       time.Duration // 액세스 토큰 유효기간
	RefreshTTL      time.Duration // 리프레시 토큰 유효기간
	CORSOrigins     string        // 허용 Origin (","로 구분, "*" 가능)
	SeedOnStart     bool          // 부팅 시 카드 시드 자동 주입 여부
	StudySessionSec int           // 개인별 1회 학습 세션 목표 시간(초) — 기본 180(3분)
}

// Load 는 환경변수(및 합리적 기본값)로부터 Config 를 구성한다.
func Load() Config {
	return Config{
		Port:            getEnv("PORT", "8080"),
		Store:           getEnv("STORE", "mongo"),
		MongoURI:        getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:         getEnv("MONGO_DB", "eduapp"),
		JWTSecret:       []byte(getEnv("JWT_SECRET", "dev-insecure-secret-change-me")),
		AccessTTL:       getDuration("ACCESS_TTL", 15*time.Minute),
		RefreshTTL:      getDuration("REFRESH_TTL", 30*24*time.Hour),
		CORSOrigins:     getEnv("CORS_ORIGINS", "*"),
		SeedOnStart:     getBool("SEED_ON_START", true),
		StudySessionSec: getInt("STUDY_SESSION_SEC", 180),
	}
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
