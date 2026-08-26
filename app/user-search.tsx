import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { Avatar } from '../src/components/ui/Avatar';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { membershipMeta } from '../src/domain/models/User';
import type { PublicProfileSummary } from '../src/domain/models/PublicProfile';
import { useUserSearch } from '../src/hooks/useUserDirectory';
import { ROUTES } from '../src/constants/routes';
import { contentColumn } from '../src/theme/layout';

export default function UserSearchScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  // 간단 디바운스 — 입력이 멈추면 300ms 뒤에 검색어를 확정한다.
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw), 300);
    return () => clearTimeout(t);
  }, [raw]);

  const { data: results = [], isFetching, error, refetch } = useUserSearch(query);
  // 검색이 실패했는데 '없어요'라고 하면, 사용자는 그 사람이 앱에 없다고 믿는다.
  // 못 찾은 것과 못 물어본 것은 다르다.
  const searchFailed = query.trim().length >= 1 && !!error;
  const showEmpty = query.trim().length >= 1 && !isFetching && !error && results.length === 0;

  const openProfile = useCallback(
    (id: string) => router.push(ROUTES.publicProfile(id) as never),
    [router],
  );

  const renderRow = useCallback(
    ({ item }: { item: PublicProfileSummary }) => <UserRow user={item} onPress={openProfile} />,
    [openProfile],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="친구 찾기" />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: c.border }}>
          <Ionicons name="search" size={18} color={c.textSecondary} />
          <TextInput
            accessibilityLabel="닉네임으로 검색"
            value={raw}
            onChangeText={setRaw}
            placeholder="닉네임으로 검색"
            placeholderTextColor={c.textSecondary}
            autoFocus
            // minWidth:0 — flex 기본값(min-width:auto)이면 좁은 화면에서 입력창이
            // 콘텐츠 폭 아래로 줄지 못해 컨테이너 밖으로 삐져나온다.
            style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontBody }}
          />
          {raw.length > 0 && (
            <Pressable onPress={() => setRaw('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="검색어 지우기">
              <Ionicons name="close-circle" size={18} color={c.textSecondary} />
            </Pressable>
          )}
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 8, fontFamily: fontBody }}>
          공개를 허용한 점검자만 검색돼요. 진행도는 상대가 허용한 범위까지만 보여요.
        </Text>
      </View>

      {isFetching && (
        <View style={{ paddingTop: 20 }}><ActivityIndicator color={c.primary} /></View>
      )}

      {searchFailed && <ErrorState message="검색하지 못했어요" onRetry={refetch} />}

      {showEmpty && (
        <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 }}>
          <Ionicons name="person-outline" size={40} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 14 * fs, marginTop: 12, textAlign: 'center', fontFamily: fontCute }}>
            "{query}" 와 일치하는 공개 프로필이 없어요
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, ...contentColumn }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        renderItem={renderRow}
      />
    </View>
  );
}

/**
 * 검색 결과 한 줄.
 *
 * 인라인 renderItem 은 입력 한 글자마다 새 함수가 되어 보이는 행을 전부 다시 그린다.
 * 검색 화면은 타이핑이 곧 리렌더라 그 비용이 가장 크게 드러나는 자리다.
 */
const UserRow = React.memo(function UserRow({
  user,
  onPress,
}: {
  user: PublicProfileSummary;
  onPress: (id: string) => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const meta = membershipMeta(user.membership);

  return (
    <Pressable
      onPress={() => onPress(user.id)}
      accessibilityRole="button"
      accessibilityLabel={`${user.nickname} 프로필 열기`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}
    >
      <Avatar uri={null} size={44} ring={1.5} ringColor={c.border} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }} numberOfLines={1}>{user.nickname}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Ionicons name={meta.icon as never} size={10} color={meta.accent} />
            <Text style={{ color: meta.accent, fontSize: 10.5, fontWeight: '800', fontFamily: fontMono }}>{meta.label}</Text>
          </View>
        </View>
        {user.org ? <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 2, fontFamily: fontBody }} numberOfLines={1}>{user.org}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.primary} />
    </Pressable>
  );
});
