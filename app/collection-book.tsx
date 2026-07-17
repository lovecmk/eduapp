import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { CollectibleCard } from '../src/components/collection/CollectibleCard';
import { PackOpenModal } from '../src/components/collection/PackOpenModal';
import { COLLECTIBLES, COLLECTIBLE_BY_ID } from '../src/data/collectibles';
import { RARITY_META, RARITY_RANK as RANK, RARITY_ORDER, type RarityTier } from '../src/utils/rarity';
import { useTilt } from '../src/hooks/useTilt';
import { useCollectionStore, STUDY_PER_PACK, type DrawResult } from '../src/store/collectionStore';
import { fontCute, fontBody, fontMono, fontDisplay } from '../src/theme/tokens';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 10;
const COL_W = (SCREEN_W - 20 * 2 - GAP * 2) / 3;
// 도감은 높은 등급을 위에 노출(공용 오름차순을 뒤집는다).
const ORDER: RarityTier[] = [...RARITY_ORDER].reverse();
const label = (t: RarityTier) => RARITY_META[t].label;

export default function CollectionBookScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  const owned = useCollectionStore((s) => s.owned);
  const packs = useCollectionStore((s) => s.packs);
  const newIds = useCollectionStore((s) => s.newIds);
  const lastDailyPack = useCollectionStore((s) => s.lastDailyPack);
  const studyProgress = useCollectionStore((s) => s.studyProgress);
  const claimDaily = useCollectionStore((s) => s.claimDaily);
  const openPack = useCollectionStore((s) => s.openPack);
  const clearNew = useCollectionStore((s) => s.clearNew);

  const [drawn, setDrawn] = useState<DrawResult[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const uniqueOwned = Object.keys(owned).length;
  const total = COLLECTIBLES.length;
  const pct = Math.round((uniqueOwned / total) * 100);
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const canClaimDaily = lastDailyPack !== today;

  const byRarity = useMemo(() => {
    const groups: Record<RarityTier, typeof COLLECTIBLES> = { legendary: [], epic: [], rare: [], common: [] };
    [...COLLECTIBLES].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).forEach((col) => groups[col.rarity].push(col));
    return groups;
  }, []);

  const onOpen = () => {
    const res = openPack();
    if (res) setDrawn(res);
  };
  const onCloseDraw = () => setDrawn(null);
  const onDetail = (id: string) => { if (owned[id]) { setDetailId(id); if (newIds.includes(id)) clearNew([id]); } };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="안전 카드 도감" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* 진행도 배너 */}
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22 }}>📖</Text>
              <View>
                <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontCute, fontWeight: '800' }}>안전 카드 도감</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody }}>수집 {uniqueOwned}/{total} · {pct}% 완성</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.primary, fontSize: 24 * fs, fontFamily: fontMono, fontWeight: '900' }}>{packs}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>보유 카드팩</Text>
            </View>
          </View>

          <View style={{ height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginTop: 14 }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
          </View>

          {/* 등급별 보유 */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {ORDER.map((tier) => {
              const totalT = byRarity[tier].length;
              const ownT = byRarity[tier].filter((x) => owned[x.id]).length;
              return (
                <View key={tier} style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 8 }}>
                  <Text style={{ color: tier === 'common' ? c.textSecondary : RARITY_META[tier].glow, fontSize: 10.5, fontFamily: fontDisplay, fontWeight: '800' }}>{label(tier)}</Text>
                  <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontMono, fontWeight: '800', marginTop: 2 }}>{ownT}/{totalT}</Text>
                </View>
              );
            })}
          </View>

          {/* 팩 열기 / 일일 무료팩 */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable onPress={onOpen} disabled={packs <= 0}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: packs > 0 ? c.primary : c.disabled, borderRadius: 14, height: 48 }}>
              <Ionicons name="gift" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>카드팩 열기</Text>
            </Pressable>
            {canClaimDaily && (
              <Pressable onPress={() => claimDaily()}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 48, paddingHorizontal: 16 }}>
                <Ionicons name="calendar" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘의 무료팩</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody, marginTop: 10, textAlign: 'center' }}>
            학습 {STUDY_PER_PACK - (studyProgress % STUDY_PER_PACK)}회 더 하면 카드팩 1개 · 매일 무료팩 1개
          </Text>
        </View>

        {/* 등급별 그리드 */}
        {ORDER.map((tier) => (
          <View key={tier} style={{ marginTop: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier === 'common' ? c.textSecondary : RARITY_META[tier].glow }} />
              <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>{label(tier)}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{byRarity[tier].filter((x) => owned[x.id]).length}/{byRarity[tier].length}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              {byRarity[tier].map((col, i) => (
                <Animated.View key={col.id} entering={FadeInDown.delay(Math.min(i, 6) * 30).duration(260)}>
                  <Pressable onPress={() => onDetail(col.id)}>
                    <CollectibleCard id={col.id} owned={!!owned[col.id]} count={owned[col.id] ?? 0} isNew={newIds.includes(col.id)} width={COL_W} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <PackOpenModal results={drawn} onClose={onCloseDraw} />
      <CollectibleDetailModal id={detailId} count={detailId ? owned[detailId] ?? 0 : 0} onClose={() => setDetailId(null)} />
    </View>
  );
}

/** 카드 상세 — 기기 기울기에 홀로그램 광택이 반응. */
function CollectibleDetailModal({ id, count, onClose }: { id: string | null; count: number; onClose: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const tilt = useTilt(!!id);
  const col = id ? COLLECTIBLE_BY_ID[id] : null;
  const meta = col ? RARITY_META[col.rarity] : null;
  const bigW = Math.min(SCREEN_W - 120, 240);

  return (
    <Modal visible={!!id} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {col && meta && (
          <Pressable onPress={() => {}} style={{ alignItems: 'center' }}>
            <View style={{ borderRadius: 20, boxShadow: `0 18px 48px ${meta.glow === 'transparent' ? 'rgba(255,255,255,0.2)' : meta.glow + '88'}` }}>
              <CollectibleCard id={col.id} width={bigW} count={count} tilt={tilt} />
            </View>
            <Text style={{ color: '#fff', fontSize: 17 * fs, fontFamily: fontCute, fontWeight: '800', marginTop: 18 }}>{col.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5 * fs, fontFamily: fontBody, marginTop: 4, textAlign: 'center' }}>{col.tagline}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 300 }}>
              <Text style={{ fontSize: 15 }}>💡</Text>
              <Text style={{ color: '#fff', fontSize: 12.5 * fs, fontFamily: fontBody, flex: 1, lineHeight: 18 }}>{col.tip}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5 * fs, fontFamily: fontMono, marginTop: 14 }}>기기를 기울여 홀로그램을 감상하세요</Text>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
