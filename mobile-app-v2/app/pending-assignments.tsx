/**
 * Pending Assignments screen — navigated to from Home's "Pending" stat card.
 * Shows only pending (not yet completed today) checklists and logsheets.
 * No filter pills — deliberately focused view.
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyChecklists } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

function ChecklistCard({ item }: { item: any }) {
  const { theme } = useTheme();
  const type = item.templateType === 'logsheet' ? 'logsheet' : 'checklist';
  const icon = type === 'logsheet' ? 'table-large' : 'clipboard-check-outline';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={() =>
        router.push({
          pathname: '/checklist-entry',
          params: {
            assignmentId: item.id,
            assetId: item.assetId,
            templateId: item.templateId,
            templateType: type,
            templateName: item.templateName,
            assetName: item.assetName,
          },
        })
      }
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
        <StatusBadge label="Pending" variant="warning" />
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} style={{ marginTop: Spacing.sm }} />
      </View>
    </TouchableOpacity>
  );
}

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

export default function PendingAssignmentsScreen() {
  const { theme } = useTheme();
  const [items,      setItems]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyChecklists();
      setItems(data as any[]);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Only show items NOT completed today
  const pending = items.filter((i) => !i.completedToday);
  const pendingChecklists = pending.filter((i) => i.templateType !== 'logsheet');
  const pendingLogsheets  = pending.filter((i) => i.templateType === 'logsheet');
  const hasLogsheets      = items.some((i) => i.templateType === 'logsheet');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Pending Assignments</Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            {loading ? '…' : `${pending.length} item${pending.length !== 1 ? 's' : ''} pending`}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={pending.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {pending.length === 0 ? (
            <EmptyState
              icon="clipboard-check-outline"
              title="All done!"
              message="You have no pending assignments for today. Great work!"
            />
          ) : (
            <>
              {pendingChecklists.length > 0 && (
                <>
                  <SectionHeader
                    icon="clipboard-check-outline"
                    title="CHECKLISTS"
                    count={pendingChecklists.length}
                    color={theme.primary}
                  />
                  {pendingChecklists.map((item) => (
                    <ChecklistCard key={item.assignmentId ?? item.id} item={item} />
                  ))}
                </>
              )}

              {hasLogsheets && pendingLogsheets.length > 0 && (
                <>
                  <SectionHeader
                    icon="table-large"
                    title="LOG SHEETS"
                    count={pendingLogsheets.length}
                    color="#7C3AED"
                  />
                  {pendingLogsheets.map((item) => (
                    <ChecklistCard key={item.assignmentId ?? item.id} item={item} />
                  ))}
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
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn:     { marginRight: Spacing.xs },
  headerTitle: { ...Typography.h3 },
  headerSub:   { fontSize: 11, marginTop: 2 },

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
