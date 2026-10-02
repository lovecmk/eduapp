jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
import * as SecureStore from 'expo-secure-store';
import { secureStorage, peekItem } from '../secureStorage';

it('늦은 읽기로 로그아웃한 토큰 사본을 되살리지 않는다', async () => {
  let finish!: (token: string) => void;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const reading = secureStorage.getItem('race-read');
  await Promise.resolve();
  await secureStorage.removeItem('race-read');
  finish('old-token');
  expect(await reading).toBeNull();
  expect(peekItem('race-read')).toBeNull();
});
it('토큰 저장과 삭제를 호출 순서대로 디스크에 적용한다', async () => {
  let finish!: () => void;
  jest.mocked(SecureStore.setItemAsync).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const saving = secureStorage.setItem('race-write', 'old-token');
  await Promise.resolve();
  const removing = secureStorage.removeItem('race-write');
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('race-write');
  finish();
  await Promise.all([saving, removing]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('race-write');
  expect(peekItem('race-write')).toBeNull();
});
