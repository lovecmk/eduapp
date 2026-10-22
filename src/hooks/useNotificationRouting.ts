import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { notificationRoute } from '../navigation/notificationRoute';

/** Warm/cold notification opens use the same tab route as the bottom bar. */
export function useNotificationRouting() {
  const router = useRouter();
  const userId = useAuthStore(s => s.bootstrapped ? s.user?.id : undefined);
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    let active = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      const data = response.notification.request.content.data;
      if (data.user_id && data.user_id !== userId) return;
      if (handled.current.has(id)) return;
      const target = notificationRoute(data);
      if (!target) return;
      handled.current.add(id);
      router.navigate(target as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    return () => { active = false; sub.remove(); };
  }, [router, userId]);
}
