const appConfig = require('../../app.config.js');
const previous = process.env.EXPO_PUBLIC_BUILD_NUMBER;
afterEach(() => {
  if (previous === undefined) delete process.env.EXPO_PUBLIC_BUILD_NUMBER;
  else process.env.EXPO_PUBLIC_BUILD_NUMBER = previous;
});
it('배포 빌드 번호를 Android/iOS 네이티브 버전에 반영한다', () => {
  process.env.EXPO_PUBLIC_BUILD_NUMBER = '99';
  const next = appConfig({ config: { version: '1.13.51', android: { package: 'org.example' }, ios: { supportsTablet: true } } });
  expect(next.android).toEqual({ package: 'org.example', versionCode: 99 });
  expect(next.ios).toEqual({ supportsTablet: true, buildNumber: '99' });
});
it.each(['', 'bad', '-1', '1.5', '2100000001'])('잘못된 빌드 번호 %p는 기존 설정을 유지한다', (build) => {
  process.env.EXPO_PUBLIC_BUILD_NUMBER = build;
  expect(appConfig({ config: { android: { versionCode: 12 } } }).android.versionCode).toBe(12);
});
