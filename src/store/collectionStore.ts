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
// 도감이 150종 → 500종이 되면서 지급률을 조였다. 예전(학습 2회당 1팩)이면
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

interface CollectionState {
  /** 카드 id → 보유 장수 */
  owned: Record<string, number>;
  /** 보유 카드팩 수 */
  packs: number;
  /** 중복 카드가 바뀐 '안전 조각' — 원하는 카드를 직접 교환할 수 있다. */
  shards: number;
  /** 마지막으로 일일 무료팩을 받은 날(YYYY-MM-DD) */
  lastDailyPack: string | null;
  /** 학습 적립 진행(STUDY_PER_PACK 회 학습 시 팩 1개) */
  studyProgress: number;
  /** 오늘 학습한 횟수(일일 무료팩 조건 판정용) */
  todayStudy: number;
  /** todayStudy 가 가리키는 날짜 */
  todayStudyDay: string | null;
  /** 상위 등급 천장 상태 */
  pity: PityState;
  /** 최근 새로 획득해 아직 확인 안 한 카드들(도감 NEW 뱃지) */
  newIds: string[];
  /** 카드팩 획득 규칙 수령 횟수(ruleId → 수령 횟수) */
  claimedRules: Record<string, number>;
  /** 이미 교환한 가챠 코드(중복 교환 방지) */
  redeemedCodes: string[];

  /** 오늘 무료팩 수령 가능 여부와 남은 조건을 함께 알려준다. */
  dailyStatus: () => { canClaim: boolean; studied: number; need: number };
  /** 오늘 무료팩을 아직 안 받았고 학습 조건을 채웠으면 지급. */
  claimDaily: () => boolean;
  /**
   * 획득 조건 규칙을 수령한다 — **스토어가 직접 재평가해서** 지급한다.
   * 화면이 보상액을 지정하지 못한다(과거의 지급 구멍을 막은 지점).
   */
  claimRule: (ruleId: string, ctx: PackRuleContext) => number;
  /**
   * 학습한 카드 수를 적립한다 — STUDY_PER_PACK 장마다 팩 1개.
   * 단위는 '장'이다(세션이 아니라). 일일 무료팩 조건도 같은 단위를 쓴다.
   */
  addStudyProgress: (cards?: number) => void;
  /** 팩 즉시 지급(디버그/보상). */
  grantPack: (n?: number) => void;
  /** 가챠 코드를 교환해 카드팩을 지급. 유효하지 않거나 이미 쓴 코드면 ok=false. */
  redeemCode: (input: string) => RedeemResult;
  /** 팩 1개를 열어 카드를 뽑는다. 팩이 없으면 null. */
  openPack: () => OpenResult | null;
  /** 조각으로 특정 카드를 교환. 성공하면 true. */
  exchangeShards: (id: string) => boolean;
  /** 도감에서 NEW 표시를 확인 처리. */
  clearNew: (ids: string[]) => void;
  /** 데이터 초기화 — 첫 방문 상태(빈 도감 + 기본 지급팩)로 되돌린다. */
  reset: () => void;
}

const EMPTY: Pick<
  CollectionState,
  'owned' | 'packs' | 'shards' | 'lastDailyPack' | 'studyProgress' | 'todayStudy' | 'todayStudyDay' | 'pity' | 'newIds' | 'claimedRules' | 'redeemedCodes'
