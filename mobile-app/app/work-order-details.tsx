import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { getWorkOrderById, updateWorkOrderStatus } from '../utils/api';

type WOStatus = 'open' | 'in_progress' | 'completed' | 'closed';

const STATUS_CFG: Record<WOStatus, { label: string; bg: string; color: string; icon: string }> = {
    open:        { label: 'OPEN',        bg: '#F1F5F9', color: '#475569', icon: 'clock-outline' },
    in_progress: { label: 'IN PROGRESS', bg: '#FFF7ED', color: '#C2410C', icon: 'progress-clock' },
    completed:   { label: 'COMPLETED',   bg: '#DCFCE7', color: '#15803D', icon: 'check-circle-outline' },
    closed:      { label: 'CLOSED',      bg: '#F0F9FF', color: '#0369A1', icon: 'lock-check-outline' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; icon: string }> = {
    low:      { label: 'Low Priority',      color: '#94A3B8', icon: 'arrow-down-circle-outline' },
    medium:   { label: 'Medium Priority',   color: '#64748B', icon: 'format-list-bulleted' },
    high:     { label: 'High Priority',     color: '#DC2626', icon: 'alert' },
    critical: { label: 'Critical Priority', color: '#DC2626', icon: 'alert-octagon' },
};

const STATUS_ORDER: WOStatus[] = ['open', 'in_progress', 'completed', 'closed'];

export default function WorkOrderDetailsScreen() {
    const params = useLocalSearchParams<{ id: string }>();
    const [wo, setWo] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState<WOStatus>('open');
    const [remark, setRemark] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => { loadData(); }, [params.id]);

    const loadData = async () => {
        try {
            setError(null);
            const data = await getWorkOrderById(params.id);
            setWo(data);
            setSelectedStatus((data.status as WOStatus) || 'open');
        } catch (err: any) {
            setError(err.message || 'Failed to load work order');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const openStatusModal = () => {
        setSelectedStatus((wo?.status as WOStatus) || 'open');
        setRemark('');
        setShowStatusModal(true);
    };

    const handleStatusUpdate = async () => {
        if (!wo) return;
        setIsUpdating(true);
        try {
            await updateWorkOrderStatus(wo.id, selectedStatus, remark.trim() || undefined);
            setShowStatusModal(false);
            Alert.alert('Updated', `Work order status changed to ${STATUS_CFG[selectedStatus].label}`);
            loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update status');
        } finally {
            setIsUpdating(false);
        }
    };

    const formatDate = (ts: string | null) => {
        if (!ts) return '—';
        return new Date(ts).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !wo) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Work Order</Text>
                    <View style={styles.headerBtn} />
                </View>
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={52} color="#EF4444" />
                    <Text style={styles.errorText}>{error || 'Not found'}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const sc = STATUS_CFG[(wo.status as WOStatus)] || STATUS_CFG.open;
    const pc = PRIORITY_CFG[wo.priority] || PRIORITY_CFG.medium;
    const canChangeStatus = wo.status !== 'closed';

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{wo.workOrderNumber || `WO-${wo.id}`}</Text>
                <View style={styles.headerBtn} />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
            >
                {/* Status banner */}
                <View style={[styles.statusBanner, { backgroundColor: sc.bg }]}>
                    <MaterialCommunityIcons name={sc.icon as any} size={22} color={sc.color} />
                    <Text style={[styles.statusBannerText, { color: sc.color }]}>{sc.label}</Text>
                    <View style={[styles.priorityPill, { borderColor: pc.color }]}>
                        <MaterialCommunityIcons name={pc.icon as any} size={13} color={pc.color} />
                        <Text style={[styles.priorityPillText, { color: pc.color }]}>{pc.label}</Text>
                    </View>
                </View>

                {/* Escalation alert banner */}
                {Number(wo.escalationLevel) > 0 && (
                    <View style={styles.escalationBanner}>
                        <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={18} color="#7C3AED" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.escalationTitle}>Escalated — Level {wo.escalationLevel}</Text>
                            {wo.escalationNote ? (
                                <Text style={styles.escalationNote} numberOfLines={2}>{wo.escalationNote}</Text>
                            ) : null}
                        </View>
                        {wo.expectedCompletionAt && new Date(wo.expectedCompletionAt) < new Date() ? (
                            <View style={styles.overduePill}>
                                <Text style={styles.overduePillText}>OVERDUE</Text>
                            </View>
                        ) : wo.cutoffStatus === 'at_risk' ? (
                            <View style={[styles.overduePill, { backgroundColor: '#FFF7ED' }]}>
                                <Text style={[styles.overduePillText, { color: '#C2410C' }]}>AT RISK</Text>
                            </View>
                        ) : null}
                    </View>
                )}

                {/* Issue description card */}
                <View style={styles.card}>
                    <Text style={styles.cardSectionLabel}>ISSUE DESCRIPTION</Text>
                    <Text style={styles.issueText}>{wo.issueDescription || '—'}</Text>
                </View>

                {/* Details card */}
                <View style={styles.card}>
                    <Text style={styles.cardSectionLabel}>DETAILS</Text>

                    <DetailRow icon="barcode" label="WO Number" value={wo.workOrderNumber || `WO-${wo.id}`} />
                    {wo.assetName ? <DetailRow icon="cog-outline" label="Asset" value={wo.assetName} /> : null}
                    {wo.location ? <DetailRow icon="map-marker-outline" label="Location" value={wo.location} /> : null}
                    <DetailRow icon="source-branch" label="Source" value={wo.issueSource === 'flag' ? 'Flag / Alert' : wo.issueSource === 'logsheet' ? 'Logsheet' : 'Manual'} />
                    <DetailRow icon="calendar-plus" label="Created" value={formatDate(wo.createdAt)} />
                    {wo.createdByName ? <DetailRow icon="account-outline" label="Created By" value={wo.createdByName} /> : null}
                    {wo.expectedCompletionAt ? (
                        <>
                            <DetailRow
                                icon="clock-alert-outline"
                                label="Deadline"
                                value={formatDate(wo.expectedCompletionAt)}
                            />
                            {wo.cutoffStatus === 'overdue' && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 }}>
                                    <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#991B1B' }}>⏰ OVERDUE</Text>
                                    </View>
                                </View>
                            )}
                            {wo.cutoffStatus === 'at_risk' && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 }}>
                                    <View style={{ backgroundColor: '#FFEDD5', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#9A3412' }}>⚠ Due Soon</Text>
                                    </View>
                                </View>
                            )}
                        </>
                    ) : null}
                    {wo.closedAt ? <DetailRow icon="calendar-check" label="Closed" value={formatDate(wo.closedAt)} /> : null}
                </View>

                {/* Assigned To card */}
                <View style={styles.card}>
                    <Text style={styles.cardSectionLabel}>ASSIGNMENT</Text>
                    {wo.assignedToName ? (
                        <>
                            <DetailRow icon="account-hard-hat-outline" label="Assigned To" value={wo.assignedToName} />
                            {wo.assignedToRole ? <DetailRow icon="badge-account-outline" label="Role" value={String(wo.assignedToRole).replace(/_/g, ' ')} /> : null}
                        </>
                    ) : (
                        <Text style={styles.unassignedText}>Not yet assigned to anyone</Text>
                    )}
                    {wo.assignedNote ? (
                        <View style={styles.noteBox}>
                            <MaterialCommunityIcons name="note-text-outline" size={15} color="#64748B" />
                            <Text style={styles.noteText}>{wo.assignedNote}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Status Timeline */}
                {wo.history && wo.history.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardSectionLabel}>STATUS TIMELINE</Text>
                        {wo.history.map((h: any, idx: number) => {                            const hsc = STATUS_CFG[(h.status as WOStatus)] || STATUS_CFG.open;
                            const isLast = idx === wo.history.length - 1;
                            return (
                                <View key={h.id} style={styles.timelineRow}>
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.timelineDot, { backgroundColor: hsc.color }]} />
                                        {!isLast && <View style={styles.timelineLine} />}
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.timelineHeader}>
                                            <View style={[styles.timelineStatusBadge, { backgroundColor: hsc.bg }]}>
                                                <Text style={[styles.timelineStatusText, { color: hsc.color }]}>{hsc.label}</Text>
                                            </View>
                                            {h.updatedByName ? (
                                                <Text style={styles.timelineBy}>by {h.updatedByName}</Text>
                                            ) : null}
                                        </View>
                                        {h.remarks ? <Text style={styles.timelineRemark}>{h.remarks}</Text> : null}
                                        <Text style={styles.timelineTs}>{formatDate(h.timestamp)}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Escalation History */}
                {wo.escalationHistory && wo.escalationHistory.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardSectionLabel}>ESCALATION HISTORY</Text>
                        {wo.escalationHistory.map((e: any, idx: number) => (
                            <View key={e.id ?? idx} style={[styles.timelineRow, { marginBottom: 8 }]}>
                                <View style={styles.timelineLeft}>
                                    <View style={[styles.timelineDot, { backgroundColor: '#7C3AED' }]} />
                                    {idx < wo.escalationHistory.length - 1 && <View style={styles.timelineLine} />}
                                </View>
                                <View style={styles.timelineContent}>
                                    <View style={styles.timelineHeader}>
                                        <View style={[styles.timelineStatusBadge, { backgroundColor: '#F5F3FF' }]}>
                                            <Text style={[styles.timelineStatusText, { color: '#7C3AED' }]}>
                                                ⏫ LEVEL {e.escalationLevel}
                                            </Text>
                                        </View>
                                    </View>
                                    {e.previousAssigneeName || e.newAssigneeName ? (
                                        <Text style={styles.timelineRemark}>
                                            {e.previousAssigneeName ? `${e.previousAssigneeName} → ` : ''}{e.newAssigneeName || 'No new assignee'}
                                        </Text>
                                    ) : null}
                                    <Text style={styles.timelineTs}>{formatDate(e.escalatedAt)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Change Status FAB */}
            {canChangeStatus && (
                <View style={styles.fabWrap}>
                    <TouchableOpacity style={styles.fab} onPress={openStatusModal} activeOpacity={0.85}>
                        <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.fabText}>Change Status</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Status Update Modal */}
            <Modal visible={showStatusModal} transparent animationType="slide" onRequestClose={() => setShowStatusModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        {/* Modal header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Update Work Order Status</Text>
                            <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle} numberOfLines={2}>{wo.issueDescription || wo.workOrderNumber}</Text>

                        {/* Status options */}
                        <Text style={styles.modalSectionLabel}>SELECT STATUS</Text>
                        {STATUS_ORDER.map((s) => {
                            const cfg = STATUS_CFG[s];
                            const isActive = selectedStatus === s;
                            return (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.statusOption, isActive && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
                                    onPress={() => setSelectedStatus(s)}
                                >
                                    <MaterialCommunityIcons name={cfg.icon as any} size={20} color={isActive ? cfg.color : '#94A3B8'} />
                                    <Text style={[styles.statusOptionText, isActive && { color: cfg.color }]}>{cfg.label}</Text>
                                    {isActive && <MaterialCommunityIcons name="check-circle" size={20} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                                </TouchableOpacity>
                            );
                        })}

                        {/* Remark input */}
                        <Text style={styles.modalSectionLabel}>ADD A REMARK (OPTIONAL)</Text>
                        <TextInput
                            style={styles.remarkInput}
                            placeholder="Describe what was done or why status changed..."
                            placeholderTextColor="#94A3B8"
                            value={remark}
                            onChangeText={setRemark}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />

                        {/* Confirm button */}
                        <TouchableOpacity
                            style={[styles.confirmBtn, isUpdating && styles.confirmBtnDisabled]}
                            onPress={handleStatusUpdate}
                            disabled={isUpdating || selectedStatus === wo.status}
                            activeOpacity={0.85}
                        >
                            {isUpdating ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                                    <Text style={styles.confirmBtnText}>
                                        {selectedStatus === wo.status ? 'No Change' : `Update to ${STATUS_CFG[selectedStatus].label}`}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={styles.detailRow}>
            <MaterialCommunityIcons name={icon as any} size={16} color="#94A3B8" style={styles.detailIcon} />
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 36 : 12,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
        gap: 8,
    },
    headerBtn: { width: 36, padding: 4 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1E293B' },

    scroll: { padding: 16, paddingBottom: 40 },

    // Status banner
    statusBanner: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 14, padding: 16, marginBottom: 12,
        gap: 10,
    },
    statusBannerText: { fontSize: 15, fontWeight: '800', flex: 1 },
    priorityPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
        borderWidth: 1.5, backgroundColor: '#FFFFFF',
    },
    priorityPillText: { fontSize: 11, fontWeight: '700' },

    // Cards
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 14,
        padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    cardSectionLabel: {
        fontSize: 11, fontWeight: '700', color: '#94A3B8',
        letterSpacing: 0.8, marginBottom: 12,
    },
    issueText: { fontSize: 16, color: '#1E293B', fontWeight: '600', lineHeight: 24 },

    // Detail rows
    detailRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
    },
    detailIcon: { marginRight: 8, marginTop: 2, flexShrink: 0 },
    detailLabel: { width: 100, fontSize: 13, color: '#94A3B8', fontWeight: '600', marginRight: 8 },
    detailValue: { flex: 1, fontSize: 13, color: '#1E293B', fontWeight: '500' },

    // Assignment
    unassignedText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
    noteBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginTop: 10,
    },
    noteText: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 20 },

    // Timeline
    timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    timelineLeft: { alignItems: 'center', width: 16 },
    timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    timelineLine: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginTop: 4, minHeight: 20 },
    timelineContent: { flex: 1, paddingBottom: 18 },
    timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    timelineStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    timelineStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
    timelineBy: { fontSize: 12, color: '#94A3B8' },
    timelineRemark: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 3 },
    timelineTs: { fontSize: 11, color: '#94A3B8' },

    // FAB
    fabWrap: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        paddingTop: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1, borderTopColor: '#F1F5F9',
    },
    fab: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#2563EB', borderRadius: 14,
        paddingVertical: 15, gap: 10,
        shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    },
    fabText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 20, paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    modalSubtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
    modalSectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

    statusOption: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    statusOptionText: { fontSize: 14, fontWeight: '600', color: '#64748B' },

    remarkInput: {
        borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: '#1E293B', minHeight: 80,
        marginBottom: 16,
    },

    confirmBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#2563EB', borderRadius: 14,
        paddingVertical: 15, gap: 8,
    },
    confirmBtnDisabled: { backgroundColor: '#93C5FD' },
    confirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

    // Error
    errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

    // Escalation banner
    escalationBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, marginBottom: 12,
        borderWidth: 1, borderColor: '#DDD6FE',
    },
    escalationTitle: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
    escalationNote: { fontSize: 12, color: '#6D28D9', marginTop: 2, lineHeight: 17 },
    overduePill: {
        backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6, borderWidth: 1, borderColor: '#FECACA',
    },
    overduePillText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
});
