import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchMySoftRequests, fetchAllSoftRequests } from '../../utils/api';
import { isSoftManager, canResolveSoft } from '../../utils/permissions';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import type { SoftRequest } from '../../utils/api';

function RequestCard({ req, canResolve }: { req: SoftRequest; canResolve: boolean }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={() => {
        if (canResolve && req.status === 'open') {
          router.push({ pathname: '/soft-resolve', params: { requestId: String(req.id) } });
        }
      }}
      activeOpacity={canResolve ? 0.8 : 1}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>{req.assetName}</Text>
          <Text style={[styles.assetId,   { color: theme.textMuted }]}>{req.assetUniqueId}</Text>
        </View>
        <StatusBadge label={req.status === 'open' ? 'Open' : 'Resolved'} variant={req.status === 'open' ? 'warning' : 'success'} />
      </View>
      <View style={styles.cardBottom}>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {req.raisedByName ? `Raised by ${req.raisedByName} · ` : ''}
          {new Date(req.raisedAt).toLocaleDateString()}
        </Text>
        {canResolve && req.status === 'open' ? (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: theme.primaryBg }]}
            onPress={() => router.push({ pathname: '/soft-resolve', params: { requestId: String(req.id) } })}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.primary} />
            <Text style={[styles.resolveBtnText, { color: theme.primary }]}>Resolve</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SoftRequestsTab() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
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

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((i) => {
    if (filter === 'open')     return i.status === 'open';
    if (filter === 'resolved') return i.status === 'resolved';
    return true;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          {isSoftManager(capabilities) ? 'All Requests' : canResolve ? 'Requests to Resolve' : 'My Requests'}
        </Text>
      </View>

      {/* Filter pills */}
      <View style={[styles.filters, { borderBottomColor: theme.border }]}>
        {(['all', 'open', 'resolved'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && { backgroundColor: theme.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, { color: filter === f ? '#fff' : theme.textSecondary }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
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
            : filtered.map((req) => <RequestCard key={req.id} req={req} canResolve={canResolve} />)
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
