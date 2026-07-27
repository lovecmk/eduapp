package memory

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserDataRepo 는 ports.UserDataRepository 의 인메모리 구현.
//
// 잠금 하나로 전부를 감싼다. 종류별로 잠금을 쪼개면 경합은 줄지만,
// LoadSync 처럼 여러 종류를 한 번에 읽는 경로에서 서로 다른 시점의 데이터가 섞인다
// ("카드는 새 값, 출석은 옛 값"). 인메모리 구현의 목적은 성능이 아니라 정확성이다.
type UserDataRepo struct {
	mu sync.RWMutex

	srs        map[string]domain.SrsState // key: userID|cardID
	history    map[string]map[string][]string
	attendance map[string]map[string]time.Time
	engagement map[string]bool // key: userID|cardID|kind
	reports    []domain.Report
	notifs     map[string][]domain.Notification
	updatedAt  map[string]time.Time
}

// NewUserDataRepo 는 인메모리 개인 데이터 저장소를 만든다.
func NewUserDataRepo() *UserDataRepo {
	return &UserDataRepo{
		srs:        map[string]domain.SrsState{},
		history:    map[string]map[string][]string{},
		attendance: map[string]map[string]time.Time{},
		engagement: map[string]bool{},
		notifs:     map[string][]domain.Notification{},
		updatedAt:  map[string]time.Time{},
	}
}

func srsKey(userID, cardID string) string { return userID + "|" + cardID }

func engKey(userID, cardID string, kind domain.EngagementKind) string {
	return userID + "|" + cardID + "|" + string(kind)
}

func (r *UserDataRepo) LoadSync(_ context.Context, userID string) (domain.SyncSnapshot, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := domain.SyncSnapshot{
		Cards:      map[string]domain.SrsState{},
		History:    map[string][]string{},
		Attendance: map[string]time.Time{},
	}
	for _, s := range r.srs {
		if s.UserID == userID {
			out.Cards[s.CardID] = s
		}
	}
	for day, ids := range r.history[userID] {
		copied := make([]string, len(ids))
		copy(copied, ids)
		out.History[day] = copied
	}
	for day, at := range r.attendance[userID] {
		out.Attendance[day] = at
	}
	if t, ok := r.updatedAt[userID]; ok {
		out.UpdatedAt = &t
	}
	return out, nil
}

func (r *UserDataRepo) SaveSrs(_ context.Context, s domain.SrsState, day string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.srs[srsKey(s.UserID, s.CardID)] = s

	if day != "" {
		if r.history[s.UserID] == nil {
			r.history[s.UserID] = map[string][]string{}
		}
		// 같은 카드를 하루에 여러 번 복습해도 이력에는 한 번만 남긴다 —
		// 이력은 "그날 무엇을 공부했나"이지 "몇 번 눌렀나"가 아니다.
		if !contains(r.history[s.UserID][day], s.CardID) {
			r.history[s.UserID][day] = append(r.history[s.UserID][day], s.CardID)
		}
	}
	r.updatedAt[s.UserID] = time.Now()
	return nil
}

func (r *UserDataRepo) MarkAttendance(_ context.Context, userID, day string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.attendance[userID] == nil {
		r.attendance[userID] = map[string]time.Time{}
	}
	// 이미 찍힌 날은 시각을 덮어쓰지 않는다. 재전송으로 체크인 시각이 뒤로 밀리면
	// "몇 시에 학습을 시작했나"가 왜곡된다.
	if _, done := r.attendance[userID][day]; done {
		return nil
	}
	r.attendance[userID][day] = at
	r.updatedAt[userID] = time.Now()
	return nil
}

func (r *UserDataRepo) Engagement(_ context.Context, userID string) (domain.EngagementSnapshot, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := domain.EngagementSnapshot{LikedIDs: []string{}, BookmarkedIDs: []string{}}
	prefix := userID + "|"
	for k, on := range r.engagement {
		if !on || !strings.HasPrefix(k, prefix) {
			continue
		}
		parts := strings.Split(k, "|")
		if len(parts) != 3 {
			continue
		}
		switch domain.EngagementKind(parts[2]) {
		case domain.Liked:
			out.LikedIDs = append(out.LikedIDs, parts[1])
		case domain.Bookmarked:
			out.BookmarkedIDs = append(out.BookmarkedIDs, parts[1])
		}
	}
	// 맵 순회는 순서가 무작위다. 정렬하지 않으면 같은 요청이 매번 다른 순서로 답해
	// 앱이 불필요하게 다시 그린다.
	sort.Strings(out.LikedIDs)
	sort.Strings(out.BookmarkedIDs)
	return out, nil
}

func (r *UserDataRepo) SetEngagement(_ context.Context, userID, cardID string, kind domain.EngagementKind, on bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if on {
		r.engagement[engKey(userID, cardID, kind)] = true
	} else {
		delete(r.engagement, engKey(userID, cardID, kind))
	}
	return nil
}

func (r *UserDataRepo) AddReport(_ context.Context, rep domain.Report) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	// 같은 사람이 같은 카드를 같은 사유로 또 신고하면 새로 쌓지 않는다.
	// 오프라인 큐가 재전송해도 접수는 한 건이어야 한다.
	for _, e := range r.reports {
		if e.UserID == rep.UserID && e.CardID == rep.CardID && e.Reason == rep.Reason {
			return nil
		}
	}
	r.reports = append(r.reports, rep)
	return nil
}

func (r *UserDataRepo) ReportedCardIDs(_ context.Context, userID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := []string{}
	for _, e := range r.reports {
		if e.UserID == userID && !contains(out, e.CardID) {
			out = append(out, e.CardID)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (r *UserDataRepo) ListReports(_ context.Context, limit int) ([]domain.Report, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	sorted := make([]domain.Report, len(r.reports))
	copy(sorted, r.reports)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].CreatedAt.Equal(sorted[j].CreatedAt) {
			return sorted[i].ID > sorted[j].ID
		}
		return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
	})
	if limit > 0 && limit < len(sorted) {
		sorted = sorted[:limit]
	}
	return sorted, nil
}

func (r *UserDataRepo) Notifications(_ context.Context, userID string) ([]domain.Notification, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	src := r.notifs[userID]
	out := make([]domain.Notification, len(src))
	copy(out, src)
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID > out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

func (r *UserDataRepo) MarkNotificationRead(_ context.Context, userID, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.notifs[userID] {
		if r.notifs[userID][i].ID == id {
			r.notifs[userID][i].ReadYn = true
			return nil
		}
	}
	// 없는 알림을 읽음 처리하는 것은 오류가 아니다 — 이미 지워졌을 수 있고,
	// 재전송된 요청일 수도 있다. 조용히 성공으로 둔다.
	return nil
}

func (r *UserDataRepo) MarkAllNotificationsRead(_ context.Context, userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.notifs[userID] {
		r.notifs[userID][i].ReadYn = true
	}
	return nil
}

func (r *UserDataRepo) AddNotifications(_ context.Context, list []domain.Notification) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, n := range list {
		r.notifs[n.UserID] = append(r.notifs[n.UserID], n)
	}
	return nil
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

var _ ports.UserDataRepository = (*UserDataRepo)(nil)
