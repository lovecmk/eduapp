import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EXPERIENCE_OPTIONS } from '../../constants/experience';
import { useSettingsStore } from '../../store/settingsStore';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { hapticTap } from '../../utils/haptics';
import { Button } from '../ui/Button';

/** Shares the account settings/offline sync path with the profile editor. */
export function ExperienceStep({ onContinue }: { onContinue: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const saved = useSettingsStore(s => s.experience);
  const [picked, setPicked] = useState(saved);
  const touched = useRef(false);
  // A delayed settings restore can fill the initial selection, but cannot
  // replace a choice the user is currently making.
  useEffect(() => { if (!touched.current) setPicked(saved); }, [saved]);
  const legacy = !!picked && !EXPERIENCE_OPTIONS.some(option => option.value === picked);
  const confirm = () => {
    if (!picked.trim()) return;
    const store = useSettingsStore.getState();
    if (store.experience !== picked) {
      store.setLearnerProfile(store.job, picked);
      store.markAccountSettingsChanged(Date.now());
    }
    hapticTap();
    onContinue();
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 24 }}>
        <Text style={{ fontSize: 34 }}>💼</Text>
        <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontBody, marginTop: 10 }}>시작하기 · 1 / 2</Text>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontFamily: fontDisplay, marginTop: 8 }}>경력을 알려주세요</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20 * fs, fontFamily: fontBody, textAlign: 'center', marginTop: 8 }}>
          현재 업무와 관련된 경력을 골라주세요.{'\n'}앞으로 나에게 맞는 학습을 준비하는 데 활용해요.
        </Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="업무 경력">
        {EXPERIENCE_OPTIONS.map(option => {
          const selected = picked === option.value;
          return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.title}
            accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => { touched.current = true; setPicked(option.value); hapticTap(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: selected ? 2 : 1,
              borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary + '12' : c.surface, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: selected ? c.primary : c.textPrimary, fontSize: 16 * fs, fontFamily: fontDisplay }}>{option.title}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 18 * fs, fontFamily: fontBody, marginTop: 5 }}>{option.description}</Text>
            </View>
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 0 : 1.5,
              borderColor: c.border, backgroundColor: selected ? c.primary : 'transparent' }}>
              {selected && <Ionicons name="checkmark" size={15} color="#fff" />}
            </View>
          </Pressable>;
        })}
      </View>
      {legacy && <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody, marginBottom: 12 }}>기존 선택: {picked} · 그대로 계속하거나 새 구간을 선택할 수 있어요.</Text>}
      <View style={{ marginTop: 'auto', paddingTop: 16 }}>
        <Button label="다음 · 진영 선택" onPress={confirm} disabled={!picked.trim()} />
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 18 * fs, fontFamily: fontBody, textAlign: 'center', marginTop: 12 }}>프로필에서 언제든 수정할 수 있어요.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
