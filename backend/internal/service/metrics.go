package service

import (
	"sort"
	"sync"
	"time"
)

// 이 파일은 "지금 서비스가 어떤 상태인가"를 프로세스 안에서 직접 관측한다.
//
// 왜 외부 APM(Prometheus 등)을 두지 않았나:
// 관리 콘솔이 필요로 하는 건 최근 1시간짜리 운영 감각(요청량·에러율·지연·누가 쓰고 있나)이지
// 장기 시계열이 아니다. 그 정도는 프로세스 메모리로 충분하고, 운영 부담이 0 이다.
// 대신 **모든 자료구조에 상한을 둔다** — 관측 도구가 서버를 죽이는 일은 없어야 한다.
//
// 한계(알고 쓰는 것):
//   - 프로세스 로컬이다. 서버를 여러 대로 늘리면 인스턴스별 수치만 보인다.
//   - 재시작하면 초기화된다. 영구 보존이 필요하면 이 수치를 외부로 내보내야 한다.

const (
	// 분 단위 시계열 보관 길이. 대시보드는 최근 1시간을 본다.
	metricsWindowMinutes = 60
	// 실시간 피드에 남길 최근 요청 수. 화면에 다 보여줄 수도 없으므로 넉넉히 이 정도.
	recentEventsMax = 100
	// 이 시간 안에 요청이 있었던 사용자를 '지금 활동 중'으로 본다.
	activeUserTTL = 5 * time.Minute
	// 활성 사용자 맵 상한 — 폭주 시에도 메모리가 무한히 늘지 않게 한다.
	activeUsersMax = 10000
	// 느린 요청으로 간주하는 기준. 이 이상이면 실시간 피드에서 눈에 띄게 표시한다.
	slowRequestMs = 1000
	// p95 계산용 지연 표본 링 버퍼 크기(고정 → 메모리 상한).
	latencySampleMax = 512
)

// RequestSample 은 요청 한 건의 관측치.
type RequestSample struct {
	At       time.Time
	Method   string
	Path     string
	Status   int
	Duration time.Duration
	UserID   string
}

// minuteBucket 은 1분 동안의 집계.
type minuteBucket struct {
	minute   time.Time // 분 단위로 내림한 시각
	requests int64
	errors   int64 // 5xx
	rejected int64 // 4xx
	totalMs  int64
	maxMs    int64
}

// RecentEvent 는 실시간 피드에 흘려보낼 요청 한 줄.
type RecentEvent struct {
	At       time.Time `json:"at"`
	Method   string    `json:"method"`
	Path     string    `json:"path"`
	Status   int       `json:"status"`
	Duration int64     `json:"duration_ms"`
	UserID   string    `json:"user_id"`
	Slow     bool      `json:"slow"`
}

// TrafficPoint 는 분 단위 시계열의 한 점.
type TrafficPoint struct {
	Minute   string `json:"minute"` // HH:MM
	Requests int64  `json:"requests"`
	Errors   int64  `json:"errors"`
	Rejected int64  `json:"rejected"`
	AvgMs    int64  `json:"avg_ms"`
	MaxMs    int64  `json:"max_ms"`
}

// MetricsSnapshot 은 대시보드가 한 번에 받아 가는 관측 결과.
type MetricsSnapshot struct {
	StartedAt      time.Time      `json:"started_at"`
	UptimeSeconds  int64          `json:"uptime_seconds"`
	TotalRequests  int64          `json:"total_requests"`
	TotalErrors    int64          `json:"total_errors"`
	TotalRejected  int64          `json:"total_rejected"`
	ErrorRate      float64        `json:"error_rate"`       // 최근 1시간 5xx 비율(%)
	RequestsPerMin float64        `json:"requests_per_min"` // 최근 1시간 평균
	AvgLatencyMs   int64          `json:"avg_latency_ms"`   // 최근 1시간 평균
	P95LatencyMs   int64          `json:"p95_latency_ms"`   // 최근 표본 기준
	ActiveUsers    int            `json:"active_users"`     // 최근 5분 내 요청한 고유 사용자
	Traffic        []TrafficPoint `json:"traffic"`
	TopPaths       []PathStat     `json:"top_paths"`
	Recent         []RecentEvent  `json:"recent"`
}

// PathStat 은 경로별 호출 집계(어디가 뜨거운지).
type PathStat struct {
	Path   string `json:"path"`
	Count  int64  `json:"count"`
	Errors int64  `json:"errors"`
	AvgMs  int64  `json:"avg_ms"`
}

type pathAgg struct {
	count   int64
	errors  int64
	totalMs int64
}

