import { apiClient } from '../network/ApiClient';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { getSessionEpoch } from '../network/sessionEpoch';

/** Revoke only this device's token; the backend also checks its current owner. */
export async function unregisterPushTokenWithServer(durable = true): Promise<void> {
  const epoch = getSessionEpoch();
  const token = await secureStorage.getItem(StorageKeys.pushToken);
  if (!token || epoch !== getSessionEpoch()) return;
  try {
    if (durable) await apiClient.postDurable('/inner/api/v1/push/unregister', { token });
    else await apiClient.post('/inner/api/v1/push/unregister', { token });
    // Keep the device token locally so another failed permission check can
    // repeat an idempotent revoke, including after offline registration.
  } catch {
    // Old servers may not have unregister yet. Consent is checked again by
    // the community sender; an unavailable revoke must not prevent logout.
  }
}
