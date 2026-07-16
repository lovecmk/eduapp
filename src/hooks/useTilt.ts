import { useEffect, useRef } from 'react';
import { Animated, Platform } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

/**
 * 디바이스 기울기(자이로/모션)를 정규화된 Animated.ValueXY(x,y ∈ [-1,1])로 노출한다.
 * - 네이티브: expo-sensors DeviceMotion(회전값)
 * - 웹(모바일): deviceorientation, 데스크톱: mousemove 폴백
 * - 미지원/비활성: {0,0} 정지 상태로 조용히 폴백
 *
 * setValue 로 직접 갱신해 React 리렌더 없이 부드럽게 동작한다(소비 측은 interpolate).
 */
export function useTilt(enabled = true): Animated.ValueXY {
  const value = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cur = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) {
      value.setValue({ x: 0, y: 0 });
      return;
    }
    // 저역통과(부드럽게) — 목표값으로 15%씩 수렴.
    const push = (tx: number, ty: number) => {
      cur.current.x += (tx - cur.current.x) * 0.15;
      cur.current.y += (ty - cur.current.y) * 0.15;
      value.setValue({ x: cur.current.x, y: cur.current.y });
    };
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    if (Platform.OS === 'web') {
      const g: typeof globalThis & { addEventListener?: (t: string, h: (e: unknown) => void) => void; removeEventListener?: (t: string, h: (e: unknown) => void) => void; innerWidth?: number; innerHeight?: number } =
        globalThis as never;
      const onOrient = (e: unknown) => {
        const ev = e as { gamma: number | null; beta: number | null };
        if (ev.gamma == null || ev.beta == null) return;
        push(clamp(ev.gamma / 35), clamp((ev.beta - 45) / 35));
      };
      const onMouse = (e: unknown) => {
        const ev = e as { clientX: number; clientY: number };
        const w = g.innerWidth ?? 1;
        const h = g.innerHeight ?? 1;
        push(clamp((ev.clientX / w) * 2 - 1), clamp((ev.clientY / h) * 2 - 1));
      };
      const hasOrient = typeof g.addEventListener === 'function' && 'DeviceOrientationEvent' in (g as object);
      if (hasOrient) g.addEventListener!('deviceorientation', onOrient);
      g.addEventListener?.('mousemove', onMouse);
      return () => {
        if (hasOrient) g.removeEventListener?.('deviceorientation', onOrient);
        g.removeEventListener?.('mousemove', onMouse);
      };
    }

    let sub: { remove: () => void } | undefined;
    let alive = true;
    DeviceMotion.isAvailableAsync()
      .then((ok) => {
        if (!ok || !alive) return;
        DeviceMotion.setUpdateInterval(50);
        sub = DeviceMotion.addListener((d) => {
          const rot = d.rotation;
          if (!rot) return;
          push(clamp((rot.gamma ?? 0) / 0.6), clamp((rot.beta ?? 0) / 0.6));
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [enabled, value]);

  return value;
}
