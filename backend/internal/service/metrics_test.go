package service

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// fixedClock 은 테스트에서 시계를 직접 움직이기 위한 도구.
type fixedClock struct{ t time.Time }

func (c *fixedClock) now() time.Time      { return c.t }
func (c *fixedClock) add(d time.Duration) { c.t = c.t.Add(d) }

// newTestMetrics 는 시계가 고정된 수집기를 만든다.
func newTestMetrics() (*Metrics, *fixedClock) {
	clk := &fixedClock{t: time.Date(2026, 7, 27, 10, 0, 0, 0, time.UTC)}
	m := NewMetrics()
	m.now = clk.now
	m.startedAt = clk.t
	return m, clk
}

func observe(m *Metrics, at time.Time, status int, ms int, user string) {
	m.Observe(RequestSample{
		At: at, Method: "GET", Path: "/api/cards",
		Status: status, Duration: time.Duration(ms) * time.Millisecond, UserID: user,
	})
}

func TestMetricsCountsAndRates(t *testing.T) {
	m, clk := newTestMetrics()

	// 성공 8, 클라이언트 오류 1, 서버 오류 1 = 10건.
	for i := 0; i < 8; i++ {
		observe(m, clk.t, 200, 10, "u1")
	}
	observe(m, clk.t, 404, 5, "u1")
	observe(m, clk.t, 500, 20, "u1")

	s := m.Snapshot()
	if s.TotalRequests != 10 {
		t.Fatalf("총 요청=%d, want 10", s.TotalRequests)
	}
	if s.TotalErrors != 1 {
		t.Fatalf("5xx=%d, want 1", s.TotalErrors)
	}
	if s.TotalRejected != 1 {
		t.Fatalf("4xx=%d, want 1", s.TotalRejected)
	}
	// 에러율은 5xx 만 센다 — 404(잘못된 요청)는 서버 잘못이 아니다.
	if s.ErrorRate != 10 {
		t.Fatalf("에러율=%.2f, want 10", s.ErrorRate)
	}
	// 평균 지연 = (8*10 + 5 + 20) / 10 = 10.5 → 정수 나눗셈 10
	if s.AvgLatencyMs != 10 {
		t.Fatalf("평균 지연=%d, want 10", s.AvgLatencyMs)
	}
}

func TestMetricsActiveUsersExpire(t *testing.T) {
	m, clk := newTestMetrics()

	observe(m, clk.t, 200, 5, "u1")
	observe(m, clk.t, 200, 5, "u2")
	if s := m.Snapshot(); s.ActiveUsers != 2 {
		t.Fatalf("활성 사용자=%d, want 2", s.ActiveUsers)
	}

	// u1 만 다시 요청 → 5분 뒤에도 u1 은 살아 있고 u2 는 만료.
	clk.add(4 * time.Minute)
	observe(m, clk.t, 200, 5, "u1")
	clk.add(2 * time.Minute) // u2 의 마지막 요청으로부터 6분 경과

	if s := m.Snapshot(); s.ActiveUsers != 1 {
		t.Fatalf("만료 후 활성 사용자=%d, want 1", s.ActiveUsers)
	}
}

func TestMetricsAnonymousRequestsNotCountedAsUsers(t *testing.T) {
	m, clk := newTestMetrics()

	// 로그인 전 요청(userID 없음)은 활성 사용자로 세면 안 된다 —
	// 세면 봇·헬스체크 트래픽이 '사용자 수'로 둔갑한다.
	observe(m, clk.t, 200, 5, "")
	observe(m, clk.t, 200, 5, "")

	s := m.Snapshot()
	if s.ActiveUsers != 0 {
		t.Fatalf("익명 요청이 활성 사용자로 계산됨: %d", s.ActiveUsers)
	}
	if s.TotalRequests != 2 {
		t.Fatalf("총 요청=%d, want 2", s.TotalRequests)
	}
}

func TestMetricsTrafficBucketsAreBounded(t *testing.T) {
	m, clk := newTestMetrics()

	// 보관 창(60분)의 두 배인 120분치를 넣는다.
	for i := 0; i < 120; i++ {
		observe(m, clk.t, 200, 5, "u1")
		clk.add(time.Minute)
	}

	s := m.Snapshot()
	if len(s.Traffic) > metricsWindowMinutes {
		t.Fatalf("시계열 길이=%d, 상한 %d 를 넘음(메모리 무한 증가)", len(s.Traffic), metricsWindowMinutes)
	}
	if len(s.Traffic) == 0 {
		t.Fatal("시계열이 비어 있음")
	}
	// 누적 카운터는 창과 무관하게 전부 세어져 있어야 한다.
	if s.TotalRequests != 120 {
		t.Fatalf("총 요청=%d, want 120", s.TotalRequests)
	}
}

