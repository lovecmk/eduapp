import { ROUTES } from '../constants/routes';

/** Only supported learning destinations are accepted from OS notification data. */
export function notificationRoute(data: Record<string, unknown>): string | null {
  const route = String(data.route ?? data.url ?? '');
  if (data.type === 'community' && /^\/qna\/[A-Za-z0-9_-]{1,64}$/.test(route)) return route;
  if (data.type === 'remind' || data.type === 'review') return ROUTES.review;
  if (['/review', '/(tabs)/review', '/eduapp/review', 'fieldlearning://review'].includes(String(data.route ?? data.url ?? ''))) return ROUTES.review;
  if (['/cards', '/(tabs)/cards', '/eduapp/cards', 'fieldlearning://cards'].includes(String(data.route ?? data.url ?? ''))) return ROUTES.cards;
  return null;
}
