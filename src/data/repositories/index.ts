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
import { ProgressRepository } from './ProgressRepository';
import { MockProgressRepository } from './ProgressRepository.mock';
import { EngagementRepository } from './EngagementRepository';
import { MockEngagementRepository } from './EngagementRepository.mock';
import { ReportRepository } from './ReportRepository';
import { MockReportRepository } from './ReportRepository.mock';
import { NotificationRepository } from './NotificationRepository';
import { MockNotificationRepository } from './NotificationRepository.mock';
import { ServiceConfigRepository } from './ServiceConfigRepository';
import { MockServiceConfigRepository } from './ServiceConfigRepository.mock';
import { DailyAssignmentRepository } from './DailyAssignmentRepository';
import { MockDailyAssignmentRepository } from './DailyAssignmentRepository.mock';

import type { IAuthRepository } from '../../domain/repositories/IAuthRepository';
import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { IStatsRepository } from '../../domain/repositories/IStatsRepository';
import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { IWeatherRepository } from '../../domain/repositories/IWeatherRepository';
import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { IUserDirectoryRepository } from '../../domain/repositories/IUserDirectoryRepository';
import type { IProgressRepository } from '../../domain/repositories/IProgressRepository';
import type { IEngagementRepository } from '../../domain/repositories/IEngagementRepository';
import type { IReportRepository } from '../../domain/repositories/IReportRepository';
import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import type { IServiceConfigRepository } from '../../domain/repositories/IServiceConfigRepository';
import type { IDailyAssignmentRepository } from '../../domain/repositories/IDailyAssignmentRepository';

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

/**
 * 오늘의 학습 — 사람마다·날마다 다른 3~5문제.
 *
 * 서버가 편성의 권위를 갖는다(기기가 바뀌어도 같은 목록, 관리자가 출제 정책을
 * 바꾸면 반영). 다만 이 앱은 지하에서 쓰여 서버에 닿지 못하는 날이 흔하고,
 * 그때 "오늘의 학습이 없습니다"를 띄우면 그날 학습이 없던 일이 된다.
 * 그래서 폴백을 건다 — 목업이 **서버와 같은 규칙**(domain/dailyPlan)으로
 * 로컬 편성을 만들어, 온라인이든 아니든 같은 사람은 같은 날 같은 문제를 본다.
 */
export const dailyAssignmentRepository: IDailyAssignmentRepository = env.useMockData
  ? new MockDailyAssignmentRepository()
  : withMockFallback(new DailyAssignmentRepository(), new MockDailyAssignmentRepository(), 'daily-assignment');

// 서비스 운영 상태(점검 모드·공지 배너·하루 상한) — 관리 콘솔이 바꾸고 앱이 읽는다.
// 이 값을 못 읽어도 앱은 평상시처럼 돌아야 하므로 보조 기능으로 둔다.
// (진짜 점검 중이라면 다른 모든 요청이 503 으로 막혀 사용자는 어차피 알게 된다.)
export const serviceConfigRepository: IServiceConfigRepository = env.useMockData
  ? new MockServiceConfigRepository()
  : withMockFallback(new ServiceConfigRepository(), new MockServiceConfigRepository(), 'service-config');

// 사용자 디렉터리 — 닉네임 검색 + 공개 프로필(공개 범위 적용).
export const userDirectoryRepository: IUserDirectoryRepository = env.useMockData
  ? new MockUserDirectoryRepository()
  : withMockFallback(new UserDirectoryRepository(), new MockUserDirectoryRepository(), 'user-directory');

// ── 사용자 데이터 동기화 저장소 ─────────────────────────────────────────────
// 아래 4개는 '사용자가 만든 데이터'를 다룬다. 서버가 준비되지 않았을 때 목업으로
// 폴백하면 로컬 값이 서버 값인 척하게 되므로, 부분 배포 폴백(withMockFallback)을
// 쓰지 않고 실서버 모드에서는 실패가 정직하게 드러나게 한다.
// (쓰기 유실 방지는 폴백이 아니라 ApiClient 의 오프라인 큐가 담당한다.)

/** 학습 진행(SRS·학습 이력·출석) 동기화 — 기기 변경/재설치 후 복원의 핵심. */
export const progressRepository: IProgressRepository = env.useMockData
  ? new MockProgressRepository()
  : new ProgressRepository();

/** 카드 반응(추천·저장). */
export const engagementRepository: IEngagementRepository = env.useMockData
  ? new MockEngagementRepository()
  : new EngagementRepository();

/** 카드 신고 접수 — 운영자에게 반드시 전달되어야 한다. */
export const reportRepository: IReportRepository = env.useMockData
  ? new MockReportRepository()
  : new ReportRepository();

/** 알림 목록·읽음·푸시 토큰. */
export const notificationRepository: INotificationRepository = env.useMockData
  ? new MockNotificationRepository()
  : new NotificationRepository();
