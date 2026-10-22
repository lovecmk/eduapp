import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { isRestored, useAccountRestoreStore } from '../store/accountRestoreStore';
import { syncPushTokenWithServer, setCommunityNotificationPresentation } from '../data/notifications/NotificationService';
import { unregisterPushTokenWithServer } from '../data/notifications/pushRegistration';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { pullNotifications } from './useNotificationSync';

/** Recheck OS consent after returning from system settings, without prompting. */
export function usePushTokenSync(): void {
  useEffect(() => {
    const allowed = (data: Record<string, unknown>) => {
      const user = useAuthStore.getState().user;
      const notifications = useSettingsStore.getState().notifications;
      return !!user && isRestored(useAccountRestoreStore.getState().entries.settings, user.id) && data.user_id === user.id && notifications.enabled && notifications.communityAlerts;
    };
    setCommunityNotificationPresentation(allowed);
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener(notification => {
      if (notification.request.content.data.type === 'community' && allowed(notification.request.content.data)) void pullNotifications();
    });
    return () => { sub.remove(); setCommunityNotificationPresentation(() => false); };
  }, []);
  const userId = useAuthStore(s => s.bootstrapped ? s.user?.id : undefined);
  const enabled = useSettingsStore(s => s.notifications.enabled);
  const settings = useAccountRestoreStore(s => s.entries.settings);
  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !isRestored(settings, userId)) return;
    let active = true;
    const epoch = getSessionEpoch();
    const allowed = () => active && epoch === getSessionEpoch() && useAuthStore.getState().user?.id === userId && useSettingsStore.getState().notifications.enabled;
    const update = () => {
      if (allowed()) void syncPushTokenWithServer(allowed);
      else if (active && epoch === getSessionEpoch()) void unregisterPushTokenWithServer();
    };
    update();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { active = false; sub.remove(); };
  }, [userId, enabled, settings]);
}
