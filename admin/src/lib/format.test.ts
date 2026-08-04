import { describe, it, expect } from 'vitest';
import {
  num,
  pct,
  ms,
  uptime,
  dateTime,
  dateOnly,
  timeAgo,
  statusTone,
  statusLabel,
  actionLabel,
  reportStatusMeta,
  audienceLabel,
} from './format';

/**
 * 서식 함수는 화면 전체가 쓴다. 여기서 "-" 대신 NaN 이나 Invalid Date 가 새면
 * 관리자가 그 숫자를 사실로 믿게 되므로, 잘못된 입력을 확실히 막아 둔다.
 */

describe('num', () => {
  it('천 단위 구분자를 넣는다', () => {
    expect(num(1234567)).toBe('1,234,567');
    expect(num(0)).toBe('0');
  });

  it('숫자가 아니면 "-" (NaN 을 화면에 흘리지 않는다)', () => {
    expect(num(null)).toBe('-');
    expect(num(undefined)).toBe('-');
    expect(num(NaN)).toBe('-');
    expect(num(Infinity)).toBe('-');
  });
});

describe('pct', () => {
  it('소수 한 자리 백분율', () => {
    expect(pct(12.345)).toBe('12.3%');
    expect(pct(0)).toBe('0.0%');
  });
  it('잘못된 값은 "-"', () => {
    expect(pct(undefined)).toBe('-');
  });
});

describe('ms — 응답 시간', () => {
  it('1초 미만은 ms, 이상은 초 단위', () => {
    expect(ms(340)).toBe('340ms');
    expect(ms(1250)).toBe('1.25초');
    expect(ms(0)).toBe('0ms');
  });
  it('잘못된 값은 "-"', () => {
    expect(ms(null)).toBe('-');
  });
});

describe('uptime — 가동 시간', () => {
  it('가장 큰 단위 두 개까지만 보여준다', () => {
    expect(uptime(3 * 86400 + 4 * 3600 + 12 * 60)).toBe('3일 4시간');
    expect(uptime(4 * 3600 + 12 * 60)).toBe('4시간 12분');
    expect(uptime(12 * 60)).toBe('12분');
  });

  it('1분 미만은 초로', () => {
    expect(uptime(45)).toBe('45초');
    expect(uptime(0)).toBe('0초');
  });

  it('음수·잘못된 값은 "-"', () => {
    expect(uptime(-1)).toBe('-');
    expect(uptime(null)).toBe('-');
  });
});

