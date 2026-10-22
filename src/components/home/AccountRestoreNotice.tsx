import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useAccountRestoreStore, type AccountResource } from '../../store/accountRestoreStore';
import { getSessionEpoch } from '../../data/network/sessionEpoch';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';

const LABELS: Record<AccountResource, string> = { faction: '진영', progress: '학습 기록·출석', settings: '계정 설정', collection: '도감', engagement: '추천·저장', notifications: '알림' };
export function AccountRestoreNotice() {
  const userId = useAuthStore(s => s.user?.id);
  const { entries, retryFailed } = useAccountRestoreStore();
  const { theme, fontScale: fs } = useTheme();
  const scoped = Object.entries(entries).filter(([, entry]) => entry.userId === userId && entry.epoch === getSessionEpoch());
  const failed = scoped.filter(([, entry]) => entry.status === 'error').map(([key]) => LABELS[key as AccountResource]);
  const loading = scoped.some(([, entry]) => entry.status === 'loading');
  if (!failed.length && !loading) return null;
  return <View testID="account-restore-notice" accessibilityLiveRegion="polite" style={{ padding: 14, marginBottom: 14, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
    <Text style={{ color: theme.colors.textPrimary, fontFamily: fontDisplay, fontSize: 13 * fs }}>{failed.length ? '계정 기록을 모두 가져오지 못했어요' : '저장된 계정 기록을 복원하고 있어요'}</Text>
    {failed.length > 0 && <>
      <Text style={{ color: theme.colors.textSecondary, fontFamily: fontBody, fontSize: 12 * fs, lineHeight: 18 * fs, marginTop: 4 }}>{failed.join(', ')} · 연결 상태를 확인하고 다시 불러와 주세요. 기존 기록을 초기화하지 않습니다.</Text>
      <Pressable accessibilityRole="button" onPress={retryFailed} style={{ paddingVertical: 10, alignSelf: 'flex-start' }}>
        <Text style={{ color: theme.colors.primary, fontFamily: fontDisplay, fontSize: 13 * fs }}>계정 기록 다시 불러오기</Text>
      </Pressable>
    </>}
  </View>;
}
