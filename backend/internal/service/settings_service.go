package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// settingsTTL 은 운영 설정 캐시의 수명.
//
// 캐시가 필요한 이유 — 점검 모드는 **모든 요청**이 확인해야 한다. 매번 저장소를
// 왕복하면 설정 하나 때문에 전체 API 의 지연이 늘고, 저장소가 흔들릴 때 서비스가
// 함께 흔들린다. 반대로 너무 길게 잡으면 "점검 모드를 켰는데 안 걸린다"가 된다.
// 5초면 사람이 콘솔에서 켠 뒤 앱을 새로고침하는 사이에 반영된다.
const settingsTTL = 5 * time.Second

// SettingsService 는 운영 설정(점검 모드·하루 상한·공지 배너)을 읽고 바꾼다.
//
// 읽기는 짧은 캐시를 거치고, 쓰기는 반드시 감사 기록을 남긴다 —
// 점검 모드를 켜는 것은 전체 사용자를 막는 행위라 흔적 없이 일어나서는 안 된다.
type SettingsService struct {
	repo  ports.SettingsRepository
	audit ports.AuditRepository
	now   func() time.Time

	mu       sync.RWMutex
	cached   domain.OpsSettings
	loadedAt time.Time
}

// NewSettingsService 는 운영 설정 서비스를 만든다. repo 가 nil 이면
// 기본값만 돌려주는 '읽기 전용' 상태로 동작한다(설정 저장소가 없는 구성).
func NewSettingsService(repo ports.SettingsRepository, audit ports.AuditRepository) *SettingsService {
	return &SettingsService{
		repo: repo, audit: audit, now: time.Now,
		cached: domain.DefaultOpsSettings(),
	}
}

// Available 은 설정을 바꿀 수 있는 구성인지.
func (s *SettingsService) Available() bool { return s != nil && s.repo != nil }

// Get 은 현재 운영 설정을 준다.
//
// 저장소를 읽지 못하면 **마지막으로 알던 값**(없으면 기본값)을 돌려준다.
// 여기서 오류를 위로 던지면 저장소가 잠깐 흔들릴 때 전체 API 가 함께 실패한다 —
// 설정은 서비스의 전제 조건이 아니라 조절 손잡이다. 실패는 늘 '열려 있는' 쪽으로.
func (s *SettingsService) Get(ctx context.Context) domain.OpsSettings {
	if s == nil {
		return domain.DefaultOpsSettings()
	}
	s.mu.RLock()
	cached, loadedAt := s.cached, s.loadedAt
	s.mu.RUnlock()

	if s.repo == nil {
		return cached
	}
	if !loadedAt.IsZero() && s.now().Sub(loadedAt) < settingsTTL {
		return cached
	}

	loaded, err := s.repo.LoadSettings(ctx)
	if err != nil {
		log.Printf("[settings] 조회 실패 — 마지막으로 알던 값을 사용합니다: %v", err)
		return cached
	}
	loaded = loaded.Normalized()

	s.mu.Lock()
	s.cached, s.loadedAt = loaded, s.now()
	s.mu.Unlock()
	return loaded
}

// SettingsInput 은 운영 설정 변경 요청.
//
// 포인터인 것은 "보내지 않음"과 "false 로 바꿈"을 구분하기 위해서다.
// 값 타입이면 화면이 일부 필드만 보낼 때 나머지가 전부 false/0 으로 덮여,
// 공지 문구를 고치려다 점검 모드가 꺼지는 일이 벌어진다.
type SettingsInput struct {
	MaintenanceYn  *bool
	MaintenanceMsg *string
	SignupEnabled  *bool
	DailyNewLimit  *int
	NoticeTxt      *string
	NoticeLevel    *string
}

// maxNoticeLen 은 앱 배너에 들어갈 수 있는 문구 길이.
// 배너는 화면 맨 위 한 줄이라, 길면 학습 화면을 밀어내고 아무도 읽지 않는다.
const maxNoticeLen = 200

