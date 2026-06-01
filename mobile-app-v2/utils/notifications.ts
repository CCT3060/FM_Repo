import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushToken } from './api';

// setNotificationHandler has module-level side effects that crash Expo Go.
// Only configure it in standalone / dev-client builds.
if (Constants.appOwnership !== 'expo') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Skip in Expo Go — device push tokens don't work there
    if (Constants.appOwnership === 'expo') {
      console.log('[Push] Skipping registration in Expo Go');
      return null;
    }

    // Respect user preference — default to enabled if not set
    const prefVal = await AsyncStorage.getItem('notifications_enabled');
    if (prefVal === 'false') {
      console.log('[Push] Notifications disabled by user preference');
      return null;
    }

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
    if (finalStatus !== 'granted') return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: '503375e8-87b2-49da-a586-3fed54987ed1',
    });

    await registerPushToken(token, Platform.OS);

    // Also register the device-level FCM token for direct Firebase pushes
    try {
      const deviceTokenResult = await Notifications.getDevicePushTokenAsync();
      if (deviceTokenResult?.data) {
        await registerPushToken(token, Platform.OS, deviceTokenResult.data);
      }
    } catch {
      // Non-critical — Expo token already registered above
    }

    return token;
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return null;
  }
}
