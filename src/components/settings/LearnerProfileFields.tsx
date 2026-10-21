import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { INTEREST_FIELDS, type InterestField } from '../../constants/interests';
import { EXPERIENCE_OPTIONS } from '../../constants/experience';

export function LearnerProfileFields({ job, experience, interests, onJob, onExperience, onInterest, companyJob }: {
  job: string; experience: string; interests: readonly string[]; companyJob?: string;
  onJob: (value: string) => void; onExperience: (value: string) => void; onInterest: (value: InterestField) => void;
}) {
  const { theme, fontScale } = useTheme(); const c = theme.colors;
  const style = { color: c.textPrimary, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 8 };
  return <View style={{ marginVertical: 16 }}>
    <Text style={{ color: c.textPrimary, fontSize: 16 * fontScale, fontWeight: '700' }}>맞춤 학습 기본정보 (선택)</Text>
    <Text style={{ color: c.textSecondary, marginTop: 8 }}>직무에 필요한 지식과 부족한 분야, 새로운 분야를 함께 추천합니다.</Text>
    {companyJob ? <Text style={{ color: c.textSecondary, marginTop: 12 }}>직무: {companyJob} · 회사 계정 정보 사용</Text> : <><Text style={{ color: c.textPrimary, marginTop: 12 }}>직무</Text><TextInput accessibilityLabel="직무" value={job} onChangeText={onJob} maxLength={120} placeholder="예: 안전점검" placeholderTextColor={c.textSecondary} style={style} /></>}
    <Text style={{ color: c.textPrimary, marginTop: 12 }}>경력</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {EXPERIENCE_OPTIONS.map(({ value, title }) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === experience }} onPress={() => onExperience(value)} style={{ padding: 10, borderRadius: 10, backgroundColor: value === experience ? c.primary + '22' : c.surfaceAlt }}><Text style={{ color: value === experience ? c.primary : c.textPrimary }}>{title}</Text></Pressable>)}
    </View>
    {!!experience && !EXPERIENCE_OPTIONS.some(option => option.value === experience) && <Text style={{ color: c.textSecondary, marginTop: 8 }}>기존 선택: {experience}</Text>}
    <Text style={{ color: c.textPrimary, marginTop: 12 }}>관심분야</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{INTEREST_FIELDS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: interests.includes(value) }} onPress={() => onInterest(value)} style={{ padding: 9, borderRadius: 10, backgroundColor: interests.includes(value) ? c.primary + '22' : c.surfaceAlt }}><Text style={{ color: interests.includes(value) ? c.primary : c.textPrimary }}>{value}</Text></Pressable>)}</View>
  </View>;
}
