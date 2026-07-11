import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryColor } from '../../src/constants/categories';
import { useQnaStore, type Answer } from '../../src/store/qnaStore';
import { useAuthStore } from '../../src/store/authStore';
import { timeAgoLabel } from '../../src/store/notificationStore';
import { isMeaningful } from '../../src/utils/sanitize';

export default function QnaDetailScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { id } = useLocalSearchParams<{ id: string }>();
  const question = useQnaStore((s) => s.questions.find((q) => q.id === id));
  const addAnswer = useQnaStore((s) => s.addAnswer);
  const toggleQLike = useQnaStore((s) => s.toggleQuestionLike);
  const toggleALike = useQnaStore((s) => s.toggleAnswerLike);
  const author = useAuthStore((s) => s.user?.name) ?? '나';
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  if (!question) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="질문" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontBody }}>질문을 찾을 수 없어요</Text>
        </View>
      </View>
    );
  }

  const accent = question.category ? getCategoryColor(question.category) ?? c.primary : c.primary;
  const canSend = isMeaningful(draft, 3);
  const submit = () => { if (!canSend) return; addAnswer(question.id, draft, author); setDraft(''); setFocused(false); };
  const sorted = [...question.answers].sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.likes - a.likes);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="질문 & 답변" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 질문 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            {question.category && (
              <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: accent, fontSize: 11, fontFamily: fontDisplay }}>{question.category}</Text>
              </View>
            )}
            <View style={[styles.avatar, { backgroundColor: question.color }]}><Text style={styles.avatarText}>{question.author.charAt(0)}</Text></View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>{question.author} · {timeAgoLabel(question.minutesAgo)}</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 18 * fs, lineHeight: 26, fontFamily: fontDisplay }}>{question.title}</Text>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, lineHeight: 22, marginTop: 10, fontFamily: fontBody }}>{question.body}</Text>
          <Pressable onPress={() => toggleQLike(question.id)} style={[styles.likeBtn, { borderColor: question.likedByMe ? c.error : c.border, backgroundColor: question.likedByMe ? c.error + '12' : 'transparent' }]}>
            <Ionicons name={question.likedByMe ? 'heart' : 'heart-outline'} size={15} color={question.likedByMe ? c.error : c.textSecondary} />
            <Text style={{ color: question.likedByMe ? c.error : c.textSecondary, fontSize: 12.5, fontFamily: fontDisplay }}>공감 {question.likes}</Text>
          </Pressable>

          {/* 답변 */}
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontDisplay, marginBottom: 12 }}>답변 {question.answers.length}</Text>
          {sorted.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 8, fontFamily: fontBody }}>첫 답변을 남겨보세요!</Text>
            </View>
          ) : sorted.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(Math.min(i, 5) * 40).duration(280)}>
              <AnswerRow answer={a} onLike={() => toggleALike(question.id, a.id)} />
            </Animated.View>
          ))}
        </ScrollView>

        {/* 답변 입력 */}
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.inputRow, { backgroundColor: c.surfaceAlt, borderColor: focused ? c.primary : c.border }]}>
            <TextInput
              value={draft} onChangeText={setDraft} onFocus={() => setFocused(true)}
              placeholder="답변을 입력하세요" placeholderTextColor={c.textSecondary}
              style={{ flex: 1, color: c.textPrimary, fontSize: 13.5, fontFamily: fontBody, paddingVertical: 4, maxHeight: 90 }}
              multiline maxLength={1050}
            />
            <Pressable onPress={submit} disabled={!canSend} style={[styles.sendBtn, { backgroundColor: canSend ? c.primary : c.disabled }]}>
              <Ionicons name="arrow-up" size={17} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AnswerRow({ answer: a, onLike }: { answer: Answer; onLike: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.answer, { backgroundColor: c.surface, borderColor: a.accepted ? c.success + '55' : c.border }]}>
      {a.accepted && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Ionicons name="checkmark-circle" size={14} color={c.success} />
          <Text style={{ color: c.success, fontSize: 11.5, fontFamily: fontDisplay }}>채택된 답변</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <View style={[styles.avatar, { backgroundColor: a.color }]}><Text style={styles.avatarText}>{a.author.charAt(0)}</Text></View>
        <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay }}>{a.author}</Text>
        {a.mine && <View style={{ backgroundColor: c.primary + '1A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: c.primary, fontSize: 9.5, fontFamily: fontDisplay }}>나</Text></View>}
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>{timeAgoLabel(a.minutesAgo)}</Text>
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 13.5, lineHeight: 20, fontFamily: fontBody }}>{a.body}</Text>
      <Pressable onPress={onLike} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}>
        <Ionicons name={a.likedByMe ? 'heart' : 'heart-outline'} size={14} color={a.likedByMe ? c.error : c.textSecondary} />
        <Text style={{ color: a.likedByMe ? c.error : c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{a.likes}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10.5, fontFamily: fontDisplay },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 14 },
  divider: { height: 1, marginVertical: 18 },
  answer: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  inputBar: { borderTopWidth: 1, padding: 12, paddingBottom: 26 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
