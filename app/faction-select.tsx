import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/ThemeProvider';
import { useFactionStore } from '../src/store/factionStore';
import { FACTION_LIST, getFaction, type FactionId, type Faction } from '../src/constants/factions';
import { fontBody, fontDisplay } from '../src/theme/tokens';
import { hapticTap, hapticSuccess } from '../src/utils/haptics';
import { useGoBack } from '../src/hooks/useGoBack';
import { ExperienceStep } from '../src/components/settings/ExperienceStep';
import { useAuthStore } from '../src/store/authStore';
import { isRestored, useAccountRestoreStore } from '../src/store/accountRestoreStore';
import { confirmFaction } from '../src/data/sync/faction';

// 진영 선택 카드 — 선택되면 진영 색으로 물들며 살짝 떠오른다.
function FactionCard({
  faction,
  selected,
  onSelect,
  surface,
  border,
  textSecondary,
  fs,
}: {
  faction: Faction;
  selected: boolean;
  onSelect: () => void;
  surface: string;
  border: string;
  textSecondary: string;
  /** 설정 → 글자 크기 배율. 이 화면도 앱의 다른 화면과 같은 배율을 따라야 한다. */
  fs: number;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const press = () => {
    scale.value = withSpring(selected ? 1 : 1.02, { damping: 16, stiffness: 220 });
    onSelect();
  };

  return (
    <Animated.View style={style}>
      <Pressable accessibilityRole="button"
        onPress={press}
        android_ripple={null}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 20,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? faction.color : border,
          backgroundColor: selected ? faction.color + '12' : surface,
          marginBottom: 14,
        }}
      >
        {/* 진영 엠블럼 */}
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: faction.color + (selected ? '26' : '18'),
          }}
        >
          <Text style={{ fontSize: 30 }}>{faction.emoji}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: faction.color, fontSize: 17 * fs, fontFamily: fontDisplay }}>{faction.name}</Text>
            <Text style={{ color: textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody }}>· {faction.emblem}</Text>
          </View>
          <Text style={{ color: textSecondary, fontSize: 12.5 * fs, lineHeight: 18 * fs, marginTop: 4, fontFamily: fontBody }}>
            {faction.description}
          </Text>
        </View>

        {/* 선택 표시 */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: selected ? 0 : 1.5,
            borderColor: border,
            backgroundColor: selected ? faction.color : 'transparent',
          }}
        >
          {selected && <Ionicons name="checkmark" size={15} color="#fff" />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function FactionSelectScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const goBack = useGoBack();
  const faction = useFactionStore(s => s.faction);
  const userId = useAuthStore(s => s.user?.id);
  const { entries, retryFailed } = useAccountRestoreStore();
  const ready = isRestored(entries.faction, userId);
  const [picked, setPicked] = useState<FactionId | null>(null);
  const [step, setStep] = useState<'experience' | 'faction'>('experience');

  const activeFaction = FACTION_LIST.find((f) => f.id === picked) ?? null;

  const onSelect = (id: FactionId) => {
    hapticTap();
    setPicked(id);
  };

  const onConfirm = async () => {
    if (!picked || !userId || !ready) return;
    const saved = await confirmFaction(userId, picked);
    if (!saved) return;
    hapticSuccess();
    // 이 화면은 홈이 push 로 연다(홈이 faction===null 을 보고 안내한다).
    // 그 위에 replace 로 홈을 또 얹으면 스택에 홈이 두 번 쌓인다 — 뒤로가기가
    // 같은 화면으로 되돌아가고, 홈 화면 인스턴스도 둘이 남는다.
    // 열린 것을 닫고 원래 홈으로 돌아간다(딥링크로 곧장 들어왔으면 홈으로).
    goBack();
  };

  if (!ready || faction) {
    const failed = entries.faction?.status === 'error';
    return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 24, justifyContent: 'center' }}>
      <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontFamily: fontDisplay }}>{faction && ready ? `${getFaction(faction)?.name} 진영을 복원했어요` : failed ? '기존 진영을 확인하지 못했어요' : '저장된 진영을 확인하고 있어요'}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20 * fs, fontFamily: fontBody, marginVertical: 16 }}>{faction && ready ? '기존에 선택한 진영으로 계속할 수 있어요.' : '기존 선택이 있는지 확인한 뒤 진행합니다. 연결 실패를 새 가입으로 처리하지 않아요.'}</Text>
      {failed && <Button label="진영 다시 불러오기" onPress={retryFailed} />}
      {(faction || failed) && <Button label="홈으로 돌아가기" onPress={goBack} variant="outline" />}
    </SafeAreaView>;
  }

  if (step === 'experience') return <ExperienceStep onContinue={() => setStep('faction')} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 20 }}>
          <Text style={{ fontSize: 34 }}>🏳️</Text>
          <Pressable accessibilityRole="button" onPress={() => setStep('experience')} style={{ padding: 8 }}>
            <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontBody }}>시작하기 · 2 / 2 · 경력 다시 선택</Text>
          </Pressable>
          <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 10, fontFamily: fontDisplay }}>진영을 선택하세요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 8, lineHeight: 20 * fs, textAlign: 'center', fontFamily: fontBody }}>
            세 진영이 커뮤니티에서 '안전 빌딩'을 함께 짓고 대항해요.{'\n'}한 번 고른 진영으로 함께 층을 쌓아 올려요.
          </Text>
        </View>

        {FACTION_LIST.map((f) => (
          <FactionCard
            key={f.id}
            faction={f}
            selected={picked === f.id}
            onSelect={() => onSelect(f.id)}
            surface={c.surface}
            border={c.border}
            textSecondary={c.textSecondary}
            fs={fs}
          />
        ))}

        {activeFaction && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: activeFaction.color + '12',
              borderRadius: 14,
              padding: 12,
              marginTop: 2,
              marginBottom: 16,
            }}
          >
            <Ionicons name={activeFaction.icon} size={18} color={activeFaction.color} />
            <Text style={{ color: activeFaction.color, fontSize: 13 * fs, flex: 1, fontFamily: fontDisplay }}>
              "{activeFaction.tagline}"
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Button label={activeFaction ? `${activeFaction.name} 진영으로 시작하기` : '진영을 골라주세요'} variant="filled" disabled={!picked} onPress={onConfirm} />
      </ScrollView>
    </SafeAreaView>
  );
}
