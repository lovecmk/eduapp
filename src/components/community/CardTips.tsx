import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { tipMinutesAgo } from '../../domain/models/CardTip';
import { useCardTips } from '../../hooks/useCardTips';
import { useAuthStore } from '../../store/authStore';
import { timeAgoLabel } from '../../store/notificationStore';
import { isMeaningful, textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { authorLabel } from '../../domain/models/User';
import { ErrorState } from '../ui/ErrorState';
import { toApiError } from '../../data/network/errors';

/** 카드별 현장 팁(작은 커뮤니티) — 실무 노하우 공유 + 좋아요. */
export function CardTips({ cardId }: { cardId: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  // 서버(`/cards/:id/tips`)가 열리면 자동으로 공유되고, 그 전에는 이 기기 안에서 돈다.
  const { tips: cardTips, isLoading, isError, error, refetch, add, toggleLike, remove } = useCardTips(cardId);
  const me = useAuthStore((s) => s.user);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const canSubmit = isMeaningful(draft);
  const len = textLength(draft);

  const submit = async () => {
    if (!canSubmit || sending) return;
    setSubmitError(false);
    setSending(true);
    const ok = await add(draft);
    setSending(false);
    // 못 올렸으면 적은 것을 지우지 않는다 — 다시 누르면 된다.
    if (!ok) { setSubmitError(true); return; }
    setDraft('');
    setFocused(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="chatbubbles" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>현장 팁</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono }}>{cardTips.length}</Text>
          </View>
        </View>
        {/* 팁은 아직 서버에 없다 — 실서버 모드에서 '함께 나눈'이라고 하면 남도 본다고 믿는다. */}
        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody }}>함께 나눈 실무 노하우</Text>
      </View>

      {isLoading && <Text style={{ color: c.textSecondary, paddingVertical: 12 }}>현장 팁을 불러오고 있어요…</Text>}
      {isError && <ErrorState message={toApiError(error).userMessage} onRetry={() => { void refetch(); }} />}
      {submitError && <Text style={{ color: c.error, paddingVertical: 8 }}>팁을 저장하지 못했어요. 입력한 내용은 유지됩니다. 다시 시도해주세요.</Text>}
      {/* 입력 */}
      <View style={[styles.inputRow, { backgroundColor: c.surfaceAlt, borderColor: focused ? c.primary : c.border }]}>
        <TextInput
          accessibilityLabel="이 카드에 남길 팁"
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          placeholder="현장에서 얻은 팁을 공유해보세요"
          placeholderTextColor={c.textSecondary}
          style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontBody, paddingVertical: 4 }}
          multiline
          maxLength={INPUT_LIMITS.tip + 20}
        />
        <Pressable onPress={() => { void submit(); }} disabled={!canSubmit || sending}
          accessibilityRole="button" accessibilityLabel="꿀팁 등록"
          style={[styles.sendBtn, { backgroundColor: !canSubmit ? c.disabled : c.primary }]}>
          <Ionicons name="arrow-up" size={16} color="#fff" />
        </Pressable>
      </View>
      {(focused || len > 0) && (
        <Text style={{ alignSelf: 'flex-end', marginTop: 4, fontSize: 10.5 * fs, fontFamily: fontMono, color: len > INPUT_LIMITS.tip ? c.error : c.textSecondary }}>
          {len}/{INPUT_LIMITS.tip}
        </Text>
      )}

      {/* 목록 */}
      {cardTips.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="bulb-outline" size={26} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 8, fontFamily: fontBody }}>첫 번째 팁을 남겨보세요!</Text>
        </View>
      ) : (
        <View style={{ marginTop: 6 }}>
          {cardTips.map((tip, i) => {
            // 내 팁의 이름은 저장된 사본이 아니라 지금 내 표시명으로 그린다 —
            // 닉네임을 바꾸면 '나' 배지 옆에만 옛 이름이 남아 있었다(authorLabel 주석).
            const shownAuthor = authorLabel(tip.author, tip.mine, me);
            return (
            <Animated.View key={tip.id} entering={FadeInDown.delay(Math.min(i, 5) * 40).duration(280)} style={[styles.tip, { borderTopColor: c.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}>
              <View style={[styles.avatar, { backgroundColor: tip.color }]}>
                <Text style={styles.avatarText}>{shownAuthor.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{shownAuthor}</Text>
                  {tip.mine && <View style={{ backgroundColor: c.primary + '1A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: c.primary, fontSize: 9.5 * fs, fontFamily: fontDisplay }}>나</Text></View>}
                  <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontMono }}>{timeAgoLabel(tipMinutesAgo(tip))}</Text>
                </View>
                <ExpandableText text={tip.body} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => toggleLike(tip)} hitSlop={6} style={{ alignItems: 'center' }}>
                  <Ionicons name={tip.likedByMe ? 'heart' : 'heart-outline'} size={17} color={tip.likedByMe ? c.error : c.textSecondary} />
                  <Text style={{ color: tip.likedByMe ? c.error : c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontMono }}>{tip.likes}</Text>
                </Pressable>
                {tip.mine && (
                  <Pressable onPress={() => remove(tip)} hitSlop={6} accessibilityRole="button" accessibilityLabel="내 꿀팁 삭제">
                    <Ionicons name="trash-outline" size={13} color={c.textSecondary} />
                  </Pressable>
                )}
              </View>
            </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** 긴 댓글은 4줄로 접고 "더보기"로 펼친다. */
function ExpandableText({ text }: { text: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  return (
    <View style={{ marginTop: 3 }}>
      <Text
        numberOfLines={expanded ? undefined : 4}
        onTextLayout={(e) => { if (!expanded && e.nativeEvent.lines.length > 4) setTruncated(true); }}
        style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 19 * fs, fontFamily: fontBody }}
      >
        {text}
      </Text>
      {truncated && (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} hitSlop={6}>
          <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontDisplay, marginTop: 3 }}>{expanded ? '접기' : '더보기'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  sendBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontFamily: fontDisplay },
});
