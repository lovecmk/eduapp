import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { TextField } from '../src/components/ui/TextField';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { ALL_CATEGORIES } from '../src/constants/categories';
import { validateCardDraft, type CardDraft } from '../src/domain/models/CardDraft';
import type { CardCategory, CardType, CardDifficulty } from '../src/domain/models/LearningCard';
import { useCreateCards } from '../src/hooks/useCards';
import { errorMessage } from '../src/data/network/errors';
import { useSafeTimeout } from '../src/hooks/useSafeTimeout';
import { useGoBack } from '../src/hooks/useGoBack';
import { fontCute, fontBody, fontMono, fontDisplay } from '../src/theme/tokens';

const TYPES: CardType[] = ['explanation', 'ox', 'choice'];
const TYPE_LABEL = ['설명형', 'OX', '객관식'];
const DIFFS: CardDifficulty[] = ['easy', 'medium', 'hard'];
const DIFF_LABEL = ['쉬움', '보통', '어려움'];

const JSON_EXAMPLE = JSON.stringify(
  [
    {
      category: '전기 위험', subCategory: '배선설비', topic: '누전차단기', keywords: ['ELB', '감전'],
      title: '누전차단기의 목적', difficulty: 'medium', type: 'ox',
      question: "누전차단기(ELB)의 주된 목적은 '과부하 차단'이다.",
      choices: ['O', 'X'], answerIndex: 1,
      principle: 'ELB는 누설전류를 감지해 감전을 예방한다. 과부하·단락 보호는 배선용차단기(MCCB)의 몫이다.',
      conclusion: 'ELB=감전 보호, MCCB=과부하 보호.', source: 'KEC 211',
    },
  ],
  null,
  2,
);

