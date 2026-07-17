import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

export interface RadarDatum {
  label: string;
  value: number; // 0~1
  color?: string;
}

/** 6축 레이더(스파이더) 차트 — 카테고리별 숙련도를 한눈에. */
export function RadarChart({ data, size = 260, accent }: { data: RadarDatum[]; size?: number; accent?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const primary = accent ?? c.primary;
  const n = data.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 42; // 라벨 여백(좌우 라벨이 잘리지 않도록 넉넉히)

  const angleFor = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const point = (i: number, r: number) => ({
    x: cx + R * r * Math.cos(angleFor(i)),
    y: cy + R * r * Math.sin(angleFor(i)),
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const polygonAt = (r: number) =>
    data.map((_, i) => { const p = point(i, r); return `${p.x},${p.y}`; }).join(' ');

  const dataPolygon = data.map((d, i) => { const p = point(i, Math.max(0.04, d.value)); return `${p.x},${p.y}`; }).join(' ');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* 그리드 */}
        {gridLevels.map((lvl) => (
          <Polygon key={lvl} points={polygonAt(lvl)} fill="none" stroke={c.border} strokeWidth={1} />
        ))}
        {/* 축선 */}
        {data.map((_, i) => {
          const p = point(i, 1);
          return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={c.border} strokeWidth={1} />;
        })}
        {/* 데이터 폴리곤 */}
        <Polygon points={dataPolygon} fill={primary} fillOpacity={0.22} stroke={primary} strokeWidth={2} />
        {/* 꼭짓점 */}
        {data.map((d, i) => {
          const p = point(i, Math.max(0.04, d.value));
          return <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={d.color ?? primary} />;
        })}
        {/* 라벨 — 좌/우 축 라벨은 안쪽으로 자라도록 textAnchor 를 동적으로 정해 잘림 방지 */}
        <G>
          {data.map((d, i) => {
            const lp = point(i, 1.16);
            const dx = Math.cos(angleFor(i));
            const anchor = Math.abs(dx) < 0.3 ? 'middle' : dx > 0 ? 'end' : 'start';
            return (
              <SvgText key={i} x={lp.x} y={lp.y + 4} fontSize={11} fontWeight="700" fill={c.textSecondary} textAnchor={anchor}>
                {d.label}
              </SvgText>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
