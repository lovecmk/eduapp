import Constants from 'expo-constants';
import { logger } from '../../utils/logger';

/**
 * 빌드 타임 환경 변수 접근 레이어 — PART 5.1
 *
 * GitHub Actions 가 Secrets 로부터 생성한 `.env` 의 `EXPO_PUBLIC_*` 변수는
 * Metro 번들러에 의해 정적으로 인라인되어 `process.env` 로 노출된다.
 * 로컬 개발 환경처럼 변수가 비어 있어도 앱이 죽지 않고 목업으로 폴백되도록
 * 모든 접근을 이 파일 한 곳에서 방어적으로 처리한다.
 *
 * 새 환경변수를 추가할 때 지켜야 할 규칙(단일 소스):
 *  1) 반드시 `EXPO_PUBLIC_` 접두사를 붙인다(그래야 번들에 인라인된다).
 *  2) 이 파일의 `readString`/`readNumber`/`readBool` 로만 읽어 기본값을 준다.
 *  3) `.env.example` 에 주석과 함께 예시를 추가한다.
 *  4) 필요하면 `env` 객체에 노출하고, 개발자 화면(ENV_SUMMARY)에서 확인 가능하게 한다.
 */

function readString(value: string | undefined, fallback = ''): string {
  const v = value?.trim();
  return v && v.length > 0 ? v : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readBool(value: string | undefined): boolean | undefined {
  const v = value?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
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
  const flag = readBool(process.env.EXPO_PUBLIC_USE_MOCK_DATA);
  if (flag !== undefined) return flag;
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
  // 날씨 API 연동용 슬롯 — 추후 사용자가 채움. 값이 없으면 목업('맑음')으로 폴백한다.
  // 자체 백엔드가 프록시하면 apiBaseUrl 만으로 충분하고, 서드파티(OpenWeather 등)를
  // 직접 호출할 경우 아래 키/기본 지역을 사용한다.
  weather: {
    apiKey: readString(process.env.EXPO_PUBLIC_WEATHER_API_KEY),
    defaultRegion: readString(process.env.EXPO_PUBLIC_WEATHER_REGION, 'Seoul'),
  },
  /** 현재 실행 중인 번들의 버전 정보 — OTA 비교 기준값. */
  build: {
    version: appVersion,
    buildNumber: bakedBuildNumber,
    commit: readString(process.env.EXPO_PUBLIC_COMMIT_SHA, 'local'),
  },
} as const;

/**
 * 환경설정 요약 — 개발자 화면에서 "지금 어떤 값으로 돌고 있는지" 한눈에 확인하기 위한
 * 읽기 전용 뷰. 민감정보(토큰·DSN 전체)는 노출하지 않고 마스킹/유무만 표시한다.
 */
export const ENV_SUMMARY: { label: string; value: string; ok: boolean }[] = [
  {
    label: 'API 주소',
    value: apiBaseUrl || '(미설정 · 목업 폴백)',
    ok: env.useMockData || apiBaseUrl.length > 0,
  },
  {
    label: '데이터 소스',
    value: env.useMockData ? '목업(Mock)' : '실서버(Live)',
    ok: true,
  },
  {
    label: '요청 타임아웃',
    value: `${env.apiTimeoutMs.toLocaleString()}ms`,
    ok: env.apiTimeoutMs >= 3_000,
  },
  {
    label: 'Sentry',
    value: env.sentryDsn ? '연결됨' : '비활성',
    ok: true,
  },
  {
    label: '빌드',
    value: `v${env.build.version} (#${env.build.buildNumber || 'dev'} · ${env.build.commit})`,
    ok: true,
  },
];

/**
 * 설정 불일치/실수를 잡아내는 개발용 검증. 프로덕션에서는 조용하지만,
 * 개발 중에는 콘솔에 경고를 남겨 `.env` 오설정을 빠르게 발견하게 한다.
 */
export function collectConfigWarnings(): string[] {
  const w: string[] = [];
  if (!env.useMockData && !apiBaseUrl) {
    w.push('실서버 모드지만 EXPO_PUBLIC_API_BASE_URL 이 비어 있습니다.');
  }
  if (apiBaseUrl && !/^https?:\/\//i.test(apiBaseUrl)) {
    w.push(`API 주소가 http(s):// 로 시작하지 않습니다: "${apiBaseUrl}"`);
  }
  if (apiBaseUrl.endsWith('/')) {
    w.push('API 주소 끝에 "/" 가 있으면 경로가 "//api/..." 로 중복됩니다. 끝 슬래시를 제거하세요.');
  }
  if (env.apiTimeoutMs < 3_000) {
    w.push(`요청 타임아웃(${env.apiTimeoutMs}ms)이 너무 짧습니다(권장 ≥ 3000ms).`);
  }
  return w;
}

{
  const warnings = collectConfigWarnings();
  if (warnings.length > 0) {
    // 개발 중에는 물론 운영에서도 남긴다 — 오설정으로 배포된 빌드는
    // 화면이 조용히 비어 보일 뿐이라, 이 로그가 유일한 단서가 된다.
    // (경고 문구에는 주소·타임아웃만 담기고 비밀은 들어가지 않는다.)
    logger.warn('env_config_warning', { warnings });
  }
}