func TestMetricsRecentEventsAreBounded(t *testing.T) {
	m, clk := newTestMetrics()

	for i := 0; i < recentEventsMax*3; i++ {
		observe(m, clk.t, 200, 5, "u1")
	}
	s := m.Snapshot()
	if len(s.Recent) > 30 {
		t.Fatalf("실시간 피드=%d건, 스냅샷 상한 30 을 넘음", len(s.Recent))
	}
	// 최신순이어야 한다(가장 최근 것이 앞).
	if len(s.Recent) >= 2 && s.Recent[0].At.Before(s.Recent[1].At) {
		t.Fatal("실시간 피드가 최신순이 아님")
	}
}

func TestMetricsSlowRequestFlag(t *testing.T) {
	m, clk := newTestMetrics()

	observe(m, clk.t, 200, slowRequestMs+1, "u1")
	observe(m, clk.t, 200, 5, "u1")

	s := m.Snapshot()
	// 최신순이므로 [0] 이 빠른 요청, [1] 이 느린 요청.
	if s.Recent[0].Slow {
		t.Fatal("빠른 요청이 느림으로 표시됨")
	}
	if !s.Recent[1].Slow {
		t.Fatal("느린 요청이 표시되지 않음 — 병목을 눈에 띄게 하는 장치가 죽어 있다")
	}
}

func TestMetricsTopPathsAreStable(t *testing.T) {
	m, clk := newTestMetrics()

	for i := 0; i < 5; i++ {
		m.Observe(RequestSample{At: clk.t, Method: "GET", Path: "/api/cards", Status: 200, Duration: time.Millisecond})
	}
	for i := 0; i < 3; i++ {
		m.Observe(RequestSample{At: clk.t, Method: "GET", Path: "/api/stats", Status: 500, Duration: time.Millisecond})
	}

	s := m.Snapshot()
	if len(s.TopPaths) < 2 {
		t.Fatalf("경로 집계=%d개, want >=2", len(s.TopPaths))
	}
	if s.TopPaths[0].Path != "/api/cards" || s.TopPaths[0].Count != 5 {
		t.Fatalf("1위 경로=%+v, want /api/cards 5회", s.TopPaths[0])
	}
	if s.TopPaths[1].Errors != 3 {
		t.Fatalf("/api/stats 에러=%d, want 3", s.TopPaths[1].Errors)
	}

	// 같은 입력에는 같은 순서 — 순서가 흔들리면 화면이 매 갱신마다 깜빡인다.
	again := m.Snapshot()
	for i := range again.TopPaths {
		if again.TopPaths[i].Path != s.TopPaths[i].Path {
			t.Fatal("연속 스냅샷의 경로 순서가 다름(화면 깜빡임 원인)")
		}
	}
}

func TestMetricsPercentile(t *testing.T) {
	m, clk := newTestMetrics()

	// 1..100ms 를 넣으면 p95 는 95 근처여야 한다.
	for i := 1; i <= 100; i++ {
		observe(m, clk.t, 200, i, "u1")
	}
	s := m.Snapshot()
	if s.P95LatencyMs < 90 || s.P95LatencyMs > 100 {
		t.Fatalf("p95=%d, want 90~100", s.P95LatencyMs)
	}
}

func TestMetricsPercentileWithSingleSample(t *testing.T) {
	m, clk := newTestMetrics()

	// 표본이 1개일 때 인덱스 계산이 범위를 벗어나 panic 하지 않아야 한다.
	observe(m, clk.t, 200, 42, "u1")
	if s := m.Snapshot(); s.P95LatencyMs != 42 {
		t.Fatalf("단일 표본 p95=%d, want 42", s.P95LatencyMs)
	}
}

func TestMetricsEmptySnapshotIsSafe(t *testing.T) {
	m, _ := newTestMetrics()

	// 요청이 한 건도 없을 때 0 으로 나누지 않아야 한다.
	s := m.Snapshot()
	if s.ErrorRate != 0 || s.AvgLatencyMs != 0 || s.RequestsPerMin != 0 || s.P95LatencyMs != 0 {
		t.Fatalf("빈 스냅샷=%+v, 모두 0 이어야 함", s)
	}
	if s.Traffic == nil || s.TopPaths == nil || s.Recent == nil {
		t.Fatal("빈 스냅샷의 배열이 nil — JSON 에서 null 이 되어 프런트가 깨진다")
	}
}

// TestMetricsConcurrentObserve 는 동시 기록이 자료구조를 깨뜨리지 않는지 확인한다.
// (-race 와 함께 돌 때 의미가 있다)
func TestMetricsConcurrentObserve(t *testing.T) {
	m, clk := newTestMetrics()

	const workers, perWorker = 20, 100
	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func(w int) {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				m.Observe(RequestSample{
					At: clk.t, Method: "GET", Path: fmt.Sprintf("/api/p%d", w%5),
					Status: 200, Duration: time.Millisecond, UserID: fmt.Sprintf("u%d", w),
				})
			}
		}(w)
	}
	// 기록 중에도 스냅샷을 계속 읽는다(읽기·쓰기 경합 확인).
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				m.Snapshot()
			}
		}
	}()
	wg.Wait()
	close(done)

	if s := m.Snapshot(); s.TotalRequests != workers*perWorker {
		t.Fatalf("총 요청=%d, want %d(동시 기록 유실)", s.TotalRequests, workers*perWorker)
	}
}
