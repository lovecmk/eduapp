import type { IServiceConfigRepository } from '../../domain/repositories/IServiceConfigRepository';
import type { ServiceConfig } from '../../domain/models/ServiceConfig';
import { defaultServiceConfig } from '../../domain/models/ServiceConfig';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../../constants/learning';
import { delay } from './_delay';

/**
 * 서비스 운영 상태 목업.
 *
 * 기본은 '아무 일도 없는 평상시'다 — 점검 꺼짐, 배너 없음. 목업이 배너를 띄우면
 * 데모 화면마다 뜻 없는 안내가 붙고, 정작 진짜 공지가 왔을 때 눈에 안 들어온다.
 *
 * 배너를 눈으로 확인하고 싶으면 아래 두 줄만 잠깐 바꾼다.
 */
export class MockServiceConfigRepository implements IServiceConfigRepository {
  async get(): Promise<ServiceConfig> {
    await delay(120);
    return {
      ...defaultServiceConfig(DAILY_MIN_CARDS, DAILY_MAX_CARDS),
      // noticeText: '이번 주 금요일 안전교육이 있습니다',
      // noticeLevel: 'warn',
      serverVersion: 'mock',
    };
  }
}
