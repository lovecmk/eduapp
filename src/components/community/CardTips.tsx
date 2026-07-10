import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useTipStore } from '../../store/tipStore';
import { useAuthStore } from '../../store/authStore';
import { timeAgoLabel } from '../../store/notificationStore';

/** 카드별 현장 팁(작은 커뮤니티) — 실무 노하우 공유 + 좋아요. */
export function CardTips({ cardId }: { cardId: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const tips = useTipStore((s) => s.tips);
  const addTip = useTipStore((s) => s.addTip);
  const toggleLike = useTipStore((s) => s.toggleLike);
  const removeTip = useTipStore((s) => s.removeTip);
  const userName = useAuthStore((s) => s.user?.name) ?? '나';
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const cardTips = tips.filter((t) => t.cardId === cardId).sort((a, b) => b.likes - a.likes || a.minutesAgo - b.minutesAgo);

  const submit = () => {
    const body = draft.trim();
    if (body.length < 2) return;
    addTip(cardId, body, userName);
    setDraft('');
    setFocused(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="chatbubbles" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontDisplay }}>현장 팁</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{cardTips.length}</Text>
          </View>
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>함께 나눈 실무 노하우</Text>
      </View>

      {/* 입력 */}
      <View style={[styles.inputRow, { backgroundColor: c.surfaceAlt, borderColor: focused ? c.primary : c.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          placeholder="현장에서 얻은 팁을 공유해보세요"
          placeholderTextColor={c.textSecondary}
          style={{ flex: 1, color: c.textPrimary, fontSize: 13, fontFamily: fontBody, paddingVertical: 4 }}
          multiline
          maxLength={140}
        />
        <Pressable onPress={submit} disabled={draft.trim().length < 2}
          style={[styles.sendBtn, { backgroundColor: draft.trim().length < 2 ? c.disabled : c.primary }]}>
          <Ionicons name="arrow-up" size={16} color="#fff" />
        </Pressable>
      </View>

      {/* 목록 */}
      {cardTips.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="bulb-outline" size={26} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 8, fontFamily: fontBody }}>첫 번째 팁을 남겨보세요!</Text>
        </View>
      ) : (
        <View style={{ marginTop: 6 }}>
          {cardTips.map((tip, i) => (
            <Animated.View key={tip.id} entering={FadeInDown.delay(Math.min(i, 5) * 40).duration(280)} style={[styles.tip, { borderTopColor: c.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}>
              <View style={[styles.avatar, { backgroundColor: tip.color }]}>
                <Text style={styles.avatarText}>{tip.author.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay }}>{tip.author}</Text>
                  {tip.mine && <View style={{ backgroundColor: c.primary + '1A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: c.primary, fontSize: 9.5, fontFamily: fontDisplay }}>나</Text></View>}
                  <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>{timeAgoLabel(tip.minutesAgo)}</Text>
                </View>
                <Text style={{ color: c.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 3, fontFamily: fontBody }}>{tip.body}</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Pressable onPress={() => toggleLike(tip.id)} hitSlop={6} style={{ alignItems: 'center' }}>
                  <Ionicons name={tip.likedByMe ? 'heart' : 'heart-outline'} size={17} color={tip.likedByMe ? c.error : c.textSecondary} />
                  <Text style={{ color: tip.likedByMe ? c.error : c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>{tip.likes}</Text>
                </Pressable>
                {tip.mine && (
                  <Pressable onPress={() => removeTip(tip.id)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={13} color={c.textSecondary} />
                  </Pressable>
                )}
              </View>
            </Animated.View>
          ))}
        </View>
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
