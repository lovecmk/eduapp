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
import { LiveDailyAssignmentRepository, CachedDailyAssignmentRepository } from './CachedDailyAssignmentRepository';
import { MockDailyAssignmentRepository } from './DailyAssignmentRepository.mock';
import { QnaRepository } from './QnaRepository';
import { MockQnaRepository } from './QnaRepository.mock';
import { SettingsRepository } from './SettingsRepository';
import { MockSettingsRepository } from './SettingsRepository.mock';
import { SupportRepository } from './SupportRepository';
import { FeedRepository } from './FeedRepository';
import { MockFeedRepository } from './FeedRepository.mock';
import { TipRepository } from './TipRepository';
import { MockTipRepository } from './TipRepository.mock';
import { DifficultyPollRepository } from './DifficultyPollRepository';
import { FactionRepository } from './FactionRepository';
import { MockFactionRepository } from './FactionRepository.mock';
import { MockDifficultyPollRepository } from './DifficultyPollRepository.mock';
import { MockSupportRepository } from './SupportRepository.mock';

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
import type { ICollectionRepository } from '../../domain/repositories/ICollectionRepository';
import { CollectionRepository } from './CollectionRepository';
import { MockCollectionRepository } from './CollectionRepository.mock';
import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import type { IServiceConfigRepository } from '../../domain/repositories/IServiceConfigRepository';
import type { IDailyAssignmentRepository } from '../../domain/repositories/IDailyAssignmentRepository';
import type { IQnaRepository } from '../../domain/repositories/IQnaRepository';
import type { ISettingsRepository } from '../../domain/repositories/ISettingsRepository';
import type { ISupportRepository } from '../../domain/repositories/ISupportRepository';
import type { IFeedRepository } from '../../domain/repositories/IFeedRepository';
import type { ITipRepository } from '../../domain/repositories/ITipRepository';
import type { IDifficultyPollRepository } from '../../domain/repositories/IDifficultyPollRepository';
import type { IFactionRepository } from '../../domain/repositories/IFactionRepository';

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
 * 연결이 끊기면 같은 계정·서버에서 오늘 받은 카드만 다시 읽는다.
 * 받은 카드가 없으면 연결 오류를 표시한다. 목업 편성은 목업 모드에서만 사용한다.
 */
export const dailyAssignmentRepository: IDailyAssignmentRepository = env.useMockData
  ? new MockDailyAssignmentRepository()
  : withMockFallback(new LiveDailyAssignmentRepository(), new CachedDailyAssignmentRepository(), 'daily-assignment');

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

/**
 * 질문 & 답변 — 커뮤니티의 유일한 '참여' 기능.
 *
 * 서버에 `/inner/api/v1/qna` 라우트(리버스 프록시의 location 블록 포함)가 아직 없다.
 * 폴백을 걸어 두면 라우트가 없는 동안에는 지금까지처럼 기기 안에서 돌고,
 * 열리는 날 앱을 다시 배포하지 않아도 **첫 요청부터 실서버를 쓴다**.
 *
 * 폴백의 대가는 분명하다 — 그동안 올린 질문은 이 기기에만 남는다. 그래서
 * 조용히 넘어가지 않고 강등 장부(_fallback.listDegradations)에 남겨
 * 개발자 화면 '연결 상태'에 그대로 드러낸다.
 */
export const qnaRepository: IQnaRepository = env.useMockData
  ? new MockQnaRepository()
  : withMockFallback(new QnaRepository(), new MockQnaRepository(), 'qna');

/**
 * 계정 설정 — 관심 분야·하루 목표·알림 수신·공개 범위·한 줄 소개.
 *
 * 여기도 라우트(`/inner/api/v1/settings`)가 열리기 전이다. 폴백된 동안 목업은 값을
 * 보관하는 척하지 않고 "서버에 기록 없음"이라고 답하므로(SettingsRepository.mock),
 * 기기 값이 그대로 권위를 유지하다가 라우트가 열리면 그 값이 서버로 올라간다.
 */
