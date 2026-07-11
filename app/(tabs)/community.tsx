import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { LivePresenceCard } from '../../src/components/community/LivePresenceCard';
import { WeeklyChallengeCard } from '../../src/components/community/WeeklyChallengeCard';
import { CommunityBuildCard } from '../../src/components/community/CommunityBuildCard';
import { QuestionComposeModal } from '../../src/components/community/QuestionComposeModal';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryColor } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useQnaStore, type Question } from '../../src/store/qnaStore';
import { timeAgoLabel } from '../../src/store/notificationStore';

export default function CommunityScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const questions = useQnaStore((s) => s.questions);
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        {/* 함께 학습 */}
        <LivePresenceCard />
        <WeeklyChallengeCard />
        <CommunityBuildCard />

        {/* 질문 & 답변 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbox-ellipses" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>질문 & 답변</Text>
          </View>
          <Pressable onPress={() => setComposeOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5, fontFamily: fontDisplay }}>질문하기</Text>
          </Pressable>
        </View>

        {questions.map((q, i) => (
          <Animated.View key={q.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(300)}>
            <QuestionRow question={q} onPress={() => router.push(ROUTES.qna(q.id) as never)} />
          </Animated.View>
        ))}
      </ScrollView>

      <QuestionComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} onCreated={(id) => router.push(ROUTES.qna(id) as never)} />
    </View>
  );
}

function QuestionRow({ question: q, onPress }: { question: Question; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = q.category ? getCategoryColor(q.category) ?? c.primary : c.primary;
  const solved = q.answers.some((a) => a.accepted);
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {q.category && (
          <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: accent, fontSize: 10.5, fontFamily: fontDisplay }}>{q.category}</Text>
          </View>
        )}
        {solved && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.success + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Ionicons name="checkmark-circle" size={11} color={c.success} />
            <Text style={{ color: c.success, fontSize: 10, fontFamily: fontDisplay }}>해결됨</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 14.5, lineHeight: 20, fontFamily: fontDisplay }}>{q.title}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 4, fontFamily: fontBody }}>{q.body}</Text>
      <View style={styles.meta}>
        <View style={[styles.avatar, { backgroundColor: q.color }]}><Text style={styles.avatarText}>{q.author.charAt(0)}</Text></View>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{q.author}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>· {timeAgoLabel(q.minutesAgo)}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.stat}><Ionicons name="chatbubble-outline" size={13} color={q.answers.length ? c.primary : c.textSecondary} /><Text style={{ color: q.answers.length ? c.primary : c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{q.answers.length}</Text></View>
        <View style={styles.stat}><Ionicons name="heart-outline" size={13} color={c.textSecondary} /><Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{q.likes}</Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  avatar: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontFamily: fontDisplay },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
});
