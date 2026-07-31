import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchMySoftRequests, fetchAllSoftRequests, updateSoftRequestStatus } from '../../utils/api';
import { isSoftManager, canResolveSoft } from '../../utils/permissions';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import type { SoftRequest } from '../../utils/api';

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  open:         { label: 'Open',         variant: 'warning' },
  acknowledged: { label: 'Acknowledged', variant: 'info' },
  in_progress:  { label: 'In Progress',  variant: 'info' },
  closed:       { label: 'Closed',       variant: 'success' },
  resolved:     { label: 'Resolved',     variant: 'success' },
};

function RequestCard({ req, canResolve, currentUserId }: { req: SoftRequest; canResolve: boolean; currentUserId?: number }) {
  const { theme } = useTheme();
  const isActive = ['open', 'acknowledged', 'in_progress'].includes(req.status);
  const isAssignedToMe = canResolve && isActive && !!req.assignedToId && Number(req.assignedToId) === Number(currentUserId);
  const isUnassignedOpen = canResolve && req.status === 'open' && !req.assignedToId;
  const needsAcknowledge = isAssignedToMe && req.status === 'open';

  const handlePress = () => {
    if (isAssignedToMe && !needsAcknowledge) {
      router.push({ pathname: '/soft-resolve', params: { requestId: String(req.id) } });
    } else if (isUnassignedOpen) {
      router.push({ pathname: '/qr-scanner', params: { mode: 'resolve-request', requestId: String(req.id), expectedAssetId: String(req.assetId ?? '') } } as any);
    } else {
      router.push({ pathname: '/soft-resolve', params: { requestId: String(req.id), readOnly: 'true' } });
    }
  };

  const handleAcknowledge = async () => {
    try { await updateSoftRequestStatus(req.id, 'in_progress'); }
    catch { /* silent */ }
  };

  const statusInfo = STATUS_MAP[req.status] ?? { label: req.status, variant: 'default' };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>
            {req.templateName || req.assetName || req.locationName || 'Soft Request'}
          </Text>
          <Text style={[styles.assetId, { color: theme.textMuted }]} numberOfLines={1}>
            {req.assetName || req.locationName || req.assetUniqueId || ''}
          </Text>
        </View>
        <StatusBadge label={statusInfo.label} variant={statusInfo.variant} />
      </View>
      <View style={styles.cardBottom}>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {req.raisedByName ? `Raised by ${req.raisedByName} · ` : ''}
          {new Date(req.raisedAt).toLocaleDateString()}
        </Text>
        {needsAcknowledge ? (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: '#FEF3C7' }]}
            onPress={handleAcknowledge}
          >
            <MaterialCommunityIcons name="check" size={14} color="#D97706" />
            <Text style={[styles.resolveBtnText, { color: '#D97706' }]}>Acknowledge</Text>
          </TouchableOpacity>
        ) : isAssignedToMe ? (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: theme.primaryBg }]}
            onPress={handlePress}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.primary} />
            <Text style={[styles.resolveBtnText, { color: theme.primary }]}>Resolve</Text>
          </TouchableOpacity>
        ) : isUnassignedOpen ? (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: '#FEF3C7' }]}
            onPress={handlePress}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={16} color="#D97706" />
            <Text style={[styles.resolveBtnText, { color: '#D97706' }]}>Scan QR</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SoftRequestsTab() {
  const { theme } = useTheme();
  const { capabilities, user } = useAuth();
  const { initialFilter } = useLocalSearchParams<{ initialFilter?: string }>();
  const [items,      setItems]      = useState<SoftRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'open' | 'resolved'>('all');

  const showAll   = isSoftManager(capabilities) || canResolveSoft(capabilities);
  const canResolve = canResolveSoft(capabilities);
  const canRaise   = capabilities.canRaiseSoftIssue;

  const load = useCallback(async () => {
    try {
      const data = showAll ? await fetchAllSoftRequests() : await fetchMySoftRequests();
      setItems(data);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [showAll]);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    if (initialFilter === 'open' || initialFilter === 'resolved' || initialFilter === 'all') {
      setFilter(initialFilter);
    }
    void load();
  }, [isFocused, initialFilter, load]);

  const filtered = items.filter((i) => {
    if (filter === 'open')     return ['open', 'acknowledged', 'in_progress'].includes(i.status);
    if (filter === 'resolved') return ['resolved', 'closed'].includes(i.status);
    return true;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          {isSoftManager(capabilities) ? 'All Requests' : canResolve ? 'Requests to Resolve' : 'My Requests'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0
            ? <EmptyState icon="wrench-outline" title="No requests" message={filter === 'open' ? 'No open requests right now.' : 'Nothing to show.'} />
            : filtered.map((req) => <RequestCard key={req.id} req={req} canResolve={canResolve} currentUserId={user?.id} />)
          }
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1 },
  headerTitle:    { ...Typography.h3 },
  raiseBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.md },
  raiseBtnText:   { ...Typography.label, color: '#fff' },
  filters:        { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  pill:           { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  pillText:       { ...Typography.label },
  list:           { padding: Spacing.lg, gap: Spacing.md },
  emptyWrap:      { flex: 1 },
  card:           { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  cardTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  assetName:      { ...Typography.h4 },
  assetId:        { ...Typography.micro, marginTop: 2 },
  cardBottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta:           { ...Typography.bodyS, flex: 1 },
  resolveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  resolveBtnText: { ...Typography.label },
});
