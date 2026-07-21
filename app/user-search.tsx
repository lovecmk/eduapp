import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Avatar } from '../src/components/ui/Avatar';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { MEMBERSHIP_META } from '../src/domain/models/User';
import { useUserSearch } from '../src/hooks/useUserDirectory';
import { ROUTES } from '../src/constants/routes';

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

  const { data: results = [], isFetching } = useUserSearch(query);
  const showEmpty = query.trim().length >= 1 && !isFetching && results.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="친구 찾기" />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: c.border }}>
          <Ionicons name="search" size={18} color={c.textSecondary} />
          <TextInput
            value={raw}
            onChangeText={setRaw}
            placeholder="닉네임으로 검색"
            placeholderTextColor={c.textSecondary}
            autoFocus
            style={{ flex: 1, color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontBody }}
          />
          {raw.length > 0 && (
            <Pressable onPress={() => setRaw('')} hitSlop={8}>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const meta = MEMBERSHIP_META[item.membership];
          return (
            <Pressable
              onPress={() => router.push(ROUTES.publicProfile(item.id) as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}
            >
              <Avatar uri={null} size={44} ring={1.5} ringColor={c.border} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }} numberOfLines={1}>{item.nickname}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Ionicons name={meta.icon as never} size={10} color={meta.accent} />
                    <Text style={{ color: meta.accent, fontSize: 10.5, fontWeight: '800', fontFamily: fontMono }}>{meta.label}</Text>
                  </View>
                </View>
                {item.org ? <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 2, fontFamily: fontBody }} numberOfLines={1}>{item.org}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.primary} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
