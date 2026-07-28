import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Switch } from '../src/components/ui/Switch';
import { fontDisplay, fontBody, fontMono, fontCute } from '../src/theme/tokens';
import { useSettingsStore } from '../src/store/settingsStore';
import { useAuthoredCardsStore } from '../src/store/authoredCardsStore';
import { mockUserDb } from '../src/data/auth/mockUserDb';
import { PACK_RULES } from '../src/data/packRules';
import { COLLECTIBLES } from '../src/data/collectibles';
import { MEMBERSHIP_META, type User } from '../src/domain/models/User';
import { ROUTES } from '../src/constants/routes';
import { env } from '../src/data/network/env';

type Tab = 'overview' | 'users' | 'rules' | 'cards' | 'flags';
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: '개요', icon: 'grid-outline' },
  { key: 'users', label: '사용자', icon: 'people-outline' },
  { key: 'rules', label: '카드팩 규칙', icon: 'gift-outline' },
  { key: 'cards', label: '등록 카드', icon: 'documents-outline' },
  { key: 'flags', label: '기능 플래그', icon: 'flag-outline' },
];

/**
 * 관리 콘솔(웹 우선) — 목업 데이터 계층을 웹에서 열람/제어한다.
 * 실서버 전환 시 각 섹션은 관리 API로 대체된다(사용자/규칙/카드/플래그).
 */
export default function AdminScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="관리 콘솔" />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 720 }}>
          {/* 탭 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable accessibilityRole="button" key={t.key} onPress={() => setTab(t.key)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? c.primary : c.surface, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
                  <Ionicons name={t.icon} size={14} color={active ? '#fff' : c.textSecondary} />
                  <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 13, fontFamily: fontDisplay }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'users' && <UsersTab />}
            {tab === 'rules' && <RulesTab />}
            {tab === 'cards' && <CardsTab />}
            {tab === 'flags' && <FlagsTab />}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontDisplay, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

function OverviewTab() {
  const { theme } = useTheme();
  const c = theme.colors;
  const authored = useAuthoredCardsStore((s) => s.cards);
  const [userCount, setUserCount] = useState(0);
  useEffect(() => { mockUserDb.listUsers().then((u) => setUserCount(u.length)); }, []);

  const stats = [
    { icon: 'people', color: '#2563EB', value: `${userCount}`, label: '가입 사용자' },
    { icon: 'documents', color: '#0EA5E9', value: `${authored.length}`, label: '등록 카드' },
    { icon: 'albums', color: '#A855F7', value: `${COLLECTIBLES.length}`, label: '수집 카드' },
    { icon: 'gift', color: '#F59E0B', value: `${PACK_RULES.length}`, label: '팩 규칙' },
  ] as const;

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        {stats.map((s) => (
          <View key={s.label} style={{ flexGrow: 1, minWidth: 150, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: s.color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Ionicons name={s.icon as never} size={19} color={s.color} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 24, fontFamily: fontMono, fontWeight: '900' }}>{s.value}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody, marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Section title="시스템 상태">
        <Row label="데이터 소스" value={env.useMockData ? 'Mock (로컬)' : 'API 서버'} />
        <Row label="앱 버전" value={`v${env.build.version}`} />
        <Row label="관리 콘솔" value="웹 우선 · 목업 데이터 제어" last />
      </Section>
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textSecondary, fontSize: 13, fontFamily: fontBody }}>{label}</Text>
      <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontMono }}>{value}</Text>
    </View>
  );
}

function UsersTab() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { mockUserDb.listUsers().then(setUsers); }, []);
  return (
    <Section title={`가입 사용자 ${users.length}명`}>
      {users.map((u) => {
        const meta = MEMBERSHIP_META[u.membership];
        return (
          <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={meta.icon as never} size={16} color={meta.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 13.5, fontFamily: fontDisplay }}>{u.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>{u.email}{u.org ? ` · ${u.org}` : ''}</Text>
            </View>
            <Text style={{ color: meta.accent, fontSize: 11, fontFamily: fontCute, fontWeight: '800' }}>{meta.label}</Text>
          </View>
        );
      })}
    </Section>
  );
}

function RulesTab() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Section title={`카드팩 획득 규칙 ${PACK_RULES.length}개`}>
      {PACK_RULES.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: r.color + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={r.icon} size={17} color={r.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 13.5, fontFamily: fontDisplay }}>{r.title}{r.repeatable ? ' · 반복' : ''}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>{r.desc} · 목표 {r.target}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="albums" size={13} color={r.color} />
            <Text style={{ color: r.color, fontSize: 13, fontFamily: fontMono, fontWeight: '800' }}>{r.reward}</Text>
          </View>
        </View>
      ))}
      <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody, marginTop: 10 }}>
        규칙 수치는 회의 확정 후 서버(관리 API)에서 조정하도록 설계되었어요.
      </Text>
    </Section>
  );
}

function CardsTab() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const authored = useAuthoredCardsStore((s) => s.cards);
  const removeCard = useAuthoredCardsStore((s) => s.removeCard);
  return (
    <Section title={`관리자 등록 카드 ${authored.length}개`}>
      <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.authorCard as never)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 12, paddingVertical: 11, marginBottom: 12 }}>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 13.5, fontFamily: fontCute, fontWeight: '800' }}>새 카드 등록 / 일괄 등록</Text>
      </Pressable>
      {authored.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 12.5, fontFamily: fontBody, textAlign: 'center', paddingVertical: 12 }}>아직 등록한 카드가 없어요</Text>
      ) : authored.map((card) => (
        <View key={card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontDisplay }}>{card.title}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>{card.category} · {card.subCategory}</Text>
          </View>
          <Pressable onPress={() => removeCard(card.id)} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel="이 문제 삭제">
            <Ionicons name="trash-outline" size={17} color={c.error} />
          </Pressable>
        </View>
      ))}
    </Section>
  );
}

function FlagsTab() {
  const s = useSettingsStore();
  return (
    <Section title="기능 플래그">
      <FlagRow label="카드 수집·카드팩" desc="컬렉션/카드팩 시스템 노출" value={s.collectionEnabled} onToggle={s.toggleCollectionEnabled} />
      <FlagRow label="자랑(플렉스) 유도" desc="목표 달성 시 자랑 제안" value={s.flexPromptEnabled} onToggle={s.toggleFlexPrompt} />
      <FlagRow label="성취 뱃지" desc="닉네임 옆 뱃지 표출" value={s.showAchievementBadge} onToggle={s.toggleAchievementBadge} last />
    </Section>
  );
}

function FlagRow({ label, desc, value, onToggle, last }: { label: string; desc: string; value: boolean; onToggle: () => void; last?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: c.textPrimary, fontSize: 13.5, fontFamily: fontDisplay }}>{label}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>{desc}</Text>
      </View>
      <Switch label={label} value={value} onValueChange={onToggle} />
    </View>
  );
}
