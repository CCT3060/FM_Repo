import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  hasTechAccess, hasSoftAccess, canManageTeam,
  canViewNotifications, canViewWarnings,
} from '../../utils/permissions';
import { fetchMyTodayProgress, fetchNotificationCount } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge, { statusVariant } from '../../components/StatusBadge';

// ─── Quick-action card ────────────────────────────────────────────────────────
function ActionCard({ icon, label, sublabel, color, onPress }: {
  icon: string; label: string; sublabel?: string; color: string; onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={26} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>{label}</Text>
      {sublabel ? <Text style={[styles.actionSub, { color: theme.textSecondary }]}>{sublabel}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statPill, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { theme } = useTheme();
  const { user, capabilities } = useAuth();
  const [progress,    setProgress]    = useState<any>(null);
  const [notifCount,  setNotifCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async () => {
    try {
      const [prog, nc] = await Promise.allSettled([
        fetchMyTodayProgress(),
        fetchNotificationCount(),
      ]);
      if (prog.status   === 'fulfilled') setProgress(prog.value);
      if (nc.status     === 'fulfilled') setNotifCount((nc.value as any).count ?? 0);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const isTechSup  = capabilities.isTechnicalSupervisor;
  const isTech     = capabilities.isTechnician;
  const isSoftMgr  = capabilities.isSoftManager;
  const canResolve = capabilities.canResolveSoftIssue;
  const canRaise   = capabilities.canRaiseSoftIssue;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting},</Text>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{firstName}</Text>
          </View>
          <View style={styles.topActions}>
            {canViewNotifications(capabilities) ? (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: theme.surface }]}
                onPress={() => router.push('/notifications')}
              >
                <MaterialCommunityIcons name="bell-outline" size={22} color={theme.textPrimary} />
                {notifCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                    <Text style={styles.badgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.surface }]}
              onPress={() => router.push('/qr-scanner')}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Today stats */}
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.xl }} />
        ) : progress ? (
          <View style={[styles.statsCard, { backgroundColor: theme.primary }]}>
            <Text style={styles.statsTitle}>Today's Progress</Text>
            <View style={styles.statsRow}>
              <StatPill label="Assigned" value={(progress as any).assigned ?? 0} color="#60A5FA" />
              <StatPill label="Completed" value={(progress as any).completed ?? 0} color="#34D399" />
              <StatPill label="Pending" value={(progress as any).pending ?? 0} color="#FBBF24" />
            </View>
          </View>
        ) : null}

        {/* Quick actions — shown based on capabilities */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>

          {/* Assets — visible to all */}
          <ActionCard
            icon="package-variant"
            label="Assets"
            sublabel="Browse & scan"
            color={theme.primary}
            onPress={() => router.push('/assets')}
          />

          {/* Checklists — tech roles */}
          {hasTechAccess(capabilities) ? (
            <ActionCard
              icon="clipboard-check-outline"
              label="Checklists"
              sublabel="My assignments"
              color={theme.success}
              onPress={() => router.push('/(tabs)/checklists')}
            />
          ) : null}

          {/* Team assignments — supervisor only */}
          {canManageTeam(capabilities) ? (
            <ActionCard
              icon="account-group-outline"
              label="My Team"
              sublabel="Assignments & stats"
              color="#7C3AED"
              onPress={() => router.push('/(tabs)/assignments')}
            />
          ) : null}

          {/* Work orders — tech roles */}
          {hasTechAccess(capabilities) ? (
            <ActionCard
              icon="briefcase-outline"
              label="Work Orders"
              sublabel="Active orders"
              color={theme.warning}
              onPress={() => router.push('/work-orders')}
            />
          ) : null}

          {/* Raise soft request */}
          {canRaise ? (
            <ActionCard
              icon="alert-circle-outline"
              label="Raise Issue"
              sublabel="Soft service"
              color={theme.danger}
              onPress={() => router.push('/soft-raise')}
            />
          ) : null}

          {/* Soft service requests */}
          {hasSoftAccess(capabilities) ? (
            <ActionCard
              icon="wrench-outline"
              label="Requests"
              sublabel={isSoftMgr ? 'All requests' : canResolve ? 'Resolve issues' : 'My requests'}
              color="#0284C7"
              onPress={() => router.push('/(tabs)/soft-requests')}
            />
          ) : null}

          {/* Warnings — tech roles */}
          {canViewWarnings(capabilities) ? (
            <ActionCard
              icon="alert-outline"
              label="Warnings"
              sublabel="Flag alerts"
              color={theme.warning}
              onPress={() => router.push('/warnings')}
            />
          ) : null}

          {/* Submission history */}
          <ActionCard
            icon="history"
            label="History"
            sublabel="Past submissions"
            color={theme.info}
            onPress={() => router.push('/history')}
          />

          {/* OJT Training */}
          {hasTechAccess(capabilities) ? (
            <ActionCard
              icon="school-outline"
              label="Training"
              sublabel="OJT modules"
              color="#059669"
              onPress={() => router.push('/training')}
            />
          ) : null}
        </View>

        {/* Role info */}
        <View style={[styles.roleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="shield-account-outline" size={20} color={theme.primary} />
          <View style={styles.roleInfo}>
            <Text style={[styles.roleName, { color: theme.textPrimary }]}>{user?.fullName}</Text>
            <Text style={[styles.roleCompany, { color: theme.textSecondary }]}>{user?.companyName}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl },
  greeting:    { ...Typography.body },
  name:        { ...Typography.h2 },
  topActions:  { flexDirection: 'row', gap: Spacing.sm },
  iconBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge:       { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:   { fontSize: 9, color: '#fff', fontWeight: '700' },
  statsCard:   { borderRadius: Radius.xl, padding: Spacing.xl, marginBottom: Spacing.xl },
  statsTitle:  { ...Typography.label, color: 'rgba(255,255,255,0.75)', marginBottom: Spacing.md, letterSpacing: 1 },
  statsRow:    { flexDirection: 'row', gap: Spacing.md },
  statPill:    { flex: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1 },
  statValue:   { ...Typography.h2 },
  statLabel:   { ...Typography.micro, marginTop: 2 },
  sectionTitle:{ ...Typography.label, letterSpacing: 1, marginBottom: Spacing.md },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.xl },
  actionCard:  { width: '47%', borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  actionIcon:  { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  actionLabel: { ...Typography.h4, marginBottom: 2 },
  actionSub:   { ...Typography.bodyS },
  roleCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  roleInfo:    { flex: 1 },
  roleName:    { ...Typography.h4 },
  roleCompany: { ...Typography.bodyS },
});
