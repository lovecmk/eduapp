import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SupportModal } from '../src/components/settings/SupportModal';
import { ChangelogModal } from '../src/components/settings/ChangelogModal';
import { fontDisplay, fontBody } from '../src/theme/tokens';
import { useAuthStore } from '../src/store/authStore';
import { useReportStore } from '../src/store/reportStore';
import { ROUTES } from '../src/constants/routes';
import { contentColumn } from '../src/theme/layout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ = [
  { q: '문제 내용이 이상하거나 틀린 것 같아요.', a: '카드 상세 화면 우측 상단의 "수정" 버튼을 눌러 사유와 함께 요청해주세요. 검토 후 콘텐츠에 반영됩니다.' },
  { q: '카드를 저장해두고 싶어요.', a: '카드 상세 우측 상단의 북마크(🔖)를 누르면 MY > "저장한 카드"에 모여요.' },
  { q: '복습은 어떤 기준으로 뜨나요?', a: '망각곡선 기반 간격 반복(SRS)으로 자동 스케줄됩니다. 회상 난이도(다시/어려움/보통/쉬움)에 따라 다음 복습 시점이 조정돼요.' },
  { q: '특정 알림만 끄고 싶어요.', a: '알림함에서 "이런 알림 끄기"로 종류별로 관리할 수 있어요. 전체를 끄려면 설정 > 알림 > "알림 받기"를 꺼주세요. 설정 검색창에 "알림"을 입력하면 바로 찾을 수 있어요.' },
];

export default function SupportScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const reportCount = useReportStore((s) => s.reports.length);
  const [supportOpen, setSupportOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenFaq(openFaq === i ? null : i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="고객센터" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, ...contentColumn }} showsVerticalScrollIndicator={false}>
        {/* 문의하기 CTA */}
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <Ionicons name="headset" size={26} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 17 * fs, fontFamily: fontDisplay, marginTop: 10 }}>무엇을 도와드릴까요?</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 * fs, marginTop: 4, textAlign: 'center', lineHeight: 18, fontFamily: fontBody }}>
            궁금한 점이나 운영진에게 전할 내용을{'\n'}언제든 남겨주세요
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setSupportOpen(true)} style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11, marginTop: 16 }}>
            <Text style={{ color: c.primary, fontSize: 13.5 * fs, fontFamily: fontDisplay }}>운영진에게 문의하기</Text>
          </Pressable>
        </View>

        {/* 바로가기 */}
        <Text style={[styles.section, { color: c.textSecondary }]}>바로가기</Text>
        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="sparkles-outline" label="공지사항 · 업데이트 내역" onPress={() => setChangelogOpen(true)} />
          <Divider />
          <Row icon="flag-outline" label="카드 내용 수정 요청 안내" desc={reportCount > 0 ? `내 요청 ${reportCount}건 접수됨` : '카드 상세 우측 상단 "수정"'} />
          <Divider />
          {/* 약관·처리방침은 앱 안의 /legal 한 화면에서 모두 본다(외부 링크 이탈 없이). */}
          <Row icon="document-text-outline" label="이용약관 · 개인정보 처리방침" onPress={() => router.push(ROUTES.legal as never)} />
        </View>

        {/* FAQ */}
        <Text style={[styles.section, { color: c.textSecondary }]}>자주 묻는 질문</Text>
        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
          {FAQ.map((item, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <Pressable accessibilityRole="button" onPress={() => toggleFaq(i)} style={styles.faqHead}>
                <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, flex: 1, fontFamily: fontDisplay }}>{item.q}</Text>
                <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSecondary} />
              </Pressable>
              {openFaq === i && (
                <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14, fontFamily: fontBody }}>{item.a}</Text>
              )}
            </View>
          ))}
        </View>

        <Text style={{ color: c.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 20, fontFamily: fontBody }}>
          평일 09:00~18:00 · 영업일 기준 24시간 내 답변
        </Text>
      </ScrollView>

      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} defaultEmail={user?.email} />
      <ChangelogModal visible={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </View>
  );
}

function Row({ icon, label, desc, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; desc?: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: c.primary + '14' }]}><Ionicons name={icon} size={17} color={c.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontDisplay }}>{label}</Text>
        {desc && <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 2, fontFamily: fontBody }}>{desc}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={17} color={c.textSecondary} />}
    </Pressable>
  );
}

function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginLeft: 58 }} />;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 8 },
  section: { fontSize: 12, fontFamily: fontDisplay, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 10, marginLeft: 4 },
  group: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 14 },
});
