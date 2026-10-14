import { ROUTES } from '../constants/routes';

/** Only supported learning destinations are accepted from OS notification data. */
export function notificationRoute(data: Record<string, unknown>): typeof ROUTES.review | typeof ROUTES.cards | null {
  if (data.type === 'remind' || data.type === 'review') return ROUTES.review;
  if (['/review', '/(tabs)/review', '/eduapp/review', 'fieldlearning://review'].includes(String(data.route ?? data.url ?? ''))) return ROUTES.review;
  if (['/cards', '/(tabs)/cards', '/eduapp/cards', 'fieldlearning://cards'].includes(String(data.route ?? data.url ?? ''))) return ROUTES.cards;
  return null;
}
