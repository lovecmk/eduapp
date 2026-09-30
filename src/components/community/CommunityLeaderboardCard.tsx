import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono, fontCute } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * 이번 주 기여 랭킹 — "혼자가 아닌 함께" 경쟁형 학습 강화.
 * 서버(GET /inner/api/v1/community/live)의 leaderboard/my_rank 를 그대로 소비한다.
 */
export function CommunityLeaderboardCard() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { data } = useCommunity();
  const board = data?.leaderboard ?? [];
  if (board.length === 0) return null;

  const myRank = data?.myRank ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name="podium" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontFamily: fontDisplay }}>이번 주 기여 랭킹</Text>
        </View>
        {myRank > 0 && (
          <View style={[styles.badge, { backgroundColor: c.primary + '18' }]}>
            <Ionicons name="person" size={11} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 11 * fs, fontFamily: fontDisplay }}>내 순위 {myRank}위</Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 12, gap: 4 }}>
        {board.slice(0, 6).map((r) => {
          const top = r.cards; // 1위 기준 대비 막대 폭
          const maxCards = board[0]?.cards || 1;
          const pct = Math.max(6, Math.round((top / maxCards) * 100));
          return (
            <View
              key={`${r.rank}-${r.name}`}
              style={[
                styles.row,
                { backgroundColor: r.isMe ? c.primary + '14' : 'transparent', borderColor: r.isMe ? c.primary : 'transparent' },
              ]}
            >
              <Text style={{ width: 22, textAlign: 'center', fontSize: 13 * fs, fontFamily: fontCute, color: r.isMe ? c.primary : c.textSecondary }}>
                {MEDALS[r.rank - 1] || r.rank}
              </Text>
              <View style={[styles.avatar, { backgroundColor: r.color }]}>
                <Text style={styles.avatarTxt}>{r.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: r.isMe ? c.primary : c.textPrimary, fontSize: 12.5 * fs, fontFamily: fontCute, fontWeight: r.isMe ? '800' : '600' }}>
                  {r.name}{r.isMe ? ' (나)' : ''}
                </Text>
                <View style={{ height: 5, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: r.isMe ? c.primary : r.color, borderRadius: 3 }} />
                </View>
              </View>
              <Text style={{ color: r.isMe ? c.primary : c.textSecondary, fontSize: 12 * fs, fontFamily: fontMono, fontWeight: '800' }}>{r.cards}장</Text>
            </View>
          );
        })}
      </View>

      <Text style={{ color: c.textSecondary, fontSize: 11 * fs, textAlign: 'center', marginTop: 10, fontFamily: fontBody }}>
        매주 월요일 0시에 초기화돼요 · 함께 학습하고 순위를 올려보세요
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 11, fontFamily: fontDisplay },
});
