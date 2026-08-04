package service

import (
	"context"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// LearningService 는 하루 신규 학습 상한을 관리한다.
//
// ── 왜 서버가 세는가 ──────────────────────────────────────────────────────
// 상한은 지금까지 앱 로컬 스토어에만 있었다. 앱을 지우거나 기기를 바꾸면
// 오늘 몇 장을 배웠는지가 초기화되고, 같은 사람이 태블릿과 휴대폰으로 각각
// 상한을 채울 수 있었다. 앱의 저장소(`/api/learning/quota`)는 이 엔드포인트를
// 오래전부터 호출하고 있었지만 서버에 라우트가 없어 늘 목업으로 떨어졌다 —
// 그래서 관리자가 콘솔에서 상한을 바꿔도 아무 일도 일어나지 않았다.
//
// 상한 값 자체는 운영 설정(OpsSettings.DailyNewLimit)에서 온다. 그래야
// 재배포 없이 "오늘은 3장으로 줄이자" 같은 조정이 가능하다.
type LearningService struct {
	data     ports.UserDataRepository
	settings *SettingsService
	now      func() time.Time
}

// NewLearningService 는 학습 상한 서비스를 만든다.
func NewLearningService(data ports.UserDataRepository, settings *SettingsService) *LearningService {
	return &LearningService{data: data, settings: settings, now: time.Now}
}

// Available 은 상한을 셀 수 있는 구성인지.
func (s *LearningService) Available() bool { return s != nil && s.data != nil }

// Quota 는 오늘의 하루 학습 상한 현황이다.
// json 태그는 앱의 LearningQuotaRepository(QuotaDTO)와 1:1 로 맞춘다.
type Quota struct {
	Limit int `json:"limit"`
	Used  int `json:"used"`
	// Remaining 은 앱이 다시 계산하지 않아도 되게 함께 준다.
	// 두 곳에서 각자 빼면 한쪽이 음수를 막지 않아 "-1장 남음"이 화면에 뜬다.
	Remaining int `json:"remaining"`
	// ResetsAt 은 다음 자정(서버 로컬 기준) — 앱이 "몇 시에 초기화되는가"를 보여준다.
	ResetsAt string `json:"resets_at"`
}

// Get 은 오늘의 상한 현황을 반환한다.
func (s *LearningService) Get(ctx context.Context, userID string) (*Quota, error) {
	now := s.now()
	limit := s.settings.Get(ctx).Normalized().DailyNewLimit

	used, err := s.data.LearningCount(ctx, userID, DayKey(now))
	if err != nil {
		return nil, err
	}
	return quotaOf(limit, used, now), nil
}

// Record 는 새로 배운 카드 수를 더하고 갱신된 현황을 반환한다.
//
// 상한을 넘겼다고 거부하지 않는 것은 의도적이다. 앱은 이미 학습을 마친 뒤에
// 보고하고(사용자에게는 끝난 일이다), 오프라인 큐가 며칠 치를 한꺼번에 밀어
// 올리기도 한다. 여기서 거절하면 그 기록만 사라지고 화면과 서버가 어긋난다.
// 상한은 '다음 학습을 열어 줄지'를 정하는 값이지 기록을 버리는 규칙이 아니다.
func (s *LearningService) Record(ctx context.Context, userID string, count int) (*Quota, error) {
	now := s.now()
	limit := s.settings.Get(ctx).Normalized().DailyNewLimit

	if count < 0 {
		count = 0 // 음수 보고는 누계를 되돌린다 — 실수든 조작이든 받아들이지 않는다
	}
	if count > maxRecordPerCall {
		count = maxRecordPerCall
	}
	used, err := s.data.AddLearningCount(ctx, userID, DayKey(now), count)
	if err != nil {
		return nil, err
	}
	return quotaOf(limit, used, now), nil
}

// maxRecordPerCall 은 한 번의 보고로 더할 수 있는 최대 건수.
// 오프라인 큐가 밀린 것을 모아 보내도 이 선을 넘을 일은 없고,
// 넘는 값은 오타이거나 조작이다.
const maxRecordPerCall = 100

func quotaOf(limit, used int, now time.Time) *Quota {
	remaining := limit - used
	if remaining < 0 {
		remaining = 0
	}
	return &Quota{
		Limit: limit, Used: used, Remaining: remaining,
		ResetsAt: nextMidnight(now).UTC().Format(time.RFC3339),
	}
}

// nextMidnight 은 다음 자정(서버 로컬)을 준다 — DayKey 가 바뀌는 시점과 같아야 한다.
func nextMidnight(t time.Time) time.Time {
	return startOfDay(t).AddDate(0, 0, 1)
}
