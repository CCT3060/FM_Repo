import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { logout, logoutUser, getStoredCompany } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import type { RoleCapabilities } from '../../utils/permissions';

function CapBadge({ label, active }: { label: string; active: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.capBadge, { backgroundColor: active ? theme.primaryBg : theme.surfaceAlt, borderColor: active ? theme.primary + '50' : theme.border }]}>
      <MaterialCommunityIcons name={active ? 'check-circle' : 'circle-outline'} size={14} color={active ? theme.primary : theme.textMuted} />
      <Text style={[styles.capText, { color: active ? theme.primary : theme.textMuted }]}>{label}</Text>
    </View>
  );
}

const CAP_LABELS: { key: keyof RoleCapabilities; label: string }[] = [
  { key: 'isTechnicalSupervisor', label: 'Technical Supervisor' },
  { key: 'isTechnician',          label: 'Technician'           },
  { key: 'isSoftManager',         label: 'Soft Service Manager' },
  { key: 'canResolveSoftIssue',   label: 'Resolve Soft Issues'  },
  { key: 'canRaiseSoftIssue',     label: 'Raise Soft Issues'    },
];

export default function ProfileTab() {
  const { theme, isDark, setPreference, preference } = useTheme();
  const { user, capabilities, clearUser } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        // Keep company in storage so app returns to login, not company-code entry
        const company = await getStoredCompany();
        await logoutUser();
        clearUser();
        if (company) {
          router.replace({
            pathname: '/login',
            params: { companyId: String(company.companyId), companyName: company.companyName },
          });
        } else {
          // Fallback: full clear, go to company code screen
          await logout();
          router.replace('/');
        }
      }},
    ]);
  };

  const toggleTheme = () => {
    setPreference(isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + name */}
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>{(user?.fullName ?? 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: theme.textPrimary }]}>{user?.fullName}</Text>
          <Text style={[styles.company, { color: theme.textSecondary }]}>{user?.companyName}</Text>
          <View style={[styles.rolePill, { backgroundColor: theme.primaryBg }]}>
            <Text style={[styles.roleText, { color: theme.primary }]}>{user?.role ?? 'Employee'}</Text>
          </View>
        </View>

        {/* Settings */}
        <View style={[styles.section, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="weather-night" size={22} color={theme.textSecondary} />
              <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={isDark ? '#fff' : theme.textMuted}
            />
          </View>
        </View>

        {/* Menu items */}
        <View style={[styles.section, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          {[
            { icon: 'history',              label: 'Submission History', onPress: () => router.push('/history')      },
            { icon: 'alert-outline',         label: 'My Warnings',        onPress: () => router.push('/warnings')     },
            { icon: 'school-outline',        label: 'Training',           onPress: () => router.push('/training')     },
            { icon: 'bell-outline',          label: 'Notifications',      onPress: () => router.push('/notifications') },
          ].map((item, idx, arr) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name={item.icon as any} size={22} color={theme.textSecondary} />
              <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: theme.danger + '50', backgroundColor: theme.dangerBg }]} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color={theme.danger} />
          <Text style={[styles.logoutText, { color: theme.danger }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: theme.textMuted }]}>FM App v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  hero:         { alignItems: 'center', paddingVertical: Spacing.xl },
  avatar:       { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  avatarText:   { fontSize: 32, color: '#fff', fontWeight: '700' },
  name:         { ...Typography.h2, marginBottom: 4 },
  company:      { ...Typography.body, marginBottom: Spacing.md },
  rolePill:     { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full },
  roleText:     { ...Typography.label },
  section:      { borderRadius: Radius.xl, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 4, gap: Spacing.md },
  sectionTitle: { ...Typography.h4 },
  sectionSub:   { ...Typography.bodyS, marginTop: -Spacing.sm },
  capsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  capBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  capText:      { ...Typography.micro },
  settingRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  settingLabel: { ...Typography.body },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  menuLabel:    { ...Typography.body, flex: 1 },
  logoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  logoutText:   { ...Typography.h4 },
  version:      { ...Typography.micro, textAlign: 'center' },
});
