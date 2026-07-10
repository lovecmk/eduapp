import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono, fontCute } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { CHANGELOG } from '../../constants/changelog';
import { env } from '../../data/network/env';

/** 업데이트 내역(Changelog) 모달 — OTA 로 배포되는 릴리스 노트를 보여준다. */
export function ChangelogModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <CenterModal visible={visible} onClose={onClose} title="업데이트 내역" icon="sparkles-outline">
      {CHANGELOG.map((entry, idx) => {
        const isCurrent = entry.version === env.build.version;
        return (
          <View key={entry.version} style={{ marginBottom: idx === CHANGELOG.length - 1 ? 0 : 22 }}>
            <View style={styles.versionRow}>
              <Text style={[styles.version, { color: c.textPrimary }]}>v{entry.version}</Text>
              {isCurrent && (
                <View style={[styles.currentChip, { backgroundColor: c.primary + '1A' }]}>
                  <Text style={[styles.currentText, { color: c.primary }]}>현재 버전</Text>
                </View>
              )}
              <Text style={[styles.date, { color: c.textSecondary }]}>{entry.date}</Text>
            </View>
            <View style={{ marginTop: 10, gap: 8 }}>
              {entry.highlights.map((h, i) => (
                <View key={i} style={styles.item}>
                  <Ionicons name="checkmark-circle" size={15} color={c.success} style={{ marginTop: 1 }} />
                  <Text style={[styles.itemText, { color: c.textSecondary }]}>{h}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  version: { fontSize: 16, fontWeight: '900', fontFamily: fontMono },
  currentChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  currentText: { fontSize: 10, fontWeight: '800', fontFamily: fontCute },
  date: { fontSize: 11, marginLeft: 'auto', fontFamily: fontMono },
  item: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  itemText: { fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fontCute },
});
