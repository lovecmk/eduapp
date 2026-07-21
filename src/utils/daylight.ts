// 시간대를 '해·달'로 간접 표현하기 위한 4단계 구분.
// 홈 히어로에 '아침/저녁' 같은 라벨 텍스트를 직접 띄우지 않고, 해/달 아이콘과
// 아주 미세한 톤/효과만으로 지금이 언제쯤인지 은은하게 알 수 있게 한다.
import type { Ionicons } from '@expo/vector-icons';

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

export interface Daylight {
  phase: DayPhase;
  /** 해/달 아이콘(간접 표현) */
  icon: keyof typeof Ionicons.glyphMap;
  /** 미세한 글로우·톤 색 */
  tint: string;
}

/** 현재(또는 주어진) 시각을 아침/낮/저녁/밤 4단계로 매핑. */
export function getDaylight(date: Date = new Date()): Daylight {
  const h = date.getHours();
  if (h >= 5 && h < 11) return { phase: 'morning', icon: 'sunny-outline', tint: '#FDBA74' }; // 떠오르는 해
  if (h >= 11 && h < 17) return { phase: 'day', icon: 'sunny', tint: '#FCD34D' };            // 한낮의 해
  if (h >= 17 && h < 20) return { phase: 'evening', icon: 'partly-sunny', tint: '#FB923C' }; // 지는 해
  return { phase: 'night', icon: 'moon', tint: '#A5B4FC' };                                   // 달
}