export default function AuthorCardScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const createCards = useCreateCards();
  // 딥링크로 바로 열렸을 때도 등록 후 갈 곳이 있도록 홈 폴백을 둔다.
  const goBack = useGoBack();

  const [mode, setMode] = useState(0); // 0=폼, 1=JSON

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="문제 등록" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <SegmentedControl options={['폼으로 등록', 'JSON 일괄']} selectedIndex={mode} onChange={setMode} />
          <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 8, lineHeight: 17 }}>
            추후 웹 등록 도구가 내보내는 메타데이터 형식과 동일해요. 지금은 앱에 저장되고, 서버 연결 시 그대로 전송됩니다.
          </Text>
        </View>
        {mode === 0 ? (
          <FormAuthor createCards={createCards} onDone={goBack} />
        ) : (
          <JsonAuthor createCards={createCards} onDone={goBack} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── 폼 등록 ────────────────────────────────────────────────
function FormAuthor({ createCards, onDone }: { createCards: ReturnType<typeof useCreateCards>; onDone: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  const [catIdx, setCatIdx] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [diffIdx, setDiffIdx] = useState(1);
  const [subCategory, setSubCategory] = useState('');
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [situation, setSituation] = useState('');
  const [question, setQuestion] = useState('');
  const [choicesText, setChoicesText] = useState('O, X');
  const [answerIndex, setAnswerIndex] = useState(0);
  const [principle, setPrinciple] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [source, setSource] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  // 등록 실패(네트워크 끊김·서버 오류)를 화면에 드러내기 위한 상태.
  // 예전엔 mutateAsync 를 try 없이 await 해서, 실패하면 아무 반응 없이
  // 버튼 로딩만 풀렸다(사용자는 등록됐는지 아닌지 알 수 없었다).
  const [sendError, setSendError] = useState<string | null>(null);
  const { run } = useSafeTimeout();

  const type = TYPES[typeIdx];
  const choices = useMemo(
    () => (type === 'ox' ? ['O', 'X'] : choicesText.split(',').map((s) => s.trim()).filter(Boolean)),
    [type, choicesText],
  );

  const draft: Partial<CardDraft> = {
    category: ALL_CATEGORIES[catIdx] as CardCategory,
    subCategory, topic, title, difficulty: DIFFS[diffIdx], type,
    situation, question,
    choices: type === 'explanation' ? undefined : choices,
    answerIndex: type === 'explanation' ? undefined : answerIndex,
    principle, conclusion, source,
  };
  const errors = validateCardDraft(draft);
  const errFor = (f: keyof CardDraft) => submitted && errors.find((e) => e.field === f)?.message;

  const submit = async () => {
    setSubmitted(true);
    setSendError(null);
    if (errors.length > 0) return;
    try {
      await createCards.mutateAsync([draft as CardDraft]);
    } catch (e) {
      setSendError(errorMessage(e));
      return; // 입력값은 그대로 남겨 다시 시도할 수 있게 한다
    }
    setDone(true);
    run(onDone, 900);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {/* 미리보기 */}
      <PreviewCard draft={draft} choices={choices} type={type} />

      <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay, marginTop: 20, marginBottom: 8 }}>대분류</Text>
      <SegmentedControl options={ALL_CATEGORIES as string[]} selectedIndex={catIdx} onChange={setCatIdx} />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1 }}><TextField label="중분류" value={subCategory} onChangeText={setSubCategory} placeholder="예: 배선설비" status={errFor('subCategory') ? 'error' : 'default'} /></View>
        <View style={{ flex: 1 }}><TextField label="소분류" value={topic} onChangeText={setTopic} placeholder="예: 누전차단기" status={errFor('topic') ? 'error' : 'default'} /></View>
      </View>
      <TextField label="카드명" value={title} onChangeText={setTitle} placeholder="예: 누전차단기의 목적" status={errFor('title') ? 'error' : 'default'} helperText={errFor('title') || undefined} />

      <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay, marginTop: 6, marginBottom: 8 }}>형식</Text>
      <SegmentedControl options={TYPE_LABEL} selectedIndex={typeIdx} onChange={(i) => { setTypeIdx(i); setAnswerIndex(0); }} />

      <View style={{ marginTop: 14 }}>
        <TextField label="상황 설명(선택)" value={situation} onChangeText={setSituation} placeholder="현장 상황 묘사" multiline />
      </View>
      <TextField label="문제" value={question} onChangeText={setQuestion} placeholder="핵심 질문" multiline status={errFor('question') ? 'error' : 'default'} helperText={errFor('question') || undefined} />

      {type !== 'explanation' && (
        <>
          {type === 'choice' && (
            <TextField label="보기(쉼표로 구분)" value={choicesText} onChangeText={setChoicesText} placeholder="보기1, 보기2, 보기3" status={errFor('choices') ? 'error' : 'default'} helperText={errFor('choices') || undefined} />
          )}
          <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay, marginTop: 6, marginBottom: 8 }}>정답</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {choices.map((ch, i) => (
              <Pressable key={i} onPress={() => setAnswerIndex(i)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: answerIndex === i ? c.success : c.border, backgroundColor: answerIndex === i ? c.success + '14' : c.surface }}>
                <Text style={{ color: answerIndex === i ? c.success : c.textPrimary, fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '700' }}>{ch || `보기${i + 1}`}</Text>
              </Pressable>
            ))}
          </View>
          {errFor('answerIndex') && <Text style={{ color: c.error, fontSize: 11.5, marginTop: 6, fontFamily: fontBody }}>{errFor('answerIndex')}</Text>}
        </>
      )}

      <View style={{ marginTop: 14 }}>
        <TextField label="핵심 원리(해설)" value={principle} onChangeText={setPrinciple} placeholder="뒷면 설명" multiline status={errFor('principle') ? 'error' : 'default'} helperText={errFor('principle') || undefined} />
      </View>
      <TextField label="결론(한 줄)" value={conclusion} onChangeText={setConclusion} placeholder="핵심 요약" />
      <TextField label="출처(선택)" value={source} onChangeText={setSource} placeholder="예: KEC 211" />

      <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay, marginTop: 6, marginBottom: 8 }}>난이도</Text>
      <SegmentedControl options={DIFF_LABEL} selectedIndex={diffIdx} onChange={setDiffIdx} />

      {submitted && errors.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: c.error + '14', borderRadius: 12, padding: 12 }}>
          <Ionicons name="alert-circle" size={16} color={c.error} />
          <Text style={{ color: c.error, fontSize: 12.5 * fs, fontFamily: fontBody, flex: 1 }}>{errors.length}개 항목을 확인해주세요</Text>
        </View>
      )}

      {sendError && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: c.error + '14', borderRadius: 12, padding: 12 }}>
          <Ionicons name="cloud-offline" size={16} color={c.error} />
          <Text style={{ color: c.error, fontSize: 12.5 * fs, fontFamily: fontBody, flex: 1 }}>
            {sendError} 입력한 내용은 그대로 있어요. 다시 시도해주세요.
          </Text>
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.success + '18', borderRadius: 16, height: 52 }}>
            <Ionicons name="checkmark-circle" size={20} color={c.success} />
            <Text style={{ color: c.success, fontSize: 15 * fs, fontFamily: fontCute, fontWeight: '800' }}>등록 완료! 학습 목록에 추가됐어요</Text>
          </View>
        ) : (
          <Button label="문제 등록하기" variant="filled" loading={createCards.isPending} onPress={submit} />
        )}
      </View>
    </ScrollView>
  );
}

