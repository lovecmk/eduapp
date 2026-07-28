package service

import (
	"testing"
	"time"
)

// 이 형식이 앱과 어긋나면 아무 오류도 나지 않는다 — 그냥 조용히 틀린 칸에 찍힌다.
// 실제로 동기화 서비스가 Go 의 time.Month(1부터)를 그대로 써서 한 달 밀린 키를
// 저장하고 있었고, 그 데이터는 앱 달력에서 다음 달에 나타났다.

func TestDayKeyUsesZeroBasedMonthLikeTheApp(t *testing.T) {
	// 앱: `${getFullYear()}-${getMonth()}-${getDate()}` — getMonth() 는 0 부터.
	cases := []struct {
		in   time.Time
		want string
	}{
		{time.Date(2026, time.January, 5, 0, 0, 0, 0, time.Local), "2026-0-5"},
		{time.Date(2026, time.July, 28, 13, 30, 0, 0, time.Local), "2026-6-28"},
		{time.Date(2026, time.December, 31, 23, 59, 0, 0, time.Local), "2026-11-31"},
	}
	for _, c := range cases {
		if got := DayKey(c.in); got != c.want {
			t.Errorf("DayKey(%v) = %q, 앱과 같으려면 %q", c.in, got, c.want)
		}
	}
}

func TestDayKeyIgnoresTimeOfDay(t *testing.T) {
	morning := DayKey(time.Date(2026, time.July, 28, 0, 0, 0, 0, time.Local))
	night := DayKey(time.Date(2026, time.July, 28, 23, 59, 59, 0, time.Local))
	if morning != night {
		t.Errorf("같은 날은 같은 키여야 한다: %q vs %q", morning, night)
	}
}

func TestParseDayKeyRoundTripsEveryMonth(t *testing.T) {
	// 12월(11)에서 어긋나면 연말 데이터만 조용히 사라진다.
	for m := time.January; m <= time.December; m++ {
		in := time.Date(2026, m, 15, 0, 0, 0, 0, time.Local)
		got, ok := ParseDayKey(DayKey(in))
		if !ok || !got.Equal(in) {
			t.Errorf("%v 왕복 실패: %q → %v (ok=%v)", m, DayKey(in), got, ok)
		}
	}
}

func TestParseDayKeyRejectsOneBasedMonth(t *testing.T) {
	// "2026-12-1" 은 0-based 로 읽으면 13월이라 존재할 수 없다.
	// 옛 형식(1-based)으로 저장된 키를 조용히 받아들이면 한 달 밀린 채 계산된다.
	if _, ok := ParseDayKey("2026-12-1"); ok {
		t.Error("월 범위를 벗어난 키는 거부해야 한다")
	}
}

func TestParseDayKeyRejectsGarbage(t *testing.T) {
	for _, bad := range []string{"", "2026", "2026-6", "2026-6-28-1", "x-6-28", "2026-6-0", "2026-6-99"} {
		if _, ok := ParseDayKey(bad); ok {
			t.Errorf("%q 는 거부해야 한다", bad)
		}
	}
}
