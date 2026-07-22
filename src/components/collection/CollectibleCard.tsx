import React from 'react';
import { View, Text, Animated } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { fontDisplay, fontMono, fontBody } from '../../theme/tokens';
import { COLLECTIBLE_BY_ID, JEWEL_META } from '../../data/collectibles';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const COLLECTIBLE_ASPECT = 0.72; // w/h — 트레이딩 카드 비율

/**
 * 수집형 안전 카드 한 장.
 * - owned=false → 실루엣(미획득) 상태.
 * - rare 이상은 등급 그라데이션 테두리, tilt 를 주면 홀로그램 광택이 미끄러진다(상세 전용).
 */
function CollectibleCardBase({
  id,
  owned = true,
  count = 1,
  isNew = false,
  width,
  tilt,
}: {
  id: string;
  owned?: boolean;
  count?: number;
  isNew?: boolean;
  width: number;
  tilt?: Animated.ValueXY;
}) {
  const col = COLLECTIBLE_BY_ID[id];
  const meta = JEWEL_META[col.rarity];
  const W = width;
  const H = Math.round(W / COLLECTIBLE_ASPECT);
  const k = W / 150;
  const R = 16 * k;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const [bg0, bg1] = meta.bg;
  const borderColor = meta.glow;

  return (
    <View style={{ width: W, height: H, borderRadius: R, overflow: 'hidden', backgroundColor: bg1 }}>
      <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={bg0} />
            <Stop offset="1" stopColor={bg1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={W} height={H} fill={`url(#bg${uid})`} />
        {owned && <Circle cx={W * 0.5} cy={H * 0.36} r={W * 0.42} fill={meta.glow === 'transparent' ? '#ffffff' : meta.glow} opacity={col.rarity === 'common' ? 0.06 : 0.16} />}
      </Svg>

      {owned ? (
        <View style={{ flex: 1, padding: 10 * k, justifyContent: 'space-between' }}>
          {/* 상단: 등급 + 파워 */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 999, paddingHorizontal: 7 * k, paddingVertical: 2 * k, borderWidth: 1, borderColor: borderColor + 'AA' }}>
              <Text style={{ color: '#fff', fontSize: 9 * k, fontFamily: fontDisplay, fontWeight: '800', letterSpacing: 0.5 }}>{meta.label}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * k }}>
              <Ionicons name="shield-checkmark" size={10 * k} color="#FCD34D" />
              <Text style={{ color: '#FCD34D', fontSize: 11 * k, fontFamily: fontMono, fontWeight: '900' }}>{col.power}</Text>
            </View>
          </View>

          {/* 하단: 이름 + 카테고리 */}
          <View>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12.5 * k, fontFamily: fontDisplay, fontWeight: '800', textAlign: 'center' }}>{col.name}</Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5 * k, fontFamily: fontBody, textAlign: 'center', marginTop: 1 }}>{col.category}</Text>
          </View>
        </View>
      ) : (
        // 미획득 실루엣
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 * k }}>
          <Text style={{ fontSize: 40 * k, opacity: 0.18 }}>❓</Text>
          <Ionicons name="lock-closed" size={13 * k} color="rgba(255,255,255,0.35)" />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9.5 * k, fontFamily: fontDisplay }}>미획득</Text>
        </View>
      )}

      {/* 아트(이모지) — 뒤 글로우 원(cx=W*0.5, cy=H*0.36)의 정중앙에 오도록 오버레이로 배치.
          위 0~H*0.72 영역의 세로 중앙 = H*0.36 = 원의 중심. */}
      {owned && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.72, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 46 * k }}>{col.emoji}</Text>
        </View>
      )}

      {/* 홀로그램 광택(tilt) */}
      {owned && tilt && (
        <Svg width={W} height={H} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <RadialGradient id={`holo${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={col.rarity === 'common' ? 0.22 : 0.4} />
              <Stop offset="0.5" stopColor={meta.glow === 'transparent' ? '#FFFFFF' : meta.glow} stopOpacity={0.14} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AnimatedCircle
            cx={tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [W * 0.15, W * 0.85] })}
            cy={tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [H * 0.05, H * 0.6] })}
            r={W * 0.6}
            fill={`url(#holo${uid})`}
          />
        </Svg>
      )}

      {/* 등급 테두리 */}
      <Svg width={W} height={H} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={`bd${uid}`} x1="0" y1="0" x2="1" y2="1">
            {(meta.colors.length > 1 ? meta.colors : [borderColor, borderColor]).map((col2, i, arr) => (
              <Stop key={i} offset={`${i / (arr.length - 1)}`} stopColor={col2} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect
          x={1.4 * k} y={1.4 * k} width={W - 2.8 * k} height={H - 2.8 * k}
          rx={R - 1.4 * k} ry={R - 1.4 * k}
          fill="none" stroke={owned ? `url(#bd${uid})` : 'rgba(255,255,255,0.12)'} strokeWidth={(col.rarity === 'common' ? 1.4 : 2.2) * k}
        />
      </Svg>

      {/* NEW 뱃지 */}
      {isNew && owned && (
        <View style={{ position: 'absolute', top: 6 * k, right: 6 * k, backgroundColor: '#EF4444', borderRadius: 999, paddingHorizontal: 6 * k, paddingVertical: 1.5 * k }}>
          <Text style={{ color: '#fff', fontSize: 8.5 * k, fontFamily: fontDisplay, fontWeight: '900' }}>NEW</Text>
        </View>
      )}
      {/* 보유 장수 */}
      {owned && count > 1 && (
        <View style={{ position: 'absolute', bottom: 6 * k, right: 6 * k, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 6 * k, paddingVertical: 1.5 * k }}>
          <Text style={{ color: '#fff', fontSize: 9 * k, fontFamily: fontMono, fontWeight: '800' }}>×{count}</Text>
        </View>
      )}
    </View>
  );
}

// 도감·피드·팩오픈에서 다수가 반복 렌더되는 SVG 카드 — 부모 리렌더 시 불필요한 재렌더를 막는다.
export const CollectibleCard = React.memo(CollectibleCardBase);
