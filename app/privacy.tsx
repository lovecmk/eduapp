import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Switch } from '../src/components/ui/Switch';
import { SettingsGroup, SettingsItem } from '../src/components/ui/SettingsGroup';
import { fontBody } from '../src/theme/tokens';
import { useSettingsStore } from '../src/store/settingsStore';

export default function PrivacyScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const visibility = useSettingsStore((s) => s.profileVisibility);
  const toggle = useSettingsStore((s) => s.toggleVisibility);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="프로필 공개 범위" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 19 * fs, marginBottom: 12, fontFamily: fontBody }}>
          다른 점검자가 내 프로필을 봤을 때 어디까지 보여줄지 정할 수 있어요. 끈 항목은 상대에게 보이지 않아요.
        </Text>

        <SettingsGroup title="검색">
          <SettingsItem
            icon="search-outline"
            label="닉네임 검색 허용"
            description="끄면 다른 사람이 나를 검색할 수 없어요"
            right={<Switch value={visibility.searchable} onValueChange={() => toggle('searchable')} />}
          />
        </SettingsGroup>

        <SettingsGroup title="공개 항목">
          <SettingsItem
            icon="book-outline"
            label="누적 학습 · 완료율"
            description="지금까지의 학습량과 완료율"
            right={<Switch value={visibility.showProgress} onValueChange={() => toggle('showProgress')} />}
          />
          <SettingsItem
            icon="flame-outline"
            label="연속 학습(스트릭)"
            description="며칠 연속으로 학습했는지"
            right={<Switch value={visibility.showStreak} onValueChange={() => toggle('showStreak')} />}
          />
          <SettingsItem
            icon="ribbon-outline"
            label="엠블럼"
            description="분야별 실력 등급 뱃지"
            right={<Switch value={visibility.showEmblems} onValueChange={() => toggle('showEmblems')} />}
          />
          <SettingsItem
            icon="albums-outline"
            label="안전 카드 컬렉션 수"
            description="모은 수집 카드 개수"
            right={<Switch value={visibility.showCollection} onValueChange={() => toggle('showCollection')} />}
          />
        </SettingsGroup>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, paddingHorizontal: 4 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 17 * fs, flex: 1, fontFamily: fontBody }}>
            닉네임 · 소속 · 소개글은 기본 정보로 항상 공개돼요. 언제든 이 화면에서 공개 범위를 바꿀 수 있어요.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
