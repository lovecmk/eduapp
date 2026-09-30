import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontMono, fontBody, radius } from '../../theme/tokens';
import { ROUTES } from '../../constants/routes';
import { REACTION_KINDS, REACTION_EMOJI, postMinutesAgo } from '../../domain/models/Feed';
import { useFeed, useFeedReaction } from '../../hooks/useFeed';
import { WrappedShareCard } from '../share/WrappedShareCard';
import { EmojiBurstButton } from '../ui/EmojiBurstButton';
import { timeAgoLabel } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { authorLabel } from '../../domain/models/User';

const REACTION_TINT: Record<string, string> = { clap: '#F2B705', fire: '#FF6B35', up: '#2563EB' };

const MINI_W = 158;

/**
 * 커뮤니티 '오늘의 플렉스' — 유저가 올린 성취 카드가 가로로 흐른다.
 * 업로드 이미지가 있으면 그대로, 없으면(웹 등) 스냅샷으로 카드를 재현해 항상 보이게 한다.
 * 다른 커뮤니티 섹션과 동일한 surface 카드 컨테이너에 담아 톤을 통일한다.
 */
export function BragFeedCard() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  // 서버(/feed)가 열리면 동료들의 카드가 자동으로 들어온다. 그 전(실서버 모드)에는
  // 이 기기에서 올린 카드만 보이고, 그 사실을 화면에 적는다(localOnly).
  const { posts, localOnly } = useFeed();
  const react = useFeedReaction();
  // 내 카드의 작성자 이름은 저장된 사본이 아니라 지금 내 표시명으로 그린다
  // (닉네임을 바꾸면 '내 카드' 배지 옆에만 옛 이름이 남았다 — authorLabel 주석).
  const me = useAuthStore((s) => s.user);

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.card, padding: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>오늘의 플렉스</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.share as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary + '14', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Ionicons name="add" size={14} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>나도 플렉스</Text>
        </Pressable>
      </View>

      {localOnly && (
        <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, lineHeight: 17 * fs, fontFamily: fontBody, marginTop: -4, marginBottom: 10 }}>
          지금은 이 기기에서 올린 성취 카드만 보여요. 다른 점검자와 나누는 피드는 준비 중이에요.
        </Text>
      )}
      {posts.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 18, gap: 6 }}>
          <Ionicons name="images-outline" size={24} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody }}>아직 올린 성취 카드가 없어요</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
        {posts.map((p) => {
          const shownAuthor = authorLabel(p.author, p.mine, me);
          return (
          <View key={p.id} style={{ width: MINI_W, marginRight: 12 }}>
            <View style={{ borderRadius: 16, overflow: 'hidden', boxShadow: `0 2px 8px ${c.border}` }}>
              {p.imageUri ? (
                <Image source={{ uri: p.imageUri }} style={{ width: MINI_W, height: MINI_W / p.aspect, borderRadius: 16 }} resizeMode="cover" />
              ) : (
                <WrappedShareCard snapshot={p.snapshot} author={shownAuthor} width={MINI_W} />
              )}
              {p.mine && (
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10 * fs, fontFamily: fontDisplay }}>내 카드</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 9 * fs, fontFamily: fontDisplay }}>{shownAuthor.charAt(0)}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 11.5 * fs, fontFamily: fontDisplay, flex: 1 }}>{shownAuthor}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 10 * fs, fontFamily: fontMono }}>{timeAgoLabel(postMinutesAgo(p))}</Text>
            </View>

            {/* 퀵 리액션 — 👏🔥👍 (탭 시 이모지 폭죽). 자랑 피드의 단일 반응 수단으로 통합. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              {REACTION_KINDS.map((kind) => (
                <EmojiBurstButton
                  key={kind}
                  emoji={REACTION_EMOJI[kind]}
                  count={p.reactions[kind]}
                  active={p.myReactions.includes(kind)}
                  tint={REACTION_TINT[kind]}
                  onPress={() => react(p.id, kind)}
                />
              ))}
            </View>
          </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
