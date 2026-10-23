import { TRACK_APPEARANCE, TRACK_GROUP_LABELS } from '../constants/tracks';
import type { LearningTrack } from './models/LearningTrack';
import type { LearningCard, CardDifficulty } from './models/LearningCard';

export interface TrackProgress {
  track: LearningTrack;
  cards: LearningCard[];
  total: number;
  mastered: number;
  pct: number;
  byDifficulty: Record<CardDifficulty, LearningCard[]>;
}

/** Group only the learner API's published cards; never use drafts or a fixed catalog. */
export function buildTrackProgress(allCards: LearningCard[]): TrackProgress[] {
  const groups = new Map<string, { groupCode: string; progress: TrackProgress }>();
  for (const card of allCards) {
    const groupCode = card.groupCode?.trim() ?? '';
    const code = card.taxonomyCategoryCode?.trim() ?? '';
    const name = card.taxonomyCategory?.trim() || code || card.category;
    const canonical = !!(code || card.taxonomyCategory?.trim());
    const id = canonical
      ? JSON.stringify(['taxonomy', groupCode, code ? 'code' : 'name', code || name])
      : JSON.stringify(['legacy', card.category]);
    let group = groups.get(id);
    if (!group) {
      const appearance = Object.prototype.hasOwnProperty.call(TRACK_APPEARANCE, code)
        ? TRACK_APPEARANCE[code] : { icon: 'document-text', color: '#0EA5E9' };
      group = {
        groupCode,
        progress: {
          track: {
            id, title: name,
            subtitle: Object.prototype.hasOwnProperty.call(TRACK_GROUP_LABELS, groupCode)
              ? TRACK_GROUP_LABELS[groupCode] : '분류별 학습',
            goal: `${name} 분류의 학습카드를 난이도별로 확인해요`,
            ...appearance,
          },
          cards: [], total: 0, mastered: 0, pct: 0,
          byDifficulty: { easy: [], medium: [], hard: [] },
        },
      };
      groups.set(id, group);
    }
    const progress = group.progress;
    progress.cards.push(card);
    progress.byDifficulty[card.difficulty].push(card);
    progress.total++;
    if (card.status === 'mastered') progress.mastered++;
  }
  const rank = (code: string) => {
    const index = ['RISK', 'MEASURE', 'DAILY3MIN'].indexOf(code);
    return index < 0 ? 3 : index;
  };
  return [...groups.values()]
    .sort((a, b) => rank(a.groupCode) - rank(b.groupCode)
      || a.progress.track.title.localeCompare(b.progress.track.title, 'ko')
      || a.progress.track.id.localeCompare(b.progress.track.id))
    .map(({ progress }) => ({ ...progress, pct: Math.round(progress.mastered / progress.total * 100) }));
}
