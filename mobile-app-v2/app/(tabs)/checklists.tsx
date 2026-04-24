import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchMyChecklists } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge, { statusVariant } from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

function ChecklistCard({ item }: { item: any }) {
  const { theme } = useTheme();
  const type = item.templateType === 'logsheet' ? 'logsheet' : 'checklist';
  const icon = type === 'logsheet' ? 'table-large' : 'clipboard-check-outline';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={() => router.push({ pathname: '/checklist-entry', params: { assignmentId: item.id, assetId: item.assetId, templateId: item.templateId, templateType: type, templateName: item.templateName, assetName: item.assetName } })}
      activeOpacity={0.8}
    >
      <View style={[styles.cardIcon, { backgroundColor: type === 'logsheet' ? '#F5F3FF' : theme.primaryBg }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={type === 'logsheet' ? '#7C3AED' : theme.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.templateName}</Text>
        <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{item.assetName}</Text>
        <Text style={[styles.cardFreq, { color: theme.textMuted }]}>{item.frequency ?? 'Unscheduled'}</Text>
      </View>
      <View style={styles.cardRight}>
        <StatusBadge label={item.completedToday ? 'Done' : 'Pending'} variant={item.completedToday ? 'success' : 'warning'} />
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} style={{ marginTop: Spacing.sm }} />
      </View>
    </TouchableOpacity>
  );
}

export default function ChecklistsTab() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const [items,      setItems]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'pending' | 'done'>('all');

  const load = useCallback(async () => {
    try {
      const data = await fetchMyChecklists();
      setItems(data as any[]);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((i) => {
    if (filter === 'pending') return !i.completedToday;
    if (filter === 'done')    return  i.completedToday;
    return true;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Checklists</Text>
        {capabilities.isTechnicalSupervisor ? (
          <TouchableOpacity onPress={() => router.push('/checklist-history')} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <MaterialCommunityIcons name="history" size={24} color={theme.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter pills */}
      <View style={[styles.filters, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {(['all', 'pending', 'done'] as const).map((f) => (
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
            ? <EmptyState icon="clipboard-check-outline" title="No checklists" message="All caught up! Check back later." />
            : filtered.map((item) => <ChecklistCard key={item.id} item={item} />)
          }
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...Typography.h3 },
  filters:     { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  pill:        { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  pillText:    { ...Typography.label },
  list:        { padding: Spacing.lg, gap: Spacing.md },
  emptyWrap:   { flex: 1 },
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  cardIcon:    { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  cardBody:    { flex: 1, gap: 2 },
  cardTitle:   { ...Typography.h4 },
  cardSub:     { ...Typography.bodyS },
  cardFreq:    { ...Typography.micro },
  cardRight:   { alignItems: 'flex-end', gap: 2 },
});
