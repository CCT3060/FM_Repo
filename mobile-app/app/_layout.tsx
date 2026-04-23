import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { Component, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OfflineBanner from '../components/OfflineBanner';
import { ThemeProvider, useTheme } from '../utils/theme';
import { registerForPushNotifications } from '../utils/notifications';

// ─── Error Boundary ──────────────────────────────────────────────────────────
// Catches any unhandled render crash so the whole app never goes black/restarts.
class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[AppErrorBoundary]', error.message, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F8FAFC' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>
            {this.state.error}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#2563EB', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 }}
            onPress={() => {
              this.setState({ hasError: false, error: '' });
              router.replace('/');
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Inner layout (needs theme context) ──────────────────────────────────────
function RootLayoutInner() {
  const { colors } = useTheme();
  const notifListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Register for push notifications once the layout mounts
    registerForPushNotifications();

    // Handle notification received while app is in foreground
    notifListener.current = Notifications.addNotificationReceivedListener(() => {
      // badge / in-app UI updates can be added here
    });

    // Handle tap on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen) {
        router.push(data.screen as any);
      } else {
        router.push('/tech-notifications' as any);
      }
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
      <StatusBar style={colors.statusBar} />
      <OfflineBanner />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
