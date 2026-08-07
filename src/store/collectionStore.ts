import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLLECTIBLE_BY_ID } from '../data/collectibles';
import { findGachaCode, normalizeGachaCode } from '../data/gachaCodes';
import { evaluateRule, PACK_RULE_BY_ID, type PackRuleContext } from '../data/packRules';
import {
  openPack as drawPack,
  canExchange,
  INITIAL_PITY,
  SHARD_PRICE,
  type DrawResult,
  type PityState,
} from '../domain/packDraw';
import {
  EMPTY_SNAPSHOT,
  mergeSnapshots,
  packBalance,
  shardBalance,
  type CollectionSnapshot,
} from '../domain/models/Collection';

export type { DrawResult } from '../domain/packDraw';

export interface RedeemResult {
  ok: boolean;
  /** 지급된 카드팩 수(성공 시) */
  packs: number;
  /** 사용자 안내 문구 */
  message: string;
}

/** 팩 개봉 결과 — 뽑은 카드와 이번에 얻은 조각. */
export interface OpenResult {
  results: DrawResult[];
  shards: number;
}

// ── 지급 정책 ───────────────────────────────────────────────────────────
// 도감이 150종 → 500종이 되면서 지급률을 조였다. 예전(학습 2장당 1팩)이면
// 하루 학습만으로 팩이 2~3개씩 쌓여, 500종이어도 몇 주면 바닥이 보인다.
// 지금은 "하루 학습을 다 하면 팩 하나" 정도가 기준선이다.

/** 첫 방문에 지급하는 카드팩 수. */
export const INITIAL_PACKS = 3;
/** 카드 몇 장을 학습해야 카드팩 1개가 적립되는지. */
export const STUDY_PER_PACK = 5;
/** 일일 무료팩 지급 수. */
export const DAILY_PACK = 1;
/**
 * 일일 무료팩을 받기 위해 그날 최소로 해야 하는 학습 수.
 *
 * 예전엔 앱을 열기만 해도 매일 팩이 나왔다 — '학습 앱'의 보상인데 학습과
 * 아무 관계가 없었다. 지금은 그날 카드를 조금이라도 봐야 열린다.
 */
export const DAILY_PACK_MIN_STUDY = 3;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface CollectionState extends CollectionSnapshot {
  /** 오늘 학습한 장수(일일 무료팩 조건 판정용) — 기기 로컬 값이라 동기화하지 않는다. */
  todayStudy: number;
  /** todayStudy 가 가리키는 날짜 */
  todayStudyDay: string | null;
  /** 최근 새로 획득해 아직 확인 안 한 카드들(도감 NEW 뱃지) — 화면 상태라 로컬. */
  newIds: string[];
  /** 마지막으로 서버와 맞춘 시각(ISO). 한 번도 못 맞췄으면 null. */
  lastSyncedAt: string | null;

  /** 오늘 무료팩 수령 가능 여부와 남은 조건을 함께 알려준다. */
  dailyStatus: () => { canClaim: boolean; studied: number; need: number };
  /** 오늘 무료팩을 아직 안 받았고 학습 조건을 채웠으면 지급. */
  claimDaily: () => boolean;
  /**
   * 획득 조건 규칙을 수령한다 — **스토어가 직접 재평가해서** 지급한다.
   * 화면이 보상액을 지정하지 못한다.
   */
  claimRule: (ruleId: string, ctx: PackRuleContext) => number;
  /** 학습한 카드 수를 적립한다 — STUDY_PER_PACK 장마다 팩 1개. */
  addStudyProgress: (cards?: number) => void;
  /** 팩 즉시 지급(디버그/보상). */
  grantPack: (n?: number) => void;
  /** 가챠 코드를 교환해 카드팩을 지급. */
  redeemCode: (input: string) => RedeemResult;
  /** 팩 1개를 열어 카드를 뽑는다. 팩이 없으면 null. */
  openPack: () => OpenResult | null;
  /** 조각으로 특정 카드를 교환. 성공하면 true. */
  exchangeShards: (id: string) => boolean;
  /** 도감에서 NEW 표시를 확인 처리. */
  clearNew: (ids: string[]) => void;

  /** 서버로 보낼 스냅샷(동기화 계층이 쓴다). */
  snapshot: () => CollectionSnapshot;
  /** 서버가 돌려준 병합 결과를 반영한다 — 덮어쓰지 않고 한 번 더 합친다. */
  applyServer: (remote: CollectionSnapshot) => void;

  /** 데이터 초기화 — 첫 방문 상태로 되돌린다. */
  reset: () => void;
}

// ── 파생 선택자 ─────────────────────────────────────────────────────────
// 잔액은 저장하지 않는다(카운터에서 계산되는 값이라 따로 두면 어긋난다).
// 화면은 이 선택자로 읽는다.

