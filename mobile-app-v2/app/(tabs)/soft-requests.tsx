import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Alert, Animated, Modal, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  View, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMySoftRequests, fetchAllSoftRequests, updateSoftRequestStatus,
  fetchMyAdditionalRequests, fetchAllAdditionalRequests,
  assignSoftRequest, assignAdditionalRequest,
  setSoftRequestCutoff, setAdditionalRequestCutoff,
  updateAdditionalRequestStatus,
  deleteSoftRequest, deleteAdditionalRequest,
  fetchSoftRequestAssignableUsers,
  fetchWorkOrders, updateWorkOrderStatus,
} from '../../utils/api';
import {
  isSoftManager, canResolveSoft, canAssignHK, canChangeHKStatus,
  canExecuteWorkOrders, canManageWorkOrders, hasTechAccess,
} from '../../utils/permissions';
import { useTheme, Typography, Spacing, Radius } from '../../utils/theme';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import type { SoftRequest, AdditionalRequest, AssignableUser } from '../../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type UnifiedWorkOrder = {
  id: number;
  workOrderNumber?: string;
  assetId?: number;
  assetName?: string;
  location?: string;
  issueDescription?: string;
  priority?: string;
  status: string;
  assignedTo?: number;
  assignedToId?: number;
  assignedToName?: string;
  createdByName?: string;
  createdAt: string;
  raisedAt: string;
  raisedByName?: string;
  _type: 'workorder';
};

type UnifiedItem =
  | (SoftRequest & { _type: 'soft' })
  | AdditionalRequest
  | UnifiedWorkOrder;

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_MAP: Record<string, { label: string; variant: StatusVariant }> = {
  open:         { label: 'Open',         variant: 'warning' },
  acknowledged: { label: 'Acknowledged', variant: 'info' },
  in_progress:  { label: 'In Progress',  variant: 'info' },
  completed:    { label: 'Completed',    variant: 'success' },
  closed:       { label: 'Closed',       variant: 'success' },
  resolved:     { label: 'Resolved',     variant: 'success' },
};

