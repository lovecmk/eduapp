import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, radius } from '../../theme/tokens';
import { ROUTES } from '../../constants/routes';
import { COLLECTIBLES } from '../../data/collectibles';
import { CollectibleCard } from '../collection/CollectibleCard';
import { useCollectionStore } from '../../store/collectionStore';

// 티저 미리보기용 대표 카드(등급별 하이라이트).
const RANK_HIGHLIGHTS = ['kfpa-safeguard', 'arc-guardian', 'elb', 'gas-detector', 'safety-helmet', 'extinguisher'];

/** 커뮤니티 '안전 카드 도감' 티저 — 수집 진행도 + 미리보기 + 팩 개봉 유도. */
export function CollectionTeaserCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const owned = useCollectionStore((s) => s.owned);
  const packs = useCollectionStore((s) => s.packs);
  const newIds = useCollectionStore((s) => s.newIds);

  const uniqueOwned = Object.keys(owned).length;
  const total = COLLECTIBLES.length;
  const pct = Math.round((uniqueOwned / total) * 100);

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.collectionBook as never)} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.card, padding: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 17 }}>🃏</Text>
          <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>안전 카드 컬렉션</Text>
          {packs > 0 && (
            <View style={{ backgroundColor: c.error, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontFamily: fontDisplay, fontWeight: '800' }}>팩 {packs}</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody, marginBottom: 12 }}>
        학습으로 카드팩을 모아 희귀 안전 카드를 수집해요 · {uniqueOwned}/{total} · {pct}%
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {RANK_HIGHLIGHTS.map((id) => (
          <CollectibleCard key={id} id={id} owned={!!owned[id]} count={owned[id] ?? 0} isNew={newIds.includes(id)} width={78} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, backgroundColor: packs > 0 ? c.primary + '14' : c.surfaceAlt, borderRadius: 12, paddingVertical: 10 }}>
        <Ionicons name={packs > 0 ? 'gift' : 'albums'} size={15} color={packs > 0 ? c.primary : c.textSecondary} />
        <Text style={{ color: packs > 0 ? c.primary : c.textSecondary, fontSize: 12.5, fontFamily: fontDisplay }}>
          {packs > 0 ? `카드팩 ${packs}개 개봉하러 가기` : '컬렉션 보러 가기'}
        </Text>
      </View>
    </Pressable>
  );
}
