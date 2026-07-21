import React from 'react';
import { View, Text, Animated, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { fontMono } from '../../theme/tokens';
import type { AchievementSnapshot } from '../../utils/achievement';
import { getRarity } from '../../utils/rarity';
import { RarityParticles } from './RarityParticles';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 4:5 세로 카드(스토리/랩드 비율). aspect = width / height.
export const SHARE_CARD_ASPECT = 0.8;

interface Props {
  snapshot: AchievementSnapshot;
  author: string;
  /** 렌더 폭 — 내부 요소는 모두 이 폭에 비례해 스케일된다(캡처/피드 공용). */
  width?: number;
  /** 자이로/포인터 기울기(Animated.ValueXY, x·y ∈ [-1,1]) — 있으면 광택이 일렁인다. */
  tilt?: Animated.ValueXY;
  /** true 면 희소 등급 별가루 파티클을 재생(공유 미리보기·트로피 상세 전용, 피드 썸네일은 off). */
  animated?: boolean;
}

/**
 * 스포티파이 랩드 스타일 전용 공유 카드.
 * 앱 UI를 캡처하지 않고, 성취 데이터와 칭호를 세련된 타이포그래피로 꽉 채운 별도 뷰다.
 * 희소 등급(Rarity)에 따라 무지개 테두리·별가루가 차등 부여되고, tilt 를 주면 광택이 일렁인다.
 * react-native-view-shot 의 captureRef 대상이 되도록 forwardRef 로 바깥 View 를 노출한다.
 */
const WrappedShareCardBase = React.forwardRef<View, Props>(function WrappedShareCard(
  { snapshot: s, author, width = 320, tilt, animated = false },
  ref,
) {
  const W = width;
  const H = Math.round(W / SHARE_CARD_ASPECT);
  const k = W / 320; // 기준 폭 320 대비 스케일 계수
  const pad = 24 * k;
  const ink = '#FFFFFF';
  const dim = 'rgba(255,255,255,0.62)';
  const faint = 'rgba(255,255,255,0.10)';

  const rarity = getRarity(s);
  // SVG def id 는 문서 전역이라, 피드에 카드가 여러 장이면 충돌한다 → 인스턴스별 유니크 id.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const bgId = `bg${uid}`;
  const borderId = `bd${uid}`;
  const specId = `sp${uid}`;
  const R = 28 * k;

  const Stat = ({ value, label, accent }: { value: string; label: string; accent?: string }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: accent ?? ink, fontFamily: fontMono, fontWeight: '900', fontSize: 26 * k, letterSpacing: -0.5 }} numberOfLines={1}>
        {value}
      </Text>
      <Text style={{ color: dim, fontSize: 10.5 * k, marginTop: 3 * k, letterSpacing: 0.3 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  return (
    <View
      ref={ref}
      // collapsable 은 네이티브 캡처(view-shot)용 — 웹에서는 DOM 경고가 나므로 네이티브에서만 지정.
      {...(Platform.OS === 'web' ? {} : { collapsable: false })}
      style={{ width: W, height: H, borderRadius: R, overflow: 'hidden', backgroundColor: '#1E1B4B' }}
    >
      {/* 그라디언트 배경 + 은은한 광원 */}
      <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#312E81" />
            <Stop offset="0.55" stopColor="#4338CA" />
            <Stop offset="1" stopColor="#2563EB" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={W} height={H} fill={`url(#${bgId})`} />
        <Circle cx={W * 0.86} cy={H * 0.12} r={W * 0.4} fill="#6366F1" opacity={0.28} />
        <Circle cx={W * 0.1} cy={H * 0.92} r={W * 0.34} fill="#38BDF8" opacity={0.18} />
      </Svg>

      <View style={{ flex: 1, padding: pad, justifyContent: 'space-between' }}>
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: dim, fontFamily: fontMono, fontSize: 11 * k, letterSpacing: 1 }}>{s.periodLabel}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 * k, backgroundColor: faint, borderRadius: 999, paddingHorizontal: 10 * k, paddingVertical: 4 * k }}>
            <Text style={{ fontSize: 11 * k }}>✨</Text>
            <Text style={{ color: ink, fontSize: 10.5 * k, fontWeight: '800', letterSpacing: 1.5 }}>WRAPPED</Text>
          </View>
        </View>

        {/* 칭호(중앙 주인공) */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 58 * k, marginBottom: 6 * k }}>{s.emoji}</Text>
          <Text style={{ color: dim, fontSize: 12 * k, letterSpacing: 2, marginBottom: 6 * k }}>MY TITLE · 나의 칭호</Text>
          <Text style={{ color: ink, fontSize: 27 * k, fontWeight: '900', textAlign: 'center', letterSpacing: -0.6, lineHeight: 32 * k }} numberOfLines={2}>
            {s.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * k, marginTop: 12 * k }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * k, backgroundColor: faint, borderRadius: 999, paddingHorizontal: 12 * k, paddingVertical: 6 * k }}>
              <Text style={{ color: ink, fontFamily: fontMono, fontSize: 12 * k, fontWeight: '900' }}>Lv.{s.level}</Text>
              <Text style={{ color: ink, fontSize: 12.5 * k, fontWeight: '700' }}>{s.levelTitle}</Text>
            </View>
            {/* 희소 등급 뱃지 */}
            {rarity.tier !== 'common' && (
              <View style={{ backgroundColor: rarity.badgeBg, borderRadius: 999, paddingHorizontal: 10 * k, paddingVertical: 6 * k, borderWidth: 1, borderColor: rarity.glow + '88' }}>
                <Text style={{ color: '#fff', fontSize: 10.5 * k, fontWeight: '900', letterSpacing: 1 }}>{rarity.label}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 핵심 성취 수치 */}
        <View style={{ gap: 14 * k }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Stat value={`${s.totalLearned}`} label="누적 학습" />
            <View style={{ width: 1, height: 34 * k, backgroundColor: faint }} />
            <Stat value={`${s.accuracyPct}%`} label="정답률" accent="#7DD3FC" />
            <View style={{ width: 1, height: 34 * k, backgroundColor: faint }} />
            <Stat value={`${s.streakDays}일`} label="연속 학습" accent="#FCD34D" />
          </View>

          {/* 대표 강점 분야 */}
          {s.topCategory ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 * k, backgroundColor: faint, borderRadius: 14 * k, paddingVertical: 9 * k, paddingHorizontal: 12 * k }}>
              <Text style={{ fontSize: 15 * k }}>{s.topEmoji}</Text>
              <Text style={{ color: ink, fontSize: 12.5 * k, fontWeight: '700' }} numberOfLines={1}>
                최강 분야 <Text style={{ color: '#7DD3FC' }}>{s.topCategory}</Text> · 마스터 {s.topCategoryPct}%
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: faint, borderRadius: 14 * k, paddingVertical: 9 * k }}>
              <Text style={{ color: dim, fontSize: 12 * k }}>완료율 {s.completionPct}% · 지금부터 강점 분야를 만들어가요</Text>
            </View>
          )}
        </View>

        {/* 푸터 — 사용자 + 아주 작은 브랜드 워드마크 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={{ color: dim, fontSize: 12 * k, fontWeight: '700' }} numberOfLines={1}>@{author}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: 'Jua-Regular', color: ink, fontSize: 12 * k, letterSpacing: 1.5, opacity: 0.85 }}>BRIDGE</Text>
            <Text style={{ fontFamily: 'Jua-Regular', color: '#7DD3FC', fontSize: 9 * k, letterSpacing: 0.5, opacity: 0.85 }}> Learning</Text>
          </View>
        </View>
      </View>

      {/* 자이로 광택(Specular) — tilt 를 주면 흰 하이라이트가 기울기 따라 미끄러진다. */}
      {tilt && (
        <Svg width={W} height={H} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <RadialGradient id={specId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.12} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AnimatedCircle
            cx={tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [W * 0.16, W * 0.84] })}
            cy={tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [H * 0.04, H * 0.5] })}
            r={W * 0.55}
            fill={`url(#${specId})`}
          />
        </Svg>
      )}

      {/* 희소 등급 별가루 — 최고 등급일수록 더 많이 반짝인다(animated 일 때만). */}
      {animated && rarity.sparkles > 0 && (
        <RarityParticles count={rarity.sparkles} width={W} height={H} k={k} />
      )}

      {/* 희소 등급 테두리 — rare↑ 에서 등급색 그라데이션 스트로크(무지개=legendary). */}
      {rarity.tier !== 'common' && (
        <Svg width={W} height={H} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id={borderId} x1="0" y1="0" x2="1" y2="1">
              {rarity.colors.map((col, i) => (
                <Stop key={i} offset={rarity.colors.length === 1 ? '0' : `${i / (rarity.colors.length - 1)}`} stopColor={col} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            x={1.6 * k} y={1.6 * k}
            width={W - 3.2 * k} height={H - 3.2 * k}
            rx={R - 1.6 * k} ry={R - 1.6 * k}
            fill="none"
            stroke={`url(#${borderId})`}
            strokeWidth={2.6 * k}
          />
        </Svg>
      )}
    </View>
  );
});

// 피드·트로피룸에서 반복 렌더되는 SVG 카드 — snapshot/props 가 같으면 재렌더를 건너뛴다.
export const WrappedShareCard = React.memo(WrappedShareCardBase);
