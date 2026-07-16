// Package token 은 JWT 액세스/리프레시 토큰 발급·검증을 담당한다.
package token

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalid 는 검증 실패 토큰에 대한 표준 오류.
var ErrInvalid = errors.New("invalid token")

// Manager 는 서명 키와 유효기간을 보유한 토큰 발급기.
type Manager struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewManager 는 토큰 매니저를 만든다.
func NewManager(secret []byte, accessTTL, refreshTTL time.Duration) *Manager {
	return &Manager{secret: secret, accessTTL: accessTTL, refreshTTL: refreshTTL}
}

type claims struct {
	Typ string `json:"typ"` // "access" | "refresh"
	jwt.RegisteredClaims
}

func (m *Manager) sign(userID, typ string, ttl time.Duration) (string, error) {
	now := time.Now()
	c := claims{
		Typ: typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(m.secret)
}

// Access 는 액세스 토큰을 발급한다.
func (m *Manager) Access(userID string) (string, error) {
	return m.sign(userID, "access", m.accessTTL)
}

// Refresh 는 리프레시 토큰을 발급한다.
func (m *Manager) Refresh(userID string) (string, error) {
	return m.sign(userID, "refresh", m.refreshTTL)
}

// Parse 는 토큰을 검증하고 (userID, typ) 를 반환한다.
func (m *Manager) Parse(tokenStr string) (userID, typ string, err error) {
	var c claims
	tok, err := jwt.ParseWithClaims(tokenStr, &c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalid
		}
		return m.secret, nil
	})
	if err != nil || !tok.Valid {
		return "", "", ErrInvalid
	}
	return c.Subject, c.Typ, nil
}
