import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { ROUTES } from '../../constants/routes';
import { useShareFeedStore } from '../../store/shareFeedStore';
import { WrappedShareCard } from '../share/WrappedShareCard';
import { timeAgoLabel } from '../../store/notificationStore';

const MINI_W = 158;

/**
 * 커뮤니티 '성취 자랑 피드' — 유저가 올린 스포티파이 랩드 스타일 카드가 가로로 흐른다.
 * 업로드 이미지가 있으면 그대로, 없으면(웹 등) 스냅샷으로 카드를 재현해 항상 보이게 한다.
 */
export function BragFeedCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const posts = useShareFeedStore((s) => s.posts);
  const toggleLike = useShareFeedStore((s) => s.toggleLike);

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trophy" size={18} color="#F2B705" />
          <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>성취 자랑 피드</Text>
        </View>
        <Pressable onPress={() => router.push(ROUTES.share as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Ionicons name="megaphone" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12.5, fontFamily: fontDisplay }}>나도 자랑하기</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
        {posts.map((p) => (
          <View key={p.id} style={{ width: MINI_W, marginRight: 12 }}>
            <View style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 6px 16px rgba(37,99,235,0.18)' }}>
              {p.imageUri ? (
                <Image source={{ uri: p.imageUri }} style={{ width: MINI_W, height: MINI_W / p.aspect, borderRadius: 16 }} resizeMode="cover" />
              ) : (
                <WrappedShareCard snapshot={p.snapshot} author={p.author} width={MINI_W} />
              )}
              {p.mine && (
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontFamily: fontDisplay }}>내 카드</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 9, fontFamily: fontDisplay }}>{p.author.charAt(0)}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 11.5, fontFamily: fontDisplay, flex: 1 }}>{p.author}</Text>
              <Pressable onPress={() => toggleLike(p.id)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name={p.likedByMe ? 'heart' : 'heart-outline'} size={14} color={p.likedByMe ? c.error : c.textSecondary} />
                <Text style={{ color: p.likedByMe ? c.error : c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{p.likes}</Text>
              </Pressable>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: fontMono, marginTop: 2 }}>{timeAgoLabel(p.minutesAgo)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
