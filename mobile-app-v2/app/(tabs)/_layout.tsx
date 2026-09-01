import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { buildTabs } from '../../utils/permissions';
import { useTheme, Spacing } from '../../utils/theme';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { user, capabilities, isLoaded } = useAuth();
  const insets = useSafeAreaInsets();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/');
    }
  }, [isLoaded, user]);

  const tabs = buildTabs(capabilities);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          paddingBottom: Math.max(Spacing.sm, insets.bottom),
          paddingTop: Spacing.xs,
          height: 60 + insets.bottom,
        },
        tabBarActiveTintColor:   theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle:        { fontSize: 11, fontWeight: '600', marginBottom: 2 },
      }}
    >
      {/* Home is always present */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home-variant" size={size} color={color} />,
        }}
      />

      {/* Dashboard — always visible */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-donut" size={size} color={color} />,
        }}
      />

      {/* Checklists — accessed via Home card (view-only), hidden from bottom nav */}
      <Tabs.Screen
        name="checklists"
        options={{
          href: null,
        }}
      />

      {/* Tasks — hidden from bottom nav */}
      <Tabs.Screen
        name="tasks"
        options={{
          href: null,
        }}
      />

      {/* Team / Assignments — hidden from bottom nav */}
      <Tabs.Screen
        name="assignments"
        options={{
          href: null,
        }}
      />

      {/* Requests (Work Orders, Soft Service & Additional Requests) */}
      <Tabs.Screen
        name="soft-requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="wrench-outline" size={size} color={color} />,
          href: (
            capabilities.canRaiseSoftIssue ||
            capabilities.canResolveSoftIssue ||
            capabilities.isSoftManager ||
            capabilities.canExecuteWorkOrders ||
            capabilities.canAssignWorkOrders ||
            capabilities.isTechnician ||
            capabilities.isTechnicalSupervisor ||
            capabilities.canRaiseAdditionalRequest ||
            capabilities.canAssignRaisedRequests
          ) ? undefined : null,
        }}
      />

      {/* Profile always present */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