// ── JSON 일괄 등록 ─────────────────────────────────────────
function JsonAuthor({ createCards, onDone }: { createCards: ReturnType<typeof useCreateCards>; onDone: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const { run } = useSafeTimeout();

  const submit = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setResult({ ok: false, msg: 'JSON 형식이 올바르지 않아요' });
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const allErrors: string[] = [];
    arr.forEach((d, i) => {
      const errs = validateCardDraft(d as Partial<CardDraft>);
      if (errs.length) allErrors.push(`#${i + 1}: ${errs.map((e) => e.message).join(', ')}`);
    });
    if (allErrors.length) {
      setResult({ ok: false, msg: allErrors.slice(0, 5).join('\n') });
      return;
    }
    try {
      await createCards.mutateAsync(arr as CardDraft[]);
    } catch (e) {
      // 저장 실패를 삼키면 사용자는 등록됐다고 오해한다. 입력은 남겨두고 이유를 보여준다.
      setResult({ ok: false, msg: `${errorMessage(e)} 입력한 JSON은 그대로 있어요.` });
      return;
    }
    setResult({ ok: true, msg: `${arr.length}개 문제를 등록했어요` });
    run(onDone, 1000);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay }}>CardDraft JSON 배열</Text>
        <Pressable onPress={() => setText(JSON_EXAMPLE)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="sparkles" size={13} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontDisplay }}>예시 채우기</Text>
        </Pressable>
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={'[ { "category": "전기 위험", "subCategory": "...", "topic": "...", "title": "...", "question": "...", ... } ]'}
        placeholderTextColor={c.textSecondary}
        multiline
        style={{ minHeight: 260, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, color: c.textPrimary, fontSize: 12.5, fontFamily: fontMono, textAlignVertical: 'top' }}
      />
      {result && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, backgroundColor: (result.ok ? c.success : c.error) + '14', borderRadius: 12, padding: 12 }}>
          <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={result.ok ? c.success : c.error} />
          <Text style={{ color: result.ok ? c.success : c.error, fontSize: 12.5 * fs, fontFamily: fontBody, flex: 1, lineHeight: 18 }}>{result.msg}</Text>
        </View>
      )}
      <View style={{ marginTop: 20 }}>
        <Button label="일괄 등록하기" variant="filled" loading={createCards.isPending} onPress={submit} />
      </View>
    </ScrollView>
  );
}

// ── 실시간 미리보기 카드 ───────────────────────────────────
function PreviewCard({ draft, choices, type }: { draft: Partial<CardDraft>; choices: string[]; type: CardType }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Badge label={draft.category ?? '분류'} />
        {type !== 'explanation' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.warning + '18', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Ionicons name="help-circle" size={12} color={c.warning} />
            <Text style={{ color: c.warning, fontSize: 10.5, fontFamily: fontCute }}>{type === 'ox' ? 'OX 퀴즈' : '객관식'}</Text>
          </View>
        )}
      </View>
      {!!draft.situation && <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 19, fontFamily: fontCute, marginBottom: 6 }}>{draft.situation}</Text>}
      <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontWeight: '800', lineHeight: 23, fontFamily: fontCute }}>{draft.question || '문제 미리보기가 여기에 표시돼요'}</Text>
      {type !== 'explanation' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {choices.map((ch, i) => (
            <View key={i} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: draft.answerIndex === i ? c.success : c.border, backgroundColor: draft.answerIndex === i ? c.success + '12' : c.surfaceAlt }}>
              <Text style={{ color: draft.answerIndex === i ? c.success : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute }}>{ch || `보기${i + 1}`}</Text>
            </View>
          ))}
        </View>
      )}
      {!!draft.conclusion && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, flexDirection: 'row', gap: 6 }}>
          <Ionicons name="bulb" size={14} color={c.success} />
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, flex: 1, lineHeight: 17 }}>{draft.conclusion}</Text>
        </View>
      )}
    </View>
  );
}
