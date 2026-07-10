import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../../theme/ThemeProvider';

export function OfflineBanner() {
  const { theme } = useTheme();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOffline(!s.isConnected));
    return () => unsub();
  }, []);

  if (!offline) return null;

  return (
    <View style={{ backgroundColor: theme.colors.error, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>⚠ 네트워크 연결이 끊겼습니다</Text>
    </View>
  );
}