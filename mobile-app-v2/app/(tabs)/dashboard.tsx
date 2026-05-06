import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchSiteScore, logout, type SiteScore, ApiError } from '../../utils/api';
import { hasSoftAccess } from '../../utils/permissions';
import { useTheme, Spacing, Radius, Typography } from '../../utils/theme';

// ─── Animated arc progress (works without SVG) ────────────────────────────────
// Uses two half-circle clips to render 0-360° progress correctly.
const SIZE   = 140;
const BORDER = 10;

function ScoreArc({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [pct]);

  // Left half: rotates from 0→180° to fill left side
  const leftRot = anim.interpolate({ inputRange: [0, 50, 100], outputRange: ['0deg', '180deg', '180deg'] });
  // Right half: hidden until > 50%, then fills
  const rightRot = anim.interpolate({ inputRange: [0, 50, 100], outputRange: ['0deg', '0deg', '180deg'] });
  const rightOpacity = anim.interpolate({ inputRange: [0, 49.9, 50], outputRange: [0, 0, 1] });

  const half = SIZE / 2;

  return (
    <View style={{ width: SIZE, height: SIZE, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      {/* Track */}
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: half, borderWidth: BORDER, borderColor: color + '22' }} />

      {/* Right half clip */}
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: 0, width: half, height: SIZE, overflow: 'hidden' }}>
          <Animated.View style={{ position: 'absolute', left: -half, width: SIZE, height: SIZE, borderRadius: half, borderWidth: BORDER, borderColor: color, borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: rightRot }], opacity: rightOpacity }} />
        </View>
      </View>

      {/* Left half clip */}
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, width: half, height: SIZE, overflow: 'hidden' }}>
          <Animated.View style={{ position: 'absolute', right: -half, width: SIZE, height: SIZE, borderRadius: half, borderWidth: BORDER, borderColor: color, borderRightColor: 'transparent', borderTopColor: 'transparent', transform: [{ rotate: leftRot }] }} />
        </View>
      </View>

      {/* Center */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color, lineHeight: 34 }}>{pct.toFixed(1)}%</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' }}>Site Score</Text>
      </View>
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, onPress }: {
  icon: string; label: string; value: number | string; color: string; onPress?: () => void;
}) {
  const { theme } = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </Wrapper>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { theme }  = useTheme();
  const { user, capabilities }   = useAuth();
  const showSoft = hasSoftAccess(capabilities);
  const [score,      setScore]      = useState<SiteScore | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchSiteScore();
      setScore(data);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        // Session expired — clear credentials and go back to company code entry
        await logout();
        router.replace('/');
        return;
      }
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); void load(); };

  const pct  = score?.percentage ?? 0;
  const ring = pct >= 75 ? '#059669' : pct >= 40 ? '#D97706' : '#EF4444';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Site Dashboard</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{user?.companyName ?? 'Company'}</Text>
          </View>
          <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onRefresh}>
            <MaterialCommunityIcons name="refresh" size={18} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadWrap}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : error ? (
          <View style={styles.loadWrap}>
            <MaterialCommunityIcons name="wifi-alert" size={48} color="#EF4444" />
            <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Failed to Load Dashboard</Text>
            <Text style={[styles.errorBody, { color: theme.textSecondary }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={onRefresh}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Score card */}
            <View style={[styles.scoreCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ScoreArc pct={pct} color={ring} />
              <View style={styles.scoreMeta}>
                <Text style={[styles.scoreTitle, { color: theme.textPrimary }]}>Checklist Completion</Text>
                <Text style={[styles.scoreBody, { color: theme.textSecondary }]}>
                  {score?.filled ?? 0} of {score?.total ?? 0} templates filled today
                </Text>
                {/* Progress bar */}
                <View style={[styles.barTrack, { backgroundColor: ring + '22' }]}>
                  <View style={[styles.barFill, { backgroundColor: ring, width: `${pct}%` as any }]} />
                </View>
              </View>
            </View>

            {/* Stats grid */}
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>TODAY'S OVERVIEW</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="clipboard-check-outline"
                label="Filled"
                value={score?.totalFilled ?? 0}
                color="#059669"
                onPress={() => router.push('/history')}
              />
              <StatCard
                icon="clipboard-list-outline"
                label="Templates"
                value={score?.total ?? 0}
                color={theme.primary}
                onPress={() => router.push('/(tabs)/checklists')}
              />
              {showSoft ? (
                <StatCard
                  icon="wrench-outline"
                  label="Open Requests"
                  value={score?.openRequests ?? 0}
                  color={score && score.openRequests > 0 ? '#EF4444' : '#6B7280'}
                  onPress={() => router.push('/(tabs)/soft-requests')}
                />
              ) : null}
              <StatCard icon="percent-outline" label="Score" value={`${pct.toFixed(1)}%`} color={ring} />
            </View>

            {/* Template counts */}
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>TEMPLATES</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="clipboard-text-outline"
                label="Checklists"
                value={score?.totalChecklistTemplates ?? 0}
                color="#7C3AED"
                onPress={() => router.push('/(tabs)/checklists')}
              />
              <StatCard
                icon="table-large"
                label="Log Sheets"
                value={score?.totalLogsheetTemplates ?? 0}
                color="#0891B2"
                onPress={() => router.push('/(tabs)/checklists')}
              />
              <StatCard
                icon="send-check-outline"
                label="Submissions Today"
                value={score?.totalSubmissionsToday ?? 0}
                color="#D97706"
                onPress={() => router.push('/history')}
              />
              <StatCard icon="chart-line" label="Completion" value={`${pct.toFixed(1)}%`} color={ring} />
            </View>

            {/* Alert banner — only for soft service users */}
            {showSoft && score && score.openRequests > 0 ? (
              <TouchableOpacity
                style={[styles.alertBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                onPress={() => router.push('/(tabs)/soft-requests')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{score.openRequests} open request{score.openRequests > 1 ? 's' : ''} need attention</Text>
                  <Text style={styles.alertSub}>Tap to view and resolve</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#EF4444" />
              </TouchableOpacity>
            ) : null}

            {/* Score legend */}
            <View style={[styles.legendCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>SCORE GUIDE</Text>
              {[
                { range: '75 – 100%', label: 'Excellent',  color: '#059669' },
                { range: '40 – 74%',  label: 'Good',       color: '#D97706' },
                { range: '0 – 39%',   label: 'Needs Work', color: '#EF4444' },
              ].map(({ range, label, color }) => (
                <View key={range} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={[styles.legendRange, { color: theme.textPrimary }]}>{range}</Text>
                  <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },
  loadWrap:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: Spacing.md },
  errorTitle:   { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  errorBody:    { fontSize: 12, textAlign: 'center', paddingHorizontal: Spacing.xl },
  retryBtn:     { marginTop: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  retryText:    { color: '#fff', fontWeight: '700', fontSize: 14 },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:        { fontSize: 20, fontWeight: '700' },
  subtitle:     { fontSize: 12, marginTop: 2 },
  refreshBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  scoreCard:    { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.lg, borderWidth: 1 },
  scoreMeta:    { width: '100%', alignItems: 'center', gap: Spacing.xs },
  scoreTitle:   { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  scoreBody:    { fontSize: 12, textAlign: 'center' },
  barTrack:     { width: '75%', height: 5, borderRadius: 3, marginTop: Spacing.sm, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 3 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:     { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1 },
  statIcon:     { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue:    { fontSize: 22, fontWeight: '700' },
  statLabel:    { fontSize: 11, textAlign: 'center' },

  alertBanner:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  alertTitle:   { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  alertSub:     { fontSize: 11, color: '#EF4444', marginTop: 1 },

  legendCard:   { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, borderWidth: 1 },
  legendRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendDot:    { width: 9, height: 9, borderRadius: 5 },
  legendRange:  { fontSize: 13, fontWeight: '600', width: 80 },
  legendLabel:  { fontSize: 13 },
});
