import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono, fontCute, fontBody } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { CHANGELOG, type ChangelogEntry } from '../../constants/changelog';
import { env } from '../../data/network/env';

/**
 * 업데이트 내역(Changelog) 모달 — OTA 로 배포되는 릴리스 노트를 보여준다.
 * 커밋(버전)별로 날짜와 함께 한 줄씩 접힌 목록으로 나열하고,
 * 항목을 누르면 해당 업데이트 상세(변경점 전체)로 들어간다.
 */
export function ChangelogModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [selected, setSelected] = useState<ChangelogEntry | null>(null);

  // 모달을 닫으면 목록 화면으로 초기화(다음에 열 때 항상 목록부터).
  useEffect(() => {
    if (!visible) setSelected(null);
  }, [visible]);

  return (
    <CenterModal visible={visible} onClose={onClose} title="업데이트 내역" icon="sparkles-outline">
      {selected ? (
        // 상세 — 선택한 업데이트의 변경점 전체
        <View>
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={c.primary} />
            <Text style={[styles.backText, { color: c.primary }]}>목록</Text>
          </Pressable>

          <View style={styles.detailHead}>
            <Text style={[styles.version, { color: c.textPrimary }]}>v{selected.version}</Text>
            {selected.version === env.build.version && (
              <View style={[styles.currentChip, { backgroundColor: c.primary + '1A' }]}>
                <Text style={[styles.currentText, { color: c.primary }]}>현재 버전</Text>
              </View>
            )}
            <Text style={[styles.date, { color: c.textSecondary }]}>{selected.date}</Text>
          </View>

          <View style={{ marginTop: 14, gap: 10 }}>
            {selected.highlights.map((h, i) => (
              <View key={i} style={styles.item}>
                <Ionicons name="checkmark-circle" size={15} color={c.success} style={{ marginTop: 1 }} />
                <Text style={[styles.itemText, { color: c.textSecondary }]}>{h}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        // 목록 — 커밋(버전)별 날짜 + 요약 한 줄. 같은 날짜가 여러 건이어도 그대로 나열된다.
        <View>
          {CHANGELOG.map((entry, idx) => {
            const isCurrent = entry.version === env.build.version;
            return (
              <Pressable
                key={entry.version}
                onPress={() => setSelected(entry)}
                style={[
                  styles.row,
                  {
                    borderColor: isCurrent ? c.primary + '55' : c.border,
                    backgroundColor: isCurrent ? c.primary + '0D' : c.surfaceAlt,
                    marginBottom: idx === CHANGELOG.length - 1 ? 0 : 10,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.version, { color: c.textPrimary }]}>v{entry.version}</Text>
                    {isCurrent && (
                      <View style={[styles.currentChip, { backgroundColor: c.primary + '1A' }]}>
                        <Text style={[styles.currentText, { color: c.primary }]}>현재</Text>
                      </View>
                    )}
                    <Text style={[styles.date, { color: c.textSecondary }]}>{entry.date}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.summary, { color: c.textSecondary }]}>
                    {entry.highlights[0]}
                  </Text>
                  {entry.highlights.length > 1 && (
                    <Text style={[styles.more, { color: c.primary }]}>+{entry.highlights.length - 1}건 더보기</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      )}
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  version: { fontSize: 15, fontWeight: '900', fontFamily: fontMono },
  currentChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  currentText: { fontSize: 10, fontWeight: '800', fontFamily: fontCute },
  date: { fontSize: 11, marginLeft: 'auto', fontFamily: fontMono },
  summary: { fontSize: 12.5, lineHeight: 18, fontFamily: fontBody },
  more: { fontSize: 11, marginTop: 4, fontFamily: fontCute, fontWeight: '700' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 14, alignSelf: 'flex-start' },
  backText: { fontSize: 14, fontFamily: fontCute, fontWeight: '700' },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  itemText: { fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fontCute },
});
