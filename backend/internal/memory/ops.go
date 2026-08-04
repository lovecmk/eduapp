package memory

import (
	"context"
	"sort"
	"sync"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// SettingsRepo 는 ports.SettingsRepository 의 인메모리 구현.
//
// 저장된 적이 없으면 기본값을 돌려준다 — '없음'을 오류로 만들면 첫 부팅부터
// 운영 설정을 읽는 모든 경로가 실패한다.
type SettingsRepo struct {
	mu      sync.RWMutex
	saved   domain.OpsSettings
	present bool
}

// NewSettingsRepo 는 인메모리 운영 설정 저장소를 만든다.
func NewSettingsRepo() *SettingsRepo { return &SettingsRepo{} }

func (r *SettingsRepo) LoadSettings(_ context.Context) (domain.OpsSettings, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if !r.present {
		return domain.DefaultOpsSettings(), nil
	}
	return r.saved, nil
}

func (r *SettingsRepo) SaveSettings(_ context.Context, s domain.OpsSettings) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.saved = s
	r.present = true
	return nil
}

var _ ports.SettingsRepository = (*SettingsRepo)(nil)

// AnnouncementRepo 는 ports.AnnouncementRepository 의 인메모리 구현.
type AnnouncementRepo struct {
	mu    sync.RWMutex
	items []domain.Announcement
}

// NewAnnouncementRepo 는 인메모리 공지 이력 저장소를 만든다.
func NewAnnouncementRepo() *AnnouncementRepo { return &AnnouncementRepo{} }

func (r *AnnouncementRepo) AppendAnnouncement(_ context.Context, a domain.Announcement) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items = append(r.items, a)
	return nil
}

func (r *AnnouncementRepo) ListAnnouncements(_ context.Context, limit int) ([]domain.Announcement, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.Announcement, len(r.items))
	copy(out, r.items)
	// 같은 시각에 두 건이 들어가도 순서가 흔들리지 않게 id 로 한 번 더 가른다.
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID > out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if limit > 0 && limit < len(out) {
		out = out[:limit]
	}
	return out, nil
}

var _ ports.AnnouncementRepository = (*AnnouncementRepo)(nil)
