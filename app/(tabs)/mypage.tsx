import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert, Platform, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Button } from '../../src/components/ui/Button';
import { fontMono, fontCute } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { MEMBERSHIP_META } from '../../src/domain/models/User';

export default function MyPageScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: allCards = [] } = useAllCards();
  const { profileImage, setProfileImage } = useSettingsStore();
  const [linkModal, setLinkModal] = React.useState(false);

  const masteredCount = useMemo(() => allCards.filter((c) => c.status === 'mastered').length, [allCards]);

  const pickImage = async () => {
    if (Platform.OS === 'web') return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Pressable onPress={pickImage} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: c.primary }} />
        ) : (
          <View
            style={{
              width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 3px 10px ${c.primary}66`,
            }}
          >
            <Text style={{ color: c.textOnPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>
              {user?.name?.charAt(0) ?? '현'}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '800', fontFamily: fontCute }} numberOfLines={1}>{user?.name ?? '현장 작업자'}</Text>
            {user ? (() => {
              const meta = MEMBERSHIP_META[user.membership];
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderColor: meta.accent + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Ionicons name={meta.icon as never} size={11} color={meta.accent} />
                  <Text style={{ color: meta.accent, fontSize: 11, fontWeight: '800', fontFamily: fontCute }}>{meta.label}</Text>
                </View>
              );
            })() : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>탭하여 프로필 사진 변경</Text>
            <Pressable onPress={() => setLinkModal(true)} style={{ backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fontCute }}>닉네임</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 16 }}>
        {[
          { value: `${allCards.length}`, label: '전체 카드' },
          { value: `${masteredCount}`, label: '마스터' },
          { value: `${Math.round((masteredCount / Math.max(allCards.length, 1)) * 100)}%`, label: '완료율' },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.primary, fontSize: 22 * fs, fontWeight: '900', fontFamily: fontMono }}>{s.value}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4, fontFamily: fontCute }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push(ROUTES.settings)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="settings-outline" size={20} color={c.textPrimary} />
          <View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>설정</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>알림, 테마, 계정 관리</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
      </Pressable>
      </ScrollView>

      <Modal visible={linkModal} transparent animationType="fade" onRequestClose={() => setLinkModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setLinkModal(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 20, padding: 24, marginHorizontal: 32, width: '80%', maxWidth: 320, borderWidth: 1, borderColor: c.border }}>
            <Ionicons name="create-outline" size={28} color={c.primary} style={{ textAlign: 'center', marginBottom: 8, alignSelf: 'center' }} />
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', textAlign: 'center', marginBottom: 8, fontFamily: fontCute }}>닉네임 변경</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontCute }}>
              닉네임 변경은{'\n'}브릿지 웹사이트에서 가능합니다
            </Text>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 10, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600', fontFamily: fontMono }}>bridge.kfpa.or.kr</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="취소" variant="outline" onPress={() => setLinkModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="이동하기" variant="filled" onPress={() => { Linking.openURL('https://bridge.kfpa.or.kr/'); setLinkModal(false); }} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
