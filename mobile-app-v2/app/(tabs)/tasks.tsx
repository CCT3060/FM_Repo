/**
 * Tasks Tab — Unified task dashboard for Technical Supervisors.
 *
 * Shows all work items in one place:
 *   • Assigned checklists & logsheets  (from /my-assignments)
 *   • Work orders                       (from /work-orders)
 *   • Soft-service requests             (if user has soft-service access)
 *
 * Filter chips: All · Templates · Work Orders · Requests
 * Status chips:  All · Pending · Done
 */

import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMyChecklists,
  fetchWorkOrders,
  fetchMySoftRequests,
  fetchAllSoftRequests,
} from '../../utils/api';
import { hasSoftAccess, isSoftManager } from '../../utils/permissions';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge, { statusVariant } from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskCategory = 'all' | 'templates' | 'workorders' | 'requests';
type TaskStatus   = 'all' | 'pending' | 'done';

interface TaskItem {
  id:       string;
  category: 'template' | 'workorder' | 'request';
  title:    string;
  subtitle: string;
  meta?:    string;
  status:   string;       // raw status string
  isDone:   boolean;
  color:    string;
  icon:     string;
  onPress:  () => void;
}

// ─── Summary pill ─────────────────────────────────────────────────────────────

function SummaryPill({
  label, value, color,
}: { label: string; value: number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryPill, { backgroundColor: color + '18', borderColor: color + '33' }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ item }: { item: TaskItem }) {
  const { theme } = useTheme();

  const badgeVariant =
    item.isDone
      ? 'success'
      : item.status === 'open' || item.status === 'in_progress'
        ? 'warning'
        : 'neutral';

  const badgeLabel =
    item.isDone
      ? 'Done'
      : item.status === 'open'
        ? 'Open'
        : item.status === 'in_progress'
          ? 'In Progress'
          : 'Pending';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          shadowColor:     theme.cardShadow,
          borderLeftColor: item.color,
        },
      ]}
      onPress={item.onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.cardIcon, { backgroundColor: item.color + '18' }]}>
        <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.subtitle}
        </Text>
        {item.meta ? (
          <Text style={[styles.cardMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {item.meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.cardRight}>
        <StatusBadge label={badgeLabel} variant={badgeVariant} />
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={theme.textMuted}
          style={{ marginTop: Spacing.xs }}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Filter pill component ────────────────────────────────────────────────────

function FilterPill({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.pill, active && { backgroundColor: theme.primary }]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, { color: active ? '#fff' : theme.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TasksTab() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();

  const [templates,  setTemplates]  = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [requests,   setRequests]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [category, setCategory] = useState<TaskCategory>('all');
  const [status,   setStatus]   = useState<TaskStatus>('all');

  const hasSoft    = hasSoftAccess(capabilities);
  const isSoftMgr  = isSoftManager(capabilities);

  // ── Load all data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [tplResult, woResult, reqResult] = await Promise.allSettled([
        fetchMyChecklists(),
        fetchWorkOrders(),
        hasSoft
          ? (isSoftMgr ? fetchAllSoftRequests() : fetchMySoftRequests())
          : Promise.resolve([]),
      ]);

      if (tplResult.status  === 'fulfilled') setTemplates(tplResult.value   as any[]);
      if (woResult.status   === 'fulfilled') setWorkOrders(woResult.value   as any[]);
      if (reqResult.status  === 'fulfilled') setRequests(reqResult.value    as any[]);
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasSoft, isSoftMgr]);

  useEffect(() => { void load(); }, [load]);

  // ── Build unified TaskItem list ────────────────────────────────────────────
  const allTasks: TaskItem[] = [
    // Templates (checklists + logsheets)
    ...templates.map((t): TaskItem => {
      const isLogsheet = t.templateType === 'logsheet';
      return {
        id:       `tpl-${t.assignmentId ?? t.id}`,
        category: 'template',
        title:    t.templateName ?? 'Template',
        subtitle: t.assetName    ?? (isLogsheet ? 'Log Sheet' : 'Checklist'),
        meta:     t.frequency    ?? t.shiftName ?? undefined,
        status:   t.completedToday ? 'completed' : 'pending',
        isDone:   !!t.completedToday,
        color:    isLogsheet ? '#7C3AED' : theme.primary,
        icon:     isLogsheet ? 'table-large' : 'clipboard-check-outline',
        onPress:  () =>
          router.push({
            pathname: '/checklist-entry',
            params: {
              assignmentId: String(t.assignmentId ?? t.id),
              assetId:      String(t.assetId ?? ''),
              templateId:   String(t.templateId),
              templateType: isLogsheet ? 'logsheet' : 'checklist',
              templateName: t.templateName,
              assetName:    t.assetName ?? '',
            },
          }),
      };
    }),

    // Work orders
    ...workOrders.map((o): TaskItem => {
      const done = ['completed', 'resolved', 'closed'].includes(
        (o.status ?? '').toLowerCase()
      );
      return {
        id:       `wo-${o.id}`,
        category: 'workorder',
        title:    o.title ?? o.description ?? `Work Order #${o.id}`,
        subtitle: o.assetName ?? o.location ?? 'Work Order',
        meta:     o.dueDate
          ? `Due: ${new Date(o.dueDate).toLocaleDateString()}`
          : o.assignedTo ?? undefined,
        status:   o.status ?? 'open',
        isDone:   done,
        color:    theme.warning,
        icon:     'briefcase-outline',
        onPress:  () =>
          router.push({ pathname: '/work-order-details', params: { orderId: String(o.id) } }),
      };
    }),

    // Soft requests
    ...requests.map((r: any): TaskItem => ({
      id:       `req-${r.id}`,
      category: 'request',
      title:    r.assetName    ?? 'Request',
      subtitle: r.assetUniqueId ?? 'Soft Service',
      meta:     r.raisedByName
        ? `By ${r.raisedByName} · ${new Date(r.raisedAt).toLocaleDateString()}`
        : new Date(r.raisedAt).toLocaleDateString(),
      status:   r.status ?? 'open',
      isDone:   r.status === 'resolved',
      color:    '#0284C7',
      icon:     'wrench-outline',
      onPress:  () => {
        if (r.status === 'open' && capabilities.canResolveSoftIssue) {
          router.push({ pathname: '/soft-resolve', params: { requestId: String(r.id) } });
        }
      },
    })),
  ];

  // ── Apply filters ──────────────────────────────────────────────────────────
  const visible = allTasks.filter((t) => {
    if (category === 'templates'  && t.category !== 'template')  return false;
    if (category === 'workorders' && t.category !== 'workorder') return false;
    if (category === 'requests'   && t.category !== 'request')   return false;
    if (status   === 'pending'    && t.isDone)                   return false;
    if (status   === 'done'       && !t.isDone)                  return false;
    return true;
  });

  // ── Counts for summary ─────────────────────────────────────────────────────
  const totalPending = allTasks.filter((t) => !t.isDone).length;
  const totalDone    = allTasks.filter((t) =>  t.isDone).length;

  // ── Category labels & icons ────────────────────────────────────────────────
  const categories: Array<{ key: TaskCategory; label: string }> = [
    { key: 'all',        label: 'All'         },
    { key: 'templates',  label: 'Templates'   },
    { key: 'workorders', label: 'Work Orders' },
    ...(hasSoft ? [{ key: 'requests' as TaskCategory, label: 'Requests' }] : []),
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Tasks</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
            {allTasks.length} total · {totalPending} pending
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: theme.primaryBg }]}
          onPress={() => router.push('/history')}
          hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
        >
          <MaterialCommunityIcons name="history" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <>
          {/* ── Summary row ── */}
          <View style={[styles.summaryRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <SummaryPill label="Total"   value={allTasks.length} color={theme.primary}  />
            <SummaryPill label="Pending" value={totalPending}    color={theme.warning}  />
            <SummaryPill label="Done"    value={totalDone}       color={theme.success}  />
            <SummaryPill
              label="Requests"
              value={requests.filter((r: any) => r.status === 'open').length}
              color="#0284C7"
            />
          </View>

          {/* ── Category filter ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.filterScroll, { borderBottomColor: theme.border }]}
            contentContainerStyle={styles.filterContent}
          >
            {categories.map((c) => (
              <FilterPill
                key={c.key}
                label={c.label}
                active={category === c.key}
                onPress={() => setCategory(c.key)}
              />
            ))}
            <View style={styles.filterDivider} />
            {(['all', 'pending', 'done'] as TaskStatus[]).map((s) => (
              <FilterPill
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                active={status === s}
                onPress={() => setStatus(s)}
              />
            ))}
          </ScrollView>

          {/* ── Task list ── */}
          <ScrollView
            contentContainerStyle={visible.length === 0 ? styles.emptyWrap : styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); void load(); }}
                tintColor={theme.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {visible.length === 0 ? (
              <EmptyState
                icon="check-circle-outline"
                title="No tasks"
                message={
                  status === 'done'
                    ? 'No completed tasks in this filter.'
                    : 'All caught up! No pending tasks.'
                }
              />
            ) : (
              <>
                {/* Group headers */}
                {renderGroup('Templates', 'template', visible, theme)}
                {renderGroup('Work Orders', 'workorder', visible, theme)}
                {hasSoft ? renderGroup('Requests', 'request', visible, theme) : null}
              </>
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

// ─── Group renderer ───────────────────────────────────────────────────────────

function renderGroup(
  label: string,
  key: TaskItem['category'],
  items: TaskItem[],
  theme: any
) {
  const group = items.filter((i) => i.category === key);
  if (group.length === 0) return null;

  return (
    <View key={key}>
      <View style={styles.groupHeader}>
        <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
          {label.toUpperCase()}
        </Text>
        <View style={[styles.groupCount, { backgroundColor: theme.primaryBg }]}>
          <Text style={[styles.groupCountText, { color: theme.primary }]}>{group.length}</Text>
        </View>
      </View>
      {group.map((item) => <TaskCard key={item.id} item={item} />)}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:            { flex: 1 },

  // Header
  header:          {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle:     { ...Typography.h3 },
  headerSub:       { ...Typography.bodyS, marginTop: 2 },
  historyBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Summary row
  summaryRow:      {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  summaryPill:     {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 2,
  },
  summaryValue:    { ...Typography.h4 },
  summaryLabel:    { ...Typography.micro },

  // Filter bar
  filterScroll:    { maxHeight: 48, borderBottomWidth: 1 },
  filterContent:   { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, alignItems: 'center', gap: Spacing.xs },
  filterDivider:   { width: 1, height: 20, backgroundColor: '#E2E8F0', marginHorizontal: Spacing.xs },
  pill:            { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  pillText:        { ...Typography.label },

  // List / empty
  list:            { padding: Spacing.lg, gap: Spacing.xs, paddingBottom: 100 },
  emptyWrap:       { flex: 1 },

  // Group header
  groupHeader:     {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  groupLabel:      { ...Typography.label, letterSpacing: 0.8 },
  groupCount:      { paddingHorizontal: Spacing.sm, paddingVertical: 1, borderRadius: Radius.full },
  groupCountText:  { ...Typography.micro },

  // Task card
  card:            {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginVertical: 3,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
  },
  cardIcon:        {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  cardBody:        { flex: 1, gap: 2 },
  cardTitle:       { ...Typography.h4 },
  cardSub:         { ...Typography.bodyS },
  cardMeta:        { ...Typography.micro },
  cardRight:       { alignItems: 'flex-end', gap: 2 },
});
