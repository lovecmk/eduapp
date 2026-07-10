// 실제 네트워크 지연을 흉내내 로딩 UI도 함께 검증 — PART 1.4.1
export const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