// Metrics 는 프로세스 내 관측 수집기. 모든 메서드는 동시 호출에 안전하다.
type Metrics struct {
	mu sync.Mutex

	startedAt time.Time
	now       func() time.Time // 테스트에서 시계를 고정하기 위해 주입 가능

	totalRequests int64
	totalErrors   int64
	totalRejected int64

	buckets []minuteBucket // 오래된 것이 앞, 최대 metricsWindowMinutes 개
	recent  []RecentEvent  // 오래된 것이 앞, 최대 recentEventsMax 개
	paths   map[string]*pathAgg
	active  map[string]time.Time // userID -> 마지막 요청 시각

	// 지연 표본 — p95 계산용. 전량 보관은 비싸므로 최근 것만 링으로 돌린다.
	latencySamples []int64
	latencyIdx     int
}

// NewMetrics 는 수집기를 만든다.
func NewMetrics() *Metrics {
	return &Metrics{
		startedAt:      time.Now(),
		now:            time.Now,
		paths:          map[string]*pathAgg{},
		active:         map[string]time.Time{},
		latencySamples: make([]int64, 0, latencySampleMax),
	}
}

// Observe 는 요청 한 건을 기록한다. 핫패스이므로 할당을 최소로 유지한다.
func (m *Metrics) Observe(s RequestSample) {
	if s.At.IsZero() {
		s.At = m.now()
	}
	ms := s.Duration.Milliseconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	m.totalRequests++
	switch {
	case s.Status >= 500:
		m.totalErrors++
	case s.Status >= 400:
		m.totalRejected++
	}

	m.recordBucket(s, ms)
	m.recordPath(s, ms)
	m.recordLatency(ms)
	m.recordActive(s)

	m.recent = append(m.recent, RecentEvent{
		At: s.At, Method: s.Method, Path: s.Path, Status: s.Status,
		Duration: ms, UserID: s.UserID, Slow: ms >= slowRequestMs,
	})
	if len(m.recent) > recentEventsMax {
		m.recent = m.recent[len(m.recent)-recentEventsMax:]
	}
}

// recordBucket 은 분 단위 버킷에 누적한다. 호출자가 락을 쥐고 있어야 한다.
//
// 샘플의 시각은 요청이 '시작된' 때라 도착 순서가 뒤집힐 수 있다. 분 경계에 걸쳐
// 오래 걸린 요청은 다음 분에 짧은 요청들이 지나간 뒤에야 기록되기 때문이다.
// 무조건 마지막 버킷에 넣으면 그 지연이 엉뚱한 분의 평균·최대값을 끌어올린다.
func (m *Metrics) recordBucket(s RequestSample, ms int64) {
	b := m.bucketFor(s.At.Truncate(time.Minute))
	if b == nil {
		return // 창 밖으로 밀려난 오래된 샘플 — 어차피 화면에 나오지 않는다
	}
	b.requests++
	if s.Status >= 500 {
		b.errors++
	} else if s.Status >= 400 {
		b.rejected++
	}
	b.totalMs += ms
	if ms > b.maxMs {
		b.maxMs = ms
	}
}

// bucketFor 는 해당 분의 버킷을 찾거나 만든다. 버킷은 항상 시간순으로 정렬돼 있다.
func (m *Metrics) bucketFor(minute time.Time) *minuteBucket {
	// 대부분의 요청은 가장 최근 분에 속한다 — 뒤에서부터 훑는다.
	for i := len(m.buckets) - 1; i >= 0; i-- {
		if m.buckets[i].minute.Equal(minute) {
			return &m.buckets[i]
		}
		if m.buckets[i].minute.Before(minute) {
			// 새 분이 시작됐다. 정렬을 유지하며 이 뒤에 끼워 넣는다.
			return m.insertBucket(i+1, minute)
		}
	}
	if len(m.buckets) == 0 {
		return m.insertBucket(0, minute)
	}
	// 보관 중인 가장 오래된 분보다도 이전이다. 창이 꽉 찼다면 어차피 잘려 나가므로 버린다.
	if len(m.buckets) >= metricsWindowMinutes {
		return nil
	}
	return m.insertBucket(0, minute)
}

func (m *Metrics) insertBucket(at int, minute time.Time) *minuteBucket {
	m.buckets = append(m.buckets, minuteBucket{})
	copy(m.buckets[at+1:], m.buckets[at:])
	m.buckets[at] = minuteBucket{minute: minute}
	if len(m.buckets) > metricsWindowMinutes {
		trimmed := len(m.buckets) - metricsWindowMinutes
		m.buckets = m.buckets[trimmed:]
		at -= trimmed
		if at < 0 {
			return nil // 방금 만든 버킷이 잘려 나갔다
		}
	}
	return &m.buckets[at]
}

// recordPath 는 경로별 집계를 갱신한다. 경로 종류는 라우트 수만큼으로 유한하다
// (핸들러가 등록한 라우트 패턴만 들어오므로 카디널리티 폭발이 없다).
func (m *Metrics) recordPath(s RequestSample, ms int64) {
	a := m.paths[s.Path]
	if a == nil {
		a = &pathAgg{}
		m.paths[s.Path] = a
	}
	a.count++
	a.totalMs += ms
	if s.Status >= 500 {
		a.errors++
	}
}

