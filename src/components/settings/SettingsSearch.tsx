import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute, fontBody } from '../../theme/tokens';
import { hapticSelection } from '../../utils/haptics';
import { normalize } from '../../utils/koreanSearch';
import { searchSettings } from '../../utils/settingsSearch';
import { SETTINGS_BY_ID, type SettingsEntry } from '../../constants/settingsIndex';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * 설정 전역 검색 — 메뉴 depth 와 무관하게 모든 설정 항목을 이름 · 설명 · 동의어 · 초성으로 찾는다.
 *
 * 구조를 외우지 않아도 되게 하는 것이 목적이라, 다른 화면에 있는 항목
 * (공개 범위 · 약관 · 알림함 등)도 같은 목록에서 함께 검색되고 바로 이동한다.
 *
 * 검색바와 결과를 분리해 둔 이유: 결과는 본문 위에 '덮어서' 보여주고 본문은 계속 마운트해 둬야
 * 검색 결과를 골랐을 때 그 자리로 정확히 스크롤·하이라이트할 수 있다(레이아웃이 유지되므로).
 */

export interface SettingsSearchState {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  results: SettingsEntry[];
  inputRef: React.RefObject<TextInput>;
}

export function useSettingsSearch(collectionEnabled: boolean): SettingsSearchState {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const results = useMemo(() => searchSettings(query, { collectionEnabled }), [query, collectionEnabled]);
  return { query, setQuery, searching: normalize(query).length > 0, results, inputRef };
}

/** 상단 고정 검색바 + '최근 본 설정' 바로가기. */
export function SettingsSearchBar({
  search,
  onSelect,
  collectionEnabled,
}: {
  search: SettingsSearchState;
  onSelect: (entry: SettingsEntry) => void;
  collectionEnabled: boolean;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const recentIds = useSettingsStore((s) => s.recentSettingIds);

  const recents = useMemo(
    () => recentIds
      .map((id) => SETTINGS_BY_ID[id])
      .filter((e): e is SettingsEntry => !!e)
      .filter((e) => e.requires !== 'collectionEnabled' || collectionEnabled),
    [recentIds, collectionEnabled],
  );

  return (
    <View>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 13, height: 46,
          borderWidth: 1.5, borderColor: focused ? c.primary : c.border,
        }}
      >
        <Ionicons name="search" size={18} color={focused ? c.primary : c.textSecondary} />
        <TextInput
          ref={search.inputRef}
          value={search.query}
          onChangeText={search.setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="설정 검색 (예: 다크모드, ㄱㅈㅋㄱ)"
          placeholderTextColor={c.disabled}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="설정 검색"
          style={[
            { flex: 1, color: c.textPrimary, fontSize: 14.5 * fs, fontFamily: fontCute, paddingVertical: 0 },
            // 웹에서 브라우저 기본 포커스 링이 컨테이너 테두리와 겹쳐 이중 사각형으로 보이는 것을 없앤다.
            // (포커스 표시는 컨테이너 테두리 색 변화로 이미 명확하다.)
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {search.query.length > 0 && (
          <Pressable onPress={() => search.setQuery('')} hitSlop={8} accessibilityLabel="검색어 지우기">
            <Ionicons name="close-circle" size={18} color={c.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* 최근 본 설정 — 자주 오가는 항목을 다시 찾아 들어가는 수고를 없앤다. */}
      {!search.searching && recents.length > 0 && (
        <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 9 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 4, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 2 }}>
              <Ionicons name="time-outline" size={13} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontCute }}>최근</Text>
            </View>
            {recents.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => { hapticSelection(); onSelect(entry); }}
                accessibilityRole="button"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: c.surfaceAlt, borderRadius: 999,
                  paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: c.border,
                }}
              >
                <Ionicons name={entry.icon} size={12.5} color={c.primary} />
                <Text style={{ color: c.textPrimary, fontSize: 12 * fs, fontFamily: fontCute }} numberOfLines={1}>
                  {entry.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

/** 검색 결과 목록 — 본문 위에 덮어 보여준다(검색 중에는 결과에만 집중). */
export function SettingsSearchResults({
  search,
  onSelect,
}: {
  search: SettingsSearchState;
  onSelect: (entry: SettingsEntry) => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { results, query } = search;

  const pick = (entry: SettingsEntry) => {
    hapticSelection();
    search.inputRef.current?.blur();
    search.setQuery('');
    onSelect(entry);
  };

  if (results.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 44, paddingHorizontal: 30, gap: 8 }}>
        <Ionicons name="search-outline" size={30} color={c.disabled} />
        <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontFamily: fontCute, textAlign: 'center' }}>
          “{query.trim()}” 검색 결과가 없어요
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, textAlign: 'center', lineHeight: 19 }}>
          다른 이름으로 찾아보거나, 검색어를 지우고 목록에서 둘러보세요.{'\n'}필요한 설정이 없다면 고객센터로 알려주세요.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontCute, marginBottom: 7, marginLeft: 4 }}>
        {results.length}개 항목
      </Text>
      <View style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
        {results.map((entry, i) => (
          <Pressable
            key={entry.id}
            onPress={() => pick(entry)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.breadcrumb.join(' ')} ${entry.label}`}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 14, paddingVertical: 12,
              backgroundColor: pressed ? c.surfaceAlt : 'transparent',
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border,
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={entry.icon} size={16} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontWeight: '600', fontFamily: fontCute }} numberOfLines={1}>
                {entry.label}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 2 }} numberOfLines={1}>
                {entry.breadcrumb.join(' › ')}
                {entry.description ? ` · ${entry.description}` : ''}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={c.textSecondary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
