package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultTelegramAPIBase 는 텔레그램 봇 API 기본 주소.
const DefaultTelegramAPIBase = "https://api.telegram.org"

// notAuthorizedMsg 는 화이트리스트에 없는 채팅이 알림 발송을 시도할 때의 응답.
const notAuthorizedMsg = "⛔ 이 채팅에는 알림 발송 권한이 없습니다."

// AlertTemplate 은 텔레그램 명령으로 발송할 알림 문안 한 벌.
// "/alert1 2 3" 처럼 미리 만들어 둔 3가지 버전을 키(alert1~3)로 고른다.
type AlertTemplate struct {
	Key   string // 명령 키: "alert1" | "alert2" | "alert3"
	Label string // 사람이 읽는 이름(도움말/확인 메시지용)
	Title string // 푸시 제목
	Body  string // 푸시 본문
}

// defaultAlertTemplates 는 우선 제공하는 3가지 알림 버전.
// (추후 관리 화면/DB 로 옮겨도 되도록 서비스 내부 데이터로만 둔다.)
func defaultAlertTemplates() []AlertTemplate {
	return []AlertTemplate{
		{Key: "alert1", Label: "긴급 안전 점검", Title: "🚨 긴급 안전 점검 요청", Body: "현장 위험요인 점검이 필요합니다. 지금 앱에서 오늘의 안전 카드를 확인하세요."},
		{Key: "alert2", Label: "오늘의 학습 리마인더", Title: "⏰ 오늘의 학습, 잊지 않으셨죠?", Body: "3분이면 충분해요. 신규 카드와 복습으로 오늘의 안전 습관을 이어가요."},
		{Key: "alert3", Label: "복습 주기 도래", Title: "🔁 복습할 카드가 도착했어요", Body: "망각곡선 기준 복습 시점이 된 카드가 있어요. 잠깐 복습하고 넘어가요."},
	}
}

// TelegramService 는 텔레그램 봇으로 알림 발송을 원격 제어한다.
// 명령(/alert1~3)을 받으면 PushService 를 통해 등록된 모든 기기에 동시에 알림을 보낸다.
// 봇 토큰(config.TelegramBotToken)이 비어 있으면 비활성(Enabled=false) 상태로,
// 폴링을 시작하지 않으며 어떤 텔레그램 API 도 호출하지 않는다(추후 API 키 주입 대비).
type TelegramService struct {
	token     string
	apiBase   string
	allowed   map[int64]bool // 허용 chat_id 화이트리스트(비면 전체 허용)
	push      *PushService
	client    *http.Client
	templates map[string]AlertTemplate
	order     []string  // 도움말 출력 순서 보존
	offset    int64     // getUpdates long-poll offset
	startedAt time.Time // 서비스 생성 시각(/ping 가동시간 산출용)
}

// TelegramConfig 는 텔레그램 서비스 구성값.
type TelegramConfig struct {
	BotToken     string
	APIBase      string
	AllowedChats []int64
}

// NewTelegramService 는 텔레그램 서비스를 만든다.
func NewTelegramService(cfg TelegramConfig, push *PushService) *TelegramService {
	apiBase := strings.TrimSpace(cfg.APIBase)
	if apiBase == "" {
		apiBase = DefaultTelegramAPIBase
	}
	allowed := map[int64]bool{}
	for _, id := range cfg.AllowedChats {
		allowed[id] = true
	}
	tmpls := map[string]AlertTemplate{}
	order := []string{}
	for _, t := range defaultAlertTemplates() {
		tmpls[t.Key] = t
		order = append(order, t.Key)
	}
	return &TelegramService{
		token:     strings.TrimSpace(cfg.BotToken),
		apiBase:   apiBase,
		allowed:   allowed,
		push:      push,
		client:    &http.Client{Timeout: 65 * time.Second}, // long-poll(50s) 여유
		templates: tmpls,
		order:     order,
		startedAt: time.Now(),
	}
}

// Enabled 는 봇 토큰이 설정돼 실제 텔레그램 연동이 가능한지 여부.
func (s *TelegramService) Enabled() bool { return s.token != "" }

// authorized 는 해당 chat 이 명령 실행 권한이 있는지(화이트리스트) 판단한다.
func (s *TelegramService) authorized(chatID int64) bool {
	if len(s.allowed) == 0 {
		return true // 화이트리스트 미설정 = 전체 허용
	}
	return s.allowed[chatID]
}

// helpText 는 /help·/start 응답(사용 가능한 명령 안내).
func (s *TelegramService) helpText() string {
	var b strings.Builder
	b.WriteString("🤖 현장학습 알림 봇\n\n")
	b.WriteString("등록된 모든 모바일 기기로 알림을 동시에 보냅니다.\n\n")
	b.WriteString("사용 가능한 명령:\n")
	for _, k := range s.order {
		t := s.templates[k]
		b.WriteString(fmt.Sprintf("• /%s — %s\n", t.Key, t.Label))
	}
	b.WriteString("• /alertall — 위 3가지 알림을 순서대로 모두 발송\n")
	b.WriteString("• /status — 현재 알림 수신 기기 수 확인\n")
	b.WriteString("• /whoami — 이 채팅의 chat_id·발송 권한 확인\n")
	b.WriteString("• /ping — 봇 생존·가동시간 확인\n")
	b.WriteString("• /help — 이 도움말 보기\n")
	return b.String()
}

