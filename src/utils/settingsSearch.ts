import { bestScore, normalize } from './koreanSearch';
import { SETTINGS_INDEX, type SettingsEntry } from '../constants/settingsIndex';

/** 한 번에 보여줄 검색 결과 최대 개수 — 그 이상은 스크롤만 길어지고 도움이 안 된다. */
const MAX_RESULTS = 20;

/**
 * 설정 전역 검색 — 라벨 > 동의어 > 설명 > 위치(그룹명) 순으로 가중치를 줘서 정렬한다.
 * UI 와 분리해 둬서 검색 규칙만 따로 테스트할 수 있다.
 */
export function searchSettings(
  query: string,
  options: { collectionEnabled?: boolean } = {},
): SettingsEntry[] {
  if (normalize(query).length === 0) return [];

  return SETTINGS_INDEX
    .filter((e) => e.requires !== 'collectionEnabled' || options.collectionEnabled)
    .map((entry) => ({
      entry,
      score: bestScore(
        [
          { text: entry.label, weight: 1 },
          { text: entry.description ?? '', weight: 0.7 },
          ...entry.keywords.map((k) => ({ text: k, weight: 0.85 })),
          { text: entry.breadcrumb.join(' '), weight: 0.5 },
        ],
        query,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, MAX_RESULTS)
    .map((r) => r.entry);
}
