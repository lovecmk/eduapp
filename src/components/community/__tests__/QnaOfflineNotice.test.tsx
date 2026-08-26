// 질문답변 '서버 미연결' 안내 — 강등 장부를 따라 나타나고 사라지는가.
//
// 이 안내가 중요한 이유는 화면이 평소와 똑같기 때문이다. 서버에 /inner/api/v1/qna 가 없으면
// 질문은 이 기기에만 남는데, 아무 표시가 없으면 사용자는 동료들에게 갔다고 믿는다.
//
// 특히 **나타나는 시점**을 고정한다. 강등은 첫 요청이 404 로 돌아온 순간 일어나므로
// 화면이 이미 그려진 뒤다. 장부를 구독하지 않으면 안내는 다음에 화면을 다시 열 때에야
// 나타난다 — 정작 질문을 올리는 그 순간에는 없다.

import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { QnaOfflineNotice } from '../QnaOfflineNotice';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { withMockFallback, __resetDegradationsForTests } from '../../../data/repositories/_fallback';
import { ApiError } from '../../../data/network/errors';

const NOTICE = '질문 & 답변은 준비 중이에요';

const wrap = () =>
  render(
    <ThemeProvider>
      <QnaOfflineNotice />
    </ThemeProvider>,
  );

/** 실서버/목업 한 쌍 — live 의 답을 테스트가 바꿔 가며 강등·복구를 만든다. */
function pair() {
  const live = { list: jest.fn() };
  const mock = { list: jest.fn(async () => []) };
  return { live, mock, repo: withMockFallback(live, mock, 'qna') };
}

describe('질문답변 서버 미연결 안내', () => {
  beforeEach(() => __resetDegradationsForTests());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => __resetDegradationsForTests());

  it('서버가 정상이면 아무것도 그리지 않는다', () => {
    wrap();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('라우트가 없어 목업으로 내려가면 나타난다 — 화면을 다시 열지 않아도', async () => {
    const { live, repo } = pair();
    live.list.mockRejectedValue(new ApiError(404, 'not found'));

    wrap();
    expect(screen.queryByText(NOTICE)).toBeNull();

    // 화면이 이미 그려진 뒤에 첫 요청이 실패한다 — 그때 안내가 붙어야 한다.
    await act(async () => {
      await repo.list();
    });

    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('서버가 되살아나면 사라진다(끝난 장애를 계속 보여주지 않는다)', async () => {
    const { live, repo } = pair();
    live.list.mockRejectedValueOnce(new ApiError(503, 'unavailable'));

    wrap();
    await act(async () => {
      await repo.list();
    });
    expect(screen.getByText(NOTICE)).toBeTruthy();

    // 일시적 실패는 재시도 창이 지나면 실서버를 다시 확인한다.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    live.list.mockResolvedValue([]);
    await act(async () => {
      await repo.list();
    });

    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
