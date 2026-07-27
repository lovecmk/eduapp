import { reactive, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 목록 조건(검색어·필터·정렬·페이지)을 주소창과 동기화한다.
 *
 * 왜 필요한가 — 관리 도구에서는 이런 일이 매일 일어난다.
 *  · "정지된 계정만 걸러서 보고 있는데, 이 화면 링크 좀 줄래?"
 *  · 상세를 열었다가 뒤로 가면 필터가 풀려 처음부터 다시 거른다.
 *  · 새로고침 한 번에 조건이 날아간다.
 * 조건을 주소에 담으면 공유·북마크·뒤로가기가 전부 공짜로 해결된다.
 *
 * 기본값과 같은 항목은 주소에 넣지 않는다 — `?search=&role=&offset=0` 처럼
 * 의미 없는 꼬리표가 붙으면 링크를 읽을 수 없게 된다.
 */

export type QueryState = Record<string, string | number>;

export function useQuerySync<T extends QueryState>(defaults: T) {
  const route = useRoute();
  const router = useRouter();

  const state = reactive({ ...defaults }) as T;

  /** 주소창 값을 상태로 읽어들인다(타입은 기본값을 기준으로 맞춘다). */
  function readFromUrl(): void {
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = route.query[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value === undefined || value === null) {
        state[key] = defaults[key];
        continue;
      }
      if (typeof defaults[key] === 'number') {
        const n = Number(value);
        // 주소창은 손으로 고칠 수 있다 — 숫자가 아니면 기본값으로 되돌린다.
        state[key] = (Number.isFinite(n) && n >= 0 ? n : defaults[key]) as T[keyof T & string];
      } else {
        state[key] = String(value) as T[keyof T & string];
      }
    }
  }

  /** 상태를 주소창에 반영한다(기본값은 생략). */
  function writeToUrl(): void {
    const query: Record<string, string> = {};
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const value = state[key];
      if (value === defaults[key] || value === '' || value === undefined) continue;
      query[key] = String(value);
    }
    // 같은 주소로 다시 밀면 vue-router 가 중복 이동 오류를 낸다.
    if (JSON.stringify(query) === JSON.stringify(route.query)) return;
    // replace 를 쓴다 — 필터를 조금씩 바꿀 때마다 히스토리가 쌓이면
    // 뒤로가기를 스무 번 눌러야 목록을 벗어난다.
    void router.replace({ query });
  }

  readFromUrl();

  // 뒤로/앞으로 이동으로 주소가 바뀌면 화면 상태도 따라간다.
  watch(
    () => route.query,
    () => readFromUrl(),
  );

  return { state, writeToUrl, readFromUrl };
}

/**
 * 정렬 상태 토글.
 * 같은 열을 다시 누르면 방향이 뒤집히고, 다른 열을 누르면 그 열의 기본 방향으로 간다.
 * (숫자·날짜는 큰 값부터, 글자는 가나다순이 자연스럽다)
 */
export function toggleSort(
  sort: Ref<string> | { value: string },
  desc: Ref<boolean> | { value: boolean },
  column: string,
  defaultDesc = false,
): void {
  if (sort.value === column) {
    desc.value = !desc.value;
  } else {
    sort.value = column;
    desc.value = defaultDesc;
  }
}
