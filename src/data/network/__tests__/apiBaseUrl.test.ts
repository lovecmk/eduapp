// 서버 주소 해석 — 잘못 넣어도 돌아가는가, 그리고 '고쳐 썼다'고 말하는가.
//
// 이 검사가 지키는 사고: 앱의 모든 API 경로에는 `/inner/api/v1` 이 이미 박혀 있는데
// (repositories/*), 프록시 안내문에는 보통 `https://도메인/inner/api/v1` 이 적혀 있다.
// 그대로 .env 에 넣으면 요청이 `/inner/api/v1/inner/api/v1/...` 가 되어 모든
// 엔드포인트가 404 다. 게다가 폴백이 걸린 기능은 목업으로 조용히 내려가 화면이
// 멀쩡해 보이므로, 주소 한 줄이 원인이라고 짚기까지 한참 걸린다.

import { resolveApiBaseUrl, describeServer, API_PREFIX } from '../apiBaseUrl';

describe('resolveApiBaseUrl', () => {
  it('도메인만 넣은 정상값은 그대로 쓴다', () => {
    expect(resolveApiBaseUrl('https://bridge.kfpa.or.kr')).toEqual({
      url: 'https://bridge.kfpa.or.kr',
      note: '',
    });
  });

  it("끝의 '/' 를 잘라낸다 — 두면 경로가 '//inner/...' 가 된다", () => {
    expect(resolveApiBaseUrl('https://bridge.kfpa.or.kr/').url).toBe('https://bridge.kfpa.or.kr');
  });

  it('접두사가 중복되면 잘라낸다 (프록시 안내문을 그대로 넣은 경우)', () => {
    // 그대로 뒀다면 /inner/api/v1/inner/api/v1/cards 로 나가 전부 404 다.
    const r = resolveApiBaseUrl(`https://bridge.kfpa.or.kr${API_PREFIX}`);
    expect(r.url).toBe('https://bridge.kfpa.or.kr');
    expect(r.note).toContain('중복');
  });

  it('접두사 중복 + 끝 슬래시도 함께 처리한다', () => {
    expect(resolveApiBaseUrl(`https://bridge.kfpa.or.kr${API_PREFIX}/`).url)
      .toBe('https://bridge.kfpa.or.kr');
  });

  it('평문·포트가 붙은 테스트 주소에도 같은 규칙이 적용된다', () => {
    expect(resolveApiBaseUrl(`http://test.inplat.org:8090${API_PREFIX}`).url)
      .toBe('http://test.inplat.org:8090');
  });

  it('고친 것이 없으면 note 는 비어 있다 — 멀쩡한 설정을 문제로 만들지 않는다', () => {
    expect(resolveApiBaseUrl('http://test.inplat.org:8090').note).toBe('');
  });

  it('빈 값은 빈 값 그대로(목업 폴백은 호출부가 정한다)', () => {
    expect(resolveApiBaseUrl('')).toEqual({ url: '', note: '' });
    expect(resolveApiBaseUrl('   ').url).toBe('');
  });

  it('경로가 비슷하기만 한 주소는 건드리지 않는다', () => {
    // '/inner/api/v10' 은 접두사가 아니다. 무턱대고 자르면 멀쩡한 주소를 망친다.
    const url = 'https://bridge.kfpa.or.kr/inner/api/v10';
    expect(resolveApiBaseUrl(url).url).toBe(url);
  });
});

describe('describeServer — 어느 서버인지 이름으로 말한다', () => {
  it('운영', () => {
    expect(describeServer('https://bridge.kfpa.or.kr')).toEqual({
      kind: 'production',
      label: '운영 (bridge.kfpa.or.kr)',
    });
  });

  it('테스트 — 포트가 붙어도 알아본다', () => {
    expect(describeServer('http://test.inplat.org:8090').kind).toBe('test');
  });

  it('주소가 없으면 목업 빌드', () => {
    expect(describeServer('').kind).toBe('mock');
  });

  it('모르는 주소는 감추지 않고 그대로 보여준다', () => {
    const d = describeServer('https://staging.example.com');
    expect(d.kind).toBe('other');
    expect(d.label).toContain('staging.example.com');
  });
});
