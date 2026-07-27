import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { WrappedShareCard, SHARE_CARD_ASPECT } from '../src/components/share/WrappedShareCard';
import { useAllCards } from '../src/hooks/useCards';
import { useStudyStats } from '../src/hooks/useStats';
import { computeAchievement } from '../src/utils/achievement';
import { useTilt } from '../src/hooks/useTilt';
import { getRarity } from '../src/utils/rarity';
import { useShareFeedStore } from '../src/store/shareFeedStore';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { ROUTES } from '../src/constants/routes';
import { endFlow } from '../src/navigation/flow';
import { contentColumn } from '../src/theme/layout';
import { useSafeTimeout, useIsMounted } from '../src/hooks/useSafeTimeout';

export default function ShareScreen() {
  const { theme, fontScale: fs } = useTheme();
  // 모듈 로드 시점의 Dimensions.get() 은 값이 고정돼 브라우저 리사이즈·기기 회전에
  // 반응하지 않는다(카드가 화면을 넘치거나 여백이 크게 남는다). 훅으로 구독한다.
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(screenW - 48, 360);
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: allCards = [] } = useAllCards();
  const { data: stats } = useStudyStats();
  const uploadShareCard = useShareFeedStore((s) => s.uploadShareCard);

  const snapshot = useMemo(() => computeAchievement(allCards, stats), [allCards, stats]);
  const author = user?.name ?? '현장 작업자';
  const rarity = getRarity(snapshot);
  const tilt = useTilt(true);

  const cardRef = useRef<View>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'done'>('idle');
  const { run } = useSafeTimeout();
  const alive = useIsMounted();

  const onShare = async () => {
    if (phase !== 'idle') return;
    setPhase('uploading');
    // 클라이언트 완결형: 기기에서 카드를 이미지로 래스터화해 업로드한다.
    // 웹/캡처 미지원 환경에서는 이미지 없이 스냅샷만 올리고, 피드가 카드를 재현한다.
    let imageUri: string | null = null;
    if (Platform.OS !== 'web' && cardRef.current) {
      try {
        imageUri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      } catch {
        imageUri = null;
      }
    }
    uploadShareCard({ author, color: '#2563EB', imageUri, aspect: SHARE_CARD_ASPECT, snapshot });
    // 캡처는 수백 ms 걸린다. 그 사이 사용자가 뒤로 갔다면 화면을 되돌리지 않는다.
    if (!alive()) return;
    setPhase('done');
    // 자동 이동도 언마운트되면 취소된다(뒤로 간 사용자를 커뮤니티로 끌고 가지 않는다).
    run(() => endFlow(router, ROUTES.community), 900);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="성취 카드 플렉스" />
      <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center', paddingBottom: 40, ...contentColumn }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '800', fontFamily: fontCute, textAlign: 'center' }}>
          나의 성취, 플렉스 🎉
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody, textAlign: 'center', marginTop: 6, marginBottom: 20, lineHeight: 19 }}>
          완성한 성취 카드를 '오늘의 플렉스'에 올려{'\n'}서로의 성장을 응원해요
        </Text>

        {/* 미리보기 = 실제로 캡처되는 뷰. 기기를 기울이면 광택이 일렁이고 등급별 효과가 붙는다. */}
        <View style={{ borderRadius: 28 * (cardW / 320), boxShadow: `0 16px 44px ${rarity.glow === 'transparent' ? 'rgba(37,99,235,0.32)' : rarity.glow + '66'}` }}>
          <WrappedShareCard ref={cardRef} snapshot={snapshot} author={author} width={cardW} tilt={tilt} animated />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
          <Ionicons name="phone-portrait-outline" size={13} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>기기를 기울이면 광택이 흘러요 · 등급 {rarity.label}</Text>
        </View>

        <View style={{ width: '100%', maxWidth: 360, marginTop: 26 }}>
          {phase === 'done' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.success + '18', borderRadius: 16, height: 54 }}>
              <Ionicons name="checkmark-circle" size={20} color={c.success} />
              <Text style={{ color: c.success, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>커뮤니티에 올렸어요!</Text>
            </View>
          ) : (
            <Pressable onPress={onShare} disabled={phase === 'uploading'}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 16, height: 54, opacity: phase === 'uploading' ? 0.7 : 1, boxShadow: '0 6px 16px rgba(37,99,235,0.3)' }}>
              {phase === 'uploading' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="megaphone" size={19} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>
                {phase === 'uploading' ? '올리는 중...' : '플렉스 올리기'}
              </Text>
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14 }}>
            <Ionicons name="lock-closed" size={12} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>
              외부 SNS가 아닌 앱 커뮤니티에만 공유돼요
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
