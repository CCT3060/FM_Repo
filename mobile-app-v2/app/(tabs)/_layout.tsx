import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { buildTabs } from '../../utils/permissions';
import { useTheme, Spacing } from '../../utils/theme';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { user, capabilities, isLoaded } = useAuth();

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
          paddingBottom: Spacing.sm,
          paddingTop: Spacing.xs,
          height: 60,
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

      {/* Checklists — tech roles only */}
      <Tabs.Screen
        name="checklists"
        options={{
          title: 'Checklists',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-check" size={size} color={color} />,
          href: (capabilities.isTechnicalSupervisor || capabilities.isTechnician) ? undefined : null,
        }}
      />

      {/* Tasks — supervisor unified view */}
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="format-list-checks" size={size} color={color} />,
          href: capabilities.isTechnicalSupervisor ? undefined : null,
        }}
      />

      {/* Team / Assignments — supervisors only */}
      <Tabs.Screen
        name="assignments"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" size={size} color={color} />,
          href: capabilities.isTechnicalSupervisor ? undefined : null,
        }}
      />

      {/* Soft Requests — soft service roles */}
      <Tabs.Screen
        name="soft-requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="wrench-outline" size={size} color={color} />,
          href: (capabilities.canRaiseSoftIssue || capabilities.canResolveSoftIssue || capabilities.isSoftManager) ? undefined : null,
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
