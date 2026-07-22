import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { BottomSheet } from '../ui/BottomSheet';
import { fontCute, fontBody, fontDisplay } from '../../theme/tokens';
import { useSettingsStore } from '../../store/settingsStore';
import { AMBIENT_THEME_OPTIONS } from '../../constants/ambient';

// 배경 테마 빠른 선택 시트 — 어디서든(주로 MY) 한 번에 열어 바로 적용.
// 배경은 전역이라 고르는 즉시 화면에 반영돼(라이브 피드백) '발견하는 재미'를 준다.
export function AmbientThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const current = useSettingsStore((s) => s.ambientTheme);
  const setAmbientTheme = useSettingsStore((s) => s.setAmbientTheme);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '800', fontFamily: fontCute }}>배경 테마</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, textAlign: 'center', fontFamily: fontBody }}>
          흰 배경 위에 은은한 분위기를 얹어요. 고르면 바로 적용돼요 ✨
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {AMBIENT_THEME_OPTIONS.map((opt) => {
          const active = current === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setAmbientTheme(opt.value)}
              style={{
                width: '47%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: active ? c.primary + '14' : c.surfaceAlt,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderWidth: 1.5,
                borderColor: active ? c.primary : c.border,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: active ? c.primary : c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: active ? 0 : 1, borderColor: c.border }}>
                <Ionicons name={opt.icon as never} size={18} color={active ? '#fff' : c.textSecondary} />
              </View>
              <Text style={{ flex: 1, color: active ? c.primary : c.textPrimary, fontSize: 14 * fs, fontWeight: active ? '800' : '600', fontFamily: fontCute }}>{opt.label}</Text>
              {active && <Ionicons name="checkmark-circle" size={18} color={c.primary} />}
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={onClose} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontDisplay }}>완료</Text>
      </Pressable>
    </BottomSheet>
  );
}

/** 현재 배경 테마의 한국어 라벨(행에 현재값 표시용). */
export function useAmbientThemeLabel(): string {
  const current = useSettingsStore((s) => s.ambientTheme);
  return AMBIENT_THEME_OPTIONS.find((o) => o.value === current)?.label ?? '자동(날씨)';
}
