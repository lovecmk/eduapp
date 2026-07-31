import { ref } from 'vue';
import { api, ApiError } from '../api/client';
import type { AdminUser, RoleCd, StatusCd } from '../api/types';
import { statusLabel } from '../lib/format';
import { toast } from '../lib/toast';

/**
 * 사용자의 권한·상태를 바꾸는 일 한 벌.
 *
 * 목록에서도(줄 위 빠른 동작), 상세에서도 같은 일을 한다. 그런데 이건
 * **되돌리기 어려운 동작**이라, 두 화면이 조금씩 다르게 물어보기 시작하면
 * 곤란해진다 — 한쪽에서는 경고가 뜨는데 다른 쪽에서는 그냥 나가는 식으로.
 * 확인 문구도, 무엇을 위험(danger)으로 볼지도 여기 한 곳에서 정한다.
 *
 * ── 확인 문구에 '무슨 일이 벌어지는지'를 쓰는 이유 ────────────────────
 * "정말 정지하시겠습니까?" 는 아무 정보가 없다. 관리자가 알아야 하는 것은
 * 되돌릴 수 있는지, 지금 접속 중인 사람은 어떻게 되는지다. 그래서 문구에
 * '새 로그인은 즉시 막히고 접속 중인 기기는 최대 15초 뒤에 끊긴다'까지 쓴다.
 *
 * 서버도 잠금 방지 규칙(자기 자신·마지막 관리자)을 갖고 있어, 화면에서 못 막은
 * 경우 409 로 거절된다 — 그 메시지를 그대로 보여준다. 화면이 지어낸 말보다
 * 서버가 아는 이유가 정확하다.
 */

export interface PendingChange {
  kind: 'role' | 'status';
  value: string;
  message: string;
  danger: boolean;
  /** 누구를 바꾸는 중인지 — 목록에서는 줄마다 대상이 다르다. */
  userId: string;
}

export function useUserActions(onDone: () => void | Promise<void>) {
  const pending = ref<PendingChange | null>(null);
  const saving = ref(false);

  /** 권한 변경을 묻는다. 이미 그 권한이면 아무 일도 하지 않는다. */
  function askRole(user: Pick<AdminUser, 'id' | 'user_nm' | 'role_cd'>, next: RoleCd): void {
    if (user.role_cd === next) return;
    pending.value = {
      kind: 'role',
      value: next,
      userId: user.id,
      // 권한을 **빼앗는** 쪽이 위험하다. 잘못 누르면 그 사람은 즉시 일을 못 하게 된다.
      danger: next === 'USER',
      message:
        next === 'ADMIN'
          ? `${name(user.user_nm)}님에게 관리자 권한을 부여합니다. 전체 사용자 데이터와 학습 콘텐츠를 조회·수정할 수 있게 됩니다.`
          : `${name(user.user_nm)}님의 관리자 권한을 해제합니다. 즉시 관리 콘솔에 접근할 수 없게 됩니다.`,
    };
  }

  /** 계정 상태 변경을 묻는다. */
  function askStatus(user: Pick<AdminUser, 'id' | 'user_nm' | 'status_cd'>, next: StatusCd): void {
    if (user.status_cd === next) return;
    pending.value = {
      kind: 'status',
      value: next,
      userId: user.id,
      danger: next !== 'A',
      message:
        next === 'A'
          ? `${name(user.user_nm)}님의 계정을 다시 활성화합니다.`
          : `${name(user.user_nm)}님의 계정을 '${statusLabel(next)}' 상태로 바꿉니다. 새 로그인은 즉시 막히고, 이미 접속 중인 기기는 최대 15초 뒤에 끊깁니다.`,
    };
  }

  function cancel(): void {
    if (!saving.value) pending.value = null;
  }

  async function confirm(): Promise<void> {
    const req = pending.value;
    if (!req || saving.value) return;
    saving.value = true;
    try {
      if (req.kind === 'role') await api.setUserRole(req.userId, req.value as RoleCd);
      else await api.setUserStatus(req.userId, req.value as StatusCd);
      toast.success(req.kind === 'role' ? '권한을 변경했습니다' : '계정 상태를 변경했습니다');
      pending.value = null;
      // 서버가 최종 상태의 주인이다 — 화면을 임의로 낙관 갱신하지 않는다.
      await onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '변경하지 못했습니다');
    } finally {
      saving.value = false;
    }
  }

  return { pending, saving, askRole, askStatus, confirm, cancel };
}

/** 이름이 비어 있는 계정이 있다 — "님" 앞이 비면 문장이 깨진다. */
function name(userNm: string): string {
  return userNm?.trim() || '이름 없는 계정';
}
