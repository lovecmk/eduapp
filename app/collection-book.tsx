import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, Modal, Platform, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticSuccess, hapticTap } from '../src/utils/haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SearchBar } from '../src/components/ui/SearchBar';
import { CollectibleCard } from '../src/components/collection/CollectibleCard';
import { CardSkeleton } from '../src/components/collection/CardSkeleton';
import { PackOpenModal } from '../src/components/collection/PackOpenModal';
import { COLLECTIBLES, COLLECTIBLE_BY_ID, PACK_SIZE, JEWEL_META, type CollectibleCategory } from '../src/data/collectibles';
import { RARITY_RANK as RANK, RARITY_ORDER, type RarityTier } from '../src/utils/rarity';
import { useTilt } from '../src/hooks/useTilt';
import { useCollectionStore, STUDY_PER_PACK, DAILY_PACK, INITIAL_PACKS, type DrawResult } from '../src/store/collectionStore';
import { fontCute, fontBody, fontMono, fontDisplay } from '../src/theme/tokens';
import { contentColumn, CONTENT_MAX_WIDTH } from '../src/theme/layout';

// 그리드 열 너비는 '본문 칼럼 폭' 기준으로 계산한다.
// 창 너비(SCREEN_W)로 계산하면 넓은 화면(웹)에서 본문은 560px 로 제한되는데
// 카드만 창 크기에 맞춰 부풀어, 3열이 1열로 무너지고 카드가 거대해진다.
const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 10;
const GRID_W = Math.min(SCREEN_W, CONTENT_MAX_WIDTH);
const COL_W = (GRID_W - 20 * 2 - GAP * 2) / 3;
// 한 번에 그리는 카드 수(6줄×3열). 150여 장을 한꺼번에 렌더하지 않고
// 아래로 스크롤할 때마다 이 단위로 조금씩 불러온다.
const PAGE = 18;
// 도감은 높은 등급을 위에 노출(공용 오름차순을 뒤집는다).
const ORDER: RarityTier[] = [...RARITY_ORDER].reverse();
const label = (t: RarityTier) => JEWEL_META[t].label;

type RarityFilter = RarityTier | 'all';
type CategoryFilter = CollectibleCategory | 'all';
type StatusFilter = 'all' | 'owned' | 'missing';

