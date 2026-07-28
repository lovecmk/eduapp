package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// 날짜 키의 **유일한** 정의.
//
// ── 왜 한 곳에 모았는가 ────────────────────────────────────────────────────
// 이 형식은 앱(src/utils/dateKey.ts)이 정한 것이고 서버는 따라야 한다.
// 앱은 `${getFullYear()}-${getMonth()}-${getDate()}` 를 쓰는데 JavaScript 의
// getMonth() 는 **0 부터**다. 7월이 6 이다.
//
// 실제로 이 함수가 두 벌로 갈라져 있었고, 동기화 서비스 쪽이 Go 의 time.Month
// (1 부터)를 그대로 써서 한 달 밀린 키를 저장하고 있었다. 바로 위에 "앱과 같은
// 형식이어야 한다"는 주석을 달아 둔 채로 말이다. 그 결과 서버가 기록한 학습
// 이력과 출석 도장이 앱 달력에서 **다음 달 칸**에 찍혔고, 아무 오류도 나지
// 않아 눈치채기 어려웠다.
//
// 형식은 이미 저장된 데이터의 계약이라 바꿀 수 없다. 그러니 정의를 하나로 두고
// 여기서만 고친다.
//
// (참고: 이 키는 저장 시점의 서버 로컬 시간대를 따른다. 앱은 사용자의 기기
//  시간대를 따르므로, 서버와 사용자가 다른 시간대에 있으면 자정 부근의 학습이
//  하루 어긋날 수 있다. 지금은 국내 단일 시간대라 문제가 없지만, 해외 사용자가
//  생기면 여기서부터 손대야 한다.)

// DayKey 는 앱과 같은 날짜 키(YYYY-M-D, month 0-based)를 만든다.
func DayKey(t time.Time) string {
	return fmt.Sprintf("%d-%d-%d", t.Year(), int(t.Month())-1, t.Day())
}

// ParseDayKey 는 날짜 키를 그날 자정으로 되돌린다. 형식이 깨졌으면 false.
//
// 저장소에서 온 값이라 깨져 있을 수 있고, 그때 0001년으로 계산하면 코호트·
// 리텐션이 통째로 어긋난다. 조용히 버리는 편이 낫다.
func ParseDayKey(key string) (time.Time, bool) {
	parts := strings.Split(key, "-")
	if len(parts) != 3 {
		return time.Time{}, false
	}
	y, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	d, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return time.Time{}, false
	}
	if m < 0 || m > 11 || d < 1 || d > 31 {
		return time.Time{}, false
	}
	return time.Date(y, time.Month(m+1), d, 0, 0, 0, 0, time.Local), true
}
