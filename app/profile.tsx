import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useCollectionStore } from '../src/store/collectionStore';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Avatar } from '../src/components/ui/Avatar';
import { AchievementBadge, useTopBadgeTier } from '../src/components/ui/AchievementBadge';
import { fontCute, fontMono, fontBody, fontDisplay } from '../src/theme/tokens';
import { MEMBERSHIP_META, displayName } from '../src/domain/models/User';
import { RARITY_META } from '../src/utils/rarity';
import { COLLECTIBLE_BY_ID } from '../src/data/collectibles';
import { useAllCards } from '../src/hooks/useCards';
import { ROUTES } from '../src/constants/routes';
import { contentColumn } from '../src/theme/layout';

const BIO_MAX = 60;

export default function ProfileScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { profileImage, setProfileImage, bio, setBio } = useSettingsStore();
  const owned = useCollectionStore((s) => s.owned);
  const { data: allCards = [] } = useAllCards();

  const [draft, setDraft] = useState(bio);
  const [editing, setEditing] = useState(false);
  const topTier = useTopBadgeTier();

  const uniqueOwned = useMemo(() => Object.values(owned).filter(Boolean).length, [owned]);
  const masteredCount = useMemo(() => allCards.filter((k) => k.status === 'mastered').length, [allCards]);
  // 보유한 최고 등급 카드 이름(자랑거리) — 있으면 소개 아래 배지로 노출.
  const topCardName = useMemo(() => {
    let best: { name: string; power: number } | null = null;
    for (const id of Object.keys(owned)) {
      if (!owned[id]) continue;
      const col = COLLECTIBLE_BY_ID[id];
      if (col && col.rarity === topTier && (!best || col.power > best.power)) best = { name: col.name, power: col.power };
    }
    return best?.name ?? null;
  }, [owned, topTier]);

  const pickImage = async () => {
    if (Platform.OS === 'web') { Alert.alert('안내', '프로필 사진 변경은 앱에서 가능합니다'); return; }
    // 갤러리 호출은 기기 상태에 따라 예외를 던진다(권한 창 취소, 사진 앱 없음 등).
    // 감싸지 않으면 아바타를 눌러도 아무 반응이 없어 고장난 것처럼 보인다.
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setProfileImage(result.assets[0].uri);
    } catch {
      Alert.alert('사진을 불러오지 못했어요', '잠시 후 다시 시도해주세요');
    }
  };

  const saveBio = () => { setBio(draft.trim()); setEditing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader
        title="내 프로필"
        right={
          <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.editProfile as never)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}>
            <Ionicons name="create-outline" size={18} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700', fontFamily: fontCute }}>수정</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, ...contentColumn }} showsVerticalScrollIndicator={false}>
        {/* 프로필 헤더 — 큰 아바타 + 이름 + 성취 뱃지 */}
        <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
          <Pressable onPress={pickImage} style={{ marginBottom: 14 }} accessibilityRole="button" accessibilityLabel="프로필 사진 변경">
            <Avatar uri={profileImage} size={96} ring={3} ringColor={c.primary} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg }}>
              <Ionicons name="camera" size={15} color="#fff" />
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>{displayName(user)}</Text>
            <AchievementBadge size={20} />
          </View>
          {user?.loginId ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 3, fontFamily: fontMono }}>@{user.loginId}</Text>
          ) : null}

          {user ? (() => {
            const meta = MEMBERSHIP_META[user.membership];
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: meta.accent + '1A', borderColor: meta.accent + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 }}>
                <Ionicons name={meta.icon as never} size={12} color={meta.accent} />
                <Text style={{ color: meta.accent, fontSize: 12, fontWeight: '800', fontFamily: fontCute }}>{meta.label}</Text>
                {user.org ? <Text style={{ color: meta.accent, fontSize: 12, fontFamily: fontBody }}>· {user.org}</Text> : null}
              </View>
            );
          })() : null}

          {topTier && topCardName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ fontSize: 13 }}>🏅</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>
                대표 카드 · <Text style={{ color: c.textPrimary, fontWeight: '800' }}>{RARITY_META[topTier].label} {topCardName}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* 한 줄 소개(bio) */}
        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>한 줄 소개</Text>
            </View>
            {!editing && (
              <Pressable accessibilityRole="button" onPress={() => { setDraft(bio); setEditing(true); }} hitSlop={8}>
                <Text style={{ color: c.primary, fontSize: 13, fontFamily: fontCute, fontWeight: '700' }}>{bio ? '수정' : '추가'}</Text>
              </Pressable>
            )}
          </View>

          {editing ? (
            <View>
              <TextInput
                accessibilityLabel="한 줄 소개"
                value={draft}
                onChangeText={(t) => setDraft(t.slice(0, BIO_MAX))}
                placeholder="예) 안전은 습관입니다 💪 매일 3분씩 성장 중!"
                placeholderTextColor={c.textSecondary}
                multiline
                autoFocus
                style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontBody, minHeight: 44, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, textAlignVertical: 'top' }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{draft.length}/{BIO_MAX}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.textSecondary, fontSize: 13, fontFamily: fontCute }}>취소</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={saveBio} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: c.primary }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontFamily: fontCute, fontWeight: '700' }}>저장</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <Text style={{ color: bio ? c.textPrimary : c.textSecondary, fontSize: 14 * fs, fontFamily: fontBody, lineHeight: 21 }}>
              {bio || '아직 소개가 없어요. 나를 한 줄로 표현해보세요!'}
            </Text>
          )}
        </View>

        {/* 성취 요약 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {[
            { value: `${uniqueOwned}`, label: '수집 카드', route: ROUTES.collectionBook },
            { value: `${masteredCount}`, label: '마스터', route: ROUTES.stats },
            { value: `${allCards.length}`, label: '전체 카드', route: ROUTES.stats },
          ].map((s) => (
            <Pressable accessibilityRole="button" key={s.label} onPress={() => router.push(s.route as never)} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
              <Text style={{ color: c.primary, fontSize: 20 * fs, fontWeight: '900', fontFamily: fontMono }}>{s.value}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4, fontFamily: fontCute }}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 바로가기 */}
        <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.trophy as never)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="trophy-outline" size={20} color={c.textPrimary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontCute }}>내 트로피룸</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.primary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}
