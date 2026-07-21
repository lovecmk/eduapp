package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// DefaultExpoPushURL 은 Expo 푸시 게이트웨이 기본 주소.
const DefaultExpoPushURL = "https://exp.host/--/api/v2/push/send"

// PushService 는 원격 푸시(Expo Push) 발송과 토큰 관리를 담당한다.
// 텔레그램 명령(/alert1~3)·서버 이벤트가 이 서비스의 Broadcast 로 전체 기기에
// "동시에" 알림을 보낸다. 등록된 토큰이 없으면 네트워크 호출 없이 즉시 반환한다.
type PushService struct {
	repo    ports.PushTokenRepository
	pushURL string
	client  *http.Client
}

// NewPushService 는 푸시 서비스를 만든다. pushURL 이 비면 Expo 기본 주소를 쓴다.
func NewPushService(repo ports.PushTokenRepository, pushURL string) *PushService {
	if strings.TrimSpace(pushURL) == "" {
		pushURL = DefaultExpoPushURL
	}
	return &PushService{
		repo:    repo,
		pushURL: pushURL,
		client:  &http.Client{Timeout: 10 * time.Second},
	}
}

// Register 는 기기 푸시 토큰을 업서트한다.
func (s *PushService) Register(ctx context.Context, token, platform, userID string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return fmt.Errorf("빈 푸시 토큰")
	}
	now := time.Now()
	return s.repo.Save(ctx, domain.PushToken{
		Token:     token,
		Platform:  platform,
		UserID:    userID,
		CreatedAt: now,
		UpdatedAt: now,
	})
}

// TokenCount 는 현재 등록된 기기 수를 반환한다(브로드캐스트 대상 수).
func (s *PushService) TokenCount(ctx context.Context) (int, error) {
	toks, err := s.repo.All(ctx)
	if err != nil {
		return 0, err
	}
	return len(toks), nil
}

// expoMessage 는 Expo Push API 메시지 한 건.
type expoMessage struct {
	To    string         `json:"to"`
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Sound string         `json:"sound"`
	Data  map[string]any `json:"data,omitempty"`
}

type expoResponse struct {
	Data []struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Details struct {
			Error string `json:"error"`
		} `json:"details"`
	} `json:"data"`
}

// Broadcast 는 등록된 모든 기기로 동일 알림을 발송하고 성공 건수를 반환한다.
// Expo 는 한 요청당 최대 100건을 권장하므로 100개씩 나눠 보낸다.
// 무효(DeviceNotRegistered) 토큰은 자동 정리한다.
func (s *PushService) Broadcast(ctx context.Context, title, body string, data map[string]any) (int, error) {
	tokens, err := s.repo.All(ctx)
	if err != nil {
		return 0, err
	}
	if len(tokens) == 0 {
		return 0, nil // 대상 없음 — 네트워크 호출 생략.
	}

	sent := 0
	const chunk = 100
	for i := 0; i < len(tokens); i += chunk {
		end := i + chunk
		if end > len(tokens) {
			end = len(tokens)
		}
		batch := tokens[i:end]
		msgs := make([]expoMessage, len(batch))
		for j, t := range batch {
			msgs[j] = expoMessage{To: t.Token, Title: title, Body: body, Sound: "default", Data: data}
		}
		ok, err := s.sendBatch(ctx, msgs, batch)
		if err != nil {
			return sent, err
		}
		sent += ok
	}
	return sent, nil
}

func (s *PushService) sendBatch(ctx context.Context, msgs []expoMessage, batch []domain.PushToken) (int, error) {
	payload, err := json.Marshal(msgs)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.pushURL, bytes.NewReader(payload))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	res, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return 0, fmt.Errorf("expo push HTTP %d", res.StatusCode)
	}

	var parsed expoResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		// 응답 파싱 실패라도 전송 자체는 됐을 수 있어 배치 전체를 성공으로 본다.
		return len(msgs), nil
	}

	ok := 0
	for i, r := range parsed.Data {
		if r.Status == "ok" {
			ok++
			continue
		}
		// 무효 토큰은 정리해 다음 브로드캐스트 낭비를 막는다.
		if i < len(batch) && r.Details.Error == "DeviceNotRegistered" {
			_ = s.repo.Delete(ctx, batch[i].Token)
		}
	}
	return ok, nil
}
