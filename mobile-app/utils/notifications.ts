import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { authenticatedFetch } from './api';

// Show notifications in foreground as banners with sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and register the Expo push token with
 * the backend so the server can send push notifications to this device.
 * Call this once on app start (after the user is logged in).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Android needs an explicit notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('tasks', {
        name: 'Task Assignments',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7C3AED',
        sound: 'default',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '9e054c0f-0868-4787-8424-3ea4a6344bd8',
    });
    const token = tokenData.data;
    console.log('[Notifications] Push token:', token);

    // Register token with backend so the server can send push notifications
    try {
      await authenticatedFetch('/api/mobile-auth/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: Platform.OS }),
      });
    } catch {
      // Non-critical — app works fine without server-side push
    }

    return token;
  } catch (err) {
    console.error('[Notifications] Registration failed:', err);
    return null;
  }
}

/**
 * Schedule a local notification immediately (useful for task assignment confirmations).
 */
export async function showLocalNotification(title: string, body: string, data?: Record<string, any>) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: 'default' },
      trigger: null, // fire immediately
    });
  } catch (err) {
    console.error('[Notifications] showLocalNotification failed:', err);
  }
}

/**
 * Get the current badge count (unread notification count from API).
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const res = await authenticatedFetch('/api/notifications/unread-count');
    if (!res.ok) return 0;
    const json = await res.json();
    return typeof json.count === 'number' ? json.count : 0;
  } catch {
    return 0;
  }
}
