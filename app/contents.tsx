import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SearchBar } from '../src/components/ui/SearchBar';
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { CategoryTrail } from '../src/components/ui/CategoryTrail';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../src/constants/categories';
import { resolveCardImage } from '../src/data/cardImages';
import { getDifficultyMeta } from '../src/constants/difficulty';
import { TRACK_LEVEL_META } from '../src/domain/models/LearningTrack';
import { ROUTES } from '../src/constants/routes';
import { useTracks, type TrackProgress } from '../src/hooks/useTracks';
import type { LearningCard, CardStatus, CardDifficulty } from '../src/domain/models/LearningCard';

const STATUS_META: Record<CardStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  new: { label: '새 카드', color: '#94A3B8', icon: 'ellipse-outline' },
  learning: { label: '학습 중', color: '#2563EB', icon: 'time' },
  mastered: { label: '마스터', color: '#34C759', icon: 'checkmark-circle' },
};

const DIFF_ORDER: CardDifficulty[] = ['easy', 'medium', 'hard'];

export default function ContentsScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { tracks, allCards, isLoading, error, refetch } = useTracks();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lockedHint, setLockedHint] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const active = useMemo(() => tracks.find((t) => t.track.id === activeId) ?? null, [tracks, activeId]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return allCards.filter((x) =>
      x.question.toLowerCase().includes(q) || x.title.toLowerCase().includes(q) ||
      x.conclusion.toLowerCase().includes(q) || x.keywords.some((k) => k.toLowerCase().includes(q)) ||
      x.topic.toLowerCase().includes(q) || x.subCategory.toLowerCase().includes(q) || x.category.includes(q));
  }, [allCards, search]);

  if (isLoading && allCards.length === 0 && !error) {
    return <View style={{ flex: 1, backgroundColor: c.bg }}><ScreenHeader title="학습 목표" /><SkeletonLoader count={5} /></View>;
  }
  if (error && allCards.length === 0) {
    return <View style={{ flex: 1, backgroundColor: c.bg }}><ScreenHeader title="학습 목표" /><ErrorState message="컨텐츠를 불러올 수 없어요" onRetry={refetch} /></View>;
  }

  const goCard = (id: string) => router.push(ROUTES.content(id) as never);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="학습 목표" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="주제·질문 검색..." />
        </View>

        {searchResults ? (
          /* --- 검색 결과 --- */
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={[styles.sectionLabel, { color: c.textSecondary, marginLeft: 0 }]}>검색 결과 {searchResults.length}건</Text>
            {searchResults.length === 0 ? (
              <Animated.View entering={FadeIn} style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="search-outline" size={40} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 14 * fs, marginTop: 10, fontFamily: fontBody }}>"{search}" 검색 결과가 없어요</Text>
              </Animated.View>
            ) : searchResults.map((card, i) => (
              <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 8) * 35).duration(300)}>
                <ContentRow card={card} onPress={() => goCard(card.id)} />
              </Animated.View>
            ))}
          </View>
        ) : active ? (
          /* --- 선택된 과정: 난이도별 문제 --- */
          <TrackDetail progress={active} onBack={() => setActiveId(null)} onCard={goCard} onStart={() => router.push(ROUTES.cards)} />
        ) : (
          /* --- 과정 선택(목표) + 전체 둘러보기 --- */
          <>
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>학습 목표 (과정)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}>
              {tracks.map((tp) => (
                <TrackCard key={tp.track.id} progress={tp}
                  onPress={() => tp.track.locked ? setLockedHint(tp.track.title) : setActiveId(tp.track.id)} />
              ))}
            </ScrollView>

            {lockedHint && (
              <Animated.View entering={FadeIn} style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: c.surfaceAlt, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time-outline" size={16} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, flex: 1, fontFamily: fontBody }}>
                  <Text style={{ fontFamily: fontDisplay, color: c.textPrimary }}>{lockedHint}</Text> 과정은 준비 중이에요. 곧 만나요!
                </Text>
                <Pressable onPress={() => setLockedHint(null)} hitSlop={6}><Ionicons name="close" size={16} color={c.textSecondary} /></Pressable>
              </Animated.View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 22, marginBottom: 10 }}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary, marginTop: 0, marginBottom: 0, marginLeft: 0 }]}>전체 둘러보기</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>{allCards.length}건</Text>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              {allCards.map((card, i) => (
                <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 8) * 35).duration(300)}>
                  <ContentRow card={card} onPress={() => goCard(card.id)} />
                </Animated.View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ---------- 과정 상세: 난이도별 섹션 ---------- */
