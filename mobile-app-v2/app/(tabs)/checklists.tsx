import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchMyChecklists } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge from '../../components/StatusBadge';
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
        <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{item.assetName ?? '—'}</Text>
        <Text style={[styles.cardFreq, { color: theme.textMuted }]}>{item.frequency ?? 'Unscheduled'}</Text>
      </View>
      <View style={styles.cardRight}>
        <StatusBadge label={item.completedToday ? 'Done' : 'Pending'} variant={item.completedToday ? 'success' : 'warning'} />
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} style={{ marginTop: Spacing.sm }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, count, color }: { icon: string; title: string; count: number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
      <MaterialCommunityIcons name={icon as any} size={15} color={color} />
      <Text style={[styles.sectionHeaderText, { color: theme.textMuted }]}>{title}</Text>
      <View style={[styles.sectionBadge, { backgroundColor: color + '18' }]}>
        <Text style={[styles.sectionBadgeText, { color }]}>{count}</Text>
      </View>
    </View>
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

  // Re-fetch on every focus so Done/Pending counts reflect the latest submission.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const checklists = items.filter((i) => i.templateType !== 'logsheet');
  const logsheets  = items.filter((i) => i.templateType === 'logsheet');
  const hasLogsheets = logsheets.length > 0;

  const applyFilter = (list: any[]) => {
    if (filter === 'pending') return list.filter((i) => !i.completedToday);
    if (filter === 'done')    return list.filter((i) =>  i.completedToday);
    return list;
  };

  const filteredChecklists = applyFilter(checklists);
  const filteredLogsheets  = applyFilter(logsheets);
  const totalFiltered = filteredChecklists.length + filteredLogsheets.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Assignments</Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>{items.length} item{items.length !== 1 ? 's' : ''} assigned</Text>
        </View>
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
              {f === 'all' ? `All (${items.length})`
               : f === 'pending' ? `Pending (${items.filter((i) => !i.completedToday).length})`
               : `Done (${items.filter((i) => i.completedToday).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={totalFiltered === 0 ? styles.emptyWrap : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {totalFiltered === 0 ? (
            <EmptyState icon="clipboard-check-outline" title="No items" message={filter === 'pending' ? 'Nothing pending — all done!' : filter === 'done' ? 'Nothing completed yet today.' : 'No assignments yet. Ask your supervisor to assign checklists.'} />
          ) : (
            <>
              {/* Checklists section */}
              {filteredChecklists.length > 0 && (
                <>
                  <SectionHeader icon="clipboard-check-outline" title="CHECKLISTS" count={filteredChecklists.length} color={theme.primary} />
                  {filteredChecklists.map((item) => <ChecklistCard key={item.assignmentId ?? item.id} item={item} />)}
                </>
              )}

              {/* Log Sheets section — only shown if company has logsheets */}
              {hasLogsheets && filteredLogsheets.length > 0 && (
                <>
                  <SectionHeader icon="table-large" title="LOG SHEETS" count={filteredLogsheets.length} color="#7C3AED" />
                  {filteredLogsheets.map((item) => <ChecklistCard key={item.assignmentId ?? item.id} item={item} />)}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  headerTitle: { ...Typography.h3 },
  headerSub:   { fontSize: 11, marginTop: 2 },
  filters:     { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  pill:        { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  pillText:    { ...Typography.label, fontSize: 11 },
  list:        { padding: Spacing.lg, gap: Spacing.sm },
  emptyWrap:   { flex: 1 },

  sectionHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: 2, marginTop: Spacing.sm, borderLeftWidth: 3, paddingLeft: Spacing.sm },
  sectionHeaderText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, flex: 1 },
  sectionBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  sectionBadgeText:  { fontSize: 11, fontWeight: '700' },

  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.md, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3, marginBottom: Spacing.xs },
  cardIcon:    { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  cardBody:    { flex: 1, gap: 2 },
  cardTitle:   { ...Typography.h4 },
  cardSub:     { ...Typography.bodyS },
  cardFreq:    { ...Typography.micro },
  cardRight:   { alignItems: 'flex-end', gap: 2 },
});
