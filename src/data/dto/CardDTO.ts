export interface CardDTO {
  id: string;
  /** 대분류 코드 */
  category_cd: string;
  /** 중분류 (예: 소화설비) */
  sub_category_nm?: string;
  /** 소분류 (예: 옥내소화전) */
  topic_nm?: string;
  question_txt: string;
  answer_txt: string;
  explanation_txt: string;
  /** 이미지 문제 URL */
  image_url?: string;
  status_cd: 'NEW' | 'LEARNING' | 'MASTERED';
  difficulty_cd?: 'EASY' | 'MEDIUM' | 'HARD';
  due_at: string | null;
  highlights?: string[];
  standards?: string[];
}
