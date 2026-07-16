// 반응형 스케일 시스템 — 다양한 기기 폭/방향/글자크기에서 레이아웃이 자연스럽게
// 늘고 줄도록 한 곳에서 규칙을 관리한다. useWindowDimensions 로 방향 전환·폴더블에도
// 즉시 반응한다(리렌더).
import { useWindowDimensions } from 'react-native';

/** 디자인 기준 기기 폭(iPhone X 계열) — 이 폭에서 rs(n)===n. */
const BASE_WIDTH = 375;
/** 과대/과소 스케일 방지 클램프(태블릿에서 글자가 지나치게 커지지 않게). */
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.35;

export type Breakpoint = 'compact' | 'regular' | 'wide';

export interface Responsive {
  width: number;
  height: number;
  isLandscape: boolean;
  /** 기준 폭 대비 선형 스케일(클램프됨). */
  scale: number;
  breakpoint: Breakpoint;
  /** 소형 기기(<360) 여부 — 여백/폰트 축소 판단용. */
  isSmall: boolean;
  isTablet: boolean;
  /**
   * moderate scale — 크기를 폭에 비례해 조정하되 factor(0~1)로 완만하게.
   * factor=1 이면 완전 비례, 0 이면 고정. 기본 0.5(권장).
   */
  rs: (size: number, factor?: number) => number;
  /** 폭 구간별 값 선택 헬퍼. */
  pick: <T>(opts: { compact: T; regular?: T; wide: T }) => T;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function breakpointFor(w: number): Breakpoint {
  if (w < 360) return 'compact';
  if (w >= 600) return 'wide';
  return 'regular';
}

/**
 * 반응형 지표를 반환하는 훅. 화면 크기가 바뀌면(회전 등) 자동으로 갱신된다.
 * 사용 예: const { rs } = useResponsive(); fontSize: rs(16)
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height); // 회전과 무관하게 안정적인 기준.
  const scale = clamp(shortest / BASE_WIDTH, MIN_SCALE, MAX_SCALE);
  const breakpoint = breakpointFor(shortest);

  const rs = (size: number, factor = 0.5) => {
    return Math.round((size + (scale - 1) * size * factor) * 100) / 100;
  };

  const pick = <T,>(opts: { compact: T; regular?: T; wide: T }): T => {
    if (breakpoint === 'compact') return opts.compact;
    if (breakpoint === 'wide') return opts.wide;
    return opts.regular ?? opts.wide;
  };

  return {
    width,
    height,
    isLandscape: width > height,
    scale,
    breakpoint,
    isSmall: shortest < 360,
    isTablet: shortest >= 600,
    rs,
    pick,
  };
}
