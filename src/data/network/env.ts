import Constants from 'expo-constants';

/**
 * 빌드 타임 환경 변수 접근 레이어 — PART 5.1
 *
 * GitHub Actions 가 Secrets 로부터 생성한 `.env` 의 `EXPO_PUBLIC_*` 변수는
 * Metro 번들러에 의해 정적으로 인라인되어 `process.env` 로 노출된다.
 * 로컬 개발 환경처럼 변수가 비어 있어도 앱이 죽지 않고 목업으로 폴백되도록
 * 모든 접근을 이 파일 한 곳에서 방어적으로 처리한다.
 */

function readString(value: string | undefined, fallback = ''): string {
  const v = value?.trim();
  return v && v.length > 0 ? v : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const apiBaseUrl = readString(process.env.EXPO_PUBLIC_API_BASE_URL);

/**
 * 목업 사용 여부 결정 규칙(우선순위):
 *  1) `EXPO_PUBLIC_USE_MOCK_DATA` 가 명시적으로 'true'/'false' 면 그 값을 따른다.
 *  2) 값이 없으면 → API 주소가 비어 있을 때 자동으로 목업으로 폴백한다.
 * 이렇게 하면 실제 백엔드(기존 플랫폼 or Golang/Mongo)가 확정되기 전에도
 * `.env` 없이 화면을 그대로 테스트할 수 있다.
 */
function resolveUseMock(): boolean {
  const flag = process.env.EXPO_PUBLIC_USE_MOCK_DATA?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return apiBaseUrl.length === 0;
}

/**
 * 현재 번들에 구워진(baked-in) 빌드 식별자.
 * Actions 가 빌드 시 `.env` 에 주입한다. 값이 없으면 app.json 의 버전을 사용하고,
 * 그마저 없으면 개발용 기본값('dev')으로 폴백한다.
 */
const bakedBuildNumber = Math.trunc(
  readNumber(process.env.EXPO_PUBLIC_BUILD_NUMBER, 0),
);
const appVersion = readString(
  process.env.EXPO_PUBLIC_APP_VERSION,
  readString(Constants.expoConfig?.version, '1.0.0'),
);

export const env = {
  apiBaseUrl,
  apiTimeoutMs: readNumber(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 10_000),
  useMockData: resolveUseMock(),
  sentryDsn: readString(process.env.EXPO_PUBLIC_SENTRY_DSN),
  /** 현재 실행 중인 번들의 버전 정보 — OTA 비교 기준값. */
  build: {
    version: appVersion,
    buildNumber: bakedBuildNumber,
    commit: readString(process.env.EXPO_PUBLIC_COMMIT_SHA, 'local'),
  },
} as const;
