import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';
import { hapticTap } from '../../utils/haptics';
import type { DiffVote } from '../../store/diffPollStore';

const OPTIONS: { key: DiffVote; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'easy', label: '쉬움', hint: '바로 알았어요', icon: 'happy-outline', color: '#34C759' },
  { key: 'normal', label: '보통', hint: '조금 고민했어요', icon: 'remove-circle-outline', color: '#FF9500' },
  { key: 'hard', label: '어려움', hint: '많이 헷갈렸어요', icon: 'sad-outline', color: '#FF3B30' },
];

/**
 * 한 문제를 풀고 넘어가기 직전에 묻는 체감 난이도.
 *
 * 정답 여부는 '맞았는가'만 알려주고 '얼마나 버거웠는가'는 알려주지 않는다.
 * 찍어서 맞힌 문제와 확신하고 맞힌 문제는 다음에 다시 만나야 할 시점이 다르므로,
 * 카드를 넘기기 전 그 자리에서 한 번만 묻는다(같은 카드는 다시 묻지 않는다).
 *
 */
export function CardDifficultyAsk({
  visible,
  onSelect,
  onSkip,
}: {
  visible: boolean;
  onSelect: (choice: DiffVote) => void;
  onSkip: () => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        {/* 배경 탭도 '건너뛰기'로 — 답을 강요하지 않는다. */}
        <Pressable accessibilityRole="button" accessibilityLabel="난이도 묻기 건너뛰기" style={{ position: 'absolute', inset: 0 }} onPress={onSkip} />
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', elevation: 16 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="speedometer-outline" size={26} color={c.primary} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', fontFamily: fontCute, textAlign: 'center' }}>
              이 문제, 얼마나 어려웠나요?
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', marginTop: 6, lineHeight: 19, fontFamily: fontCute }}>
              느낀 그대로 골라주세요.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {OPTIONS.map((o) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`난이도 ${o.label} — ${o.hint}`}
                key={o.key}
                onPress={() => { hapticTap(); onSelect(o.key); }}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6,
                  borderRadius: 16, borderWidth: 1.5, borderColor: o.color + '66', backgroundColor: o.color + '12',
                }}
              >
                <Ionicons name={o.icon} size={26 * fs} color={o.color} />
                <Text style={{ color: o.color, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute, marginTop: 6 }}>{o.label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontCute, marginTop: 3, textAlign: 'center' }}>{o.hint}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={6} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 6 }}>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>건너뛰기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
