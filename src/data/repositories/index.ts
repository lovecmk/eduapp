// 실제/목업 전환을 이 한 파일에서만 결정 — PART 1.4.1
// 백엔드 엔드포인트가 준비되면 .env 의 EXPO_PUBLIC_USE_MOCK_DATA 를 false 로.
import { env } from '../network/env';
import { withMockFallback } from './_fallback';

import { AuthRepository } from './AuthRepository';
import { MockAuthRepository } from './AuthRepository.mock';
import { CardRepository } from './CardRepository';
import { MockCardRepository } from './CardRepository.mock';
import { StatsRepository } from './StatsRepository';
import { MockStatsRepository } from './StatsRepository.mock';
import { CommunityRepository } from './CommunityRepository';
import { MockCommunityRepository } from './CommunityRepository.mock';
import { WeatherRepository } from './WeatherRepository';
import { MockWeatherRepository } from './WeatherRepository.mock';
import { LearningQuotaRepository } from './LearningQuotaRepository';
import { MockLearningQuotaRepository } from './LearningQuotaRepository.mock';
import { UserDirectoryRepository } from './UserDirectoryRepository';
import { MockUserDirectoryRepository } from './UserDirectoryRepository.mock';

import type { IAuthRepository } from '../../domain/repositories/IAuthRepository';
import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { IStatsRepository } from '../../domain/repositories/IStatsRepository';
import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { IWeatherRepository } from '../../domain/repositories/IWeatherRepository';
import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { IUserDirectoryRepository } from '../../domain/repositories/IUserDirectoryRepository';

export const authRepository: IAuthRepository = env.useMockData
  ? new MockAuthRepository()
  : new AuthRepository();

export const cardRepository: ICardRepository = env.useMockData
  ? new MockCardRepository()
  : new CardRepository();

export const statsRepository: IStatsRepository = env.useMockData
  ? new MockStatsRepository()
  : new StatsRepository();

export const communityRepository: ICommunityRepository = env.useMockData
  ? new MockCommunityRepository()
  : new CommunityRepository();

// 아래 3개는 '보조 기능' — 있으면 좋지만 없어도 앱이 돌아가야 한다. 실서버 모드라도
// 해당 엔드포인트가 아직 배포되지 않았으면(부분 배포) withMockFallback 이 그 기능만
// 조용히 목업으로 떨어뜨린다. 나머지 엔드포인트가 준비되면 자동으로 실서버를 쓴다.
// (핵심 기능인 auth/card/stats/community 는 폴백하지 않는다 — 에러가 정직하게 드러나야 함.)

// 날씨 — 홈 배경 앰비언트 효과용. 실제 날씨 API 연동은 추후(사용자) 예정이며,
// 그전까지는 목업('맑음')으로 폴백한다. 연동 시 WeatherRepository 만 채우면 된다.
export const weatherRepository: IWeatherRepository = env.useMockData
  ? new MockWeatherRepository()
  : withMockFallback(new WeatherRepository(), new MockWeatherRepository(), 'weather');

// 하루 학습 할당량 — 신규 학습 상한(복습은 자유). 오프라인은 로컬 스토어 기반 목업.
export const learningQuotaRepository: ILearningQuotaRepository = env.useMockData
  ? new MockLearningQuotaRepository()
  : withMockFallback(new LearningQuotaRepository(), new MockLearningQuotaRepository(), 'learning-quota');

// 사용자 디렉터리 — 닉네임 검색 + 공개 프로필(공개 범위 적용).
export const userDirectoryRepository: IUserDirectoryRepository = env.useMockData
  ? new MockUserDirectoryRepository()
  : withMockFallback(new UserDirectoryRepository(), new MockUserDirectoryRepository(), 'user-directory');
