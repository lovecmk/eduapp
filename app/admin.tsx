import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
export default function AdminScreen() { return <MovedToBridgeNotice />; }
function MovedToBridgeNotice() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="관리 콘솔" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <Ionicons name="open-outline" size={28} color={c.primary} />
        </View>
        <Text style={{ color: c.textPrimary, fontSize: 17, fontFamily: fontDisplay, marginBottom: 10, textAlign: 'center' }}>
          관리 콘솔은 브릿지로 옮겼어요
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13.5, lineHeight: 21, fontFamily: fontBody, textAlign: 'center' }}>
          사용자 · 문제 · 신고 · 공지 · 운영 설정은{'\n'}
          브릿지 운영관리에서 처리합니다.
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono, marginTop: 16, textAlign: 'center' }}>
          bridge.kfpa.or.kr
        </Text>
      </View>
    </View>
  );
}
