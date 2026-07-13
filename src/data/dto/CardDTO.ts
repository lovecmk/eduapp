export interface CardDTO {
  id: string;
  /** 대분류 코드 */
  category_cd: string;
  /** 중분류 (예: 배선설비) */
  sub_category_nm?: string;
  /** 소분류 (예: 전기화재 기본) */
  topic_nm?: string;
  /** 키워드 태그 */
  keywords?: string[];
  /** 카드명(제목) */
  title_txt?: string;
  /** 권장 학습 시간(초) */
  study_seconds?: number;
  /** 앞면_상황설명 */
  situation_txt?: string;
  /** 앞면_문제 */
  question_txt: string;
  /** 이미지 문제 URL */
  image_url?: string;
  /** 뒷면 — 핵심 원리 */
  principle_txt?: string;
  /** 뒷면 — 화재/폭발 프로세스 */
  process_txt?: string;
  /** 뒷면 — 화재의 3요소 */
  fire_triangle_txt?: string;
  /** 뒷면 — 결론 */
  conclusion_txt?: string;
  /** 출처·관련근거 */
  source_txt?: string;
  status_cd: 'NEW' | 'LEARNING' | 'MASTERED';
  difficulty_cd?: 'EASY' | 'MEDIUM' | 'HARD';
  due_at: string | null;
}
