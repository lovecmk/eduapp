import type { LearningTrack } from '../domain/models/LearningTrack';

// 학습 과정(목표) 정의. 지금은 "기초" 과정 중심이며,
// locked 과정(자격증/기술사)은 향후 콘텐츠 확장을 예고한다.
export const LEARNING_TRACKS: LearningTrack[] = [
  {
    id: 'elec-basic',
    title: '전기 화재 기초',
    subtitle: '전기 위험',
    goal: '절연·누전·과부하 등 전기화재의 원리를 익혀요',
    level: 'foundation',
    icon: 'flash',
    color: '#F2B705',
    categories: ['전기 위험'],
  },
  {
    id: 'process-basic',
    title: '공정 화재·폭발 기초',
    subtitle: '공정 위험',
    goal: '도장 등 공정의 폭발성 분위기와 위험장소를 익혀요',
    level: 'foundation',
    icon: 'color-fill',
    color: '#5C6BC0',
    categories: ['공정 위험'],
  },
  {
    id: 'hazmat-basic',
    title: '위험물 안전관리 기초',
    subtitle: '위험물',
    goal: '마그네슘 등 금수성·가연성 위험물 취급을 익혀요',
    level: 'foundation',
    icon: 'flame',
    color: '#E2574C',
    categories: ['위험물'],
  },
  // --- 향후 확장(자격 과정) — 준비 중 ---
  {
    id: 'safety-manager',
    title: '산업안전기사',
    subtitle: '자격 취득 과정',
    goal: '산업안전기사 시험 대비 심화 과정',
    level: 'certificate',
    icon: 'shield-checkmark',
    color: '#5C6BC0',
    categories: ['전기 위험', '공정 위험', '위험물'],
    locked: true,
  },
  {
    id: 'fire-engineer',
    title: '소방기술사 대비',
    subtitle: '자격 취득 과정',
    goal: '소방기술사 시험 대비 최고 난이도 과정',
    level: 'expert',
    icon: 'ribbon',
    color: '#F2705B',
    categories: ['전기 위험', '공정 위험', '위험물'],
    locked: true,
  },
];