// whoamiText 는 현재 chat 의 chat_id 와 발송 권한 상태를 안내한다.
// 화이트리스트(TELEGRAM_ALLOWED_CHATS) 를 설정하려면 먼저 chat_id 를 알아야 하므로
// 운영자가 자신의 chat_id 를 손쉽게 확인하도록 돕는다.
func (s *TelegramService) whoamiText(chatID int64) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("🪪 이 채팅의 chat_id: %d\n", chatID))
	switch {
	case len(s.allowed) == 0:
		b.WriteString("화이트리스트가 비어 있어 모든 채팅이 알림을 보낼 수 있어요.\n")
		b.WriteString("특정 채팅만 허용하려면 이 chat_id 를 TELEGRAM_ALLOWED_CHATS 에 넣으세요.")
	case s.authorized(chatID):
		b.WriteString("✅ 이 채팅은 알림 발송 권한이 있어요.")
	default:
		b.WriteString("⛔ 이 채팅은 알림 발송 권한이 없어요.\n")
		b.WriteString("허용하려면 이 chat_id 를 TELEGRAM_ALLOWED_CHATS 에 추가하세요.")
	}
	return b.String()
}

// uptimeText 는 가동 시간을 사람이 읽기 쉬운 한국어로 만든다.
func uptimeText(d time.Duration) string {
	d = d.Round(time.Second)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	sec := int(d.Seconds()) % 60
	switch {
	case h > 0:
		return fmt.Sprintf("%d시간 %d분", h, m)
	case m > 0:
		return fmt.Sprintf("%d분 %d초", m, sec)
	default:
		return fmt.Sprintf("%d초", sec)
	}
}

// HandleCommand 는 텍스트 명령을 처리하고 텔레그램에 돌려줄 응답 문자열을 만든다.
// 텔레그램 네트워크와 분리돼 있어 단위 테스트가 쉽다(부수효과는 PushService 뿐).
func (s *TelegramService) HandleCommand(ctx context.Context, chatID int64, text string) string {
	cmd, args := parseCommand(text)
	if cmd == "" {
		return "명령을 인식하지 못했어요. /help 로 사용법을 확인하세요."
	}

	switch cmd {
	case "start", "help":
		return s.helpText()
	case "ping":
		return fmt.Sprintf("🏓 pong — 봇 정상 동작 중(가동 %s)", uptimeText(time.Since(s.startedAt)))
	case "whoami":
		return s.whoamiText(chatID)
	case "status":
		n, err := s.push.TokenCount(ctx)
		if err != nil {
			log.Printf("[telegram] status 기기 수 조회 실패 chat=%d: %v", chatID, err)
			return "기기 수를 조회하지 못했어요."
		}
		return fmt.Sprintf("📱 현재 알림 수신 기기: %d대", n)
	case "alertall":
		// 전체 발송도 개별 발송(alert1~3)과 동일하게 화이트리스트를 강제한다.
		if !s.authorized(chatID) {
			return notAuthorizedMsg
		}
		return s.broadcastKeys(ctx, s.order)
	case "alert1", "alert2", "alert3":
		if !s.authorized(chatID) {
			return notAuthorizedMsg
		}
		return s.broadcastKeys(ctx, []string{cmd})
	case "alert":
		// "/alert 1 2 3" 형태 지원 — 인자로 받은 번호들을 순서대로 발송.
		if !s.authorized(chatID) {
			return notAuthorizedMsg
		}
		keys := keysFromArgs(args)
		if len(keys) == 0 {
			return "발송할 번호를 지정하세요. 예) /alert 1 2 3 또는 /alert1"
		}
		return s.broadcastKeys(ctx, keys)
	default:
		return "알 수 없는 명령이에요. /help 로 사용법을 확인하세요."
	}
}

// broadcastKeys 는 주어진 템플릿 키들을 차례로 브로드캐스트하고 결과 요약을 만든다.
func (s *TelegramService) broadcastKeys(ctx context.Context, keys []string) string {
	var lines []string
	for _, k := range keys {
		t, ok := s.templates[k]
		if !ok {
			lines = append(lines, fmt.Sprintf("• %s: 알 수 없는 알림", k))
			continue
		}
		n, err := s.push.Broadcast(ctx, t.Title, t.Body, map[string]any{"kind": "telegram_alert", "template": k})
		if err != nil {
			lines = append(lines, fmt.Sprintf("• %s(%s): 발송 실패 — %v", k, t.Label, err))
			continue
		}
		if n == 0 {
			lines = append(lines, fmt.Sprintf("• %s(%s): 등록된 기기가 없어요", k, t.Label))
			continue
		}
		lines = append(lines, fmt.Sprintf("• %s(%s): ✅ %d대 발송", k, t.Label, n))
	}
	return "📣 알림 발송 결과\n" + strings.Join(lines, "\n")
}

