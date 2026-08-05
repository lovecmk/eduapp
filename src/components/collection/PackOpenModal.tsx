import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess, hapticWarning } from '../../utils/haptics';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import { CollectibleCard } from './CollectibleCard';
import { COLLECTIBLE_BY_ID, JEWEL_META } from '../../data/collectibles';
import { RARITY_RANK as RANK, type RarityTier } from '../../utils/rarity';
import { fontCute, fontDisplay } from '../../theme/tokens';
import type { OpenResult } from '../../store/collectionStore';
import { fontBody } from '../../theme/tokens';

/** 카드팩 개봉 연출 — 닫힌 팩 탭 → 카드가 하나씩 반짝이며 등장. */
export function PackOpenModal({ result, onClose }: { result: OpenResult | null; onClose: () => void }) {
  const [opened, setOpened] = useState(false);
  const { width: screenW } = useWindowDimensions();
  const results = result?.results ?? null;

  useEffect(() => {
    if (result) setOpened(false);
  }, [result]);

  const best = useMemo<RarityTier>(() => {
    if (!results) return 'common';
    return results.reduce<RarityTier>((acc, r) => {
      const t = COLLECTIBLE_BY_ID[r.id].rarity;
      return RANK[t] > RANK[acc] ? t : acc;
    }, 'common');
  }, [results]);

  const open = () => {
    setOpened(true);
    // 희귀도 2 이상은 '대박' 성공감, 그 이하는 부드러운 주의감으로 결과를 손끝에 예고한다.
    if (RANK[best] >= 2) hapticSuccess();
    else hapticWarning();
  };

  const cardW = Math.min((screenW - 48 - 14) / 2, 150);
  const bestMeta = JEWEL_META[best];

  return (
    <Modal visible={!!result} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,8,15,0.94)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {!result || !results ? null : !opened ? (
          // 닫힌 팩
          <Pressable accessibilityRole="button" onPress={open} style={{ alignItems: 'center' }}>
            <Animated.View entering={ZoomIn.springify()} style={{ width: 180, height: 240, borderRadius: 22, backgroundColor: '#1E1B4B', borderWidth: 2, borderColor: '#6366F1', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 12px 40px rgba(99,102,241,0.5)' }}>
              <Text style={{ fontSize: 76 }}>🎁</Text>
              <Text style={{ color: '#fff', fontSize: 15, fontFamily: fontDisplay, fontWeight: '800' }}>안전 카드팩</Text>
            </Animated.View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Ionicons name="hand-left" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontFamily: fontCute, fontWeight: '700' }}>탭하여 개봉하기</Text>
            </View>
          </Pressable>
        ) : (
          // 개봉 결과
          <View style={{ alignItems: 'center', width: '100%' }}>
            {RANK[best] >= 1 && (
              <Animated.View entering={FadeIn.delay(results.length * 160 + 200)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, backgroundColor: bestMeta.glow + '2A', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: bestMeta.glow + '99' }}>
                <Text style={{ fontSize: 15 }}>{bestMeta.emoji}</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontFamily: fontDisplay, fontWeight: '900' }}>{bestMeta.label} 카드 등장!</Text>
              </Animated.View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
              {results.map((r, i) => (
                <Animated.View key={i} entering={ZoomIn.delay(i * 160).springify().damping(12)}>
                  <CollectibleCard id={r.id} width={cardW} isNew={r.isNew} />
                </Animated.View>
              ))}
            </View>
            {/* 중복이 나와도 빈손이 아니라는 걸 그 자리에서 보여준다 —
                조각 화면을 따로 찾아가야 알 수 있으면 중복은 그냥 실망으로 남는다. */}
            {result.shards > 0 && (
              <Animated.View entering={FadeIn.delay(results.length * 160 + 260)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.6)' }}>
                <Text style={{ fontSize: 14 }}>🧩</Text>
                <Text style={{ color: '#fff', fontSize: 12.5, fontFamily: fontBody }}>중복 카드가 안전 조각 {result.shards}개가 됐어요</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeIn.delay(results.length * 160 + 300)} style={{ width: '100%', maxWidth: 320, marginTop: 26 }}>
              <Pressable accessibilityRole="button" onPress={onClose} style={{ backgroundColor: '#fff', borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#111', fontSize: 15, fontFamily: fontCute, fontWeight: '800' }}>확인</Text>
              </Pressable>
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}
