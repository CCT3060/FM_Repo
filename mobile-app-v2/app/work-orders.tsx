import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchWorkOrders, createWorkOrder } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge, { statusVariant } from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function WorkOrdersScreen() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('all');

  const canCreate = capabilities.isTechnicalSupervisor;

  const load = useCallback(async () => {
    try {
      const raw = await fetchWorkOrders(filter !== 'all' ? { status: filter } : undefined);
      const data = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
      setOrders(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        title="Work Orders"
        showBack
        right={canCreate ? (
          <TouchableOpacity onPress={() => router.push('/work-order-create')}>
            <MaterialCommunityIcons name="plus-circle-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterScroll, { borderBottomColor: theme.border }]}>
        {(['all', 'open', 'in_progress', 'completed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && { backgroundColor: theme.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, { color: filter === f ? '#fff' : theme.textSecondary }]}>
              {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={orders.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 ? (
            <EmptyState icon="briefcase-outline" title="No work orders" message="Work orders matching this filter will appear here." />
          ) : orders.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
              onPress={() => router.push({ pathname: '/work-order-details', params: { orderId: o.id } })}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{o.title ?? o.description}</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{o.assetName}</Text>
                </View>
                <StatusBadge label={o.status} variant={statusVariant(o.status)} />
              </View>
              <View style={styles.cardMeta}>
                {o.assignedTo ? (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="account-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.metaText, { color: theme.textMuted }]}>{o.assignedTo}</Text>
                  </View>
                ) : null}
                {o.dueDate ? (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="calendar-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.metaText, { color: theme.textMuted }]}>{new Date(o.dueDate).toLocaleDateString()}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  filterScroll:{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1, flexGrow: 0 },
  pill:        { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, marginRight: Spacing.sm },
  pillText:    { ...Typography.label },
  list:        { padding: Spacing.lg, gap: Spacing.md },
  card:        { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3, gap: Spacing.sm },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle:   { ...Typography.h4 },
  cardSub:     { ...Typography.bodyS },
  cardMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metaItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:    { ...Typography.micro },
});
