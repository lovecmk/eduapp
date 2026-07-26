// 컴포넌트 테스트 공용 셋업 — 네이티브 전용 모듈을 테스트에서 안전하게 대체한다.

// reanimated: 테스트 환경에서 네이티브 브리지가 없으므로 공식 목업을 사용.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// AsyncStorage: zustand persist 가 쓰는 저장소. 공식 목업(메모리 구현)으로 대체한다.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-font: jest-expo(SDK 52) 환경에서 내부 폰트 레지스트리가 초기화되지 않아
// @expo/vector-icons 렌더 시 'loadedNativeFonts.forEach is not a function' 이 난다.
// 테스트에서는 폰트가 항상 로드된 것으로 간주한다.
jest.mock('expo-font', () => ({
  isLoaded: () => true,
  isLoading: () => false,
  loadAsync: jest.fn(() => Promise.resolve()),
  useFonts: () => [true, null],
  unloadAllAsync: jest.fn(() => Promise.resolve()),
  processFontFamily: (f) => f,
}));

// haptics/secure-store 등 네이티브 부수효과는 테스트에서 무시.
// 실제 expo-haptics 는 Promise 를 돌려준다(호출부가 .catch 로 실패를 삼킨다).
// 목업도 Promise 를 돌려줘야 실제 코드 경로와 같아진다.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
