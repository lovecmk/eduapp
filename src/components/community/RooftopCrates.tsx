import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay, fontMono } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { Button } from '../ui/Button';
import { useCollectionStore } from '../../store/collectionStore';
import { useSrsStore } from '../../store/srsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { hapticImpact, hapticSuccess, hapticTap } from '../../utils/haptics';
import { toast } from '../../store/toastStore';
import { ROUTES } from '../../constants/routes';
import {
  BUILDING_CRATES,
  describeContents,
  evaluateCrates,
  monthBricks,
  type CrateStatus,
} from '../../domain/buildingCrates';

const nativeDriver = Platform.OS !== 'web';

/** 받침 유무에 따른 주격 조사(이/가). */
function subj(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}이(가)`;
  return code % 28 === 0 ? `${word}가` : `${word}이`;
}

/** 옥상 위 상자 하나 — 열 수 있으면 통통 튄다. */
function CrateNode({ status, accent, onPress }: { status: CrateStatus; accent: string; onPress: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const bounce = useRef(new Animated.Value(0)).current;
  const ready = status.state === 'ready';

  useEffect(() => {
    if (!ready) {
      bounce.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(bounce, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, bounce]);

  const { crate, state } = status;
  const ringColor = ready ? c.warning : state === 'opened' ? c.success : c.border;
  const bg = ready ? c.warning + '22' : state === 'opened' ? c.success + '14' : c.surfaceAlt;
  const caption =
    state === 'ready' ? '열기!' : state === 'opened' ? '열었음' : state === 'needBricks' ? `벽돌 ${status.bricksLeft}` : `${crate.floor}층`;
  const a11y =
    state === 'ready'
      ? `${crate.floor}층 ${crate.name}, 지금 열 수 있어요`
      : state === 'opened'
        ? `${crate.floor}층 ${crate.name}, 이번 달에 열었어요`
        : state === 'needBricks'
          ? `${crate.floor}층 ${crate.name}, 벽돌 ${status.bricksLeft}장 더 필요해요`
          : `${crate.floor}층 ${crate.name}, ${status.floorsLeft}층 남았어요`;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={4} style={{ flex: 1, alignItems: 'center' }}>
      <Animated.View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          borderWidth: ready ? 2 : 1,
          borderColor: ringColor,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
        }}
      >
        <Text style={{ fontSize: 19, opacity: state === 'locked' ? 0.35 : state === 'opened' ? 0.55 : 1 }}>
          {state === 'locked' ? '📦' : crate.emoji}
        </Text>
        {state === 'opened' && (
          <View style={{ position: 'absolute', right: -4, bottom: -4, backgroundColor: c.success, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        )}
      </Animated.View>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 5,
          color: ready ? c.warning : state === 'locked' ? c.textSecondary : accent,
          fontSize: 10.5 * fs,
          fontFamily: ready ? fontDisplay : fontMono,
        }}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

/** 상자 상세 + 여는 연출. */
function CrateSheet({
  status,
  month,
  floors,
  bricks,
  onClose,
}: {
  status: CrateStatus | null;
  month: string;
  floors: number;
  bricks: number;
  onClose: () => void;
}) {
  const collectionEnabled = useSettingsStore((st) => st.collectionEnabled);
  const enableCollection = useSettingsStore((st) => st.toggleCollectionEnabled);
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { run } = useSafeTimeout();
  const shake = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const [phase, setPhase] = useState<'idle' | 'opening' | 'revealed'>('idle');
  const [got, setGot] = useState<{ packs: number; shards: number } | null>(null);

  // 다른 상자를 고르면 처음 상태로.
  const floorKey = status?.crate.floor ?? 0;
  useEffect(() => {
    setPhase('idle');
    setGot(null);
    shake.setValue(0);
    pop.setValue(1);
  }, [floorKey, shake, pop]);

  if (!status) return null;
  const { crate, state } = status;

  const open = () => {
    setPhase('opening');
    hapticImpact();
    // 덜컹덜컹 — 상자가 흔들리다가 열린다.
    Animated.sequence([
      ...[1, -1, 1, -1, 1, 0].map((v) =>
        Animated.timing(shake, { toValue: v, duration: 90, easing: Easing.linear, useNativeDriver: nativeDriver }),
      ),
    ]).start();
    run(() => {
      const res = useCollectionStore.getState().openBuildingCrate(month, crate.floor, floors);
      if (!res) {
        // 조건이 그사이 바뀌었다(달이 넘어감·다른 기기에서 먼저 엶).
        setPhase('idle');
        toast('지금은 이 상자를 열 수 없어요', 'info');
        return;
      }
      setGot(res);
      setPhase('revealed');
      hapticSuccess();
      pop.setValue(0.4);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: nativeDriver }).start();
    }, 560);
  };

  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });
  const floorOk = status.floorsLeft === 0;
  const bricksOk = status.bricksLeft === 0;

  const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={ok ? c.success : c.textSecondary} />
      <Text style={{ flex: 1, color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontBody }}>{label}</Text>
      <Text style={{ color: ok ? c.success : c.textSecondary, fontSize: 12 * fs, fontFamily: fontMono }}>{detail}</Text>
    </View>
  );

  return (
    <CenterModal visible onClose={onClose} title={`${crate.floor}층 · ${crate.name}`} icon="cube">
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Animated.Text
          style={{
            fontSize: 56,
            transform: [{ rotate }, { scale: pop }],
          }}
        >
          {phase === 'revealed' ? '✨' : crate.emoji}
        </Animated.Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, marginTop: 6, textAlign: 'center' }}>
          {crate.flavor}
        </Text>
      </View>

      {phase === 'revealed' && got ? (
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay }}>
            {[got.packs > 0 ? `카드팩 +${got.packs}` : '', got.shards > 0 ? `안전 조각 +${got.shards}` : ''].filter(Boolean).join(' · ')}
          </Text>
          {crate.surprise && (
            <Text style={{ color: c.warning, fontSize: 12 * fs, fontFamily: fontBody, marginTop: 4 }}>
              {got.packs >= 3 ? '대박! 최고 등급 상자였어요 🎊' : got.packs === 2 ? '운이 좋았어요! 🍀' : '다음 달엔 더 큰 게 나올지도 몰라요 🤞'}
            </Text>
          )}
          <View style={{ width: '100%', gap: 8, marginTop: 16 }}>
            <Button
              label="카드팩 열러 가기"
              onPress={() => {
                onClose();
                router.push(ROUTES.collectionBook as never);
              }}
            />
            <Button label="닫기" variant="outline" onPress={onClose} />
          </View>
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 }}>
            <Check ok={floorOk} label={`빌딩 ${crate.floor}층 도달`} detail={floorOk ? `지금 ${floors}층` : `${status.floorsLeft}층 남음`} />
            <Check ok={bricksOk} label={`이번 달 내 벽돌 ${crate.bricks}장`} detail={`${Math.min(bricks, crate.bricks)}/${crate.bricks}`} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <Ionicons name="gift-outline" size={15} color={c.warning} />
            <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay }}>{describeContents(crate)}</Text>
          </View>
          <View style={{ marginTop: 16 }}>
            {state === 'opened' ? (
              <Text style={{ color: c.success, fontSize: 13 * fs, fontFamily: fontDisplay, textAlign: 'center' }}>
                이번 달에 이미 열었어요 ✓
              </Text>
            ) : (
              <Button
                label={state === 'ready' ? (collectionEnabled ? '상자 열기' : '카드 수집 켜고 열기') : state === 'needBricks' ? `벽돌 ${status.bricksLeft}장 더 필요해요` : `${status.floorsLeft}층 더 올라가야 해요`}
                disabled={state !== 'ready'}
                loading={phase === 'opening'}
                onPress={() => {
                  if (!collectionEnabled) enableCollection();
                  open();
                }}
              />
            )}
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 16 * fs, fontFamily: fontBody, marginTop: 12, textAlign: 'center' }}>
            카드 학습 1장 = 벽돌 1장 · 열지 않은 상자는 달이 바뀌면 사라져요
          </Text>
        </>
      )}
    </CenterModal>
  );
}

/**
 * 옥상 보물상자 줄 — 안전 빌딩이 정해진 층에 닿으면 상자가 놓이고, 그 달에 벽돌을
 * 충분히 올린 사람이 연다. 규칙·보상액은 domain/buildingCrates 가 정한다.
 */
export function RooftopCrates({ month, floors, accent }: { month: string; floors: number; accent: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const collectionEnabled = useSettingsStore((s) => s.collectionEnabled);
  const enableCollection = useSettingsStore((s) => s.toggleCollectionEnabled);
  const monthStudy = useCollectionStore((s) => s.monthStudy);
  const monthStudyKey = useCollectionStore((s) => s.monthStudyKey);
  const claimed = useCollectionStore((s) => s.claimedRules);
  const srsCards = useSrsStore((s) => s.cards);
  const [selected, setSelected] = useState<number | null>(null);

  const bricks = useMemo(
    () => monthBricks(month, { monthStudy, monthStudyKey }, srsCards),
    [month, monthStudy, monthStudyKey, srsCards],
  );
  const statuses = useMemo(
    () => evaluateCrates({ month, floors, myBricks: bricks, claimed }),
    [month, floors, bricks, claimed],
  );

  const ready = statuses.filter((s) => s.state === 'ready');
  const needBricks = statuses.find((s) => s.state === 'needBricks');
  const nextLocked = statuses.find((s) => s.state === 'locked');
  const allOpened = statuses.every((s) => s.state === 'opened');

  // 상자 사이를 잇는 공사 진행선 — 상자는 같은 간격으로 놓여 있으니 구간별로 채운다.
  const last = BUILDING_CRATES.length - 1;
  let fill = 0;
  for (let i = 0; i < BUILDING_CRATES.length; i++) {
    const lo = i === 0 ? 0 : BUILDING_CRATES[i - 1].floor;
    const hi = BUILDING_CRATES[i].floor;
    if (floors >= hi) { fill = i; continue; }
    const frac = Math.max(0, (floors - lo) / (hi - lo));
    fill = i === 0 ? 0 : i - 1 + frac;
    break;
  }
  const fillPct = Math.min(100, (fill / last) * 100);

  let hint: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string };
  // 상자는 카드팩·조각을 준다. 카드 수집(베타)을 꺼 둔 사람에게도 상자는 보여 주되
  // 여는 대신 '켜기'를 권한다 — 숨기면 이 보상이 있다는 것조차 모른다.
  if (!collectionEnabled)
    hint = { icon: 'lock-closed-outline', text: '카드 수집(베타)을 켜면 상자를 열 수 있어요', color: c.textSecondary };
  else if (ready.length > 0) hint = { icon: 'sparkles', text: `열 수 있는 상자 ${ready.length}개! 눌러서 열어 보세요`, color: c.warning };
  else if (needBricks)
    hint = { icon: 'construct-outline', text: `벽돌 ${needBricks.bricksLeft}장 더 올리면 ${needBricks.crate.emoji} ${subj(needBricks.crate.name)} 열려요`, color: accent };
  else if (nextLocked)
    hint = { icon: 'business-outline', text: `다음 상자 ${nextLocked.crate.emoji} ${nextLocked.crate.name} · ${nextLocked.floorsLeft}층 남음`, color: c.textSecondary };
  else if (allOpened) hint = { icon: 'trophy', text: '이번 달 상자를 모두 열었어요! 다음 달에 또 만나요', color: c.success };
  else hint = { icon: 'cube-outline', text: '옥상에 상자가 놓여 있어요', color: c.textSecondary };

  const selectedStatus = selected == null ? null : statuses.find((s) => s.crate.floor === selected) ?? null;

  return (
    <View style={{ marginTop: 14, backgroundColor: c.warning + '0D', borderColor: c.warning + '33', borderWidth: 1, borderRadius: 14, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Text style={{ fontSize: 14 * fs }}>🏗️</Text>
        <Text style={{ flex: 1, color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay }}>옥상 보물상자</Text>
        <View style={{ backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: accent, fontSize: 11 * fs, fontFamily: fontMono }}>🧱 내 벽돌 {bricks}장</Text>
        </View>
      </View>

      <View>
        {/* 공사 진행선(상자 중심 높이) */}
        <View style={{ position: 'absolute', left: '10%', right: '10%', top: 19, height: 3, borderRadius: 2, backgroundColor: c.border }}>
          <View style={{ width: `${fillPct}%`, height: '100%', borderRadius: 2, backgroundColor: accent }} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          {statuses.map((s) => (
            <CrateNode
              key={s.crate.floor}
              status={s}
              accent={accent}
              onPress={() => {
                hapticTap();
                setSelected(s.crate.floor);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Ionicons name={hint.icon} size={14} color={hint.color} />
        <Text style={{ flex: 1, color: hint.color, fontSize: 12 * fs, fontFamily: fontBody }}>{hint.text}</Text>
        {!collectionEnabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="카드 수집 켜기"
            hitSlop={8}
            onPress={() => {
              enableCollection();
              toast('카드 수집을 켰어요 · 설정에서 언제든 끌 수 있어요', 'success');
            }}
          >
            <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontDisplay }}>켜기</Text>
          </Pressable>
        )}
      </View>

      <CrateSheet
        status={selectedStatus}
        month={month}
        floors={floors}
        bricks={bricks}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
