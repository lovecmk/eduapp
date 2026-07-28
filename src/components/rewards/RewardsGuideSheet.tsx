import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { BottomSheet } from '../ui/BottomSheet';
import { fontCute, fontBody, fontDisplay } from '../../theme/tokens';
import { ROUTES } from '../../constants/routes';

// ── 보상 3종 안내 ────────────────────────────────────────────────────────
// 엠블럼 / 안전 카드 도감 / 트로피룸 은 초보자에게 헷갈리기 쉽다.
// 이 시트가 "무엇이 어떻게 다른지" 를 한 화면에서 명확히 구분해 준다.
// mypage 의 '내 컬렉션 · 성취' 섹션 안내(❓) 버튼과, 첫 진입 자동 안내에서 재사용한다.

export type RewardKind = 'emblem' | 'collection' | 'trophy';

interface GuideItem {
  kind: RewardKind;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tag: string; // 한 단어 성격(실력/수집/달성)
  title: string;
  what: string; // 무엇인가
  how: string; // 어떻게 얻나
  route: string;
  cta: string;
}

const ITEMS: GuideItem[] = [
  {
    kind: 'emblem',
    icon: 'ribbon',
    color: '#2563EB',
    tag: '실력',
    title: '엠블럼',
    what: '분야별(전기·공정·위험물·현장점검) 내 실력을 보여주는 등급 뱃지예요.',
    how: '해당 분야 카드를 많이 마스터할수록 🥉→🥈→🥇 등급이 올라가요.',
    route: ROUTES.stats,
    cta: '학습 통계에서 보기',
  },
  {
    kind: 'collection',
    icon: 'albums',
    color: '#7E57C2',
    tag: '수집',
    title: '안전 카드 도감',
    what: '학습하다 얻은 카드팩을 열어 모으는 수집형 카드예요.',
    how: '꾸준히 학습하면 카드팩을 얻고, 팩을 열면 새 카드가 도감에 채워져요.',
    route: ROUTES.collectionBook,
    cta: '도감 열어보기',
  },
  {
    kind: 'trophy',
    icon: 'trophy',
    color: '#F2B705',
    tag: '달성',
    title: '트로피룸',
    what: '목표를 이루거나 자랑(플렉스)한 성취 기록을 모아두는 보관함이에요.',
    how: '연속 학습·목표 달성 같은 순간마다 성취 카드가 트로피룸에 쌓여요.',
    route: ROUTES.trophy,
    cta: '트로피룸 가기',
  },
];

export function RewardsGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const goto = (route: string) => {
    onClose();
    router.push(route as never);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '800', fontFamily: fontCute }}>보상 한눈에 보기</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, textAlign: 'center', fontFamily: fontBody }}>
          비슷해 보이지만 셋은 서로 달라요. 이렇게 구분하면 쉬워요!
        </Text>
      </View>

      {ITEMS.map((it) => (
        <View
          key={it.kind}
          style={{ flexDirection: 'row', gap: 12, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: c.border }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: it.color + '1A', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={it.icon} size={22} color={it.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>{it.title}</Text>
              <View style={{ backgroundColor: it.color + '1A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: it.color, fontSize: 10.5, fontWeight: '800', fontFamily: fontCute }}>{it.tag}</Text>
              </View>
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, marginTop: 5, lineHeight: 18 * fs, fontFamily: fontBody }}>{it.what}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5 }}>
              <Ionicons name="sparkles" size={12} color={c.textSecondary} style={{ marginTop: 2 }} />
              <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, lineHeight: 16 * fs, flex: 1, fontFamily: fontBody }}>{it.how}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => goto(it.route)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={{ color: it.color, fontSize: 12 * fs, fontWeight: '800', fontFamily: fontCute }}>{it.cta}</Text>
              <Ionicons name="chevron-forward" size={13} color={it.color} />
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={onClose} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontDisplay }}>알겠어요</Text>
      </Pressable>
    </BottomSheet>
  );
}
