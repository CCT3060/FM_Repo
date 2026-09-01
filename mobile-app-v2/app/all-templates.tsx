/**
 * All Templates screen — shows every active checklist slot and logsheet template
 * for the company with granular location, room, shift, and slot breakdown.
 * Mathematically consistent with Mobile Dashboard summary cards.
 */

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAllTemplates } from '../utils/api';
import { useTheme, Spacing, Radius, Typography } from '../utils/theme';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

type Template = {
  id: string | number;
  templateId: number;
  templateName: string;
  locationId?: number | null;
  locationName?: string | null;
  campus?: string | null;
  building?: string | null;
  floor?: string | number | null;
  room?: string | null;
  assetType?: string;
  frequency?: string;
  hourlyInterval?: number | string | null;
  shiftId?: number | null;
  shiftName?: string | null;
  shiftWindow?: string | null;
  slotTiming?: string | null;
  slotIndex?: number;
  totalSlotsInShift?: number;
  templateType: 'checklist' | 'logsheet';
  completedToday: boolean;
  submissionId?: number | null;
  submittedAt?: string | null;
  submittedByName?: string | null;
};

const TYPE_CONFIG = {
  checklist: { icon: 'clipboard-check-outline', color: '#2563EB', label: 'Checklist' },
  logsheet:  { icon: 'table-large',             color: '#7C3AED', label: 'Logsheet'  },
} as const;

function getLocationText(item: Template): string | null {
  const hasRoom = Boolean(item.room && String(item.room).trim());
  const hasFloor = item.floor != null && String(item.floor).trim() !== '';
  const buildingSuffix = item.building && (!item.locationName || !item.locationName.includes(item.building))
    ? ` (${item.building})`
    : '';

  if (hasRoom && hasFloor) {
    return `Room: ${item.room} · Floor ${item.floor}${buildingSuffix}`;
  }
  if (hasRoom) {
    return `Room: ${item.room}${buildingSuffix}`;
  }
  if (hasFloor) {
    return `Floor ${item.floor}${buildingSuffix}`;
  }
  if (item.locationName) {
    return `${item.locationName}${buildingSuffix}`;
  }
  if (item.building) {
    return item.building;
  }
  return null;
}