// ─── User picker modal ────────────────────────────────────────────────────────
function UserPicker({
  visible, users, title, onSelect, onClose,
}: {
  visible: boolean;
  users: AssignableUser[];
  title: string;
  onSelect: (u: AssignableUser) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.pickerBox, { backgroundColor: theme.surface }]}>
              <Text style={[styles.pickerTitle, { color: theme.textPrimary }]}>{title}</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {users.length === 0 ? (
                  <Text style={{ color: theme.textSecondary, padding: Spacing.md }}>No assignable users found.</Text>
                ) : users.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.pickerRow, { borderBottomColor: theme.border }]}
                    onPress={() => { onSelect(u); onClose(); }}
                  >
                    <MaterialCommunityIcons name="account-circle-outline" size={20} color={theme.primary} />
                    <Text style={{ color: theme.textPrimary, marginLeft: 8 }}>{u.fullName}</Text>
                    {u.role ? <Text style={{ color: theme.textMuted, fontSize: 11, marginLeft: 4 }}>({u.role})</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={onClose} style={[styles.pickerCancel, { borderTopColor: theme.border }]}>
                <Text style={{ color: theme.danger, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Action bottom sheet ──────────────────────────────────────────────────────
function ActionSheet({
  visible, item, currentUserId, canAssign, canChangeStatus, onClose, onRefresh,
}: {
  visible: boolean;
  item: UnifiedItem | null;
  currentUserId?: number;
  canAssign: boolean;
  canChangeStatus: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const [busy, setBusy] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [cutoffDate, setCutoffDate] = useState('');

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      fetchSoftRequestAssignableUsers().then(setAssignableUsers).catch(() => {});
      setCutoffDate('');
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  if (!item) return null;

  const isWO = item._type === 'workorder';
  const isSoft = item._type === 'soft';
  const isActive = ['open', 'acknowledged', 'in_progress'].includes(item.status);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onClose();
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = (user: AssignableUser) => {
    if (isWO) {
      Alert.alert('Info', 'Assign work order via details screen');
    } else if (isSoft) {
      run(() => assignSoftRequest(item.id, user.id));
    } else {
      run(() => assignAdditionalRequest(item.id, user.id));
    }
  };

  const handleCutoff = () => {
    if (!cutoffDate.trim()) { Alert.alert('Enter date', 'Please enter a cutoff date (YYYY-MM-DD HH:MM)'); return; }
    const isoDate = new Date(cutoffDate.trim()).toISOString();
    if (isSoft) {
      run(() => setSoftRequestCutoff(item.id, isoDate));
    } else if (!isWO) {
      run(() => setAdditionalRequestCutoff(item.id, isoDate));
    }
  };

  const handleStatus = (status: string) => {
    if (isWO) {
      run(() => updateWorkOrderStatus(item.id, status === 'resolved' ? 'completed' : status));
      return;
    }
    if (isSoft) {
      if (status === 'resolved') {
        onClose();
        router.push({ pathname: '/soft-resolve', params: { requestId: String(item.id) } });
        return;
      }
      run(() => updateSoftRequestStatus(item.id, status));
    } else {
      run(() => updateAdditionalRequestStatus(item.id, status));
    }
  };

  const handleDelete = () => {
    if (isWO) return;
    Alert.alert('Delete Request', 'Are you sure you want to delete this request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => isSoft ? deleteSoftRequest(item.id) : deleteAdditionalRequest(item.id)) },
    ]);
  };

  const btn = (icon: string, label: string, color: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      key={label}
      style={[styles.actionBtn, { backgroundColor: color + '18', opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );

  const itemTitle = isWO
    ? ((item as UnifiedWorkOrder).issueDescription || (item as UnifiedWorkOrder).workOrderNumber || 'Work Order')
    : isSoft
    ? ((item as SoftRequest).templateName || (item as SoftRequest).assetName || 'Soft Request')
    : ((item as AdditionalRequest).serviceName || 'Additional Request');

  const itemSub = isWO
    ? `Work Order · ${(item as UnifiedWorkOrder).workOrderNumber || `#${item.id}`}`
    : isSoft ? `Soft Service Request · #${item.id}` : `Additional Request · #${item.id}`;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[styles.sheet, { backgroundColor: theme.surface, transform: [{ translateY: slideAnim }] }]}
            >
              {/* Handle */}
              <View style={[styles.handle, { backgroundColor: theme.border }]} />

              {/* Header */}
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                {itemTitle}
              </Text>
              <Text style={[styles.sheetSub, { color: theme.textMuted }]}>
                {itemSub}
              </Text>

              {busy && <ActivityIndicator color={theme.primary} style={{ marginVertical: 8 }} />}

              {/* Actions grid */}
              <View style={styles.actionGrid}>
                {!isWO && canAssign && btn('account-arrow-right', 'Assign', theme.primary, () => setShowUserPicker(true))}
                {canChangeStatus && isActive && btn('check-circle-outline', 'Acknowledge', '#059669', () => handleStatus(isWO ? 'in_progress' : 'acknowledged'))}
                {canChangeStatus && isActive && btn('play-circle-outline', 'Start Work',  '#D97706', () => handleStatus('in_progress'))}
                {canChangeStatus && isActive && btn('check-all',           'Resolve / Complete', '#6D28D9', () => handleStatus(isWO ? 'completed' : 'resolved'))}
                {canChangeStatus && !isActive && btn('refresh', 'Reopen', '#0891b2', () => handleStatus('open'))}
                {!isWO && canAssign && btn('delete-outline', 'Delete', '#DC2626', handleDelete)}
              </View>

              {/* Cutoff */}
              {!isWO && canAssign && (
                <View style={[styles.cutoffRow, { borderTopColor: theme.border }]}>
                  <TextInput
                    placeholder="Set cutoff: YYYY-MM-DD HH:MM"
                    placeholderTextColor={theme.textMuted}
                    value={cutoffDate}
                    onChangeText={setCutoffDate}
                    style={[styles.cutoffInput, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.background }]}
                  />
                  <TouchableOpacity
                    onPress={handleCutoff}
                    style={[styles.cutoffBtn, { backgroundColor: theme.primary }]}
                    disabled={busy}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Set</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      <UserPicker
        visible={showUserPicker}
        users={assignableUsers}
        title="Assign to…"
        onSelect={handleAssign}
        onClose={() => setShowUserPicker(false)}
      />
    </Modal>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────
function RequestCard({
  item, canResolve, canManage, currentUserId, onAction, onRefresh,
}: {
  item: UnifiedItem;
  canResolve: boolean;
  canManage: boolean;
  currentUserId?: number;
  onAction: (item: UnifiedItem) => void;
  onRefresh: () => void;
}) {
  const { theme } = useTheme();
  const isWO   = item._type === 'workorder';
  const isSoft = item._type === 'soft';
  const softReq = isSoft ? (item as SoftRequest & { _type: 'soft' }) : null;
  const addReq  = item._type === 'additional' ? (item as AdditionalRequest) : null;
  const woReq   = isWO ? (item as UnifiedWorkOrder) : null;

  const isActive = ['open', 'acknowledged', 'in_progress'].includes(item.status);
  const assignedId = (item as any).assignedToId ?? (item as any).assignedTo;
  const isAssignedToMe = isActive && !!assignedId && Number(assignedId) === Number(currentUserId);
  const needsAcknowledge = isAssignedToMe && item.status === 'open';
  const statusInfo = STATUS_MAP[item.status] ?? { label: item.status, variant: 'neutral' as const };

  const title = isWO
    ? (woReq!.issueDescription || woReq!.workOrderNumber || 'Work Order')
    : softReq
    ? (softReq.templateName || softReq.assetName || softReq.locationName || 'Soft Request')
    : (addReq!.serviceName || 'Additional Request');

  const subtitle = isWO
    ? [woReq!.workOrderNumber, woReq!.assetName, woReq!.location].filter(Boolean).join(' · ')
    : softReq
    ? (softReq.assetName || softReq.locationName || softReq.assetUniqueId || '')
    : (addReq!.priority ? `Priority: ${addReq!.priority}` : '');

  const handlePress = () => {
    if (isWO) {
      router.push({ pathname: '/work-order-details', params: { orderId: String(item.id) } });
      return;
    }
    if (!isSoft) return;
    if (isAssignedToMe && !needsAcknowledge) {
      router.push({ pathname: '/soft-resolve', params: { requestId: String(item.id) } });
    } else {
      router.push({ pathname: '/soft-resolve', params: { requestId: String(item.id), readOnly: 'true' } });
    }
  };

  const handleStartWO = async () => {
    try {
      await updateWorkOrderStatus(item.id, 'in_progress');
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start work order');
    }
  };

  const handleResolveWO = async () => {
    try {
      await updateWorkOrderStatus(item.id, 'completed');
      onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to complete work order');
    }
  };

  const handleAcknowledge = async () => {
    try {
      await updateSoftRequestStatus(item.id, 'in_progress');
      onRefresh();
    } catch { /* silent */ }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Type tag */}
      <View
        style={[
          styles.typeTag,
          { backgroundColor: isWO ? '#F59E0B18' : isSoft ? '#0284C718' : '#7C3AED18' },
        ]}
      >
        <MaterialCommunityIcons
          name={isWO ? 'briefcase-outline' : isSoft ? 'wrench-outline' : 'file-plus-outline'}
          size={11}
          color={isWO ? '#D97706' : isSoft ? '#0284C7' : '#7C3AED'}
        />
        <Text
          style={[
            styles.typeTagText,
            { color: isWO ? '#D97706' : isSoft ? '#0284C7' : '#7C3AED' },
          ]}
        >
          {isWO ? 'Work Order' : isSoft ? 'HK Request' : 'Add. Request'}
        </Text>
      </View>

      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.assetId, { color: theme.textMuted }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <StatusBadge label={statusInfo.label} variant={statusInfo.variant} />
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {item.raisedByName ? `${item.raisedByName} · ` : ''}
          {new Date(item.raisedAt || (item as any).createdAt).toLocaleDateString()}
          {item.assignedToName ? ` · 👤 ${item.assignedToName}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {/* Work Order direct actions */}
          {isWO && isActive && (
            item.status === 'open' ? (
              <TouchableOpacity
                style={[styles.resolveBtn, { backgroundColor: '#FEF3C7' }]}
                onPress={handleStartWO}
              >
                <MaterialCommunityIcons name="play-circle-outline" size={14} color="#D97706" />
                <Text style={[styles.resolveBtnText, { color: '#D97706' }]}>Start Work</Text>
              </TouchableOpacity>
            ) : item.status === 'in_progress' ? (
              <TouchableOpacity
                style={[styles.resolveBtn, { backgroundColor: '#DCFCE7' }]}
                onPress={handleResolveWO}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={14} color="#16A34A" />
                <Text style={[styles.resolveBtnText, { color: '#16A34A' }]}>Resolve</Text>
              </TouchableOpacity>
            ) : null
          )}

          {/* Soft request actions */}
          {needsAcknowledge && isSoft ? (
            <TouchableOpacity
              style={[styles.resolveBtn, { backgroundColor: '#FEF3C7' }]}
              onPress={handleAcknowledge}
            >
              <MaterialCommunityIcons name="check" size={14} color="#D97706" />
              <Text style={[styles.resolveBtnText, { color: '#D97706' }]}>Acknowledge</Text>
            </TouchableOpacity>
          ) : isAssignedToMe && isSoft ? (
            <TouchableOpacity
              style={[styles.resolveBtn, { backgroundColor: theme.primaryBg }]}
              onPress={handlePress}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.primary} />
              <Text style={[styles.resolveBtnText, { color: theme.primary }]}>Resolve</Text>
            </TouchableOpacity>
          ) : null}

          {canManage || isWO ? (
            <TouchableOpacity
              style={[styles.resolveBtn, { backgroundColor: theme.primaryBg }]}
              onPress={() => onAction(item)}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={16} color={theme.primary} />
              <Text style={[styles.resolveBtnText, { color: theme.primary }]}>Actions</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
export default function SoftRequestsTab() {
  const { theme } = useTheme();
  const { capabilities, user } = useAuth();
  const { initialFilter } = useLocalSearchParams<{ initialFilter?: string }>();

  const [items,       setItems]       = useState<UnifiedItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [filter,      setFilter]      = useState<'all' | 'open' | 'resolved'>('all');
  const [actionItem,  setActionItem]  = useState<UnifiedItem | null>(null);
  const [sheetOpen,   setSheetOpen]   = useState(false);

  const canAssignHKReq   = canAssignHK(capabilities) || user?.role === 'admin';
  const canChangeHKStat  = canChangeHKStatus(capabilities) || user?.role === 'admin';
  const canAssignAddReq  = !!capabilities?.canAssignRaisedRequests || user?.role === 'admin';
  const canChangeAddStat = !!capabilities?.canAssignRaisedRequests || user?.role === 'admin';

  const hasWOCapabilities = Boolean(
    capabilities.canExecuteWorkOrders ||
    capabilities.canAssignWorkOrders ||
    capabilities.isTechnician ||
    capabilities.isTechnicalSupervisor ||
    user?.role === 'admin'
  );
  const showAllWorkOrders = Boolean(
    capabilities.canAssignWorkOrders ||
    capabilities.isTechnicalSupervisor ||
    user?.role === 'admin'
  );

  const showAllSoft       = isSoftManager(capabilities) || canAssignHKReq;
  const showAllAdditional = isSoftManager(capabilities) || canAssignAddReq;
  const canResolve = Boolean(canResolveSoft(capabilities) || canChangeHKStat || capabilities.canExecuteWorkOrders);
  const canManage  = Boolean(canAssignHKReq || canAssignAddReq || capabilities.canAssignWorkOrders || capabilities.isTechnicalSupervisor);

  const load = useCallback(async () => {
    try {
      const [softData, addData, woData] = await Promise.allSettled([
        showAllSoft ? fetchAllSoftRequests() : fetchMySoftRequests(),
        showAllAdditional ? fetchAllAdditionalRequests() : fetchMyAdditionalRequests(),
        hasWOCapabilities
          ? (showAllWorkOrders ? fetchWorkOrders() : fetchWorkOrders({ assignedTo: user?.id }))
          : Promise.resolve([]),
      ]);

      const soft: UnifiedItem[] = softData.status === 'fulfilled' && Array.isArray(softData.value)
        ? softData.value.map((r) => ({ ...r, _type: 'soft' as const }))
        : [];
      const add: UnifiedItem[] = addData.status === 'fulfilled' && Array.isArray(addData.value)
        ? addData.value
        : [];
      const woList: UnifiedItem[] = woData.status === 'fulfilled' && Array.isArray(woData.value)
        ? (woData.value as any[]).map((w) => ({
            id: w.id,
            workOrderNumber: w.workOrderNumber,
            assetId: w.assetId,
            assetName: w.assetName,
            location: w.location,
            issueDescription: w.issueDescription || w.title,
            priority: w.priority || 'medium',
            status: w.status || 'open',
            assignedTo: w.assignedTo ? Number(w.assignedTo) : undefined,
            assignedToId: w.assignedTo ? Number(w.assignedTo) : undefined,
            assignedToName: w.assignedToName,
            createdByName: w.createdByName,
            createdAt: w.createdAt || new Date().toISOString(),
            raisedAt: w.createdAt || new Date().toISOString(),
            raisedByName: w.createdByName || 'System',
            _type: 'workorder' as const,
          }))
        : [];

      // Merge and sort by raisedAt descending
      const merged = [...soft, ...add, ...woList].sort(
        (a, b) => new Date((b as any).raisedAt || (b as any).createdAt || 0).getTime() -
                  new Date((a as any).raisedAt || (a as any).createdAt || 0).getTime()
      );
      setItems(merged);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [showAllSoft, showAllAdditional, hasWOCapabilities, showAllWorkOrders, user?.id]);

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
    if (filter === 'resolved') return ['resolved', 'closed', 'completed'].includes(i.status);
    return true;
  });

  const openAction = (item: UnifiedItem) => { setActionItem(item); setSheetOpen(true); };

  const filterLabel = isSoftManager(capabilities) || canManage
    ? 'All Requests'
    : canResolve
    ? 'Requests to Resolve'
    : 'My Requests';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{filterLabel}</Text>
      </View>

      {/* Filter pills */}
      <View style={[styles.filters, { borderBottomColor: theme.border }]}>
        {(['all', 'open', 'resolved'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, { backgroundColor: filter === f ? theme.primary : theme.surface }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, { color: filter === f ? '#fff' : theme.textSecondary }]}>
              {f === 'all' ? 'All' : f === 'open' ? 'Active' : 'Resolved'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${(item as any)._type}-${item.id}`}
          contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="wrench-outline"
              title="No requests"
              message={filter === 'open' ? 'No active requests right now.' : 'Nothing to show.'}
            />
          }
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              canResolve={canResolve}
              canManage={canManage}
              currentUserId={user?.id}
              onAction={openAction}
              onRefresh={() => void load()}
            />
          )}
        />
      )}

      <ActionSheet
        visible={sheetOpen}
        item={actionItem}
        currentUserId={user?.id}
        canAssign={
          (actionItem as any)?._type === 'workorder'
            ? canManageWorkOrders(capabilities) || user?.role === 'admin'
            : (actionItem as any)?._type !== 'additional'
            ? canAssignHKReq
            : canAssignAddReq
        }
        canChangeStatus={
          (actionItem as any)?._type === 'workorder'
            ? canExecuteWorkOrders(capabilities) || canManageWorkOrders(capabilities) || user?.role === 'admin'
            : (actionItem as any)?._type !== 'additional'
            ? canChangeHKStat
            : canChangeAddStat
        }
        onClose={() => setSheetOpen(false)}
        onRefresh={() => void load()}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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

  // Card
  card:           { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3, marginBottom: 2 },
  typeTag:        { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginBottom: 8 },
  typeTagText:    { fontSize: 10, fontWeight: '700' },
  cardTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  assetName:      { ...Typography.h4 },
  assetId:        { ...Typography.micro, marginTop: 2 },
  cardBottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  meta:           { ...Typography.bodyS, flex: 1 },
  resolveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  resolveBtnText: { ...Typography.label },

  // Action sheet
  sheetOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 12 },
  handle:         { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle:     { ...Typography.h3, marginBottom: 2 },
  sheetSub:       { ...Typography.bodyS, marginBottom: Spacing.md },
  actionGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md },
  actionBtnText:  { fontWeight: '600', fontSize: 13 },
  cutoffRow:      { flexDirection: 'row', gap: 8, paddingTop: Spacing.md, borderTopWidth: 1, alignItems: 'center' },
  cutoffInput:    { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  cutoffBtn:      { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.md },

  // User picker
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.xl },
  pickerBox:      { borderRadius: 16, overflow: 'hidden', paddingTop: Spacing.md },
  pickerTitle:    { ...Typography.h4, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  pickerRow:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1 },
  pickerCancel:   { padding: Spacing.md, alignItems: 'center', borderTopWidth: 1, marginTop: 4 },
});
