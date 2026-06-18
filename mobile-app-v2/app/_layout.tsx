import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import React, { Component, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme, Spacing, Radius, Typography } from '../utils/theme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { verifyToken } from '../utils/api';
import { startNetworkMonitor } from '../utils/networkStatus';
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
  // Use a ref so the effect body can read the latest isLoaded without
  // being re-added to the dependency array (runs once on mount only).
  const isLoadedRef = useRef(isLoaded);
  isLoadedRef.current = isLoaded;

  useEffect(() => {
    (async () => {
      const result = await verifyToken();
      if (result?.user) {
        setUser(result.user);
        router.replace('/(tabs)/dashboard');
      } else {
        // Mark auth as loaded but do NOT navigate — index.tsx owns routing
        // for unauthenticated users. Navigating here causes a race with
        // index.tsx's own redirect and produces visible login-screen flicker.
        // Skip the state update if already loaded to avoid a needless re-render.
        if (!isLoadedRef.current) setUser(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

// ─── Inner layout ─────────────────────────────────────────────────────────────
function RootLayoutInner() {
  const { theme } = useTheme();
  const notifListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Push notifications are unavailable in Expo Go since SDK 53.
    // Dynamically import so the module-level side effects only run in
    // standalone / development builds, never in Expo Go.
    if (Constants.appOwnership !== 'expo') {
      void import('../utils/notifications').then(({ registerForPushNotifications }) => {
        void registerForPushNotifications();
      });
      void import('expo-notifications').then((Notifications) => {
        // Handle cold-start: app opened by tapping a notification while killed
        Notifications.getLastNotificationResponseAsync().then((response) => {
          if (response?.notification) {
            const data = response.notification.request.content.data;
            if (data?.screen) setTimeout(() => router.push(data.screen as any), 500);
            else setTimeout(() => router.push('/notifications'), 500);
          }
        });

        notifListener.current = Notifications.addNotificationReceivedListener(() => {});
        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          if (data?.screen) router.push(data.screen as any);
          else router.push('/notifications');
        });
      });

      // Re-register push token whenever app comes to foreground
      // This ensures token is always up-to-date in the DB even if login-time
      // registration failed (e.g. slow network or fresh install).
      const { AppState } = require('react-native');
      const appStateListener = AppState.addEventListener('change', (state: string) => {
        if (state === 'active') {
          void import('../utils/notifications').then(({ registerForPushNotifications }) => {
            void registerForPushNotifications();
          });
        }
      });
      return () => {
        appStateListener.remove();
      };
    }

    // Start real device network monitoring (uses expo-network, not backend connectivity)
    const stopNetworkMonitor = startNetworkMonitor();

    return () => {
      stopNetworkMonitor();
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
