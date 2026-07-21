import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess, hapticWarning } from '../src/utils/haptics';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/ThemeProvider';
import { useCollectionStore, type RedeemResult } from '../src/store/collectionStore';
import { fontCute, fontMono, fontBody } from '../src/theme/tokens';

export default function RedeemScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const redeemCode = useCollectionStore((s) => s.redeemCode);
  const packs = useCollectionStore((s) => s.packs);

  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);

  const onRedeem = () => {
    const r = redeemCode(code);
    setResult(r);
    if (r.ok) hapticSuccess();
    else hapticWarning();
    if (r.ok) setCode('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="가챠 코드 교환" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 보유 팩 배너 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.primary, borderRadius: 18, padding: 18, marginBottom: 24 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="gift" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 * fs, fontFamily: fontCute }}>보유 카드팩</Text>
              <Text style={{ color: '#fff', fontSize: 22 * fs, fontWeight: '900', fontFamily: fontMono }}>{packs}개</Text>
            </View>
          </View>

          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', marginBottom: 8, fontFamily: fontCute }}>이벤트 코드 입력</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginBottom: 12, fontFamily: fontBody, lineHeight: 18 }}>
            브릿지 이벤트·공지에서 받은 코드를 입력하면 카드팩을 받을 수 있어요. (예: WELCOME)
          </Text>

          <TextInput
            value={code}
            onChangeText={(t) => { setCode(t); if (result) setResult(null); }}
            placeholder="코드를 입력하세요"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={onRedeem}
            style={{
              height: 52,
              borderWidth: 1.5,
              borderColor: result ? (result.ok ? c.success : c.error) : c.border,
              borderRadius: 14,
              paddingHorizontal: 16,
              color: c.textPrimary,
              fontSize: 16 * fs,
              fontFamily: fontMono,
              letterSpacing: 1,
              backgroundColor: c.surface,
              marginBottom: 12,
            }}
          />

          {result ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={result.ok ? c.success : c.error} />
              <Text style={{ color: result.ok ? c.success : c.error, fontSize: 13 * fs, fontFamily: fontBody, flexShrink: 1 }}>
                {result.ok ? `${result.message} · 카드팩 ${result.packs}개 지급!` : result.message}
              </Text>
            </View>
          ) : null}

          <Button label="교환하기" variant="filled" onPress={onRedeem} disabled={!code.trim()} />

          {result?.ok ? (
            <Pressable
              onPress={() => router.push('/collection-book' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, padding: 12 }}
            >
              <Text style={{ color: c.primary, fontSize: 14 * fs, fontWeight: '700', fontFamily: fontCute }}>도감에서 카드팩 열기</Text>
              <Ionicons name="arrow-forward" size={16} color={c.primary} />
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