> = {
  owned: {},
  packs: INITIAL_PACKS,
  shards: 0,
  lastDailyPack: null,
  studyProgress: 0,
  todayStudy: 0,
  todayStudyDay: null,
  pity: INITIAL_PITY,
  newIds: [],
  claimedRules: {},
  redeemedCodes: [],
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
        set((s) => ({ packs: s.packs + DAILY_PACK, lastDailyPack: todayKey() }));
        return true;
      },

      addStudyProgress: (cards = 1) =>
        set((s) => {
          const n = Math.max(0, Math.floor(cards));
          if (n === 0) return {};
          const today = todayKey();
          const todayStudy = (s.todayStudyDay === today ? s.todayStudy : 0) + n;
          // 한 세션에서 여러 장을 마치면 팩도 그만큼 나온다(나머지는 이월).
          const p = s.studyProgress + n;
          return {
            todayStudy,
            todayStudyDay: today,
            studyProgress: p % STUDY_PER_PACK,
            packs: s.packs + Math.floor(p / STUDY_PER_PACK),
          };
        }),

      grantPack: (n = 1) => set((s) => ({ packs: s.packs + n })),

      redeemCode: (input) => {
        const found = findGachaCode(input);
        if (!found) {
          return { ok: false, packs: 0, message: '유효하지 않은 코드예요. 다시 확인해주세요.' };
        }
        const norm = normalizeGachaCode(input);
        if (get().redeemedCodes.includes(norm)) {
          return { ok: false, packs: 0, message: '이미 사용한 코드예요.' };
        }
        set((s) => ({ packs: s.packs + found.packs, redeemedCodes: [...s.redeemedCodes, norm] }));
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
          packs: s.packs + progress.claimable,
          claimedRules: { ...s.claimedRules, [ruleId]: (s.claimedRules[ruleId] ?? 0) + times },
        }));
        return progress.claimable;
      },

      openPack: () => {
        const state = get();
        if (state.packs <= 0) return null;
        const { results, shards, pity } = drawPack(state.owned, state.pity, Math.random);
        set((s) => {
          const owned = { ...s.owned };
          const newSet = new Set(s.newIds);
          for (const r of results) {
            owned[r.id] = (owned[r.id] ?? 0) + 1;
            if (r.isNew) newSet.add(r.id);
          }
          return { owned, packs: s.packs - 1, shards: s.shards + shards, pity, newIds: [...newSet] };
        });
        return { results, shards };
      },

      exchangeShards: (id) => {
        const s = get();
        const check = canExchange(id, s.owned, s.shards);
        if (!check.ok) return false;
        set((cur) => ({
          owned: { ...cur.owned, [id]: (cur.owned[id] ?? 0) + 1 },
          shards: cur.shards - check.price,
          newIds: cur.newIds.includes(id) ? cur.newIds : [...cur.newIds, id],
        }));
        return true;
      },

      clearNew: (ids) => set((s) => ({ newIds: s.newIds.filter((x) => !ids.includes(x)) })),

      reset: () => set({ ...EMPTY }),
    }),
    {
      name: 'collection',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: unknown, from: number) => {
        const state = persisted as CollectionState | undefined;
        if (!state) return { ...EMPTY } as CollectionState;
        // v1 → v2: 팩 지급을 늘렸으니 기존 사용자에게도 보너스 팩 3개.
        if (from < 2) state.packs = (state.packs ?? 0) + 3;
        // v2 → v3: 조각·천장·오늘 학습량이 새로 생겼다. 기존 사용자에게
        // 이미 모은 중복 장수만큼 조각을 소급 지급한다 — 갑자기 규칙이
        // 바뀌었다고 그동안의 중복이 그냥 사라지면 억울하니까.
        if (from < 3) {
          state.shards = state.shards ?? backfillShards(state.owned ?? {});
          state.pity = state.pity ?? INITIAL_PITY;
          state.todayStudy = state.todayStudy ?? 0;
          state.todayStudyDay = state.todayStudyDay ?? null;
        }
        return state as CollectionState;
      },
    },
  ),
);

/** v2 사용자가 이미 쌓아둔 중복을 조각으로 환산한다. */
function backfillShards(owned: Record<string, number>): number {
  let total = 0;
  for (const [id, count] of Object.entries(owned)) {
    const card = COLLECTIBLE_BY_ID[id];
    if (!card || count <= 1) continue;
    // 소급분은 정가(SHARD_REWARD)가 아니라 교환가의 1/20 수준으로 낮게 쳐서,
    // 예전 규칙으로 쌓은 중복이 새 경제를 단번에 무너뜨리지 않게 한다.
    total += (count - 1) * Math.round(SHARD_PRICE[card.rarity] / 20);
  }
  return total;
}
