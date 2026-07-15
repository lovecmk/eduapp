import React, { useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
import { sendTestNotification } from '../src/data/notifications/NotificationService';

type SendState = 'idle' | 'sending' | 'sent' | 'denied' | 'error';

export default function DeveloperScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [state, setState] = useState<SendState>('idle');

  const onSend = async () => {
    setState('sending');
    try {
      const ok = await sendTestNotification();
      setState(ok ? 'sent' : 'denied');
    } catch {
      setState('error');
    }
  };

  const feedback = {
    idle: null,
    sending: { icon: 'time-outline' as const, color: c.textSecondary, text: '알림을 보내는 중...' },
    sent: { icon: 'checkmark-circle' as const, color: c.success, text: Platform.OS === 'web' ? '브라우저 알림을 보냈어요.' : '내 폰으로 알림을 보냈어요! 잠시 후 확인해보세요.' },
    denied: { icon: 'notifications-off-outline' as const, color: c.warning, text: '알림 권한이 없어요. 설정에서 알림을 허용해주세요.' },
    error: { icon: 'alert-circle-outline' as const, color: c.error, text: '알림 전송에 실패했어요. 잠시 후 다시 시도해주세요.' },
  }[state];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="개발자 모드" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Ionicons name="construct-outline" size={30} color={c.primary} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay }}>개발자 도구</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, textAlign: 'center', lineHeight: 18, fontFamily: fontBody }}>
            테스트용 기능 모음입니다.
          </Text>
        </View>

        <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="notifications-outline" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>알림 테스트</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19, marginBottom: 16, fontFamily: fontBody }}>
            버튼을 누르면 이 기기로 실제 로컬 알림을 즉시 전송합니다.
          </Text>

          <Button
            label="내 폰에 알림 보내기"
            onPress={onSend}
            loading={state === 'sending'}
          />

          {feedback && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
              <Ionicons name={feedback.icon} size={18} color={feedback.color} />
              <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, flex: 1, lineHeight: 18, fontFamily: fontBody }}>{feedback.text}</Text>
            </View>
          )}

          {Platform.OS === 'web' && (
            <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginTop: 10, fontFamily: fontMono }}>
              * 웹에서는 브라우저 알림으로 대체됩니다.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
