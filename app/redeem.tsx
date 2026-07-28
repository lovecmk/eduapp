import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess, hapticWarning } from '../src/utils/haptics';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/ThemeProvider';
import { useCollectionStore, type RedeemResult } from '../src/store/collectionStore';
import { listGachaCodes, normalizeGachaCode } from '../src/data/gachaCodes';
import { fontCute, fontMono, fontBody, fontDisplay } from '../src/theme/tokens';

export default function RedeemScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const redeemCode = useCollectionStore((s) => s.redeemCode);
  const packs = useCollectionStore((s) => s.packs);
  const redeemedCodes = useCollectionStore((s) => s.redeemedCodes);

  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);

  const events = listGachaCodes();

  const doRedeem = (raw: string) => {
    const r = redeemCode(raw);
    setResult(r);
    if (r.ok) { hapticSuccess(); setCode(''); }
    else hapticWarning();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="이벤트 · 쿠폰" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 쿠폰 지갑 배너 — 보유 카드팩 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.primary, borderRadius: 20, padding: 18, marginBottom: 22 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ticket" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 * fs, fontFamily: fontCute }}>내 쿠폰 지갑 · 보유 카드팩</Text>
              <Text style={{ color: '#fff', fontSize: 24 * fs, fontWeight: '900', fontFamily: fontMono }}>{packs}개</Text>
            </View>
            <Pressable accessibilityRole="button"
              onPress={() => router.push('/collection-book' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}
            >
              <Text style={{ color: '#fff', fontSize: 12 * fs, fontFamily: fontDisplay }}>도감</Text>
              <Ionicons name="chevron-forward" size={13} color="#fff" />
            </Pressable>
          </View>

          {/* 진행 중인 이벤트 쿠폰 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="pricetags" size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>진행 중인 이벤트</Text>
          </View>

          <View style={{ gap: 12, marginBottom: 26 }}>
            {events.map((ev) => {
              const used = redeemedCodes.includes(normalizeGachaCode(ev.code));
              return (
                <View key={ev.code} style={{ flexDirection: 'row', borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden', opacity: used ? 0.6 : 1 }}>
                  {/* 쿠폰 좌측 스텁 */}
                  <View style={{ width: 68, backgroundColor: used ? c.surfaceAlt : c.primary + '12', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderStyle: 'dashed', borderRightColor: c.border }}>
                    <Text style={{ color: used ? c.textSecondary : c.primary, fontSize: 20 * fs, fontWeight: '900', fontFamily: fontMono }}>×{ev.packs}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 9.5, fontFamily: fontBody, marginTop: 1 }}>카드팩</Text>
                  </View>
                  {/* 쿠폰 본문 */}
                  <View style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, fontFamily: fontCute, fontWeight: '700' }}>{ev.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                        <Ionicons name="pricetag-outline" size={11} color={c.textSecondary} />
                        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono, letterSpacing: 0.5 }}>{ev.code}</Text>
                      </View>
                    </View>
                    {used ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7 }}>
                        <Ionicons name="checkmark-circle" size={15} color={c.success} />
                        <Text style={{ color: c.success, fontSize: 12 * fs, fontFamily: fontCute, fontWeight: '700' }}>사용 완료</Text>
                      </View>
                    ) : (
                      <Pressable accessibilityRole="button" onPress={() => doRedeem(ev.code)} style={{ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
                        <Text style={{ color: '#fff', fontSize: 12.5 * fs, fontFamily: fontDisplay }}>받기</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* 쿠폰 코드 직접 입력 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="keypad" size={15} color={c.textPrimary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>쿠폰 코드 직접 입력</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginBottom: 12, fontFamily: fontBody, lineHeight: 18 }}>
            공지·이벤트에서 받은 쿠폰 코드가 있다면 직접 입력해 카드팩을 받으세요.
          </Text>

          <TextInput
            accessibilityLabel="교환 코드 입력"
            value={code}
            onChangeText={(t) => { setCode(t); if (result) setResult(null); }}
            placeholder="쿠폰 코드를 입력하세요"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => code.trim() && doRedeem(code)}
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

          <Button label="쿠폰 교환하기" variant="filled" onPress={() => doRedeem(code)} disabled={!code.trim()} />

          {result?.ok ? (
            <Pressable accessibilityRole="button"
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
