import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { TextField } from '../src/components/ui/TextField';
import { Button } from '../src/components/ui/Button';
import { AvailabilityField, type CheckState } from '../src/components/auth/AvailabilityField';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { authRepository } from '../src/data/repositories';
import { fontBody, fontCute } from '../src/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICKNAME_RE = /^[a-zA-Z0-9가-힣_]{2,12}$/;

export default function EditProfileScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { updateProfile, loading, error: authError, clearError } = useAuthStore();

  const [name, setName] = useState(user?.name ?? '');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [org, setOrg] = useState(user?.org ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [nicknameState, setNicknameState] = useState<CheckState>('idle');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [hint, setHint] = useState<string | null>(null);

  const originalNickname = (user?.nickname ?? '').trim();
  const nicknameChanged = nickname.trim() !== originalNickname;
  // 닉네임을 바꾸지 않았거나, 비웠거나(닉네임 제거 허용), 바꿨으면 중복확인을 통과해야 저장 가능.
  const nicknameOk = !nicknameChanged || nickname.trim() === '' || nicknameState === 'available';

  const dirty = useMemo(
    () =>
      name.trim() !== (user?.name ?? '').trim() ||
      nicknameChanged ||
      email.trim() !== (user?.email ?? '').trim() ||
      org.trim() !== (user?.org ?? '').trim() ||
      jobTitle.trim() !== (user?.jobTitle ?? '').trim(),
    [name, nicknameChanged, email, org, jobTitle, user],
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="내 정보 수정" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontBody }}>로그인 후 이용할 수 있어요.</Text>
        </View>
      </View>
    );
  }

  const onSave = async () => {
    setHint(null);
    clearError();
    const next: typeof errors = {};
    if (!name.trim()) next.name = '이름을 입력해주세요';
    if (!EMAIL_RE.test(email.trim())) next.email = '올바른 이메일 형식이 아닙니다';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!nicknameOk) {
      setHint('변경한 닉네임의 중복확인을 완료해주세요');
      return;
    }
    const ok = await updateProfile({
      name: name.trim(),
      nickname: nickname.trim(),
      email: email.trim(),
      org: org.trim(),
      jobTitle: jobTitle.trim(),
    });
    if (ok) router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="내 정보 수정" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48, maxWidth: 520, width: '100%', alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 아이디는 변경 불가 — 안내 표시 */}
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="lock-closed" size={18} color={c.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontCute }}>아이디 (변경 불가)</Text>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontBody }}>{user.loginId ?? '—'}</Text>
            </View>
          </View>

          <TextField label="이름" value={name} onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: undefined })); }} placeholder="이름을 입력하세요"
            status={errors.name ? 'error' : 'default'} helperText={errors.name} />

          <AvailabilityField
            label="닉네임"
            value={nickname}
            onChangeText={setNickname}
            placeholder="커뮤니티에 표시될 별명"
            autoCapitalize="none"
            validate={(v) => (NICKNAME_RE.test(v.trim()) ? null : '닉네임은 2~12자(한글/영문/숫자)로 입력하세요')}
            checkTaken={(v) => authRepository.isNicknameTaken(v, user.id)}
            onStateChange={setNicknameState}
            availableText="사용 가능한 닉네임입니다"
            takenText="이미 사용 중인 닉네임입니다"
          />
          {!nicknameChanged && originalNickname ? (
            <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginTop: -8, marginBottom: 12, fontFamily: fontBody }}>
              현재 닉네임을 그대로 사용 중이에요.
            </Text>
          ) : null}

          <TextField label="이메일" value={email} onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); }} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address"
            status={errors.email ? 'error' : 'default'} helperText={errors.email} />
          <TextField label="소속 (선택)" value={org} onChangeText={setOrg} placeholder="예) 안전관리본부" />
          <TextField label="직무 (선택)" value={jobTitle} onChangeText={setJobTitle} placeholder="예) 현장 안전관리자" />

          {(authError || hint) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 }}>
              <Ionicons name="alert-circle" size={14} color={c.error} />
              <Text style={{ color: c.error, fontSize: 12 * fs, fontFamily: fontBody }}>{authError ?? hint}</Text>
            </View>
          )}

          <View style={{ marginTop: 8 }}>
            <Button label="저장하기" variant="filled" loading={loading} onPress={onSave} disabled={!dirty} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
