import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../ui/CenterModal';
import { Button } from '../ui/Button';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay, fontMono } from '../../theme/tokens';
import { claimDailyWelcome, type DailyWelcome } from '../../data/dailyWelcome';
import { useLearningCompletion } from '../../hooks/useLearningCompletion';
import { useDailyAssignment } from '../../hooks/useDailyAssignment';
import { useLearningDay } from '../../hooks/useLearningDay';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useFactionStore } from '../../store/factionStore';
import { useSrsStore } from '../../store/srsStore';
import { useProgressStatusStore } from '../../store/progressStatusStore';
import { logger } from '../../utils/logger';

export function DailyWelcomeGate({ enabled }: { enabled: boolean }) {
  const userId = useAuthStore(s => s.user?.id);
  const needsUnlock = useAuthStore(s => s.needsUnlock);
  const biometric = useSettingsStore(s => s.biometricLoginEnabled);
  const faction = useFactionStore(s => s.faction);
  const progress = useProgressStatusStore();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const stores = [useSrsStore, useSettingsStore, useFactionStore];
    const update = () => setHydrated(stores.every(store => store.persist.hasHydrated()));
    const unsub = stores.map(store => store.persist.onFinishHydration(update));
    update(); return () => unsub.forEach(fn => fn());
  }, []);
  const unlocked = Platform.OS === 'web' || !biometric || !needsUnlock;
  if (!enabled || !userId || !faction || !hydrated || !unlocked || !progress.settled || progress.userId !== userId || /login|signup|faction-select|find-pw/.test(pathname)) return null;
  return <DailyLearningWelcome key={userId} userId={userId} />;
}

export function DailyLearningWelcome({ userId }: { userId: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const completion = useLearningCompletion();
  const { isSuccess, isError } = useDailyAssignment();
  const day = useLearningDay();
  const [activation, setActivation] = useState(1);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const attempted = useRef<number>();
  const [welcome, setWelcome] = useState<DailyWelcome | null>(null);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { setActive(state === 'active'); if (state === 'active') setActivation(value => value + 1); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!active || (!isSuccess && !isError) || attempted.current === activation) return;
    let cancelled = false;
    void claimDailyWelcome(userId, day.date, completion.streak, () => !cancelled).then(result => {
      if (cancelled) return;
      attempted.current = activation;
      if (result) setWelcome(result);
    }).catch(() => { logger.warn('daily_welcome.storage_failed', {}); });
    return () => { cancelled = true; };
  }, [userId, day.date, completion.streak, activation, active, isSuccess, isError]);
  if (!welcome || !active) return null;
  const streak = completion.streak;
  const message = streak === 0 ? '오늘부터 한 걸음, 함께 시작해요'
    : streak < 5 ? '좋은 시작이 쌓이고 있어요'
    : streak < 20 ? '꾸준한 배움이 힘이 되고 있어요' : '단단한 학습 습관을 이어가고 있어요';
  return <CenterModal visible onClose={() => setWelcome(null)} title="오늘의 한 걸음" icon="sunny-outline">
    <View testID="daily-learning-welcome" accessibilityViewIsModal style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary + '16' }}>
        <Ionicons name={streak > 0 ? 'flame' : 'leaf'} size={34} color={c.primary} />
      </View>
      <Text style={{ fontFamily: fontDisplay, color: c.textPrimary, fontSize: 15 * fs }}>평일 연속 학습</Text>
      <Text testID="daily-welcome-streak" style={{ fontFamily: fontMono, fontSize: 38 * fs, fontWeight: '900', color: c.primary }}>{streak}일</Text>
      <Text style={{ fontFamily: fontBody, color: c.textSecondary, fontSize: 12 * fs, textAlign: 'center' }}>{message}</Text>
      <View style={{ width: '100%', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 16, marginVertical: 4 }}>
        <Text testID="daily-welcome-category" style={{ fontFamily: fontDisplay, color: c.primary, fontSize: 11 * fs, marginBottom: 8 }}>{welcome.category}</Text>
        <Text testID="daily-welcome-quote" style={{ fontFamily: fontBody, color: c.textPrimary, fontSize: 15 * fs, lineHeight: 23 * fs }}>{welcome.text}</Text>
      </View>
      <Button label="좋은 하루 시작하기" onPress={() => setWelcome(null)} style={{ width: '100%' }} />
    </View>
  </CenterModal>;
}