// 카테고리(분야) 필터 — 짧은 이모지로 한눈에 구분.
const CATEGORIES: { key: CategoryFilter; label: string; emoji: string }[] = [
  { key: 'all', label: '전체', emoji: '🗂️' },
  { key: '전기 위험', label: '전기', emoji: '⚡' },
  { key: '공정 위험', label: '공정', emoji: '⚙️' },
  { key: '위험물', label: '위험물', emoji: '☣️' },
  { key: '현장 점검', label: '현장', emoji: '🦺' },
  { key: '공통', label: '공통', emoji: '🧩' },
];

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

  // ── 도감 탐색 필터 상태(150종을 편하게 둘러보도록) ─────────────────
  const [query, setQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [howtoOpen, setHowtoOpen] = useState(false);

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

  // 필터가 적용된 결과 — 검색어·분야·보유상태·등급을 모두 반영.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COLLECTIBLES.filter((col) => {
      if (rarityFilter !== 'all' && col.rarity !== rarityFilter) return false;
      if (categoryFilter !== 'all' && col.category !== categoryFilter) return false;
      const isOwned = !!owned[col.id];
      if (statusFilter === 'owned' && !isOwned) return false;
      if (statusFilter === 'missing' && isOwned) return false;
      if (q) {
        const hay = `${col.name} ${col.tagline} ${col.tip} ${col.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, rarityFilter, categoryFilter, statusFilter, owned]);

  // 결과를 등급별 섹션으로 묶는다(등급 필터가 걸리면 해당 섹션만 남는다).
  const sections = useMemo(() => {
    return ORDER
      .map((tier) => ({ tier, items: filtered.filter((c) => c.rarity === tier) }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  const filterActive = query.trim() !== '' || rarityFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all';
  const resetFilters = () => { setQuery(''); setRarityFilter('all'); setCategoryFilter('all'); setStatusFilter('all'); };

  // ── 아래로 스크롤하며 조금씩 불러오기(무한 스크롤 + 스켈레톤) ──────────
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 필터가 바뀌면 처음부터 다시 조금씩 보여준다.
  useEffect(() => { setVisibleCount(PAGE); }, [query, rarityFilter, categoryFilter, statusFilter]);
  useEffect(() => () => { if (loadTimer.current) clearTimeout(loadTimer.current); }, []);

  const totalFiltered = filtered.length;
  const hasMore = visibleCount < totalFiltered;
  const remaining = totalFiltered - visibleCount;

  // 등급 섹션을 유지하되, 현재 노출 수(visibleCount)까지만 잘라서 렌더한다.
  const visibleSections = useMemo(() => {
    let budget = visibleCount;
    const out: { tier: RarityTier; items: typeof COLLECTIBLES; total: number; ownedCount: number }[] = [];
    for (const s of sections) {
      if (budget <= 0) break;
      const shown = budget >= s.items.length ? s.items : s.items.slice(0, budget);
      out.push({ tier: s.tier, items: shown, total: s.items.length, ownedCount: s.items.filter((x) => owned[x.id]).length });
      budget -= shown.length;
    }
    return out;
  }, [sections, visibleCount, owned]);

  // 바닥 근처에 닿으면 스켈레톤을 잠깐 보여준 뒤 다음 페이지를 붙인다.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMore || loadingMore) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceToBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    // 바닥에 닿기 한참 전(약 1.5화면 앞)에서 미리 불러와, 스켈레톤 자리에
    // 도착할 즈음이면 실제 카드가 이미 채워져 있도록 한다.
    if (distanceToBottom < 700) {
      setLoadingMore(true);
      loadTimer.current = setTimeout(() => {
        setVisibleCount((v) => v + PAGE);
        setLoadingMore(false);
      }, 220);
    }
  };

  const onOpen = () => {
    const res = openPack();
    if (res) {
      hapticImpact();
      setDrawn(res);
    }
  };
  const onClaimDaily = () => {
    if (claimDaily()) hapticSuccess();
  };
  const onCloseDraw = () => setDrawn(null);
  const onDetail = (id: string) => { if (owned[id]) { setDetailId(id); if (newIds.includes(id)) clearNew([id]); } };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="안전 카드 컬렉션" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40, ...contentColumn }} stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {/* ── 헤더 영역: 진행도 배너 + 카드팩 획득 안내(접기) ── (index 0) */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {/* 진행도 배너 */}
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>📖</Text>
                <View>
                  <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontCute, fontWeight: '800' }}>안전 카드 컬렉션</Text>
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
                const active = rarityFilter === tier;
                return (
                  <Pressable key={tier} onPress={() => { hapticTap(); setRarityFilter(active ? 'all' : tier); }}
                    style={{ flex: 1, alignItems: 'center', backgroundColor: active ? JEWEL_META[tier].glow + '22' : c.surfaceAlt, borderRadius: 12, paddingVertical: 8, borderWidth: 1, borderColor: active ? JEWEL_META[tier].glow : 'transparent' }}>
                    <Text style={{ color: JEWEL_META[tier].glow, fontSize: 10.5, fontFamily: fontDisplay, fontWeight: '800' }}>{label(tier)}</Text>
                    <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontMono, fontWeight: '800', marginTop: 2 }}>{ownT}/{totalT}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 팩 열기 / 일일 무료팩 */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable onPress={onOpen} disabled={packs <= 0}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: packs > 0 ? c.primary : c.disabled, borderRadius: 14, height: 48 }}>
                <Ionicons name="gift" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>{packs > 0 ? `카드팩 열기 (${packs})` : '보유한 팩 없음'}</Text>
              </Pressable>
              {canClaimDaily && (
                <Pressable onPress={onClaimDaily}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 48, paddingHorizontal: 16 }}>
                  <Ionicons name="calendar" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘의 무료팩</Text>
                </Pressable>
              )}
            </View>
            {/* 다음 카드팩까지 남은 학습 진행 — '어떻게 더 얻지?'에 즉답 */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody }}>다음 무료 카드팩까지</Text>
                <Text style={{ color: c.textPrimary, fontSize: 11.5 * fs, fontFamily: fontMono, fontWeight: '700' }}>
                  학습 {STUDY_PER_PACK - (studyProgress % STUDY_PER_PACK)}회
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${((studyProgress % STUDY_PER_PACK) / STUDY_PER_PACK) * 100}%`, height: '100%', backgroundColor: c.success, borderRadius: 3 }} />
              </View>
            </View>
          </View>

          {/* 카드팩 획득 방법 — 기본은 접어두고(도감이 커진 만큼 목록을 먼저), 탭하면 펼침 */}
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14, marginTop: 14 }}>
            <Pressable onPress={() => { hapticTap(); setHowtoOpen((v) => !v); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800', flex: 1 }}>카드팩 얻는 방법</Text>
              <Ionicons name={howtoOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
            </Pressable>
            {howtoOpen && (
              <View style={{ marginTop: 10 }}>
                {[
                  { icon: 'school', color: c.success, title: `학습 ${STUDY_PER_PACK}회마다 1팩`, desc: '카드를 학습하면 자동으로 적립돼요' },
                  { icon: 'calendar', color: c.warning, title: `매일 무료팩 ${DAILY_PACK}개`, desc: canClaimDaily ? '오늘 무료팩이 준비돼 있어요!' : '내일 다시 받을 수 있어요' },
                  { icon: 'gift', color: c.primary, title: `첫 가입 보너스 ${INITIAL_PACKS}팩`, desc: '처음 시작할 때 넉넉히 지급돼요' },
                ].map((m) => (
                  <View key={m.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: m.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={m.icon as keyof typeof Ionicons.glyphMap} size={17} color={m.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontCute, fontWeight: '700' }}>{m.title}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 1 }}>{m.desc}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ fontSize: 13 }}>💎</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, flex: 1, lineHeight: 16 }}>
                    한 팩({PACK_SIZE}장)에는 에메랄드 등급 이상 카드가 최소 1장 나와요
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── 스티키 필터 툴바(스크롤해도 상단 고정) ── (index 1) */}
        <View style={{ backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <SearchBar value={query} onChange={setQuery} placeholder="카드 이름·안전상식 검색" />

          {/* 분야(카테고리) 칩 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>
            {CATEGORIES.map((cat) => {
              const active = categoryFilter === cat.key;
              return (
                <Pressable key={cat.key} onPress={() => { hapticTap(); setCategoryFilter(cat.key); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 999, backgroundColor: active ? c.primary : c.surfaceAlt, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
                  <Text style={{ fontSize: 12 }}>{cat.emoji}</Text>
                  <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute, fontWeight: '700' }}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 보유 상태 세그먼트 + 결과 수 + 초기화 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 3 }}>
              {([['all', '전체'], ['owned', '보유'], ['missing', '미보유']] as [StatusFilter, string][]).map(([key, lbl]) => {
                const active = statusFilter === key;
                return (
                  <Pressable key={key} onPress={() => { hapticTap(); setStatusFilter(key); }}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? c.primary : 'transparent' }}>
                    <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute, fontWeight: '700' }}>{lbl}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontMono }}>{filtered.length}장</Text>
              {filterActive && (
                <Pressable onPress={() => { hapticTap(); resetFilters(); }} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons name="close-circle" size={15} color={c.textSecondary} />
                  <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>초기화</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── 결과: 등급별 그리드 ── (index 2) */}
        <View style={{ paddingHorizontal: 20 }}>
          {sections.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontCute, fontWeight: '800', marginTop: 12 }}>조건에 맞는 카드가 없어요</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, marginTop: 4 }}>검색어나 필터를 바꿔보세요</Text>
              <Pressable onPress={resetFilters} style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9 }}>
                <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '800' }}>필터 초기화</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {visibleSections.map(({ tier, items, total, ownedCount }) => (
                <View key={tier} style={{ marginTop: 22 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: JEWEL_META[tier].glow }} />
                    <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>{label(tier)}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{ownedCount}/{total}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                    {items.map((col, i) => (
                      <Animated.View key={col.id} entering={FadeInDown.delay(Math.min(i, 6) * 24).duration(240)}>
                        <Pressable onPress={() => onDetail(col.id)}>
                          <CollectibleCard id={col.id} owned={!!owned[col.id]} count={owned[col.id] ?? 0} isNew={newIds.includes(col.id)} width={COL_W} />
                        </Pressable>
                      </Animated.View>
                    ))}
                  </View>
                </View>
              ))}

              {/* 아래로 스크롤하면 나타나는 로딩 스켈레톤 — 다음 카드들이 채워질 자리 */}
              {hasMore && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 22 }}>
                  {Array.from({ length: Math.min(PAGE, remaining) }).map((_, i) => (
                    <CardSkeleton key={`sk-${i}`} width={COL_W} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <PackOpenModal results={drawn} onClose={onCloseDraw} />
      <CollectibleDetailModal id={detailId} count={detailId ? owned[detailId] ?? 0 : 0} onClose={() => setDetailId(null)} />
    </View>
  );
}

/** 카드 상세 — 기기 기울기에 홀로그램 광택이 반응. */
function CollectibleDetailModal({ id, count, onClose }: { id: string | null; count: number; onClose: () => void }) {
  const { fontScale: fs } = useTheme();
  const tilt = useTilt(!!id);
  const col = id ? COLLECTIBLE_BY_ID[id] : null;
  const meta = col ? JEWEL_META[col.rarity] : null;
  const bigW = Math.min(GRID_W - 120, 240);

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
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5 * fs, fontFamily: fontMono, marginTop: 14 }}>{Platform.OS === 'web' ? '마우스를 움직여 홀로그램을 감상하세요' : '기기를 기울여 홀로그램을 감상하세요'}</Text>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
