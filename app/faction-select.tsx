import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/ThemeProvider';
import { useFactionStore } from '../src/store/factionStore';
import { FACTION_LIST, type FactionId, type Faction } from '../src/constants/factions';
import { fontBody, fontDisplay } from '../src/theme/tokens';
import { hapticTap, hapticSuccess } from '../src/utils/haptics';
import { ROUTES } from '../src/constants/routes';

// 진영 선택 카드 — 선택되면 진영 색으로 물들며 살짝 떠오른다.
function FactionCard({
  faction,
  selected,
  onSelect,
  surface,
  border,
  textSecondary,
}: {
  faction: Faction;
  selected: boolean;
  onSelect: () => void;
  surface: string;
  border: string;
  textSecondary: string;
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
            <Text style={{ color: faction.color, fontSize: 17, fontFamily: fontDisplay }}>{faction.name}</Text>
            <Text style={{ color: textSecondary, fontSize: 12.5, fontFamily: fontBody }}>· {faction.emblem}</Text>
          </View>
          <Text style={{ color: textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 4, fontFamily: fontBody }}>
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
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const chooseFaction = useFactionStore((s) => s.chooseFaction);
  const [picked, setPicked] = useState<FactionId | null>(null);

  const activeFaction = FACTION_LIST.find((f) => f.id === picked) ?? null;

  const onSelect = (id: FactionId) => {
    hapticTap();
    setPicked(id);
  };

  const onConfirm = () => {
    if (!picked) return;
    hapticSuccess();
    chooseFaction(picked);
    router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 20 }}>
          <Text style={{ fontSize: 34 }}>🏳️</Text>
          <Text style={{ color: c.textPrimary, fontSize: 22, marginTop: 10, fontFamily: fontDisplay }}>진영을 선택하세요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 20, textAlign: 'center', fontFamily: fontBody }}>
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
            <Text style={{ color: activeFaction.color, fontSize: 13, flex: 1, fontFamily: fontDisplay }}>
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
