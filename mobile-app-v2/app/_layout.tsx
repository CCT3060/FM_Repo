import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { Component, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme, Spacing, Radius, Typography } from '../utils/theme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { verifyToken } from '../utils/api';
import { registerForPushNotifications } from '../utils/notifications';
import OfflineBanner from '../components/OfflineBanner';

// ─── Error Boundary ───────────────────────────────────────────────────────────
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
    console.error('[ErrorBoundary]', error.message, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.wrap}>
          <Text style={errStyles.title}>Something went wrong</Text>
          <Text style={errStyles.msg}>{this.state.error}</Text>
          <TouchableOpacity
            style={errStyles.btn}
            onPress={() => { this.setState({ hasError: false, error: '' }); router.replace('/'); }}
          >
            <Text style={errStyles.btnText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  wrap:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, backgroundColor: '#F8FAFC' },
  title:   { ...Typography.h2, color: '#0F172A', marginBottom: Spacing.sm },
  msg:     { ...Typography.body, color: '#64748B', textAlign: 'center', marginBottom: Spacing.xl },
  btn:     { backgroundColor: '#2563EB', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md },
  btnText: { ...Typography.h4, color: '#fff' },
});

// ─── Auth bootstrapper ────────────────────────────────────────────────────────
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { setUser, isLoaded } = useAuth();

  useEffect(() => {
    (async () => {
      const result = await verifyToken();
      if (result?.user) {
        setUser(result.user);
        router.replace('/(tabs)/home');
      } else {
        setUser(null);
        router.replace('/');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

// ─── Inner layout ─────────────────────────────────────────────────────────────
function RootLayoutInner() {
  const { theme } = useTheme();
  const notifListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    void registerForPushNotifications();

    notifListener.current = Notifications.addNotificationReceivedListener(() => {});

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen) router.push(data.screen as any);
      else router.push('/notifications');
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthBootstrap>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background }, animation: 'slide_from_right' }} />
        <StatusBar style={theme.statusBar} />
        <OfflineBanner />
      </AuthBootstrap>
    </SafeAreaProvider>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutInner />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
