import { searchSettings } from '../settingsSearch';
import { SETTINGS_INDEX, SETTINGS_BY_ID } from '../../constants/settingsIndex';
import { LEGAL_SECTIONS } from '../../constants/legal';

const idsOf = (query: string, collectionEnabled = false) =>
  searchSettings(query, { collectionEnabled }).map((e) => e.id);

describe('설정 색인 무결성', () => {
  it('id 가 중복되지 않는다(하이라이트 앵커 키로 쓰이므로 유일해야 한다)', () => {
    const ids = SETTINGS_INDEX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 항목이 경로 · 위치 · 검색 보조어를 갖는다', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(entry.route.startsWith('/')).toBe(true);
      expect(entry.breadcrumb.length).toBeGreaterThan(0);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('법적 고지 화면의 각 절이 색인에 등록되어 있다(검색으로 도달 가능)', () => {
    for (const section of LEGAL_SECTIONS) {
      const entry = SETTINGS_BY_ID[section.id];
      expect(entry).toBeDefined();
      expect(entry.route).toBe('/legal');
    }
  });
});

describe('searchSettings', () => {
  it('빈 질의는 결과가 없다', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
  });

  it('라벨로 찾는다', () => {
    expect(idsOf('고대비')).toContain('high-contrast');
  });

  it('동의어(키워드)로도 찾는다 — 라벨에 없는 말로 검색해도 걸린다', () => {
    expect(idsOf('다크모드')).toContain('theme');
    expect(idsOf('지문')).toContain('biometric');
    expect(idsOf('회원탈퇴')).toContain('account-delete');
  });

  it('초성만으로 찾는다', () => {
    expect(idsOf('ㄱㅈㅋㄱ')).toContain('font-scale');
  });

  it('공백 유무와 무관하게 찾는다', () => {
    expect(idsOf('글자크기')).toContain('font-scale');
    expect(idsOf('글자 크기')).toContain('font-scale');
  });

  it('설정 본문이 아닌 다른 화면의 항목도 함께 검색된다', () => {
    // 약관(/legal) · 공개 범위(/privacy) 처럼 한 단계 들어가야 하는 항목들.
    expect(idsOf('개인정보')).toContain('privacy-policy');
    expect(idsOf('스트릭')).toContain('privacy-streak');
    expect(idsOf('오픈소스')).toContain('opensource');
  });

  it('가장 잘 맞는 항목이 맨 앞에 온다', () => {
    expect(idsOf('알림 시간')[0]).toBe('notify-time');
  });

  it('카드 수집이 꺼져 있으면 수집 전용 항목은 결과에서 빠진다', () => {
    expect(idsOf('카드팩 획득 조건', false)).not.toContain('pack-rules');
    expect(idsOf('카드팩 획득 조건', true)).toContain('pack-rules');
  });

  it('전혀 관련 없는 말은 결과가 없다', () => {
    expect(searchSettings('zzzzqqq')).toEqual([]);
  });
});
