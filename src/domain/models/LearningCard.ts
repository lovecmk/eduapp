// 학습카드 도메인 모델 — 산업 안전점검 대상 화재·폭발 위험 학습 카드.
// 카테고리는 대분류(category) → 중분류(subCategory) → 소분류(topic) 3단 계층으로 구성된다.
export type CardCategory = '전기 위험' | '공정 위험' | '위험물' | '현장 점검';
export type CardStatus = 'new' | 'learning' | 'mastered';
export type CardDifficulty = 'easy' | 'medium' | 'hard';

/**
 * 카드 형식.
 * - explanation: 텍스트+설명형(기본), 텍스트+사진 첨부형 포함
 * - ox: O/X 퀴즈 — 앞면에서 정답 체크
 * - choice: 빈칸 2지선다 및 기존 객관식 퀴즈 — 앞면에서 정답 체크
 */
export type CardType = 'explanation' | 'ox' | 'choice';

/**
 * 콘텐츠 원본(시드) 카드 — 학습 진행 상태와 무관한 순수 지식 데이터.
 * 앞면(상황+문제) / 뒷면(원리·프로세스·화재3요소·결론·출처)을 구조화해 담는다.
 */
export interface SeedCard {
  id: string;
  /** 서버 정본 대분류 코드(RISK/MEASURE). 기존 앱 표시 분류와 별개다. */
  groupCode?: string;
  /** 원본 기술 분류(전기·화기 등). 기존 4분야 집계와 별개로 경로에 표시한다. */
  taxonomyCategoryCode?: string;
  taxonomyCategory?: string;
  /** 대분류 (예: 전기 위험) */
  category: CardCategory;
  /** 중분류 (예: 배선설비) */
  subCategory: string;
  /** 소분류 (예: 전기화재 기본) */
  topic: string;
  /** 키워드 태그 */
  keywords: string[];
  /** 업종 */
  industry?: string;
  /** 카드명(제목) */
  title: string;
  /** 공식 형식 이름(기초용어형/상황형/OX형/빈칸형) */
  format?: string;
  difficulty: CardDifficulty;
  /** 카드별 권장 학습 시간(초) */
  studySeconds: number;
  /** 카드 형식(미지정 시 explanation 으로 간주) */
  type?: CardType;

  // ── 앞면 ──
  /** 앞면_상황설명 — 현장 상황 묘사 */
  situation: string;
  /** 앞면_문제 — 핵심 질문 */
  question: string;
  /** 이미지 문제일 경우 도해/사진 URL */
  imageUrl?: string;

  // ── 퀴즈형(ox/choice) 전용 ──
  /** 보기 목록 — ox: ['O','X'], choice: ['보기1','보기2',...] */
  choices?: string[];
  /** 정답 보기 인덱스(choices 기준) */
  answerIndex?: number;

  // ── 뒷면(구조화 해설) ──
  /** 핵심 원리(뒷면 일반 설명) */
  principle: string;
  /** 화재/폭발 진행 프로세스(단계 체인) */
  process?: string;
  /** 화재의 3요소(가연물·점화원·산소) */
  fireTriangle?: string;
  /** 결론(한 줄 핵심) */
  conclusion: string;
  /** 저장된 정답 원문. conclusion은 기존 화면용 파생 문장일 수 있다. */
  answer?: string;
  /** 위험개선 권고사항 */
  improvement?: string;
  /** 뒷면 미디어(해설 도해/사진) URL — 뒷면_미디어 컬럼에 파일이 있으면 이미지 문제 */
  answerImageUrl?: string;
  /** 출처·관련근거 */
  source?: string;
  /** 참고사항 */
  note?: string;
  /** 이미지 포함 여부 */
  hasImage: boolean;
}

/** 학습 진행 상태가 결합된 런타임 카드. */
export interface LearningCard extends SeedCard {
  status: CardStatus;
  /** 다음 복습 예정일(간격 반복). null 이면 미예정. */
  dueAt: Date | null;
}
