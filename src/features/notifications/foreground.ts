import { type Notification, type NotificationBehavior, setNotificationHandler } from 'expo-notifications';

import { ID_PREFIXES } from './plan';

// Without a handler, alerts are not shown while Lumen is open, which is when standing-test alerts fire.
// Only those play a sound, since a reading is due within seconds.
// https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#setnotificationhandlerhandler
async function foregroundBehavior(notification: Notification): Promise<NotificationBehavior> {
  const isStanding = notification.request.identifier.startsWith(`${ID_PREFIXES.standing}-`);
  return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: isStanding, shouldSetBadge: false };
}

export function showNotificationsInForeground(): void {
  setNotificationHandler({
    handleNotification: foregroundBehavior,
    handleError: (notificationId, error) =>
      console.warn(`Notification ${notificationId} could not be shown in the app: ${error.message}`),
  });
}