describe('날짜 서식', () => {
  it('ISO 를 사람이 읽는 형태로', () => {
    const iso = new Date(2026, 6, 27, 10, 32).toISOString();
    expect(dateTime(iso)).toBe('2026-07-27 10:32');
    expect(dateOnly(iso)).toBe('2026-07-27');
  });

  it('파싱 불가한 값은 "-" (Invalid Date 를 화면에 흘리지 않는다)', () => {
    expect(dateTime('not-a-date')).toBe('-');
    expect(dateTime('')).toBe('-');
    expect(dateTime(null)).toBe('-');
    expect(dateOnly(undefined)).toBe('-');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-07-27T12:00:00Z');

  it('경과 시간에 맞는 단위를 고른다', () => {
    expect(timeAgo('2026-07-27T11:59:30Z', now)).toBe('방금');
    expect(timeAgo('2026-07-27T11:57:00Z', now)).toBe('3분 전');
    expect(timeAgo('2026-07-27T10:00:00Z', now)).toBe('2시간 전');
    expect(timeAgo('2026-07-25T12:00:00Z', now)).toBe('2일 전');
  });

  it('30일이 넘으면 날짜로 보여준다', () => {
    expect(timeAgo('2026-01-01T12:00:00Z', now)).toBe('2026-01-01');
  });

  it('미래 시각(시계 어긋남)은 "방금"으로 흡수한다', () => {
    // 서버·클라이언트 시계가 조금 어긋나 "-5분 전" 같은 값이 뜨면 안 된다.
    expect(timeAgo('2026-07-27T12:00:30Z', now)).toBe('방금');
  });

  it('잘못된 값은 "-"', () => {
    expect(timeAgo('nope', now)).toBe('-');
  });
});

describe('statusTone — HTTP 상태를 배지 토큰으로', () => {
  it('2xx 정상, 4xx 경고, 5xx 오류', () => {
    expect(statusTone(200)).toBe('ok');
    expect(statusTone(204)).toBe('ok');
    expect(statusTone(404)).toBe('warn');
    expect(statusTone(500)).toBe('danger');
    expect(statusTone(302)).toBe('neutral');
  });

  it('base.css 에 실제로 있는 배지 클래스만 만든다', () => {
    // 호출부는 `badge-${statusTone(...)}` 로 클래스를 만든다. 여기서 색 이름
    // (green/amber)을 돌려주면 존재하지 않는 클래스가 되어 배지가 색을 잃는다.
    const defined = ['ok', 'warn', 'danger', 'neutral', 'accent', 'info'];
    for (const code of [200, 204, 302, 404, 429, 500, 503]) {
      expect(defined).toContain(statusTone(code));
    }
  });
});

describe('statusLabel — 계정 상태', () => {
  it('빈 값은 활성으로 본다(기존 데이터 호환)', () => {
    expect(statusLabel('')).toBe('활성');
    expect(statusLabel('A')).toBe('활성');
    expect(statusLabel('I')).toBe('정지');
    expect(statusLabel('D')).toBe('삭제');
  });
});

describe('reportStatusMeta — 신고 처리 단계', () => {
  it('네 단계에 이름표와 색을 준다', () => {
    expect(reportStatusMeta('OPEN').label).toBe('미처리');
    expect(reportStatusMeta('DOING').label).toBe('확인 중');
    expect(reportStatusMeta('RESOLVED').label).toBe('처리 완료');
    expect(reportStatusMeta('REJECTED').label).toBe('반려');
  });

  it('빈 값·알 수 없는 값은 미처리 쪽으로 떨어진다', () => {
    // 처리되지 않은 것을 '완료'로 보이게 하는 실수가 훨씬 나쁘다 —
    // 판독은 항상 '아직 손이 필요하다' 쪽으로 안전하게 기운다.
    expect(reportStatusMeta('').label).toBe('미처리');
    expect(reportStatusMeta('').tone).toBe('warn');
  });

  it('base.css 에 실제로 있는 배지 클래스만 만든다', () => {
    // statusTone 과 같은 이유 — 색 이름을 돌려주면 없는 클래스가 만들어져
    // 배지가 통째로 색을 잃는다.
    const defined = ['ok', 'warn', 'danger', 'neutral', 'accent', 'info'];
    for (const cd of ['OPEN', 'DOING', 'RESOLVED', 'REJECTED', '', 'WEIRD']) {
      expect(defined).toContain(reportStatusMeta(cd).tone);
    }
  });
});

describe('audienceLabel — 공지 대상', () => {
  it('대상 지정 방식을 한국어로', () => {
    expect(audienceLabel('ALL')).toBe('전체');
    expect(audienceLabel('ORG')).toBe('조직');
    expect(audienceLabel('MEMBERSHIP')).toBe('등급');
    expect(audienceLabel('ROLE')).toBe('권한');
    expect(audienceLabel('USER')).toBe('개별');
  });

  it('모르는 값은 그대로 보여 준다(빈칸으로 삼키지 않는다)', () => {
    expect(audienceLabel('PLANET')).toBe('PLANET');
  });
});

describe('actionLabel — 감사 로그', () => {
  it('새로 생긴 관리 행위도 이름표를 갖는다', () => {
    // 코드가 그대로 보이면(report.review) 이력 화면이 개발자 로그처럼 읽힌다.
    expect(actionLabel('report.review')).toBe('신고 처리');
    expect(actionLabel('notification.send')).toBe('공지 발송');
    expect(actionLabel('settings.update')).toBe('운영 설정');
  });
});