// recordLatency 는 p95 표본을 링 버퍼에 넣는다(고정 크기 → 메모리 상한).
func (m *Metrics) recordLatency(ms int64) {
	if len(m.latencySamples) < latencySampleMax {
		m.latencySamples = append(m.latencySamples, ms)
		return
	}
	m.latencySamples[m.latencyIdx] = ms
	m.latencyIdx = (m.latencyIdx + 1) % latencySampleMax
}

// recordActive 는 활성 사용자 목록을 갱신하고, 만료분을 정리한다.
func (m *Metrics) recordActive(s RequestSample) {
	if s.UserID == "" {
		return
	}
	m.active[s.UserID] = s.At
	if len(m.active) > activeUsersMax {
		m.pruneActive(s.At)
	}
	// 상한을 넘겨도 여전히 크다면(전부 활성) 가장 오래된 것부터 버린다.
	if len(m.active) > activeUsersMax {
		oldest, oldestAt := "", time.Time{}
		for id, at := range m.active {
			if oldestAt.IsZero() || at.Before(oldestAt) {
				oldest, oldestAt = id, at
			}
		}
		delete(m.active, oldest)
	}
}

func (m *Metrics) pruneActive(now time.Time) {
	cutoff := now.Add(-activeUserTTL)
	for id, at := range m.active {
		if at.Before(cutoff) {
			delete(m.active, id)
		}
	}
}

// Snapshot 은 현재 관측 상태를 복사해 반환한다(호출자가 자유롭게 다뤄도 안전).
func (m *Metrics) Snapshot() MetricsSnapshot {
	now := m.now()

	m.mu.Lock()
	defer m.mu.Unlock()

	m.pruneActive(now)

	// 창(window) 밖으로 밀려난 버킷은 통계에서 제외한다.
	cutoff := now.Add(-metricsWindowMinutes * time.Minute).Truncate(time.Minute)
	traffic := make([]TrafficPoint, 0, len(m.buckets))
	var winReq, winErr, winMs int64
	for _, b := range m.buckets {
		if b.minute.Before(cutoff) {
			continue
		}
		avg := int64(0)
		if b.requests > 0 {
			avg = b.totalMs / b.requests
		}
		traffic = append(traffic, TrafficPoint{
			Minute:   b.minute.Format("15:04"),
			Requests: b.requests, Errors: b.errors, Rejected: b.rejected,
			AvgMs: avg, MaxMs: b.maxMs,
		})
		winReq += b.requests
		winErr += b.errors
		winMs += b.totalMs
	}

	errRate, avgLatency, perMin := 0.0, int64(0), 0.0
	if winReq > 0 {
		errRate = round2(float64(winErr) / float64(winReq) * 100)
		avgLatency = winMs / winReq
	}
	if len(traffic) > 0 {
		perMin = round2(float64(winReq) / float64(len(traffic)))
	}

	return MetricsSnapshot{
		StartedAt:      m.startedAt,
		UptimeSeconds:  int64(now.Sub(m.startedAt).Seconds()),
		TotalRequests:  m.totalRequests,
		TotalErrors:    m.totalErrors,
		TotalRejected:  m.totalRejected,
		ErrorRate:      errRate,
		RequestsPerMin: perMin,
		AvgLatencyMs:   avgLatency,
		P95LatencyMs:   m.percentileLocked(95),
		ActiveUsers:    len(m.active),
		Traffic:        traffic,
		TopPaths:       m.topPathsLocked(8),
		Recent:         m.recentLocked(30),
	}
}

// percentileLocked 는 지연 표본의 백분위수를 구한다. 호출자가 락을 쥐고 있어야 한다.
func (m *Metrics) percentileLocked(p int) int64 {
	if len(m.latencySamples) == 0 {
		return 0
	}
	sorted := make([]int64, len(m.latencySamples))
	copy(sorted, m.latencySamples)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	// 표본이 1개일 때도 인덱스가 범위를 벗어나지 않도록 잘라준다.
	idx := p * len(sorted) / 100
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

// topPathsLocked 는 호출이 많은 경로 순으로 n 개를 준다.
func (m *Metrics) topPathsLocked(n int) []PathStat {
	out := make([]PathStat, 0, len(m.paths))
	for path, a := range m.paths {
		avg := int64(0)
		if a.count > 0 {
			avg = a.totalMs / a.count
		}
		out = append(out, PathStat{Path: path, Count: a.count, Errors: a.errors, AvgMs: avg})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Path < out[j].Path // 동률에도 순서를 고정(화면 깜빡임 방지)
		}
		return out[i].Count > out[j].Count
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// recentLocked 는 최근 요청을 최신순으로 n 개 준다.
func (m *Metrics) recentLocked(n int) []RecentEvent {
	if n > len(m.recent) {
		n = len(m.recent)
	}
	out := make([]RecentEvent, 0, n)
	for i := len(m.recent) - 1; i >= len(m.recent)-n; i-- {
		out = append(out, m.recent[i])
	}
	return out
}

func round2(f float64) float64 { return float64(int(f*100+0.5)) / 100 }
