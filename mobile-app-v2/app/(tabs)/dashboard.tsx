import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Animated, Easing, Image, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { fetchSiteScore, logoutUser, getStoredCompany, type SiteScore, ApiError, API_BASE } from '../../utils/api';
import { hasSoftAccess } from '../../utils/permissions';
import { useTheme, Spacing, Radius, Typography } from '../../utils/theme';

// ─── SVG arc progress ────────────────────────────────────────────────────────
const SIZE   = 140;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * RADIUS;

/**
 * Clockwise circular progress ring using SVG strokeDashoffset.
 * No two-half-clip, no visual break at 50%, starts at 12 o'clock.
 */
function ScoreArc({ pct, color }: { pct: number; color: string }) {
  const animVal = useRef(new Animated.Value(0)).current;
  const [dashOffset, setDashOffset] = useState(CIRC);

  useEffect(() => {
    animVal.setValue(0);
    const listenerId = animVal.addListener(({ value }) => {
      setDashOffset(CIRC * (1 - value / 100));
    });
    Animated.timing(animVal, {
      toValue: pct,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    return () => { animVal.removeListener(listenerId); };
  }, [pct]);

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {/* SVG rotated -90° so arc starts at 12 o'clock going clockwise */}
      <Svg width={SIZE} height={SIZE}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {/* Track */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={color + '30'} strokeWidth={STROKE} fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={color} strokeWidth={STROKE} fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      {/* Center text */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color, lineHeight: 30 }}>{pct.toFixed(1)}%</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>Site Score</Text>
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
        // Session expired — keep company, return to login screen
        const company = await getStoredCompany();
        await logoutUser();
        if (company) {
          router.replace({ pathname: '/login', params: { companyId: String(company.companyId), companyName: company.companyName } });
        } else {
          router.replace('/');
        }
        return;
      }
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const isFocused = useIsFocused();
  useEffect(() => { if (isFocused) void load(); }, [isFocused, load]);
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
          {/* Catalyst logo – left */}
          <Image
            source={require('../../assets/images/catalyst-logo.png')}
            style={styles.headerLogoLeft}
            resizeMode="contain"
          />
          {/* Spacer */}
          <View style={{ flex: 1 }} />
          {/* Client / company logo – right corner */}
          {user?.companyLogoUrl ? (
            <Image
              source={{ uri: user.companyLogoUrl.startsWith('http') ? user.companyLogoUrl : `${API_BASE}${user.companyLogoUrl}` }}
              style={styles.headerLogoRight}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.headerLogoRight, { alignItems: 'flex-end', justifyContent: 'center' }]}>
              <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign: 'right' }]} numberOfLines={2}>{user?.companyName ?? ''}</Text>
            </View>
          )}
          {/* Refresh button */}
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
            {/* Score card — horizontal: arc left, progress right */}
            <View style={[styles.scoreCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ScoreArc pct={pct} color={ring} />
              <View style={styles.scoreSide}>
                <Text style={[styles.scoreTitle, { color: theme.textPrimary }]}>Today's Company Progress</Text>
                <Text style={[styles.scoreBody, { color: theme.textSecondary }]}>
                  {score?.filled ?? 0} of {score?.total ?? 0} templates filled
                </Text>
                <View style={[styles.barTrack, { backgroundColor: ring + '22' }]}>
                  <View style={[styles.barFill, { backgroundColor: ring, width: `${Math.min(pct, 100)}%` as any }]} />
                </View>
                <Text style={[styles.pctLabel, { color: ring }]}>{pct.toFixed(0)}% complete</Text>
              </View>
            </View>

            {/* CHECKLISTS section */}
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>CHECKLISTS</Text>
            <View style={styles.statsRow}>
              <StatCard
                icon="clipboard-list-outline"
                label="Total Checklist"
                value={score?.totalChecklistTemplates ?? 0}
                color={theme.primary}
                onPress={() => router.push({ pathname: '/all-templates', params: { initialFilter: 'all', type: 'checklist' } } as any)}
              />
              <StatCard
                icon="clipboard-check-outline"
                label="Filled Checklist"
                value={score?.filled ?? 0}
                color="#059669"
                onPress={() => router.push({ pathname: '/all-templates', params: { initialFilter: 'done', type: 'checklist' } } as any)}
              />
              <StatCard
                icon="clipboard-alert-outline"
                label="Pending Checklist"
                value={(score?.totalChecklistTemplates ?? 0) - (score?.filled ?? 0)}
                color="#F59E0B"
                onPress={() => router.push({ pathname: '/all-templates', params: { initialFilter: 'pending', type: 'checklist' } } as any)}
              />
            </View>

            {/* REQUESTS section */}
            {showSoft && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>REQUESTS</Text>
                <View style={styles.statsRow}>
                  <StatCard
                    icon="inbox-outline"
                    label="Total Request"
                    value={score?.totalRequests ?? 0}
                    color={theme.primary}
                    onPress={() => router.push({ pathname: '/(tabs)/soft-requests', params: { initialFilter: 'all' } } as any)}
                  />
                  <StatCard
                    icon="alert-circle-outline"
                    label="Open Request"
                    value={score?.openRequests ?? 0}
                    color={score && score.openRequests > 0 ? '#EF4444' : '#6B7280'}
                    onPress={() => router.push({ pathname: '/(tabs)/soft-requests', params: { initialFilter: 'open' } } as any)}
                  />
                  <StatCard
                    icon="check-circle-outline"
                    label="Closed Request"
                    value={score?.closedRequests ?? 0}
                    color="#059669"
                    onPress={() => router.push({ pathname: '/(tabs)/soft-requests', params: { initialFilter: 'resolved' } } as any)}
                  />
                </View>
              </>
            )}
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

  header:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogoLeft:  { width: 90, height: 36 },
  headerLogoRight: { width: 80, height: 36 },
  title:        { fontSize: 20, fontWeight: '700' },
  subtitle:     { fontSize: 12, marginTop: 2 },
  refreshBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  scoreCard:    { borderRadius: Radius.xl, padding: Spacing.xl, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, borderWidth: 1 },
  scoreSide:    { flex: 1, gap: Spacing.xs },
  scoreTitle:   { fontSize: 14, fontWeight: '700' },
  scoreBody:    { fontSize: 12 },
  pctLabel:     { fontSize: 13, fontWeight: '700', marginTop: 2 },
  barTrack:     { width: '100%', height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 3 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statsRow:     { flexDirection: 'row', gap: Spacing.sm },
  statCard:     { flex: 1, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1 },
  statIcon:     { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue:    { fontSize: 20, fontWeight: '700' },
  statLabel:    { fontSize: 10, textAlign: 'center' },

  alertBanner:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  alertTitle:   { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  alertSub:     { fontSize: 11, color: '#EF4444', marginTop: 1 },
});
