import { resolveChangelog, type ChangelogEntry } from '../changelog';

// 화면의 '업데이트 날짜'가 배포와 함께 움직이는지 고정한다.
// 손으로 적은 날짜만 쓰면 배포를 아무리 해도 그 자리에 멈춰 보인다.

const ENTRIES: ChangelogEntry[] = [
  { version: '1.11.0', date: '2026-07-13', highlights: ['OTA 업데이트 지원'] },
  { version: '1.10.0', date: '2026-07-13', highlights: ['학습 콘텐츠 51종'] },
];

describe('resolveChangelog', () => {
  it('현재 버전의 날짜는 실제 빌드 시각에서 온다', () => {
    const out = resolveChangelog(ENTRIES, {
      version: '1.11.0',
      buildTime: '2026-08-02T05:30:00.000Z',
    });
    expect(out[0]!.date).toBe('2026-08-02');
    // 손으로 쓴 요약은 그대로 남는다 — 날짜만 실제 값으로 바꾼다.
    expect(out[0]!.highlights).toEqual(['OTA 업데이트 지원']);
  });

  it('과거 항목의 날짜는 건드리지 않는다', () => {
    const out = resolveChangelog(ENTRIES, {
      version: '1.11.0',
      buildTime: '2026-08-02T05:30:00.000Z',
    });
    expect(out[1]!.date).toBe('2026-07-13');
  });

  it('손으로 쓴 항목이 없는 배포도 목록에 나타난다', () => {
    // patch 자동 증가(1.11.1, 1.11.2 …)는 대부분 릴리스 노트가 없다.
    // 그때 목록에 현재 버전이 없으면 "업데이트했는데 내역이 안 보인다"가 된다.
    const out = resolveChangelog(ENTRIES, {
      version: '1.11.4',
      buildTime: '2026-08-02T05:30:00.000Z',
    });
    expect(out[0]!.version).toBe('1.11.4');
    expect(out[0]!.date).toBe('2026-08-02');
    expect(out[0]!.auto).toBe(true);
    expect(out).toHaveLength(3);
  });

  it('같은 날 여러 번 배포해도 각 버전이 따로 보인다', () => {
    const a = resolveChangelog(ENTRIES, { version: '1.11.1', buildTime: '2026-08-02T01:00:00Z' });
    const b = resolveChangelog(ENTRIES, { version: '1.11.2', buildTime: '2026-08-02T09:00:00Z' });
    expect(a[0]!.version).not.toBe(b[0]!.version);
    // 날짜는 같아도 버전이 다르므로 사용자는 새 배포임을 알 수 있다.
    expect(a[0]!.date).toBe(b[0]!.date);
  });

  it('빌드 시각을 모르면(로컬 실행) 손으로 적은 날짜로 물러선다', () => {
    const out = resolveChangelog(ENTRIES, { version: '1.11.0', buildTime: undefined });
    expect(out[0]!.date).toBe('2026-07-13');
  });

  it('빌드 시각이 망가져 있어도 화면이 깨지지 않는다', () => {
    const out = resolveChangelog(ENTRIES, { version: '1.11.0', buildTime: '엉뚱한값' });
    expect(out[0]!.date).toBe('2026-07-13');
  });
});