// Templates 는 등록된 알림 템플릿을 순서대로 반환한다(앱/도움말 노출용).
func (s *TelegramService) Templates() []AlertTemplate {
	out := make([]AlertTemplate, 0, len(s.order))
	for _, k := range s.order {
		out = append(out, s.templates[k])
	}
	return out
}

// BroadcastTemplate 은 키(alert1~3 또는 1~3)로 템플릿 하나를 전체 기기에 발송한다.
// 앱/서버가 텔레그램과 동일한 알림을 직접 트리거할 때 쓴다.
func (s *TelegramService) BroadcastTemplate(ctx context.Context, key string) (int, AlertTemplate, error) {
	key = strings.ToLower(strings.TrimSpace(key))
	switch key {
	case "1", "2", "3":
		key = "alert" + key
	}
	t, ok := s.templates[key]
	if !ok {
		return 0, AlertTemplate{}, fmt.Errorf("알 수 없는 알림 버전: %s", key)
	}
	n, err := s.push.Broadcast(ctx, t.Title, t.Body, map[string]any{"kind": "app_alert", "template": key})
	return n, t, err
}

// --- 텔레그램 API (Enabled 일 때만 호출) ---

type tgUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

type tgUpdatesResp struct {
	OK     bool       `json:"ok"`
	Result []tgUpdate `json:"result"`
}

// SendMessage 는 지정 chat 으로 텍스트를 보낸다.
func (s *TelegramService) SendMessage(ctx context.Context, chatID int64, text string) error {
	if !s.Enabled() {
		return nil
	}
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", s.apiBase, s.token)
	form := url.Values{}
	form.Set("chat_id", fmt.Sprintf("%d", chatID))
	form.Set("text", text)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("telegram sendMessage HTTP %d", res.StatusCode)
	}
	return nil
}

// Dispatch 는 한 건의 명령을 처리하고 응답을 텔레그램으로 돌려준다(웹훅/폴링 공용).
// long-polling 고루틴은 Fiber recover 미들웨어 밖에서 돌기 때문에, 명령 처리 중
// 패닉이 나면 폴링 루프(및 프로세스)가 통째로 죽는다. 여기서 복구해 봇을 살려 둔다.
func (s *TelegramService) Dispatch(ctx context.Context, chatID int64, text string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[telegram] 명령 처리 중 패닉 복구 chat=%d: %v", chatID, r)
		}
	}()
	reply := s.HandleCommand(ctx, chatID, text)
	if err := s.SendMessage(ctx, chatID, reply); err != nil {
		log.Printf("[telegram] 응답 전송 실패 chat=%d: %v", chatID, err)
	}
}

// Poll 은 long-polling(getUpdates) 루프로 명령을 수신·처리한다.
// 봇 토큰이 없으면 즉시 반환한다. ctx 가 취소되면 루프를 종료한다.
func (s *TelegramService) Poll(ctx context.Context) {
	if !s.Enabled() {
		log.Printf("[telegram] 봇 토큰 미설정 — 폴링 비활성(추후 TELEGRAM_BOT_TOKEN 주입)")
		return
	}
	log.Printf("[telegram] long-polling 시작")
	for {
		select {
		case <-ctx.Done():
			log.Printf("[telegram] 폴링 종료")
			return
		default:
		}
		updates, err := s.getUpdates(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[telegram] getUpdates 오류: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range updates {
			if u.Message == nil || strings.TrimSpace(u.Message.Text) == "" {
				s.offset = u.UpdateID + 1
				continue
			}
			s.Dispatch(ctx, u.Message.Chat.ID, u.Message.Text)
			s.offset = u.UpdateID + 1
		}
	}
}

func (s *TelegramService) getUpdates(ctx context.Context) ([]tgUpdate, error) {
	endpoint := fmt.Sprintf("%s/bot%s/getUpdates?timeout=50&offset=%d", s.apiBase, s.token, s.offset)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("getUpdates HTTP %d", res.StatusCode)
	}
	var parsed tgUpdatesResp
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed.Result, nil
}

// parseCommand 는 "/alert1@bot arg1 arg2" → ("alert1", ["arg1","arg2"]) 로 분해한다.
func parseCommand(text string) (string, []string) {
	fields := strings.Fields(strings.TrimSpace(text))
	if len(fields) == 0 {
		return "", nil
	}
	head := fields[0]
	if !strings.HasPrefix(head, "/") {
		return "", nil
	}
	head = strings.TrimPrefix(head, "/")
	if i := strings.Index(head, "@"); i >= 0 { // /help@MyBot 형태 제거
		head = head[:i]
	}
	return strings.ToLower(head), fields[1:]
}

// keysFromArgs 는 ["1","2","x","3"] → ["alert1","alert2","alert3"] 로 변환한다(유효 번호만).
func keysFromArgs(args []string) []string {
	var keys []string
	for _, a := range args {
		switch strings.TrimSpace(a) {
		case "1":
			keys = append(keys, "alert1")
		case "2":
			keys = append(keys, "alert2")
		case "3":
			keys = append(keys, "alert3")
		}
	}
	return keys
}
