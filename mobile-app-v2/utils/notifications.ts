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
      projectId: 'f5d10940-b371-498c-874e-768243da8506',
    });

    await registerPushToken(token, Platform.OS);
    return token;
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return null;
  }
}
