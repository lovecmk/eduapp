// 순수 로직(매퍼·네트워크 계약·폴백) 단위 테스트 전용 설정.
// RN/Expo 런타임을 로드하지 않도록 node 환경 + ts-jest 로만 돌린다. 컴포넌트(RN) 렌더
// 테스트가 필요해지면 별도 프로젝트로 jest-expo 프리셋을 추가하면 된다.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  clearMocks: true,
};
