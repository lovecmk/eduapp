import type { RooftopReceipt } from './models/Rooftop';

const koreanDate = (at: number) => new Date(at + 9 * 3600000);
function weekStart(at: number): number {
  const d = koreanDate(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 86400000;
}
/** Demo parity with server rules; the production server is the sole authority. */
export function canOpenRooftop(history: Pick<RooftopReceipt, 'opened_at'>[], at = Date.now()): boolean {
  const day = koreanDate(at).toISOString().slice(0, 10);
  let daily = 0;
  let weekly = 0;
  for (const h of history) {
    const opened = Date.parse(h.opened_at);
    if (at - opened < 60000) return false;
    if (koreanDate(opened).toISOString().slice(0, 10) === day) daily++;
    if (weekStart(opened) === weekStart(at)) weekly++;
  }
  return daily < 3 && weekly < 5;
}
