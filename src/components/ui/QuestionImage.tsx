import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Modal, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * 지금 모바일 데이터(셀룰러)로 연결돼 있는가 — `enabled` 일 때만 NetInfo 를 구독한다.
 *
 * 데이터 절약을 켜지 않은 대부분의 사람에게는 구독 자체가 필요 없다.
 * 판정하지 못하면(웹·미지원 기기) false — 사진을 막는 쪽으로 틀리면 문제를 못 푼다.
 */
function useCellular(enabled: boolean): boolean {
  const [cellular, setCellular] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setCellular(false);
      return;
    }
    try {
      return NetInfo.addEventListener((s) => setCellular(s.type === 'cellular'));
    } catch {
      setCellular(false);
      return undefined;
    }
  }, [enabled]);
  return cellular;
}

/** 원격 주소에서 받아 와야 하는 그림인가(번들 사진은 이미 기기에 있다). */
function isRemote(src: ImageSourcePropType | undefined): boolean {
  return !!src && typeof src === 'object' && !Array.isArray(src) && typeof (src as { uri?: unknown }).uri === 'string';
}

/** 같은 그림인지 가르는 열쇠 — 번들 사진은 숫자, 원격 사진은 주소. */
function sourceKeyOf(src: ImageSourcePropType | undefined): string {
  if (src === undefined) return '';
  if (typeof src === 'number') return `asset:${src}`;
  if (isRemote(src)) return `uri:${(src as { uri: string }).uri}`;
  return JSON.stringify(src);
}

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

  /**
   * 그림이 바뀌면 상태를 처음부터 다시 잡는다.
   *
   * 학습 화면은 카드를 넘겨도 이 컴포넌트를 **같은 자리에서 다시 쓴다**(key 가 없다).
   * 그래서 한 장의 사진이 실패하면 `failed` 가 다음 카드로 그대로 넘어가, 그 뒤로 나오는
   * 사진 문제는 **불러오려는 시도조차 없이** 전부 '불러올 수 없어요'가 됐다. 한 번의
   * 네트워크 실수가 그날 세션의 모든 사진 문제를 풀 수 없게 만든 것이다.
   * 렌더 중에 비교해 바로 되돌린다(effect 로 하면 한 프레임 동안 이전 상태가 보인다).
   */
  const sourceKey = sourceKeyOf(imgSource);
  const [shownKey, setShownKey] = useState(sourceKey);
  const [allowed, setAllowed] = useState(false);
  if (shownKey !== sourceKey) {
    setShownKey(sourceKey);
    setLoading(true);
    setFailed(false);
    setAllowed(false);
  }

  /**
   * 데이터 절약 — 설정에서 켜 두면 모바일 데이터에서는 원격 사진을 **눌러야** 받는다.
   *
   * 예전에는 설정에 '오프라인 · 데이터 절약(Wi-Fi 에서만 다운로드)' 스위치만 있고 그 값을
   * 읽는 곳이 없었다. 앱이 받는 것 중 용량이 큰 것은 카드 사진뿐이라 여기서 지킨다.
   * 그림이 문제의 일부일 수 있으므로 숨기지 않고, 한 번 눌러 받을 수 있게 자리를 남긴다.
   */
  const dataSaver = useSettingsStore((s) => s.offlineMode);
  const cellular = useCellular(dataSaver && isRemote(imgSource));
  const held = dataSaver && cellular && isRemote(imgSource) && !allowed;
  /**
   * 그림이 없거나 못 불러온 상태.
   *
   * 예전에는 source 가 없으면 스피너가 **영원히** 돌았다(onLoadEnd 가 올 일이
   * 없으니 loading 이 풀리지 않는다). 그래서 부르는 쪽마다 "풀리면 그릴 것"
   * 이라는 조건을 달았고, 그 결과 사진을 못 푼 카드는 사진 칸이 통째로 사라져
   * 학습자에게 '사진 없는 문제'로 보였다 — 문제가 "어떤 문제점이 있을까?" 인
   * 카드에서는 그림이 곧 문제라서 풀 수가 없다.
   *
   * 이제 그림이 없으면 **자리를 남긴다.** 여기에 그림이 있어야 한다는 사실이
   * 화면에 남아야, 학습자는 넘기지 않고 신고하거나 다시 불러올 수 있다.
   */
  const missing = !imgSource || failed;
  const canExpand = expandable && !missing && !held;

  return (
    <>
      <Pressable accessibilityRole="button"
        disabled={!canExpand && !held}
        accessibilityLabel={held ? '사진 불러오기' : undefined}
        // 카드 앞면 전체가 '탭하여 뒤집기' Pressable 로 감싸져 있어, 웹에서는 클릭이
        // 부모로 전파되어 이미지 확대와 카드 뒤집기가 동시에 일어난다.
        // stopPropagation 으로 이미지 탭은 확대만 하도록 전파를 차단한다.
        onPress={(e) => {
          (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
          if (held) { setAllowed(true); return; }
          setViewerOpen(true);
        }}
        style={[styles.wrap, { height, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      >
        {!missing && !held && (
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

        {held && (
          <View style={styles.center}>
            <Ionicons name="cellular-outline" size={26} color={c.textSecondary} />
            <Text style={[styles.failText, { color: c.textSecondary }]}>데이터 절약 중이에요 · 탭하면 사진을 불러와요</Text>
          </View>
        )}

        {loading && !missing && !held && (
          <View style={styles.center}>
            <ActivityIndicator color={c.primary} />
          </View>
        )}

        {missing && (
          <View style={styles.center}>
            <Ionicons name="image-outline" size={30} color={c.textSecondary} />
            <Text style={[styles.failText, { color: c.textSecondary }]}>이미지를 불러올 수 없어요</Text>
            {!!alt && (
              <Text style={[styles.failAlt, { color: c.textSecondary }]} numberOfLines={2}>
                {alt}
              </Text>
            )}
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
  /** 그림 대신 남는 설명 — 그림이 문제의 일부일 때 최소한 무엇이 있어야 하는지는 알린다. */
  failAlt: { fontSize: 11, fontFamily: fontBody, opacity: 0.8, paddingHorizontal: 16, textAlign: 'center' },
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
