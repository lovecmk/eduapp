import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import { delay } from './_delay';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

function createMockCards(): LearningCard[] {
  return [
    {
      id: 'c1', category: '소방', difficulty: 'easy',
      question: '소화기 사용 시 가장 먼저 해야 할 동작은?',
      answer: '안전핀을 뽑는다',
      explanation: '소화기는 ① 안전핀 뽑기 → ② 노즐을 불쪽으로 → ③ 손잡이를 움켜쥐기 → ④ 빗자루로 쓸듯이 분사.',
      highlights: ['바람을 등지고 사용해야 분말이 되돌아오지 않음', '소화기 점검은 매월 1회 이상 실시'],
      standards: ['KFS 1998-1 소화기 설치 및 유지관리 기준 제7조'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c2', category: '전기', difficulty: 'easy',
      question: '젖은 손으로 전기 기기를 만져도 되는가?',
      answer: '아니오 (절대 금지)',
      explanation: '물은 전기를 잘 통하게 해 감전 위험이 급격히 커집니다.',
      highlights: ['작업 전 반드시 손과 장갑을 건조하게 유지', '누전차단기 동작 여부를 사전 점검'],
      standards: ['산업안전보건기준에 관한 규칙 제304조(전기기계·기구 취급 제한)'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c3', category: '추락', difficulty: 'medium',
      question: '2m 이상 고소작업 시 필수 보호구는?',
      answer: '안전대(안전벨트) + 안전모',
      explanation: '높이 2m 이상에서는 추락방지를 위해 안전대를 반드시 체결해야 합니다.',
      highlights: ['안전대 걸이는 가능한 한 높은 위치에 고정', '작업 발판은 추락방호망 또는 안전난간과 병행 설치'],
      standards: ['산업안전보건법 제42조(추락위험이 있는 장소)', 'KOSHA GUIDE C-13-2020'],
      status: 'learning', dueAt: day(0),
    },
    {
      id: 'c4', category: '화학', difficulty: 'hard',
      question: 'MSDS에서 가장 먼저 확인할 항목은?',
      answer: '유해·위험성 및 응급조치',
      explanation: 'MSDS 16개 항목 중 유해·위험성(2항)과 응급조치 요령(4항)을 우선 숙지해야 합니다.',
      highlights: ['MSDS는 작업장 내 비치 필수', 'MSDS 미비치 시 과태료 부과 대상'],
      standards: ['산업안전보건법 제110조(물질안전보건자료의 작성·비치)'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c5', category: '기계', difficulty: 'medium',
      question: '회전체 작업 중 장갑 착용은?',
      answer: '상황에 따라 금지',
      explanation: '드릴·선반 등 회전체 작업에서는 장갑이 말려 들어갈 위험이 있습니다.',
      highlights: ['회전체 협착 위험 작업에서는 장갑을 벗는 것이 원칙', '보호장갑이 필요한 경우 안전장갑 사용 후 작업 전 제거'],
      status: 'mastered', dueAt: day(2),
    },
    {
      id: 'c6', category: '소방', difficulty: 'medium',
      question: '화재 발생 시 대피 우선순위는?',
      answer: '인명 대피 → 신고 → 초기 진화',
      explanation: '화재 시 가장 먼저 자신과 주변 사람의 대피를 우선으로 하고, 이후 119 신고, 가능한 경우에만 소화기로 초기 진화를 시도합니다.',
      highlights: ['대피 시 엘리베이터 대신 계단 이용', '연기는 낮게 흐르므로 몸을 낮춰 이동'],
      standards: ['소방시설법 제3조(화재안전기준)'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c7', category: '전기', difficulty: 'hard',
      question: '감전사고 발생 시 응급처치 순서는?',
      answer: '전원 차단 → 구조 → 심폐소생술',
      explanation: '감전사고 시 먼저 전원을 차단하여 추가 감전을 막고, 구조 후 의식·호흡이 없으면 즉시 심폐소생술(CPR)을 시행합니다.',
      highlights: ['절연 장비(고무장갑, 절연봉) 없이 직접 구조 금지', '119 신고와 동시에 CPR 지속'],
      standards: ['한국전기안전공사 전기재해 예방 기준'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c8', category: '추락', difficulty: 'easy',
      question: '사다리 작업 시 안전 수칙은?',
      answer: '3점 지지 유지',
      explanation: '사다리 작업은 항상 두 발과 한 손(또는 두 손과 한 발)의 3점 지지를 유지해야 안전합니다.',
      highlights: ['사다리 각도는 75도 유지', '사다리 최상단 2단 이하에서만 작업'],
      standards: ['산업안전보건기준에 관한 규칙 제26조(사다리)'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c9', category: '화학', difficulty: 'medium',
      question: '화학 물질 누출 시 대처 방법은?',
      answer: '역풍으로 대피 · 밀폐 공간 환기',
      explanation: '화학 물질 누출 시 바람 방향과 반대(역풍)로 대피하고, 밀폐 공간은 즉시 환기시킵니다.',
      highlights: ['누출 물질의 MSDS 확인이 최우선', '방독 마스크 미착용 시 접근 금지'],
      standards: ['화학물질관리법 제23조(유해화학물질 누출사고 대처)'],
      status: 'new', dueAt: day(2),
    },
    {
      id: 'c10', category: '기계', difficulty: 'hard',
      question: '굴착기 작업 중 사고 예방법은?',
      answer: '작업 반경 내 접근 금지',
      explanation: '굴착기 등 중장비 작업 시 장비의 회전 반경 내에는 절대 접근해서는 안 되며, 신호수 배치가 필수입니다.',
      highlights: ['장비 후진 시 후방 카메라 또는 신호수 필수', '작업 전 장비 이상 유무 점검'],
      standards: ['건설기계안전관리기준 제18조(굴착기)'],
      status: 'new', dueAt: day(1),
    },
  ];
}

let mockCards = createMockCards();

export class MockCardRepository implements ICardRepository {
  async getTodayCards(): Promise<LearningCard[]> {
    await delay(300);
    return mockCards.filter((c) => c.dueAt && c.dueAt <= day(0) && c.status !== 'mastered');
  }

  async getAllCards(): Promise<LearningCard[]> {
    await delay(300);
    return [...mockCards];
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    await delay(200);
    const idx = mockCards.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error('목업 데이터에 없는 id입니다');
    const updated = { ...mockCards[idx], status };
    mockCards = [...mockCards];
    mockCards[idx] = updated;
    return updated;
  }
}