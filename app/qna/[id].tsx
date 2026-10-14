import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryColor } from '../../src/constants/categories';
import { minutesSince, type Answer } from '../../src/domain/models/Qna';
import { timeAgoLabel } from '../../src/store/notificationStore';
import {
  cleanAnswerBody,
  useAnswerLike,
  useAnswerQuestion,
  useQuestion,
  useQuestionLike,
} from '../../src/hooks/useQna';
import { toast } from '../../src/store/toastStore';
import { errorMessage } from '../../src/data/network/errors';

export default function QnaDetailScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: question, isLoading, error, refetch } = useQuestion(id);
  const answerMutation = useAnswerQuestion(id ?? '');
  const questionLike = useQuestionLike();
  const answerLike = useAnswerLike(id ?? '');
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  if (!question) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="질문" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontBody }}>
            {isLoading ? '질문을 불러오는 중이에요' : error ? errorMessage(error) : '질문을 찾을 수 없어요'}
          </Text>
          {!!error && <Pressable accessibilityRole="button" onPress={() => void refetch()} style={{ padding: 16 }}><Text style={{ color: c.primary }}>다시 시도</Text></Pressable>}
        </View>
      </View>
    );
  }

  const accent = question.category ? getCategoryColor(question.category) ?? c.primary : c.primary;
  const cleaned = cleanAnswerBody(draft);
  // 전송 중에는 버튼을 잠근다 — 두 번 누르면 같은 답변이 두 개 올라간다.
  const canSend = !!cleaned && !answerMutation.isPending;
  const submit = () => {
    if (!cleaned || answerMutation.isPending) return;
    const sentDraft = draft;
    answerMutation.mutate(cleaned, {
      onSuccess: () => {
        // 기다리는 사이 새 내용을 적었다면 그것까지 지우지 않는다.
        setDraft((current) => current === sentDraft ? '' : current);
        setFocused(false);
        toast('답변을 올렸어요', 'success');
      },
      onError: (error) => toast(errorMessage(error) + ' 답변을 유지했으니 다시 보내주세요.', 'warn', 4000),
    });
  };
  const sorted = [...question.answers].sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.likes - a.likes);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="질문 & 답변" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 여기서도 알린다 — 목록만 보고 들어온 사람은 커뮤니티 화면의 안내를 놓친다.
              답변을 쓰기 직전이라, '이 답변이 누구에게 가는가'는 여기서 더 중요하다. */}

          {/* 질문 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            {question.category && (
              <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: accent, fontSize: 11 * fs, fontFamily: fontDisplay }}>{question.category}</Text>
              </View>
            )}
            <View style={[styles.avatar, { backgroundColor: question.color }]}><Text style={styles.avatarText}>{question.author.charAt(0)}</Text></View>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody }}>{question.author} · {timeAgoLabel(minutesSince(question.createdAt))}</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 18 * fs, lineHeight: 26 * fs, fontFamily: fontDisplay }}>{question.title}</Text>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, lineHeight: 22 * fs, marginTop: 10, fontFamily: fontBody }}>{question.body}</Text>
          <Pressable accessibilityRole="button" onPress={() => questionLike.mutate({ id: question.id, liked: !question.likedByMe })} style={[styles.likeBtn, { borderColor: question.likedByMe ? c.error : c.border, backgroundColor: question.likedByMe ? c.error + '12' : 'transparent' }]}>
            <Ionicons name={question.likedByMe ? 'heart' : 'heart-outline'} size={15} color={question.likedByMe ? c.error : c.textSecondary} />
            <Text style={{ color: question.likedByMe ? c.error : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>공감 {question.likes}</Text>
          </Pressable>

          {/* 답변 */}
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay, marginBottom: 12 }}>답변 {question.answerCount}</Text>
          {sorted.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 8, fontFamily: fontBody }}>첫 답변을 남겨보세요!</Text>
            </View>
          ) : sorted.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(Math.min(i, 5) * 40).duration(280)}>
              <AnswerRow answer={a} onLike={() => answerLike.mutate({ answerId: a.id, liked: !a.likedByMe })} />
            </Animated.View>
          ))}
        </ScrollView>

        {/* 답변 입력 */}
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.inputRow, { backgroundColor: c.surfaceAlt, borderColor: focused ? c.primary : c.border }]}>
            <TextInput
              accessibilityLabel="답변 입력"
              value={draft} onChangeText={setDraft} onFocus={() => setFocused(true)}
              placeholder="답변을 입력하세요" placeholderTextColor={c.textSecondary}
              style={{ flex: 1, color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontBody, paddingVertical: 4, maxHeight: 90 }}
              multiline maxLength={1050}
            />
            <Pressable onPress={submit} disabled={!canSend} accessibilityRole="button" accessibilityLabel="답변 보내기" style={[styles.sendBtn, { backgroundColor: canSend ? c.primary : c.disabled }]}>
              <Ionicons name="arrow-up" size={17} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AnswerRow({ answer: a, onLike }: { answer: Answer; onLike: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.answer, { backgroundColor: c.surface, borderColor: a.accepted ? c.success + '55' : c.border }]}>
      {a.accepted && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Ionicons name="checkmark-circle" size={14} color={c.success} />
          <Text style={{ color: c.success, fontSize: 11.5 * fs, fontFamily: fontDisplay }}>채택된 답변</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <View style={[styles.avatar, { backgroundColor: a.color }]}><Text style={styles.avatarText}>{a.author.charAt(0)}</Text></View>
        <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{a.author}</Text>
        {a.mine && <View style={{ backgroundColor: c.primary + '1A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: c.primary, fontSize: 9.5 * fs, fontFamily: fontDisplay }}>나</Text></View>}
        <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontMono }}>{timeAgoLabel(minutesSince(a.createdAt))}</Text>
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 20 * fs, fontFamily: fontBody }}>{a.body}</Text>
      <Pressable accessibilityRole="button" onPress={onLike} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}>
        <Ionicons name={a.likedByMe ? 'heart' : 'heart-outline'} size={14} color={a.likedByMe ? c.error : c.textSecondary} />
        <Text style={{ color: a.likedByMe ? c.error : c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>{a.likes}</Text>
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
