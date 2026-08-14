import type {
  AccountSettingsSnapshot,
  ISettingsRepository,
} from '../../domain/repositories/ISettingsRepository';
import type { AccountSettings } from '../../domain/models/UserSettings';
import { delay } from './_delay';

/**
 * 목업 계정 설정 — **보관하는 척하지 않는다.**
 *
 * 로컬 설정을 그대로 되돌려 주고 싶은 유혹이 있지만, 그러면 동기화 훅이
 * "서버에도 같은 값이 있다"고 오해해 기기 값을 서버 값으로 착각한다.
 * 대신 `present: false` 로 "서버에 기록이 없다"고 정직하게 답한다 —
 * 그 신호를 받은 훅은 기기 값을 권위로 삼고, 라우트가 열리는 날 그 값을
 * 그대로 서버에 올린다.
 */
export class MockSettingsRepository implements ISettingsRepository {
  async pull(): Promise<AccountSettingsSnapshot> {
    await delay(80);
    return { settings: {}, updatedAt: null, present: false };
  }

  async push(_settings: AccountSettings, _updatedAt: Date): Promise<void> {
    // 보낼 곳이 없다. 값은 이미 기기에 저장돼 있으므로 여기서 할 일은 없다.
    await delay(50);
  }
}
