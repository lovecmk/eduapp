import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import { CardTips } from './CardTips';

/** 복습 등에서 흐름을 끊지 않고 현장 팁을 온디맨드로 여는 바텀시트. */
export function CardTipsSheet({ visible, cardId, onClose }: { visible: boolean; cardId: string; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          <View style={styles.header}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>현장 팁</Text>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="close" size={17} color={c.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 16, paddingTop: 4 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <CardTips cardId={cardId} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 10, paddingBottom: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