export const settingsRepository: ISettingsRepository = env.useMockData
  ? new MockSettingsRepository()
  : withMockFallback(new SettingsRepository(), new MockSettingsRepository(), 'settings');

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

/**
 * 안전 카드 도감 — 500종 수집 기록·카드팩·조각.
 *
 * 폴백을 두지 않는다(위 4개와 같은 이유). 서버가 준비되지 않았는데 목업으로
 * 떨어지면 기기 로컬 값이 '서버에 저장된 값'인 척하게 되고, 사용자는 앱을
 * 지워도 남는 줄 믿었다가 몇 달치 수집을 잃는다.
 */
export const collectionRepository: ICollectionRepository = env.useMockData
  ? new MockCollectionRepository()
  : new CollectionRepository();

/**
 * 고객센터 문의 — 폴백을 걸지 않는다. 라우트가 없을 때 목업으로 떨어지면 목업이
 * "접수되었어요"라고 답해, 사라진 문의가 접수된 것처럼 보인다(고치기 전의 결함 그대로).
 * 실패는 화면까지 올려 사유를 말하게 한다.
 */
export const supportRepository: ISupportRepository = env.useMockData
  ? new MockSupportRepository()
  : new SupportRepository();

// ── 커뮤니티 참여 기능 — 서버 라우트가 열리면 앱 재배포 없이 자동으로 붙는다 ──────────
//
// 셋 다 Q&A 와 같은 방식이다. 라우트가 없으면(404/501) 이 기기 안(로컬 스토어)에서 돌고,
// 5분마다 서버를 다시 확인한다(_fallback). 열리는 날 첫 요청부터 서버를 쓴다.
// 기기 안에서 도는 동안에는 화면이 그 사실을 말한다(useDegraded('feed' | 'tips' | …)).
// 로컬 폴백은 **지어낸 남의 데이터를 만들지 않는다**(시드는 목업 모드에서만).

/** 자랑 피드('오늘의 플렉스') — `/inner/api/v1/feed`. */
export const feedRepository: IFeedRepository = env.useMockData
  ? new MockFeedRepository()
  : withMockFallback(new FeedRepository(), new MockFeedRepository(), 'feed');

/** 카드별 현장 팁 — `/inner/api/v1/cards/:id/tips`. */
export const tipRepository: ITipRepository = env.useMockData
  ? new MockTipRepository()
  : withMockFallback(new TipRepository(), new MockTipRepository(), 'tips');

/** 체감 난이도 투표 — `/inner/api/v1/cards/:id/difficulty`. */
export const difficultyPollRepository: IDifficultyPollRepository = env.useMockData
  ? new MockDifficultyPollRepository()
  : withMockFallback(new DifficultyPollRepository(), new MockDifficultyPollRepository(), 'difficulty-poll');

/** 내 진영 — `/inner/api/v1/me/faction`. 서버가 알아야 진영 대항전을 진영별로 집계한다. */
export const factionRepository: IFactionRepository = env.useMockData
  ? new MockFactionRepository()
  : withMockFallback(new FactionRepository(), new MockFactionRepository(), 'faction');

/**
 * 폴백으로 **감싸지 않은** 실서버 저장소 — 서버가 없던 동안 기기에 쌓인 것을 옮기는 일
 * (data/sync/localBackfill) 전용. 감싼 저장소를 쓰면 라우트가 없을 때 다시 로컬로 떨어져
 * 같은 글이 두 벌이 된다. 목업 모드에서는 옮길 서버가 없으므로 null.
 */
export const liveCommunityRepositories = env.useMockData
  ? null
  : {
      feed: new FeedRepository(),
      tips: new TipRepository(),
      poll: new DifficultyPollRepository(),
      qna: new QnaRepository(),
      notifications: notificationRepository,
    };

import { RooftopRepository } from './RooftopRepository';
import { MockRooftopRepository } from './RooftopRepository.mock';
export const rooftopRepository = env.useMockData ? new MockRooftopRepository() : new RooftopRepository();
