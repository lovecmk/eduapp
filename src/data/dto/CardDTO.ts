export interface CardDTO {
  id: string;
  category_cd: string;
  question_txt: string;
  answer_txt: string;
  explanation_txt: string;
  status_cd: 'NEW' | 'LEARNING' | 'MASTERED';
  difficulty_cd?: 'EASY' | 'MEDIUM' | 'HARD';
  due_at: string | null;
  highlights?: string[];
  standards?: string[];
}
