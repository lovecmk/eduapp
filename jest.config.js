// 두 종류의 테스트를 한 명령(npm test)으로 돌린다.
//  1) logic  — 매퍼·네트워크 계약·검증 규칙 등 순수 로직. RN 런타임 없이 node + ts-jest 로 빠르게.
//  2) components — 실제 RN 컴포넌트 렌더. jest-expo 프리셋으로 RN/Expo 모듈을 변환해야 한다.
/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', {}] },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
      clearMocks: true,
    },
    {
      displayName: 'components',
      preset: 'jest-expo',
      roots: ['<rootDir>/src', '<rootDir>/app'],
      // 컴포넌트 테스트만 .test.tsx 로 작성한다(로직 테스트와 확실히 분리).
      testMatch: ['**/__tests__/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.components.js'],
      clearMocks: true,
    },
  ],
};
