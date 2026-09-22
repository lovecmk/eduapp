export interface CardDTO {
  id: string;
  /** 서버 정본 대분류 코드(RISK/MEASURE). 앱의 표시 분류와 별개다. */
  group_cd?: string;
  /** 대분류 코드 */
  category_cd: string;
  /** 중분류 (예: 배선설비) */
  sub_category_nm?: string;
  /** 소분류 (예: 전기화재 기본) */
  topic_nm?: string;
  /** 키워드 태그 */
  keywords?: string[];
  /** 업종 */
  industry_nm?: string;
  /** 카드명(제목) */
  title_txt?: string;
  /** 공식 카드 형식명(기초용어형/상황형/OX형). card_type_cd보다 세밀하다. */
  format_nm?: string;
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
  /** 뒷면1 — DB에 저장된 정답 원문(OX는 O/X) */
  answer_txt?: string;
  /** 뒷면5 — 위험개선 권고사항 */
  improvement_txt?: string;
  /** 뒷면 미디어(해설 도해/사진) URL */
  answer_image_url?: string;
  /** 출처·관련근거 */
  source_txt?: string;
  /** 참고사항 */
  note_txt?: string;
  status_cd: 'NEW' | 'LEARNING' | 'MASTERED';
  difficulty_cd?: 'EASY' | 'MEDIUM' | 'HARD';
  due_at: string | null;
  /** 카드 형식 — EXPLANATION(기본) / OX / CHOICE */
  card_type_cd?: 'EXPLANATION' | 'OX' | 'CHOICE';
  /** 퀴즈 보기 목록 */
  choices?: string[];
  /** 정답 보기 인덱스 */
  answer_index?: number;
}
