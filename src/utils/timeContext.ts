// 시간대(사용자가 앱을 켠 시각) 기반 컨텍스트 — 메인 히어로의 문구/이모지/톤을
// 시간에 맞게 바꿔 "지금 이 순간의 나"에게 말 거는 경험을 만든다.

export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';

export interface TimeContext {
  period: DayPeriod;
  /** 짧은 시간대 라벨 (예: '늦은 밤') */
  label: string;
  /** 시간대 대표 이모지 (히어로 배지) */
  emoji: string;
  /** 히어로 캐릭터 이모지 (시간대별로 표정/상황이 달라짐) */
  character: string;
  /** 이 시간대에 어울리는 인사 문구 풀(무작위로 하나 선택) */
  greetings: string[];
  /** 시간대 강조색(배지·글로우 틴트용) */
  tint: string;
  /** 인사말 앞에 붙는 호칭 톤 (예: '좋은 아침이에요') */
  salutation: string;
}

function periodOf(hour: number): DayPeriod {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 && hour < 24) return 'night';
  return 'lateNight'; // 0~5시
}

const PRESET: Record<DayPeriod, Omit<TimeContext, 'period'>> = {
  dawn: {
    label: '이른 아침',
    emoji: '🌅',
    character: '🌱',
    salutation: '상쾌한 아침이에요',
    tint: '#FDBA74',
    greetings: [
      '이른 아침, 오늘의 안전을 가장 먼저 챙기는 당신 멋져요',
      '하루를 여는 3분, 오늘도 무사고로 시작해요',
      '아침 공기처럼 맑게, 한 장으로 가볍게 시작해요',
      '오늘 하루도 안전하게 — 첫 카드부터 함께해요',
    ],
  },
  morning: {
    label: '아침',
    emoji: '☀️',
    character: '👷',
    salutation: '좋은 아침이에요',
    tint: '#FCD34D',
    greetings: [
      '오늘도 3분, 안전을 차곡차곡 쌓아요',
      '아침의 한 장이 하루의 사고를 막아요',
      '집중이 가장 잘 되는 시간, 지금 시작해요',
      '가볍게 워밍업 한 장, 오늘도 파이팅이에요',
    ],
  },
  afternoon: {
    label: '한낮',
    emoji: '🌤️',
    character: '🦺',
    salutation: '점심 잘 챙기셨나요',
    tint: '#38BDF8',
    greetings: [
      '나른한 오후, 짧은 3분으로 리프레시해요',
      '오후의 한 장이 현장을 더 안전하게 만들어요',
      '잠깐 쉬어가듯, 카드 한 장으로 환기해요',
      '오늘의 학습, 아직이라면 지금이 딱 좋아요',
    ],
  },
  evening: {
    label: '저녁',
    emoji: '🌇',
    character: '🌆',
    salutation: '오늘 하루도 수고했어요',
    tint: '#FB923C',
    greetings: [
      '하루를 마무리하는 3분, 오늘의 안전을 되새겨요',
      '퇴근길 한 장, 내일의 나를 위한 준비예요',
      '오늘 하루 고생 많았어요 — 마지막 한 장만 더!',
      '저녁의 복습이 기억을 오래 붙잡아요',
    ],
  },
  night: {
    label: '밤',
    emoji: '🌙',
    character: '🌙',
    salutation: '편안한 밤이에요',
    tint: '#818CF8',
    greetings: [
      '하루의 끝, 오늘 배운 안전을 가볍게 복습해요',
      '자기 전 3분, 오늘의 지식을 내 것으로 만들어요',
      '오늘도 안전하게 마무리 — 정말 잘하고 있어요',
      '조용한 밤, 카드 한 장으로 하루를 정리해요',
    ],
  },
  lateNight: {
    label: '늦은 밤',
    emoji: '🌌',
    character: '🦉',
    salutation: '늦은 시간까지 고생 많아요',
    tint: '#A78BFA',
    greetings: [
      '늦게까지 애쓰는 당신, 무리하지 말고 딱 한 장만',
      '이 시간의 집중력은 특별해요 — 가볍게 한 장',
      '늦은 밤에도 안전을 챙기는 마음, 정말 대단해요',
      '오늘도 정말 수고했어요. 짧게 마무리하고 푹 쉬어요',
    ],
  },
};

/** 현재(또는 주어진) 시각의 시간대 컨텍스트를 반환한다. */
export function getTimeContext(date: Date = new Date()): TimeContext {
  const period = periodOf(date.getHours());
  return { period, ...PRESET[period] };
}

/** 문구 풀에서 하나를 고른다(seed 를 주면 결정론적, 없으면 무작위). */
export function pickGreeting(ctx: TimeContext, seed?: number): string {
  const n = ctx.greetings.length;
  if (n === 0) return '';
  const idx = seed === undefined ? Math.floor(Math.random() * n) : Math.abs(Math.trunc(seed)) % n;
  return ctx.greetings[idx];
}
