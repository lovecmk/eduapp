import { notificationRoute } from '../notificationRoute';
import { ROUTES } from '../../constants/routes';

it.each(['/review', '/(tabs)/review', '/eduapp/review', 'fieldlearning://review'])('review entry %s uses the bottom tab route', route => {
  expect(notificationRoute({ route })).toBe(ROUTES.review);
});
it('reminders and learning use their canonical tab destinations', () => {
  expect(notificationRoute({ type: 'remind' })).toBe(ROUTES.review);
  expect(notificationRoute({ route: '/cards' })).toBe(ROUTES.cards);
});
it.each(['https://evil.test/review', '//evil.test/review', '/unknown', ''])('unknown/external destination %s is ignored', route => {
  expect(notificationRoute({ route })).toBeNull();
});

it('opens only local question detail routes for community events', () => {
  expect(notificationRoute({ type: 'community', route: '/qna/q_123' })).toBe('/qna/q_123');
  for (const route of ['https://evil.test/qna/q_123', '//evil.test/qna/q_123', '/qna/../settings', '/qna/q_123?next=outside', '/qna/' + 'a'.repeat(65)]) {
    expect(notificationRoute({ type: 'community', route })).toBeNull();
  }
});