function TemplateRow({ item }: { item: Template }) {
  const { theme } = useTheme();
  const cfg = TYPE_CONFIG[item.templateType] ?? TYPE_CONFIG.checklist;
  const locText = getLocationText(item);

  return (
    <View
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: cfg.color + '15' }]}>
        <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={2}>
          {item.templateName}
        </Text>

        {locText ? (
          <View style={styles.locationWrap}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color="#0891B2" style={{ marginTop: 2 }} />
            <Text style={[styles.locationText, { color: '#0891B2' }]} numberOfLines={2}>
              {locText}
            </Text>
          </View>
        ) : null}

        {item.slotTiming || item.shiftWindow ? (
          <View style={styles.shiftWrap}>
            <MaterialCommunityIcons name="clock-outline" size={12} color="#6366F1" />
            <Text style={[styles.shiftText, { color: '#6366F1' }]} numberOfLines={1}>
              {item.totalSlotsInShift && item.totalSlotsInShift > 1
                ? `Slot ${item.slotIndex}/${item.totalSlotsInShift} (${item.slotTiming || item.shiftWindow})`
                : `Slot (${item.slotTiming || item.shiftWindow})`}
            </Text>
          </View>
        ) : null}

        <View style={styles.rowMeta}>
          <View style={[styles.typePill, { backgroundColor: cfg.color + '15' }]}>
            <Text style={[styles.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {item.frequency ? (
            <Text style={[styles.rowSub, { color: theme.textMuted }]}>{item.frequency}</Text>
          ) : null}
          {item.assetType ? (
            <Text style={[styles.rowSub, { color: theme.textMuted }]}>· {item.assetType}</Text>
          ) : null}
          {item.completedToday && item.submittedByName ? (
            <Text style={[styles.rowSub, { color: '#059669', fontWeight: '600' }]}>
              · Filled by {item.submittedByName}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge
          label={item.completedToday ? 'Done' : 'Pending'}
          variant={item.completedToday ? 'success' : 'warning'}
        />
      </View>
    </View>
  );
}

export default function AllTemplatesScreen() {
  const { theme } = useTheme();
  const { initialFilter, type: typeFilter } = useLocalSearchParams<{ initialFilter?: string; type?: string }>();
  const [items,      setItems]      = useState<Template[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<'all' | 'pending' | 'done'>(
    (initialFilter as 'all' | 'pending' | 'done') ?? 'all'
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAllTemplates();
      setItems(Array.isArray(data) ? (data as Template[]) : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load templates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); void load(); };

  const filtered = items.filter((t) => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q
      || (t.templateName || '').toLowerCase().includes(q)
      || (t.locationName || '').toLowerCase().includes(q)
      || (t.building || '').toLowerCase().includes(q)
      || (t.floor != null ? String(t.floor).toLowerCase().includes(q) : false)
      || (t.room || '').toLowerCase().includes(q)
      || (t.slotTiming || '').toLowerCase().includes(q)
      || (t.frequency || '').toLowerCase().includes(q)
      || (t.assetType || '').toLowerCase().includes(q);

    const matchFilter =
      filter === 'all'
        ? true
        : filter === 'done'
        ? t.completedToday
        : !t.completedToday;

    const matchType = !typeFilter || typeFilter === 'all' || t.templateType === typeFilter;
    return matchSearch && matchFilter && matchType;
  });

  const typedItems = !typeFilter || typeFilter === 'all'
    ? items
    : items.filter((t) => t.templateType === typeFilter);

  const checklists = filtered.filter((t) => t.templateType === 'checklist');
  const logsheets  = filtered.filter((t) => t.templateType === 'logsheet');

  const doneCount    = typedItems.filter((t) =>  t.completedToday).length;
  const pendingCount = typedItems.filter((t) => !t.completedToday).length;

  const pageTitle = typeFilter === 'checklist' ? 'Checklists' : typeFilter === 'logsheet' ? 'Logsheets' : 'Checklists & Templates';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{pageTitle}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {loading ? '…' : `${typedItems.length} total · ${doneCount} done · ${pendingCount} pending`}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.inputText }]}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${pageTitle.toLowerCase()}, location, room or timing…`}
          placeholderTextColor={theme.inputPlaceholder}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.pills}>
        {(['all', 'pending', 'done'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.pill, { backgroundColor: filter === f ? theme.primary : theme.surface, borderColor: filter === f ? theme.primary : theme.border }]}
          >
            <Text style={[styles.pillText, { color: filter === f ? '#fff' : theme.textSecondary }]}>
              {f === 'all'     ? `All (${typedItems.length})` : ''}
              {f === 'pending' ? `Pending (${pendingCount})` : ''}
              {f === 'done'    ? `Done (${doneCount})`    : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading templates…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="wifi-alert" size={48} color="#EF4444" />
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Failed to Load</Text>
          <Text style={[styles.errorBody, { color: theme.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState icon="clipboard-text-off-outline" title="No templates found" message="Try adjusting your search or filter." />
          ) : (
            <>
              {checklists.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, { borderLeftColor: '#2563EB' }]}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={14} color="#2563EB" />
                    <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>CHECKLISTS</Text>
                    <View style={[styles.badge, { backgroundColor: '#2563EB18' }]}>
                      <Text style={[styles.badgeText, { color: '#2563EB' }]}>{checklists.length}</Text>
                    </View>
                  </View>
                  {checklists.map((t) => (
                    <TemplateRow key={`c-${t.id}`} item={t} />
                  ))}
                </>
              )}

              {logsheets.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, { borderLeftColor: '#7C3AED' }]}>
                    <MaterialCommunityIcons name="table-large" size={14} color="#7C3AED" />
                    <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>LOGSHEETS</Text>
                    <View style={[styles.badge, { backgroundColor: '#7C3AED18' }]}>
                      <Text style={[styles.badgeText, { color: '#7C3AED' }]}>{logsheets.length}</Text>
                    </View>
                  </View>
                  {logsheets.map((t) => <TemplateRow key={`l-${t.id}`} item={t} />)}
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
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerText:    { flex: 1 },
  title:         { fontSize: 18, fontWeight: '700' },
  subtitle:      { fontSize: 11, marginTop: 2 },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, margin: Spacing.lg, marginBottom: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 44 },
  searchInput:   { flex: 1, ...Typography.body },
  pills:         { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  pill:          { flex: 1, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  pillText:      { fontSize: 12, fontWeight: '700' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  loadingText:   { ...Typography.body },
  errorTitle:    { fontSize: 15, fontWeight: '700' },
  errorBody:     { fontSize: 12, textAlign: 'center' },
  retryBtn:      { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.md, marginTop: Spacing.sm },
  retryText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll:        { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, borderLeftWidth: 3, marginBottom: Spacing.sm, marginTop: Spacing.md },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  badge:         { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  badgeText:     { fontSize: 11, fontWeight: '700' },
  row:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, marginBottom: Spacing.xs },
  rowIcon:       { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowBody:       { flex: 1 },
  rowTitle:      { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  locationWrap:  { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 2 },
  locationText:  { fontSize: 11.5, fontWeight: '600', flex: 1 },
  shiftWrap:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  shiftText:     { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  rowMeta:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typePill:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  typePillText:  { fontSize: 10, fontWeight: '700' },
  rowSub:        { fontSize: 11 },
  rowRight:      { alignItems: 'flex-end', justifyContent: 'center' },
});
