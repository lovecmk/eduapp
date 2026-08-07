import { ref } from 'vue';
import type {
  AuthResult,
  Dashboard,
  MetricsSnapshot,
  ServiceStatus,
  UserPage,
  UserDetail,
  UserQuery,
  AdminUser,
  CardPage,
  CardQuery,
  Card,
  AdminReport,
  ReportPage,
  ReportStatus,
  AuditLog,
  Insight,
  LearnerDiagnosis,
  NotifyInput,
  Announcement,
  AnnounceResult,
  AudienceKind,
  AudiencePreview,
  OpsSettings,
  SettingsPatch,
  LearnerToday,
  UserCollection,
  LabelCount,
  RoleCd,
  StatusCd,
} from './types';

/**
 * 관리 콘솔 API 클라이언트.
 *
 * 세 가지를 책임진다.
 *  1. 토큰 보관과 자동 갱신 — 액세스 토큰은 15분이라 관리자가 화면을 켜 둔 채
 *     자리를 비우면 반드시 만료된다. 만료를 사용자에게 떠넘기지 않고 조용히 갱신한다.
 *  2. 오류 정규화 — 서버는 { "message": "..." } 로 답한다. 상태 코드와 함께
 *     ApiError 로 감싸 화면이 "왜 안 됐는지"를 그대로 보여줄 수 있게 한다.
 *  3. 인증 스트림(SSE) — EventSource 로는 Authorization 헤더를 못 붙이므로
 *     fetch 스트림으로 직접 읽는다(아래 openStream 참고).
 */

const ACCESS_KEY = 'eduadmin.access';
const REFRESH_KEY = 'eduadmin.refresh';

/**
 * 액세스 토큰 보유 여부 — **반응형**으로 노출한다.
 *
 * 클래스 필드(this.access)는 Vue 가 추적하지 못한다. 화면이 그것을 computed 안에서
 * 읽으면 값이 바뀌어도 다시 계산되지 않아 "로그인은 됐는데 화면이 안 넘어가는"
 * 상태가 된다(실제로 겪은 버그다). 그래서 토큰의 유무만 별도 ref 로 미러링하고,
 * 화면은 반드시 이 ref 를 본다.
 *
 * 토큰 값 자체를 ref 에 담지 않는 이유: 값이 필요한 곳은 클라이언트 내부뿐이고,
 * 반응형 객체에 자격증명을 담으면 devtools 등에 그대로 노출된다.
 */
export const hasAccessToken = ref<boolean>(localStorage.getItem(ACCESS_KEY) !== null);

/** 서버 응답을 상태 코드와 함께 감싼 오류. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 인증이 끊긴 상태(재로그인 필요). */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }

  /** 권한 부족 — 로그인은 유효하지만 관리자가 아니다. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** 규칙상 막힌 요청(마지막 관리자 강등 등). 재시도해도 같은 결과다. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** 로그인 상태가 끊겼을 때 앱에 알리는 콜백(라우터가 로그인 화면으로 보낸다). */
type AuthLostHandler = () => void;

class AdminApi {
  private access: string | null = localStorage.getItem(ACCESS_KEY);
  private refresh: string | null = localStorage.getItem(REFRESH_KEY);
  private onAuthLost: AuthLostHandler | null = null;

  /**
   * 진행 중인 토큰 갱신 요청. 여러 요청이 동시에 401 을 받아도
   * 갱신은 한 번만 일어나게 한다(refresh 토큰이 회전하는 서버에서
   * 동시 갱신은 서로의 토큰을 무효화해 로그아웃을 유발한다).
   */
  private refreshInFlight: Promise<boolean> | null = null;

  get isAuthenticated(): boolean {
    return !!this.access;
  }

  setAuthLostHandler(fn: AuthLostHandler): void {
    this.onAuthLost = fn;
  }

  /** 토큰을 저장한다. 새로고침해도 로그인이 유지되어야 관리 작업이 끊기지 않는다. */
  private setTokens(access: string, refresh: string): void {
    this.access = access;
    this.refresh = refresh;
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    hasAccessToken.value = true; // 화면이 관찰하는 반응형 미러를 함께 갱신
  }

