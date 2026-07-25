import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View } from 'react-native';
import {
  useSettingsSearch,
  SettingsSearchBar,
  SettingsSearchResults,
  type SettingsSearchState,
} from '../SettingsSearch';
import type { SettingsEntry } from '../../../constants/settingsIndex';

/** 실제 설정 화면과 같은 구성(고정 검색바 + 결과 오버레이)으로 감싸는 테스트용 하네스. */
function Harness({ onSelect }: { onSelect: (e: SettingsEntry) => void }) {
  const search: SettingsSearchState = useSettingsSearch(false);
  return (
    <View>
      <SettingsSearchBar search={search} onSelect={onSelect} collectionEnabled={false} />
      {search.searching ? <SettingsSearchResults search={search} onSelect={onSelect} /> : null}
    </View>
  );
}

const type = (api: ReturnType<typeof render>, text: string) => {
  fireEvent.changeText(api.getByLabelText('설정 검색'), text);
};

describe('설정 검색', () => {
  it('검색어를 입력하기 전에는 결과가 보이지 않는다', () => {
    const api = render(<Harness onSelect={jest.fn()} />);
    expect(api.queryByText(/개 항목/)).toBeNull();
  });

  it('이름으로 검색하면 해당 항목과 위치(경로)가 함께 보인다', () => {
    const api = render(<Harness onSelect={jest.fn()} />);
    type(api, '고대비');
    expect(api.getByText('고대비 모드')).toBeTruthy();
    expect(api.getByText(/설정 › 화면/)).toBeTruthy();
  });

  it('초성만 입력해도 찾는다', () => {
    const api = render(<Harness onSelect={jest.fn()} />);
    type(api, 'ㄱㅈㅋㄱ');
    expect(api.getByText('글자 크기')).toBeTruthy();
  });

  it('다른 화면에 있는 항목도 같은 목록에서 검색된다', () => {
    const api = render(<Harness onSelect={jest.fn()} />);
    type(api, '오픈소스');
    expect(api.getByText('오픈소스 라이선스')).toBeTruthy();
  });

  it('결과를 고르면 해당 항목을 콜백으로 넘기고 검색어를 비운다', () => {
    const onSelect = jest.fn();
    const api = render(<Harness onSelect={onSelect} />);
    type(api, '고대비');
    fireEvent.press(api.getByText('고대비 모드'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('high-contrast');
    // 결과 목록이 닫히고 본문으로 돌아간다.
    expect(api.queryByText(/개 항목/)).toBeNull();
  });

  it('결과가 없으면 안내 문구를 보여준다', () => {
    const api = render(<Harness onSelect={jest.fn()} />);
    type(api, 'zzzqqq');
    expect(api.getByText(/검색 결과가 없어요/)).toBeTruthy();
  });
});
