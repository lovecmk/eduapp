import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import { delay } from './_delay';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

// 건물점검자 대상 학습 콘텐츠 — 대분류 > 중분류 > 소분류 계층 구조.
// 일부 문항은 도해/사진을 동반하는 이미지 문제(imageUrl).
function createMockCards(): LearningCard[] {
  return [
    {
      id: 'c1', category: '건축', subCategory: '마감·방수', topic: '옥상 방수',
      difficulty: 'easy',
      question: '옥상 노출 방수층 점검 시 가장 먼저 확인할 하자는?',
      answer: '들뜸(부풀음)과 균열',
      explanation: '노출 방수는 자외선·온도차로 들뜸/균열이 먼저 발생합니다. 방수층 파단 전 조기 발견이 누수 예방의 핵심입니다.',
      highlights: ['드레인 주변·파라펫 코너를 중점 확인', '들뜸 부위는 타음(打音)검사로 공극 판별'],
      standards: ['건축물관리법 시행령 별표3 정기점검 항목'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c2', category: '건축', subCategory: '균열·손상', topic: '콘크리트 균열',
      difficulty: 'medium',
      question: '아래 외벽 균열은 구조균열과 비구조균열 중 무엇에 해당하는가?',
      answer: '경사(사인장) 균열 → 구조균열 의심',
      explanation: '개구부 모서리에서 45° 방향으로 발생하는 사인장 균열은 전단력에 의한 구조균열일 가능성이 높아 정밀안전진단 대상입니다.',
      imageUrl: 'https://picsum.photos/seed/crack-wall/640/380',
      highlights: ['폭 0.3mm 이상 균열은 진행성 여부 정밀 계측', '균열 게이지로 3개월 추이 관찰'],
      standards: ['시설물안전법 세부지침 콘크리트 균열 평가기준'],
      status: 'learning', dueAt: day(0),
    },
    {
      id: 'c3', category: '구조', subCategory: '콘크리트', topic: '철근 피복두께',
      difficulty: 'hard',
      question: '옥외 노출 기둥의 최소 철근 피복두께 기준은?',
      answer: '40mm 이상',
      explanation: '흙에 접하지 않는 옥외 노출부(D29 미만)는 피복두께 40mm 이상을 확보해야 철근 부식과 중성화를 지연시킬 수 있습니다.',
      highlights: ['피복 부족 시 철근 노출·부식 팽창으로 균열', '전자기유도식 피복측정기(rebar locator)로 확인'],
      standards: ['KDS 14 20 50 콘크리트구조 피복두께 기준'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c4', category: '구조', subCategory: '철골·접합', topic: '고력볼트',
      difficulty: 'medium',
      question: '고력볼트 접합부 육안점검에서 조임 상태를 확인하는 표식은?',
      answer: '핀테일 파단 및 마킹 회전량',
      explanation: 'TS(토크전단형) 고력볼트는 핀테일이 절단되면 적정 축력이 도입된 것으로 봅니다. 마킹선의 회전 정도로 공회전·조임불량을 판별합니다.',
      highlights: ['너트 회전량 마킹으로 미조임 식별', '볼트 부식·유격 동반 확인'],
      standards: ['KDS 14 31 25 강구조 접합 설계기준'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c5', category: '기계설비', subCategory: '급배수', topic: '저수조 위생',
      difficulty: 'easy',
      question: '건축물 저수조(물탱크) 청소 및 위생점검 주기는?',
      answer: '연 2회 이상',
      explanation: '급수 저수조는 반기 1회(연 2회) 이상 청소하고 수질검사를 실시해야 합니다. 맨홀 잠금·월류관 방충망도 함께 확인합니다.',
      highlights: ['오버플로우관 방충망 파손 여부 확인', '수조 내부 침전물·이물질 점검'],
      standards: ['수도법 시행규칙 제22조의3 저수조 청소'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c6', category: '기계설비', subCategory: '공조·환기', topic: '제연설비',
      difficulty: 'medium',
      question: '거실 제연설비 점검 시 확인하는 핵심 성능은?',
      answer: '급기·배기 풍량과 차압',
      explanation: '제연구역은 화재 시 연기 유입을 막기 위한 최소 차압(40Pa 이상)과 방연풍속을 확보해야 합니다.',
      highlights: ['제연댐퍼 자동 작동 연동 확인', '급기가압 방식은 출입문 개폐력 점검'],
      standards: ['제연설비의 화재안전성능기준(NFPC 501)'],
      status: 'new', dueAt: day(2),
    },
    {
      id: 'c7', category: '전기', subCategory: '수변전', topic: '절연저항',
      difficulty: 'hard',
      question: '저압(400V 미만) 전로의 절연저항 최소 기준은?',
      answer: '0.5MΩ 이상 (SELV/PELV 등 구간별 상이)',
      explanation: '대지전압 150V 초과 400V 이하 전로는 절연저항 0.5MΩ 이상을 유지해야 합니다. 절연 열화는 누전·감전·화재의 직접 원인입니다.',
      imageUrl: 'https://picsum.photos/seed/switchboard/640/380',
      highlights: ['측정 전 전원 차단·잔류전하 방전', '절연저항계(메거)로 상-대지 간 측정'],
      standards: ['KEC 132 전로의 절연저항 및 절연내력'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c8', category: '전기', subCategory: '배선·접지', topic: '접지저항',
      difficulty: 'medium',
      question: '접지저항 측정에 사용하는 계측기와 방법은?',
      answer: '접지저항계 · 전위강하법',
      explanation: '보조전극 2개를 일정 간격으로 타입 후 전위강하법으로 측정합니다. 접지저항이 클수록 지락 시 대지전위 상승으로 위험합니다.',
      highlights: ['건조·동결기에는 대지저항률 상승 유의', '접지선 단선·부식 육안 확인 병행'],
      standards: ['KEC 140 접지시스템'],
      status: 'new', dueAt: day(2),
    },
    {
      id: 'c9', category: '소방', subCategory: '소화설비', topic: '옥내소화전',
      difficulty: 'medium',
      question: '옥내소화전 방수구 노즐 선단 방수압력 적정 범위는?',
      answer: '0.17MPa 이상 0.7MPa 이하',
      explanation: '방수압이 0.17MPa 미만이면 소화 성능 부족, 0.7MPa 초과 시 반동력으로 취급이 어렵습니다. 방수량은 130L/min 이상이어야 합니다.',
      imageUrl: 'https://picsum.photos/seed/hydrant/640/380',
      highlights: ['가장 먼 소화전에서 방수압 측정(피토게이지)', '펌프 기동·충압펌프 자동기동 확인'],
      standards: ['옥내소화전설비의 화재안전성능기준(NFPC 102)'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c10', category: '소방', subCategory: '피난·경보', topic: '유도등',
      difficulty: 'easy',
      question: '정전 시 유도등의 최소 예비전원 점등 유지시간은?',
      answer: '20분 이상 (일부 대상 60분)',
      explanation: '유도등은 상용전원 차단 시 예비전원으로 20분 이상 점등되어야 하며, 지하상가·11층 이상 등은 60분 이상이 요구됩니다.',
      highlights: ['점검스위치로 예비전원 절환 확인', '피난구·통로유도등 시야 가림 점검'],
      standards: ['유도등 및 유도표지의 화재안전성능기준(NFPC 303)'],
      status: 'new', dueAt: day(0),
    },
    {
      id: 'c11', category: '승강기', subCategory: '안전장치', topic: '조속기',
      difficulty: 'hard',
      question: '엘리베이터 조속기(governor)의 기능은?',
      answer: '과속 감지 → 비상정지장치 작동',
      explanation: '카가 정격속도의 일정 비율(약 1.3배)을 초과하면 조속기가 이를 감지해 로프를 물고 비상정지장치(safety gear)를 작동시킵니다.',
      highlights: ['조속기 로프 텐션·마모 확인', '작동속도 봉인(seal) 훼손 여부 점검'],
      standards: ['승강기 안전검사기준 제18조 조속기'],
      status: 'new', dueAt: day(1),
    },
    {
      id: 'c12', category: '승강기', subCategory: '유지관리', topic: '정기검사',
      difficulty: 'easy',
      question: '설치된 승강기의 정기검사 주기는?',
      answer: '매 1년 (설치검사 후)',
      explanation: '승강기는 설치검사 합격 후 매 1년마다 정기검사를 받아야 하며, 검사 합격증명서를 승강기 내부에 게시해야 합니다.',
      highlights: ['검사 유효기간 만료 전 수검', '월 1회 이상 자체점검 기록 유지'],
      standards: ['승강기 안전관리법 제32조 정기검사'],
      status: 'new', dueAt: day(2),
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