  clearTokens(): void {
    this.access = null;
    this.refresh = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    hasAccessToken.value = false;
  }

  /** 현재 액세스 토큰(스트림 연결에 필요). */
  accessToken(): string | null {
    return this.access;
  }

  // ── 인증 ────────────────────────────────────────────────────────────────────

  async login(id: string, password: string): Promise<AuthResult> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      throw new ApiError(res.status, messageOf(body) ?? '로그인에 실패했습니다');
    }
    const auth = body as AuthResult;
    this.setTokens(auth.access_token, auth.refresh_token);
    return auth;
  }

  async logout(): Promise<void> {
    // 서버 통지는 실패해도 로컬 세션은 반드시 비운다 —
    // 여기서 막히면 사용자가 로그아웃을 못 하게 된다.
    try {
      if (this.refresh) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: this.refresh }),
        });
      }
    } catch {
      /* 무시 */
    }
    this.clearTokens();
  }

  /** 리프레시 토큰으로 액세스 토큰을 재발급한다. 성공하면 true. */
  private tryRefresh(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.refresh) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refresh }),
      });
      if (!res.ok) return false;
      const body = (await readBody(res)) as Partial<AuthResult>;
      // 서버가 200 을 주고도 토큰이 비어 올 수 있다 — 그대로 저장하면
      // 이후 모든 요청이 빈 Bearer 로 나가 조용히 실패한다.
      if (typeof body.access_token !== 'string' || body.access_token === '') return false;
      // 리프레시 토큰이 회전됐다면 새 값을 저장해야 다음 갱신이 성공한다.
      this.setTokens(body.access_token, body.refresh_token ?? this.refresh);
      return true;
    } catch {
      return false;
    }
  }

  // ── 요청 ────────────────────────────────────────────────────────────────────

  /**
   * 인증이 필요한 요청. 401 을 받으면 한 번 갱신하고 재시도한다.
   * 재시도는 딱 한 번 — 갱신 후에도 401 이면 진짜 세션이 끝난 것이다.
   */
  private async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.access) headers.set('Authorization', `Bearer ${this.access}`);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let res: Response;
    try {
      res = await fetch(path, { ...init, headers });
    } catch {
      // 네트워크 자체가 끊긴 경우 — 상태 코드가 없으므로 0 으로 구분한다.
      throw new ApiError(0, '서버에 연결할 수 없습니다');
    }

    if (res.status === 401 && retry) {
      if (await this.tryRefresh()) {
        return this.request<T>(path, init, false);
      }
      this.clearTokens();
      this.onAuthLost?.();
      throw new ApiError(401, '로그인이 만료되었습니다. 다시 로그인해주세요');
    }

    if (res.status === 204) return undefined as T;

    const body = await readBody(res);
    if (!res.ok) {
      throw new ApiError(res.status, messageOf(body) ?? defaultMessage(res.status));
    }
    return body as T;
  }

  // ── 관리 API ────────────────────────────────────────────────────────────────

  dashboard(): Promise<Dashboard> {
    return this.request<Dashboard>('/api/admin/dashboard');
  }

  status(): Promise<ServiceStatus> {
    return this.request<ServiceStatus>('/api/admin/status');
  }

  metrics(): Promise<MetricsSnapshot> {
    return this.request<MetricsSnapshot>('/api/admin/metrics');
  }

  /** 분석 — 서버가 짧게 캐시하므로 연속 호출해도 부담이 적다. */
  insight(): Promise<Insight> {
    return this.request<Insight>('/api/admin/insight');
  }

  /** 분석 캐시를 버리고 다시 계산한다(고친 것이 반영됐는지 확인할 때). */
  refreshInsight(): Promise<Insight> {
    return this.request<Insight>('/api/admin/insight/refresh', { method: 'POST' });
  }

  /** 학습자 한 명의 코칭 진단(오답·약점·또래 비교). 캐시하지 않는다. */
  learnerDiagnosis(id: string): Promise<LearnerDiagnosis> {
    return this.request<LearnerDiagnosis>(
      `/api/admin/insight/learner/${encodeURIComponent(id)}`,
    );
  }

  users(q: UserQuery = {}): Promise<UserPage> {
    return this.request<UserPage>(`/api/admin/users${queryString(q)}`);
  }

  user(id: string): Promise<UserDetail> {
    return this.request<UserDetail>(`/api/admin/users/${encodeURIComponent(id)}`);
  }

  setUserRole(id: string, role: RoleCd): Promise<AdminUser> {
    return this.request<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role_cd: role }),
    });
  }

  setUserStatus(id: string, status: StatusCd): Promise<AdminUser> {
    return this.request<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status_cd: status }),
    });
  }

  /** 이 사람의 도감 현황 — "팩이 사라졌어요" 같은 문의에 답할 때 쓴다. */
  userCollection(id: string): Promise<UserCollection> {
    return this.request<UserCollection>(`/api/admin/users/${encodeURIComponent(id)}/collection`);
  }

  /** 그 사람이 오늘 받은 문제 — 편성이 사람마다 다르므로 콘솔에서 확인할 수 있어야 한다. */
  learnerToday(id: string): Promise<LearnerToday> {
    return this.request<LearnerToday>(`/api/admin/users/${encodeURIComponent(id)}/today`);
  }

  cards(q: CardQuery = {}): Promise<CardPage> {
    return this.request<CardPage>(`/api/admin/cards${queryString(q)}`);
  }

  card(id: string): Promise<Card> {
    return this.request<Card>(`/api/admin/cards/${encodeURIComponent(id)}`);
  }

  createCard(card: Card): Promise<Card> {
    return this.request<Card>('/api/admin/cards', {
      method: 'POST',
      body: JSON.stringify(card),
    });
  }

  updateCard(id: string, card: Card): Promise<Card> {
    return this.request<Card>(`/api/admin/cards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(card),
    });
  }

  deleteCard(id: string): Promise<void> {
    return this.request<void>(`/api/admin/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** 접수된 신고 목록 + 단계별 전체 건수. */
  async reports(q: { status?: string; card_id?: string; limit?: number } = {}): Promise<ReportPage> {
    const res = await this.request<ReportPage>(
      `/api/admin/reports${queryString({ limit: 100, ...q })}`,
    );
    return { items: res.items ?? [], counts: res.counts ?? {}, pending: res.pending ?? 0 };
  }

  /** 신고 한 건의 처리 단계를 바꾼다. */
  reviewReport(id: string, status: ReportStatus, resolution = ''): Promise<AdminReport> {
    return this.request<AdminReport>(`/api/admin/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status_cd: status, resolution_txt: resolution }),
    });
  }

  /** 공지를 발송하고 결과(수신자 수·이력)를 돌려준다. */
  announce(input: NotifyInput): Promise<AnnounceResult> {
    return this.request<AnnounceResult>('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** 발송된 공지 이력. */
  async announcements(limit = 50): Promise<Announcement[]> {
    const res = await this.request<{ items: Announcement[] }>(
      `/api/admin/announcements?limit=${limit}`,
    );
    return res.items ?? [];
  }

  /** 보내기 전에 대상 규모를 확인한다 — 되돌릴 수 없는 발송을 눈감고 누르지 않게. */
  audiencePreview(kind: AudienceKind, value = ''): Promise<AudiencePreview> {
    return this.request<AudiencePreview>(
      `/api/admin/announcements/audience${queryString({ audience_cd: kind, audience_value: value })}`,
    );
  }

  /** 지금 존재하는 소속 조직 목록(대상 고르기·필터용). */
  async orgs(): Promise<LabelCount[]> {
    const res = await this.request<{ items: LabelCount[] }>('/api/admin/orgs');
    return res.items ?? [];
  }

  /** 운영 설정 조회. */
  settings(): Promise<OpsSettings> {
    return this.request<OpsSettings>('/api/admin/settings');
  }

  /** 운영 설정 변경 — 바꾼 필드만 보낸다(남의 변경을 덮지 않기 위해). */
  updateSettings(patch: SettingsPatch): Promise<OpsSettings> {
    return this.request<OpsSettings>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async audit(limit = 100): Promise<AuditLog[]> {
    const res = await this.request<{ items: AuditLog[] }>(`/api/admin/audit?limit=${limit}`);
    return res.items ?? [];
  }

  /**
   * 실시간 지표 스트림을 연다.
   *
   * 브라우저 기본 EventSource 를 쓰지 않는 이유: EventSource 는 요청 헤더를
   * 설정할 수 없어 Authorization 을 붙일 수 없다. 우회로는 토큰을 쿼리스트링에
   * 싣는 것인데, 그러면 토큰이 접근 로그·리버스 프록시 로그·브라우저 히스토리에
   * 그대로 남는다. 관리자 토큰은 전체 사용자 데이터에 접근할 수 있으므로
   * 그 위험을 감수할 이유가 없다. fetch 스트림으로 직접 읽어 헤더를 지킨다.
   *
   * 반환값은 연결을 끊는 함수다(컴포넌트 언마운트 시 반드시 호출).
   */
  openStream(onSnapshot: (s: MetricsSnapshot) => void, onStateChange?: (live: boolean) => void): () => void {
    const controller = new AbortController();
    let stopped = false;
    let retryDelay = 1000;

    const connect = async (): Promise<void> => {
      if (stopped) return;
      try {
        const res = await fetch('/api/admin/stream', {
          headers: { Authorization: `Bearer ${this.access ?? ''}` },
          signal: controller.signal,
        });

        if (res.status === 401) {
          // 스트림도 토큰 만료를 만난다. 갱신 후 다시 연결한다.
          if (await this.tryRefresh()) {
            if (!stopped) void connect();
            return;
          }
          this.clearTokens();
          this.onAuthLost?.();
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        onStateChange?.(true);
        retryDelay = 1000; // 성공했으니 백오프를 되돌린다

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE 는 빈 줄(\n\n)로 이벤트를 구분한다. 마지막 조각은 아직 미완성일 수
          // 있으므로 버퍼에 남겨 다음 청크와 이어 붙인다.
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const snapshot = parseSSEData(chunk);
            if (snapshot) onSnapshot(snapshot as MetricsSnapshot);
          }
        }
      } catch {
        // 끊김 — 아래에서 재연결한다.
      }

      if (stopped) return;
      onStateChange?.(false);
      // 지수 백오프(최대 15초). 서버가 죽어 있을 때 초당 재연결로 몰아치지 않는다.
      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 15000);
      setTimeout(() => {
        if (!stopped) void connect();
      }, delay);
    };

    void connect();

    return () => {
      stopped = true;
      controller.abort();
      onStateChange?.(false);
    };
  }
}

/** SSE 이벤트 한 덩어리에서 data 를 꺼내 JSON 으로 파싱한다. */
export function parseSSEData(chunk: string): unknown | null {
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    // ':' 로 시작하는 줄은 주석(heartbeat)이다.
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n'));
  } catch {
    // 깨진 프레임 하나 때문에 스트림 전체를 끊지는 않는다.
    return null;
  }
}

/**
 * 쿼리 객체를 ?a=1&b=2 로 만든다. 빈 값은 아예 보내지 않는다 —
 * `?search=` 처럼 빈 파라미터를 보내면 서버가 '빈 문자열로 검색'으로 해석할 여지가 있다.
 */
export function queryString(q: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q as Record<string, unknown>)) {
    if (value === undefined || value === '' || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // 서버가 JSON 이 아닌 것을 돌려준 경우(프록시 오류 페이지 등).
    return { message: text.slice(0, 200) };
  }
}

function messageOf(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string' && m.trim() !== '') return m;
  }
  return null;
}

/** 서버가 메시지를 주지 않았을 때 쓰는 기본 문구. */
export function defaultMessage(status: number): string {
  if (status === 400) return '요청 내용을 다시 확인해주세요';
  if (status === 403) return '권한이 없습니다';
  if (status === 404) return '대상을 찾을 수 없습니다';
  if (status === 409) return '규칙상 수행할 수 없는 작업입니다';
  if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요';
  if (status >= 500) return '서버에 문제가 생겼습니다';
  return '요청을 처리하지 못했습니다';
}

export const api = new AdminApi();
