import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Modal, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';

/**
 * 이미지 문제용 이미지 뷰 — 로딩 중 스켈레톤, 실패 시 아이콘 폴백으로 깨진 이미지를 방지.
 * `uri`(원격 URL) 또는 `source`(번들 로컬 이미지 require) 중 하나를 받는다.
 *
 * - 인라인 미리보기는 `contentFit="contain"` 으로 가로/세로 비율이 제각각인 사진도
 *   잘리지 않고 전체가 보이도록 한다(레터박스).
 * - 이미지를 누르면 전체 화면 뷰어(핀치 없이 contain)가 열려 크게 볼 수 있다.
 */
export function QuestionImage({
  uri,
  source,
  height = 190,
  expandable = true,
  alt,
}: {
  uri?: string;
  source?: ImageSourcePropType;
  height?: number;
  expandable?: boolean;
  /** 그림 설명 — 이미지 문제는 그림이 문제의 일부라 못 보면 풀 수 없다. */
  alt?: string;
}) {
  const { theme } = useTheme();
  // 전체 화면 뷰어 크기는 리사이즈·회전에 따라가야 한다(모듈 상수로 굳히면 안 된다).
  const { width: screenW, height: screenH } = useWindowDimensions();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const imgSource = source ?? (uri ? { uri } : undefined);
  const canExpand = expandable && !failed && !!imgSource;

  return (
    <>
      <Pressable accessibilityRole="button"
        disabled={!canExpand}
        // 카드 앞면 전체가 '탭하여 뒤집기' Pressable 로 감싸져 있어, 웹에서는 클릭이
        // 부모로 전파되어 이미지 확대와 카드 뒤집기가 동시에 일어난다.
        // stopPropagation 으로 이미지 탭은 확대만 하도록 전파를 차단한다.
        onPress={(e) => { (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.(); setViewerOpen(true); }}
        style={[styles.wrap, { height, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      >
        {!failed && imgSource && (
          <Image
            source={imgSource}
            // 문제의 일부다 — 이 그림을 못 보면 문제를 풀 수 없다.
            accessibilityLabel={alt ?? '문제 이미지'}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={300}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setFailed(true); setLoading(false); }}
          />
        )}

        {loading && !failed && (
          <View style={styles.center}>
            <ActivityIndicator color={c.primary} />
          </View>
        )}

        {failed && (
          <View style={styles.center}>
            <Ionicons name="image-outline" size={30} color={c.textSecondary} />
            <Text style={[styles.failText, { color: c.textSecondary }]}>이미지를 불러올 수 없어요</Text>
          </View>
        )}

        <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Ionicons name="image" size={11} color="#fff" />
          <Text style={styles.badgeText}>이미지 문제</Text>
        </View>

        {canExpand && !loading && (
          <View style={[styles.expandHint, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Ionicons name="expand" size={11} color="#fff" />
            <Text style={styles.badgeText}>탭하여 크게</Text>
          </View>
        )}
      </Pressable>

      {/* 전체 화면 뷰어 */}
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)} statusBarTranslucent>
        {/* 배경은 '탭하면 닫히는 판'이지만, 닫기 버튼을 **품지 않는다**.
            예전엔 배경 Pressable 안에 닫기 Pressable 이 들어 있어 웹에서는 <button> 안에
            <button> 이 됐다 — 유효하지 않은 DOM 이고, 스크린 리더는 중첩된 컨트롤을
            제대로 읽어 주지 못한다. 배경을 화면을 덮는 **형제**로 깔고 그 위에 내용을
            얹으면, 탭 동작은 그대로면서 구조만 바로잡힌다.
            이미지·안내는 pointerEvents="none" 이라 탭이 아래 배경으로 흘러간다. */}
        <View style={{ flex: 1 }}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.viewerScrim]}
            onPress={() => setViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="확대 이미지 닫기"
          />
          <View pointerEvents="box-none" style={styles.viewerBackdrop}>
            {imgSource && (
              <Image
                source={imgSource}
                pointerEvents="none"
                accessibilityLabel={alt ?? '문제 이미지 확대'}
                style={{ width: screenW, height: screenH }}
                contentFit="contain"
                transition={150}
              />
            )}
            <Pressable
              onPress={() => setViewerOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="확대 보기 닫기"
              style={[styles.viewerClose, { top: insets.top + 12 }]}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <View pointerEvents="none" style={[styles.viewerHint, { bottom: insets.bottom + 20 }]}>
              <Ionicons name="information-circle-outline" size={13} color="#fff" />
              <Text style={styles.viewerHintText}>화면을 탭하면 닫혀요</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6 },
  failText: { fontSize: 12, fontFamily: fontBody },
  badge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  expandHint: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  /** 가운데 정렬만 맡는 층 — 어둡게 까는 일은 viewerScrim(형제 배경)이 한다. */
  viewerBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerScrim: { backgroundColor: 'rgba(0,0,0,0.94)' },
  viewerClose: {
    position: 'absolute', right: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  viewerHint: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
  },
  viewerHintText: { color: '#fff', fontSize: 12, fontFamily: fontDisplay },
});
