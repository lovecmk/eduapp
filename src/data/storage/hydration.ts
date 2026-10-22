interface PersistedStore {
  persist: { hasHydrated: () => boolean; onFinishHydration: (listener: () => void) => () => void };
}

/** Do not read defaults or send them to the server while disk restoration is still in progress. */
export async function waitForHydration(...stores: PersistedStore[]): Promise<void> {
  await Promise.all(stores.map(store => {
    if (store.persist.hasHydrated()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { unsub(); reject(new Error('저장된 데이터를 읽지 못했습니다')); }, 10_000);
      const done = () => { clearTimeout(timer); unsub(); resolve(); };
      const unsub = store.persist.onFinishHydration(done);
      if (store.persist.hasHydrated()) done();
    });
  }));
}
