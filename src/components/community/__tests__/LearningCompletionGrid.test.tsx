import { completionPaths } from '../LearningCompletionGrid';

it('omits the weekend bridge and resumes the band on Monday and Tuesday', () => {
  const result = completionPaths(2026, 9, [['2026-9-23', '2026-9-26'], ['2026-9-26', '2026-9-27']], 350);
  expect(result.paths).toEqual([]);
  expect(result.bands).toEqual(['M 75 224 H 125']);
});

it('does not bridge a weekend across months', () => {
  for (const month of [6, 7]) {
    const result = completionPaths(2026, month, [['2026-6-31', '2026-7-3']], 350);
    expect(result.paths).toEqual([]);
    expect(result.bands).toEqual([]);
  }
});

it('keeps adjacent month continuation within the visible weekday cell', () => {
  const result = completionPaths(2026, 9, [['2026-8-30', '2026-9-1']], 350);
  expect(result.paths).toEqual(['M 210 16 H 225']);
});