function TrackDetail({ progress, onBack, onCard, onStart }: {
  progress: TrackProgress; onBack: () => void; onCard: (id: string) => void; onStart: () => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { track, total, mastered, pct, byDifficulty } = progress;

  return (
    <View>
      {/* 과정 헤더 */}
      <Animated.View entering={FadeIn.duration(300)} style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Pressable onPress={onBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          <Ionicons name="chevron-back" size={16} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 13, fontFamily: fontDisplay }}>모든 과정</Text>
        </Pressable>
        <View style={[styles.trackHeader, { backgroundColor: track.color + '12', borderColor: track.color + '33' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.trackHeaderIcon, { backgroundColor: track.color }]}>
              <Ionicons name={track.icon as never} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay }}>{track.title}</Text>
                <LevelBadge level={track.level} />
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 2, fontFamily: fontBody }}>{track.goal}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1, height: 8, backgroundColor: c.surface, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: track.color, borderRadius: 4 }} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 12, fontFamily: fontMono }}>{mastered}/{total} · {pct}%</Text>
          </View>
        </View>
      </Animated.View>

      {/* 난이도별 문제 */}
      <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
        {DIFF_ORDER.map((d) => {
          const cards = byDifficulty[d];
          if (cards.length === 0) return null;
          const meta = getDifficultyMeta(theme, d);
          return (
            <View key={d} style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
                <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>{meta.label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>{cards.length}문제</Text>
              </View>
              {cards.map((card, i) => (
                <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(300)}>
                  <ContentRow card={card} onPress={() => onCard(card.id)} />
                </Animated.View>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LevelBadge({ level }: { level: TrackProgress['track']['level'] }) {
  const meta = TRACK_LEVEL_META[level];
  return (
    <View style={{ backgroundColor: meta.color + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: meta.color, fontSize: 10.5, fontFamily: fontDisplay }}>{meta.label}</Text>
    </View>
  );
}

function TrackCard({ progress, onPress }: { progress: TrackProgress; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { track, total, mastered, pct } = progress;
  const locked = track.locked;
  return (
    <Pressable onPress={onPress} style={[styles.trackCard, { backgroundColor: c.surface, borderColor: c.border, opacity: locked ? 0.85 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[styles.trackIcon, { backgroundColor: track.color + (locked ? '14' : '1A') }]}>
          <Ionicons name={(locked ? 'lock-closed' : track.icon) as never} size={20} color={track.color} />
        </View>
        <LevelBadge level={track.level} />
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay, marginTop: 12 }}>{track.title}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 2, fontFamily: fontBody }}>{track.subtitle}</Text>
      {locked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 }}>
          <Ionicons name="time-outline" size={13} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontDisplay }}>준비 중</Text>
        </View>
      ) : (
        <>
          <View style={{ height: 5, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden', marginTop: 14 }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: track.color, borderRadius: 3 }} />
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono, marginTop: 6 }}>{mastered}/{total} 마스터</Text>
        </>
      )}
    </Pressable>
  );
}

function ContentRow({ card, onPress }: { card: LearningCard; onPress: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(card.category) ?? c.primary;
  const diff = getDifficultyMeta(theme, card.difficulty);
  const status = STATUS_META[card.status];
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      {resolveCardImage(card.imageUrl) ? (
        <Image source={resolveCardImage(card.imageUrl)!} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={getCategoryIcon(card.category)} size={24} color={accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
        <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, marginTop: 5, fontFamily: fontDisplay }}>{card.question}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={{ color: status.color, fontSize: 11, fontFamily: fontDisplay }}>{status.label}</Text>
          </View>
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.border }} />
          <Text style={{ color: diff.color, fontSize: 11, fontFamily: fontDisplay }}>{diff.label}</Text>
          {card.hasImage ? (
            <>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="image" size={11} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>이미지</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSecondary} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontFamily: fontDisplay, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 12, marginLeft: 20 },
  trackCard: { width: 168, borderRadius: 18, borderWidth: 1, padding: 14 },
  trackIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trackHeader: { borderRadius: 18, borderWidth: 1, padding: 16 },
  trackHeaderIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
});