/** 보유 카드팩 수. */
export const selectPacks = (s: CollectionSnapshot) => packBalance(s);
/** 보유 안전 조각 수. */
export const selectShards = (s: CollectionSnapshot) => shardBalance(s);
/** 다음 팩까지 남은 학습 장수. */
export const selectStudyToNextPack = (s: CollectionSnapshot) =>
  STUDY_PER_PACK - (s.studyTotal % STUDY_PER_PACK);

const EMPTY = {
  ...EMPTY_SNAPSHOT,
  // 첫 방문 보너스는 '적립'으로 기록한다 — 잔액을 직접 세팅하면 카운터와 어긋난다.
  packsEarned: INITIAL_PACKS,
  todayStudy: 0,
  todayStudyDay: null as string | null,
  newIds: [] as string[],
  lastSyncedAt: null as string | null,
};

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      dailyStatus: () => {
        const s = get();
        const today = todayKey();
        const studied = s.todayStudyDay === today ? s.todayStudy : 0;
        return {
          canClaim: s.lastDailyPack !== today && studied >= DAILY_PACK_MIN_STUDY,
          studied,
          need: Math.max(0, DAILY_PACK_MIN_STUDY - studied),
        };
      },

      claimDaily: () => {
        if (!get().dailyStatus().canClaim) return false;
        set((s) => ({ packsEarned: s.packsEarned + DAILY_PACK, lastDailyPack: todayKey() }));
        return true;
      },

      addStudyProgress: (cards = 1) =>
        set((s) => {
          const n = Math.max(0, Math.floor(cards));
          if (n === 0) return {};
          const today = todayKey();
          const studyTotal = s.studyTotal + n;
          // 적립은 누적 학습량에서 계산한다 — 별도 진행 카운터를 두면
          // 서버와 맞출 때 두 값이 어긋난다.
          const earnedBefore = Math.floor(s.studyTotal / STUDY_PER_PACK);
          const earnedAfter = Math.floor(studyTotal / STUDY_PER_PACK);
          return {
            studyTotal,
            todayStudy: (s.todayStudyDay === today ? s.todayStudy : 0) + n,
            todayStudyDay: today,
            packsEarned: s.packsEarned + (earnedAfter - earnedBefore),
          };
        }),

      grantPack: (n = 1) => set((s) => ({ packsEarned: s.packsEarned + n })),

      redeemCode: (input) => {
        const found = findGachaCode(input);
        if (!found) {
          return { ok: false, packs: 0, message: '유효하지 않은 코드예요. 다시 확인해주세요.' };
        }
        const norm = normalizeGachaCode(input);
        if (get().redeemedCodes.includes(norm)) {
          return { ok: false, packs: 0, message: '이미 사용한 코드예요.' };
        }
        set((s) => ({
          packsEarned: s.packsEarned + found.packs,
          redeemedCodes: [...s.redeemedCodes, norm],
        }));
        return { ok: true, packs: found.packs, message: found.label };
      },

      claimRule: (ruleId, ctx) => {
        const rule = PACK_RULE_BY_ID[ruleId];
        // 모르는 규칙 id는 지급하지 않는다(화면이 임의의 id를 보내도 무해하게).
        if (!rule) return 0;
        const claimedTimes = get().claimedRules[ruleId] ?? 0;
        // 지금 상태로 다시 계산 — 화면이 들고 있던 값이 낡았어도 여기서 바로잡힌다.
        const progress = evaluateRule(rule, ctx, claimedTimes);
        if (progress.claimable <= 0) return 0;
        const times = progress.claimable / rule.reward;
        set((s) => ({
          packsEarned: s.packsEarned + progress.claimable,
          claimedRules: { ...s.claimedRules, [ruleId]: (s.claimedRules[ruleId] ?? 0) + times },
        }));
        return progress.claimable;
      },

      openPack: () => {
        const state = get();
        if (packBalance(state) <= 0) return null;
        const pity: PityState = { sinceEpic: state.sinceEpic, sinceLegendary: state.sinceLegendary };
        const { results, shards, pity: nextPity } = drawPack(state.owned, pity, Math.random);
        set((s) => {
          const owned = { ...s.owned };
          const newSet = new Set(s.newIds);
          for (const r of results) {
            owned[r.id] = (owned[r.id] ?? 0) + 1;
            if (r.isNew) newSet.add(r.id);
          }
          return {
            owned,
            packsOpened: s.packsOpened + 1,
            shardsEarned: s.shardsEarned + shards,
            sinceEpic: nextPity.sinceEpic,
            sinceLegendary: nextPity.sinceLegendary,
            newIds: [...newSet],
          };
        });
        return { results, shards };
      },

      exchangeShards: (id) => {
        const s = get();
        const check = canExchange(id, s.owned, shardBalance(s));
        if (!check.ok) return false;
        set((cur) => ({
          owned: { ...cur.owned, [id]: (cur.owned[id] ?? 0) + 1 },
          shardsSpent: cur.shardsSpent + check.price,
          newIds: cur.newIds.includes(id) ? cur.newIds : [...cur.newIds, id],
        }));
        return true;
      },

      clearNew: (ids) => set((s) => ({ newIds: s.newIds.filter((x) => !ids.includes(x)) })),

      snapshot: () => {
        const s = get();
        return {
          owned: s.owned,
          packsEarned: s.packsEarned,
          packsOpened: s.packsOpened,
          shardsEarned: s.shardsEarned,
          shardsSpent: s.shardsSpent,
          studyTotal: s.studyTotal,
          claimedRules: s.claimedRules,
          redeemedCodes: s.redeemedCodes,
          lastDailyPack: s.lastDailyPack,
          sinceEpic: s.sinceEpic,
          sinceLegendary: s.sinceLegendary,
        };
      },

      applyServer: (remote) =>
        set((s) => {
          // 덮어쓰지 않고 한 번 더 합친다 — 요청이 오가는 사이에도 사용자는
          // 팩을 연다. 그대로 덮으면 그 몇 초 동안의 개봉이 사라진다.
          const merged = mergeSnapshots(get().snapshot(), remote);
          // 서버에 있는데 내가 아직 못 본 카드는 NEW 로 띄운다(새 기기 첫 동기화).
          const fresh = Object.keys(merged.owned).filter((id) => !s.owned[id]);
          return {
            ...merged,
            newIds: [...new Set([...s.newIds, ...fresh])],
            lastSyncedAt: new Date().toISOString(),
          };
        }),

      reset: () => set({ ...EMPTY }),
    }),
    {
      name: 'collection',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      // 파생·화면 상태는 저장하지 않는다(newIds 는 남겨 둔다 — 재실행 후에도
      // '새로 얻은 카드'를 확인할 수 있어야 한다).
      migrate: (persisted: unknown, from: number) => {
        const state = persisted as (Partial<CollectionState> & Record<string, unknown>) | undefined;
        if (!state) return { ...EMPTY } as CollectionState;

        // v1 → v2: 팩 지급을 늘렸으니 기존 사용자에게도 보너스 팩 3개.
        if (from < 2) state.packsEarned = ((state.packs as number) ?? 0) + 3;

        // v2 → v3: 조각·천장이 생겼다. 이미 모은 중복을 조각으로 소급 지급한다.
        if (from < 3) {
          state.shardsEarned = state.shardsEarned ?? backfillShards(state.owned ?? {});
          state.todayStudy = state.todayStudy ?? 0;
          state.todayStudyDay = state.todayStudyDay ?? null;
        }

        // v3 → v4: 잔액(packs/shards)을 단조 카운터로 바꾼다.
        //
        // 예전 값에는 '얼마나 열었는가'가 없다. 그래서 개봉/사용 카운터를 0으로
        // 두고 적립 카운터에 현재 잔액을 넣는다 — 잔액이 그대로 보존되고,
        // 이후의 증감만 카운터로 쌓인다. 과거 개봉 횟수는 복원할 수 없지만
        // 그 값을 쓰는 화면이 없어 잃을 것이 없다.
        if (from < 4) {
          const pity = (state.pity as PityState | undefined) ?? INITIAL_PITY;
          state.packsEarned = (state.packsEarned as number | undefined) ?? (state.packs as number) ?? 0;
          state.packsOpened = 0;
          state.shardsEarned = (state.shardsEarned as number | undefined) ?? (state.shards as number) ?? 0;
          state.shardsSpent = 0;
          state.sinceEpic = pity.sinceEpic ?? 0;
          state.sinceLegendary = pity.sinceLegendary ?? 0;
          // 누적 학습량은 예전에 '다음 팩까지의 진행'만 들고 있었다. 되살릴 수
          // 없으니 0에서 시작한다 — 적립은 앞으로의 학습으로만 쌓인다.
          state.studyTotal = state.studyTotal ?? 0;
          state.lastDailyPack = (state.lastDailyPack as string | null) ?? '';
          delete state.packs;
          delete state.shards;
          delete state.pity;
          delete state.studyProgress;
        }
        return { ...EMPTY, ...state } as CollectionState;
      },
    },
  ),
);

/** v2 이하 사용자가 이미 쌓아둔 중복을 조각으로 환산한다. */
function backfillShards(owned: Record<string, number>): number {
  let total = 0;
  for (const [id, count] of Object.entries(owned)) {
    const card = COLLECTIBLE_BY_ID[id];
    if (!card || count <= 1) continue;
    // 소급분은 정가가 아니라 교환가의 1/20 수준으로 낮게 쳐서, 예전 규칙으로
    // 쌓은 중복이 새 경제를 단번에 무너뜨리지 않게 한다.
    total += (count - 1) * Math.round(SHARD_PRICE[card.rarity] / 20);
  }
  return total;
}