// Update 는 설정을 바꾸고 감사 기록을 남긴다.
func (s *SettingsService) Update(ctx context.Context, actor Actor, in SettingsInput) (domain.OpsSettings, error) {
	if !s.Available() {
		return domain.DefaultOpsSettings(), ErrInvalidInput{Reason: "설정 저장소가 연결되어 있지 않습니다"}
	}

	current, err := s.repo.LoadSettings(ctx)
	if err != nil {
		// 읽기 실패를 무시하고 저장하면 지금 값을 모른 채 통째로 덮어쓴다 —
		// 보내지 않은 필드가 옛 값으로 되돌아간다. 쓰기는 반드시 정직하게 실패한다.
		return domain.DefaultOpsSettings(), err
	}
	current = current.Normalized()
	next := current

	if in.MaintenanceYn != nil {
		next.MaintenanceYn = *in.MaintenanceYn
	}
	if in.MaintenanceMsg != nil {
		next.MaintenanceMsg = strings.TrimSpace(*in.MaintenanceMsg)
	}
	if in.SignupEnabled != nil {
		next.SignupEnabled = *in.SignupEnabled
	}
	if in.DailyNewLimit != nil {
		if *in.DailyNewLimit < 1 {
			return current, ErrInvalidInput{Reason: "하루 학습 상한은 1 이상이어야 합니다"}
		}
		if *in.DailyNewLimit > 100 {
			return current, ErrInvalidInput{Reason: "하루 학습 상한은 100을 넘을 수 없습니다"}
		}
		next.DailyNewLimit = *in.DailyNewLimit
	}
	if in.NoticeTxt != nil {
		txt := strings.TrimSpace(*in.NoticeTxt)
		if len([]rune(txt)) > maxNoticeLen {
			return current, ErrInvalidInput{Reason: fmt.Sprintf("공지 배너는 %d자를 넘을 수 없습니다", maxNoticeLen)}
		}
		next.NoticeTxt = txt
	}
	if in.NoticeLevel != nil {
		lv := domain.NoticeLevel(strings.ToUpper(strings.TrimSpace(*in.NoticeLevel)))
		switch lv {
		case domain.NoticeInfo, domain.NoticeWarn, domain.NoticeDanger:
			next.NoticeLevel = lv
		default:
			return current, ErrInvalidInput{Reason: "알 수 없는 공지 단계입니다(INFO/WARN/DANGER)"}
		}
	}
	if len([]rune(next.MaintenanceMsg)) > maxNoticeLen {
		return current, ErrInvalidInput{Reason: fmt.Sprintf("점검 안내는 %d자를 넘을 수 없습니다", maxNoticeLen)}
	}

	next = next.Normalized()
	changes := settingsDiff(current, next)
	if len(changes) == 0 {
		return current, nil // 바뀐 것이 없다 — 감사 로그에 빈 변경을 남기지 않는다
	}

	next.UpdatedAt = s.now()
	next.UpdatedBy = actor.ID
	next.UpdatedByName = actor.Name
	if err := s.repo.SaveSettings(ctx, next); err != nil {
		return current, err
	}

	// 저장 직후 캐시를 새 값으로 바꾼다. 만료를 기다리면 방금 켠 점검 모드가
	// 몇 초간 반영되지 않아, 관리자는 설정이 먹히지 않았다고 판단한다.
	s.mu.Lock()
	s.cached, s.loadedAt = next, s.now()
	s.mu.Unlock()

	s.recordChange(ctx, actor, changes)
	return next, nil
}

// recordChange 는 설정 변경을 감사 기록에 남긴다.
func (s *SettingsService) recordChange(ctx context.Context, actor Actor, changes []string) {
	if s.audit == nil {
		return
	}
	l := domain.AuditLog{
		ID:         fmt.Sprintf("audit-%d", s.now().UnixNano()),
		ActorID:    actor.ID,
		ActorName:  actor.Name,
		Action:     "settings.update",
		TargetType: "settings",
		TargetID:   "ops",
		Summary:    "운영 설정 변경: " + strings.Join(changes, ", "),
		CreatedAt:  s.now(),
	}
	if err := s.audit.Append(ctx, l); err != nil {
		log.Printf("[settings] 감사 기록 실패: %v", err)
	}
}

// settingsDiff 는 사람이 읽는 변경 요약을 만든다.
// "설정 변경" 한 줄만 남기면 나중에 무엇이 바뀌었는지 알 수 없다.
func settingsDiff(before, after domain.OpsSettings) []string {
	var out []string
	if before.MaintenanceYn != after.MaintenanceYn {
		out = append(out, "점검 모드 "+onOff(after.MaintenanceYn))
	}
	if before.MaintenanceMsg != after.MaintenanceMsg {
		out = append(out, "점검 안내 문구 수정")
	}
	if before.SignupEnabled != after.SignupEnabled {
		out = append(out, "신규 가입 "+onOff(after.SignupEnabled))
	}
	if before.DailyNewLimit != after.DailyNewLimit {
		out = append(out, fmt.Sprintf("하루 학습 상한 %d → %d", before.DailyNewLimit, after.DailyNewLimit))
	}
	if before.NoticeTxt != after.NoticeTxt {
		if after.NoticeTxt == "" {
			out = append(out, "공지 배너 내림")
		} else {
			out = append(out, "공지 배너 게시")
		}
	}
	if before.NoticeLevel != after.NoticeLevel {
		out = append(out, "공지 단계 "+string(after.NoticeLevel))
	}
	return out
}

func onOff(on bool) string {
	if on {
		return "켬"
	}
	return "끔"
}
