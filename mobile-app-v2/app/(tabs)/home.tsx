import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
  canFillLogsheet, canAssignLogsheet, canViewChecklists,
  canExecuteWorkOrders, canManageWorkOrders,
  canViewAssets, canViewTraining,
} from '../../utils/permissions';
import { fetchMyTodayProgress, fetchNotificationCount } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';

// ─── Quick-action card ────────────────────────────────────────────────────────
function ActionCard({ icon, label, sublabel, color, onPress }: {
  icon: string; label: string; sublabel?: string; color: string; onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.textPrimary }]} numberOfLines={1}>{label}</Text>
      {sublabel ? <Text style={[styles.actionSub, { color: theme.textSecondary }]} numberOfLines={1}>{sublabel}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { theme } = useTheme();
  const { user, capabilities } = useAuth();
  const [progress,   setProgress]   = useState<any>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // 5-second timeout so the spinner doesn't hang if the backend is unreachable
    const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    try {
      const [prog, nc] = await Promise.allSettled([
        Promise.race([fetchMyTodayProgress(), timeout(5000)]),
        Promise.race([fetchNotificationCount(), timeout(5000)]),
      ]);
      if (prog.status === 'fulfilled') setProgress(prog.value);
      if (nc.status   === 'fulfilled') setNotifCount((nc.value as any).count ?? 0);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  // Re-fetch every time this screen comes into focus so counts update
  // immediately after a checklist submission (no manual pull-to-refresh needed).
  const isFocused = useIsFocused();
  useEffect(() => { if (isFocused) void load(); }, [isFocused, load]);
  const onRefresh = () => { setRefreshing(true); void load(); };

  const isSoftMgr  = capabilities.isSoftManager;
  const canResolve = capabilities.canResolveSoftIssue;
  const canRaise   = capabilities.canRaiseSoftIssue;

  const isModuleEnabled = (mod: string) => {
    if (!user?.companyEnabledModules || !Array.isArray(user.companyEnabledModules)) return true;
    const aliases: Record<string, string[]> = {
      workorders: ['workorders', 'requests'],
      requests: ['workorders', 'requests'],
      softrequests: ['softrequests', 'soft-requests'],
      'soft-requests': ['softrequests', 'soft-requests'],
      ojt: ['ojt', 'ojt-training', 'ojtTraining'],
      'ojt-training': ['ojt', 'ojt-training', 'ojtTraining'],
      'additional-requests': ['additional-requests', 'additionalRequests'],
      additionalRequests: ['additional-requests', 'additionalRequests'],
      checklists: ['checklists'],
      logsheets: ['logsheets'],
      assets: ['assets'],
      attendance: ['attendance'],
      locations: ['locations'],
      warnings: ['warnings'],
      fleet: ['fleet'],
    };
    const checkList = aliases[mod] || [mod];
    return checkList.some((m) => user.companyEnabledModules!.includes(m));
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const isAdmin = user?.role === 'admin';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{firstName}</Text>
            <Text style={[styles.company, { color: theme.textMuted }]}>{user?.companyName}</Text>
          </View>
          <View style={styles.topActions}>
            {canViewNotifications(capabilities) ? (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => router.push('/notifications')}
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color={theme.textPrimary} />
                {notifCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                    <Text style={styles.badgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/qr-scanner')}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          {isModuleEnabled('assets') && (isAdmin || hasTechAccess(capabilities) || canViewAssets(capabilities)) ? (
            <ActionCard icon="package-variant" label="Assets" sublabel="Browse & scan" color={theme.primary} onPress={() => router.push('/assets')} />
          ) : null}

          {isModuleEnabled('checklists') && (isAdmin || canViewChecklists(capabilities)) ? (
            <ActionCard
              icon="clipboard-check-outline"
              label="Checklists"
              sublabel="View assigned"
              color="#059669"
              onPress={() => router.push({ pathname: '/all-templates', params: { initialFilter: 'all', type: 'checklist' } } as any)}
            />
          ) : null}

          {isModuleEnabled('logsheets') && (isAdmin || canFillLogsheet(capabilities) || canAssignLogsheet(capabilities) || hasTechAccess(capabilities)) ? (
            <ActionCard
              icon="table-large"
              label="Logsheets"
              sublabel="View logs"
              color="#7C3AED"
              onPress={() => router.push({ pathname: '/all-templates', params: { initialFilter: 'all', type: 'logsheet' } } as any)}
            />
          ) : null}

          {isModuleEnabled('workorders') && (isAdmin || canExecuteWorkOrders(capabilities) || canManageWorkOrders(capabilities)) ? (
            <ActionCard icon="briefcase-outline" label="Work Orders" sublabel="Active orders" color="#D97706" onPress={() => router.push('/work-orders')} />
          ) : null}

          {isModuleEnabled('softrequests') && (isAdmin || canRaise) && !capabilities.isClientSupervisor ? (
           <ActionCard icon="alert-circle-outline" label="Raise Issue" sublabel="HK Request" color={theme.danger} onPress={() => router.push('/soft-raise')} />
          ) : null}

          {isModuleEnabled('additional-requests') && (isAdmin || capabilities?.canRaiseAdditionalRequest) ? (
            <ActionCard icon="file-plus-outline" label="Additional Request" sublabel="Plumbing · Electrical…" color="#7c3aed" onPress={() => router.push('/additional-request' as any)} />
          ) : null}

          {isModuleEnabled('attendance') && (isAdmin || capabilities?.canMarkAttendance) ? (
            <ActionCard icon="account-check-outline" label="Attendance" sublabel="Mark today's attendance" color="#0891b2" onPress={() => router.push('/attendance-mark' as any)} />
          ) : null}

          {isModuleEnabled('softrequests') && (isAdmin || hasSoftAccess(capabilities) || capabilities?.canAssignRaisedRequests) ? (
            <ActionCard
              icon="wrench-outline"
              label="HK Requests"
              sublabel={isSoftMgr ? 'All requests' : canResolve ? 'Resolve issues' : 'My requests'}
              color="#0284C7"
              onPress={() => router.push('/(tabs)/soft-requests')}
            />
          ) : null}

          {isModuleEnabled('warnings') && (isAdmin || canViewWarnings(capabilities)) ? (
            <ActionCard icon="alert-outline" label="Warnings" sublabel="Flag alerts" color="#D97706" onPress={() => router.push('/warnings')} />
          ) : null}

          {(isAdmin || hasTechAccess(capabilities) || hasSoftAccess(capabilities)) ? (
            <ActionCard icon="history" label="History" sublabel="Past submissions" color={theme.info} onPress={() => router.push('/history')} />
          ) : null}

          {isModuleEnabled('ojt') && (isAdmin || canViewTraining(capabilities)) ? (
            <ActionCard icon="school-outline" label="Training" sublabel="OJT modules" color="#059669" onPress={() => router.push('/training')} />
          ) : null}

          {isModuleEnabled('locations') && (isAdmin || hasTechAccess(capabilities)) ? (
            <ActionCard icon="map-marker-outline" label="Locations" sublabel="Browse locations" color="#0891B2" onPress={() => router.push('/locations' as any)} />
          ) : null}
        </View>

        {/* ── Role chip ─────────────────────────────────────────────────── */}
        <View style={[styles.roleChip, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '30' }]}>
          <MaterialCommunityIcons name="shield-account-outline" size={16} color={theme.primary} />
          <Text style={[styles.roleText, { color: theme.primary }]}>{user?.role?.replace(/_/g, ' ')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.lg },

  topBar:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  greeting:     { fontSize: 13, marginBottom: 2 },
  name:         { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  company:      { fontSize: 12, marginTop: 2 },
  topActions:   { flexDirection: 'row', gap: Spacing.sm, paddingTop: 4 },
  iconBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge:        { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:    { fontSize: 9, color: '#fff', fontWeight: '700' },

  statsRow:     { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  statItem:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue:    { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  statLabel:    { fontSize: 11, marginTop: 2 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionCard:   { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: 4 },
  actionIconWrap:{ width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionLabel:  { fontSize: 13, fontWeight: '600' },
  actionSub:    { fontSize: 11 },

  roleChip:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1 },
  roleText:     { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});
