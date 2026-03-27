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
import { useResponsiveMetrics } from '../utils/responsive';

type WOStatus = 'open' | 'in_progress' | 'completed' | 'closed';

const STATUS_CFG: Record<WOStatus, { label: string; bg: string; color: string; icon: string }> = {
    open: { label: 'OPEN', bg: '#F1F5F9', color: '#475569', icon: 'clock-outline' },
    in_progress: { label: 'IN PROGRESS', bg: '#FFF7ED', color: '#C2410C', icon: 'progress-clock' },
    completed: { label: 'COMPLETED', bg: '#DCFCE7', color: '#15803D', icon: 'check-circle-outline' },
    closed: { label: 'CLOSED', bg: '#F0F9FF', color: '#0369A1', icon: 'lock-check-outline' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; icon: string }> = {
    low: { label: 'Low Priority', color: '#94A3B8', icon: 'arrow-down-circle-outline' },
    medium: { label: 'Medium Priority', color: '#64748B', icon: 'format-list-bulleted' },
    high: { label: 'High Priority', color: '#DC2626', icon: 'alert' },
    critical: { label: 'Critical Priority', color: '#DC2626', icon: 'alert-octagon' },
};

const STATUS_ORDER: WOStatus[] = ['open', 'in_progress', 'completed', 'closed'];

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={styles.detailRow}>
            <MaterialCommunityIcons name={icon as any} size={16} color="#94A3B8" style={styles.detailIcon} />
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
        </View>
    );
}

export default function WorkOrderDetailsScreen() {
    const metrics = useResponsiveMetrics();
    const params = useLocalSearchParams<{ id: string }>();
    const [workOrder, setWorkOrder] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState<WOStatus>('open');
    const [remark, setRemark] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        void loadData();
    }, [params.id]);

    const loadData = async () => {
        try {
            setError(null);
            const data = await getWorkOrderById(params.id);
            setWorkOrder(data);
            setSelectedStatus((data.status as WOStatus) || 'open');
        } catch (err: any) {
            setError(err.message || 'Failed to load work order');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        void loadData();
    };

    const openStatusModal = () => {
        setSelectedStatus((workOrder?.status as WOStatus) || 'open');
        setRemark('');
        setShowStatusModal(true);
    };

    const handleStatusUpdate = async () => {
        if (!workOrder) return;
        const nextRemark = remark.trim() || undefined;
        setIsUpdating(true);
        try {
            await updateWorkOrderStatus(workOrder.id, selectedStatus, nextRemark);
            setWorkOrder((prev: any) => prev ? { ...prev, status: selectedStatus, latestOfflineRemark: nextRemark } : prev);
            setShowStatusModal(false);
            Alert.alert('Updated', `Work order status changed to ${STATUS_CFG[selectedStatus].label}`);
            void loadData();
        } catch (err: any) {
            if (err?.queued) {
                setWorkOrder((prev: any) => prev ? { ...prev, status: selectedStatus, latestOfflineRemark: nextRemark } : prev);
                setShowStatusModal(false);
                Alert.alert('Saved Offline', 'Work order status was saved on this device and will sync automatically when internet is back.');
            } else {
                Alert.alert('Error', err.message || 'Failed to update status');
            }
        } finally {
            setIsUpdating(false);
        }
    };

    const formatDate = (value?: string | null) => {
        if (!value) return '—';
        return new Date(value).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const headerDynamic = {
        paddingHorizontal: metrics.horizontalPadding,
        paddingTop: Platform.OS === 'android' ? (metrics.isTablet ? 40 : 48) : 20,
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#0F5FDB" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !workOrder) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.header, headerDynamic]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { fontSize: metrics.fluid(17, 18, 21) }]}>Work Order</Text>
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

    const statusConfig = STATUS_CFG[(workOrder.status as WOStatus)] || STATUS_CFG.open;
    const priorityConfig = PRIORITY_CFG[workOrder.priority] || PRIORITY_CFG.medium;
    const canChangeStatus = workOrder.status !== 'closed';

    return (
        <SafeAreaView style={styles.container}>
            <View style={[styles.header, headerDynamic]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { fontSize: metrics.fluid(17, 18, 21) }]} numberOfLines={1}>
                    {workOrder.workOrderNumber || `WO-${workOrder.id}`}
                </Text>
                <View style={styles.headerBtn} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scroll, { paddingHorizontal: metrics.horizontalPadding }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0F5FDB']} />}
            >
                <View style={[styles.contentWrap, { maxWidth: metrics.contentMaxWidth }]}>
                    <View style={[styles.statusBanner, { backgroundColor: statusConfig.bg }]}>
                        <MaterialCommunityIcons name={statusConfig.icon as any} size={22} color={statusConfig.color} />
                        <Text style={[styles.statusBannerText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                        <View style={[styles.priorityPill, { borderColor: priorityConfig.color }] }>
                            <MaterialCommunityIcons name={priorityConfig.icon as any} size={13} color={priorityConfig.color} />
                            <Text style={[styles.priorityPillText, { color: priorityConfig.color }]}>{priorityConfig.label}</Text>
                        </View>
                    </View>

                    {Number(workOrder.escalationLevel) > 0 && (
                        <View style={styles.escalationBanner}>
                            <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={18} color="#7C3AED" />
                            <View style={styles.flexOne}>
                                <Text style={styles.escalationTitle}>Escalated - Level {workOrder.escalationLevel}</Text>
                                {workOrder.escalationNote ? <Text style={styles.escalationNote} numberOfLines={2}>{workOrder.escalationNote}</Text> : null}
                            </View>
                            {workOrder.expectedCompletionAt && new Date(workOrder.expectedCompletionAt) < new Date() ? (
                                <View style={styles.overduePill}><Text style={styles.overduePillText}>OVERDUE</Text></View>
                            ) : workOrder.cutoffStatus === 'at_risk' ? (
                                <View style={[styles.overduePill, styles.atRiskPill]}><Text style={[styles.overduePillText, styles.atRiskText]}>AT RISK</Text></View>
                            ) : null}
                        </View>
                    )}

                    <View style={styles.card}>
                        <Text style={styles.cardSectionLabel}>ISSUE DESCRIPTION</Text>
                        <Text style={styles.issueText}>{workOrder.issueDescription || '—'}</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardSectionLabel}>DETAILS</Text>
                        <DetailRow icon="barcode" label="WO Number" value={workOrder.workOrderNumber || `WO-${workOrder.id}`} />
                        {workOrder.assetName ? <DetailRow icon="cog-outline" label="Asset" value={workOrder.assetName} /> : null}
                        {workOrder.location ? <DetailRow icon="map-marker-outline" label="Location" value={workOrder.location} /> : null}
                        <DetailRow icon="source-branch" label="Source" value={workOrder.issueSource === 'flag' ? 'Flag / Alert' : workOrder.issueSource === 'logsheet' ? 'Logsheet' : 'Manual'} />
                        <DetailRow icon="calendar-plus" label="Created" value={formatDate(workOrder.createdAt)} />
                        {workOrder.createdByName ? <DetailRow icon="account-outline" label="Created By" value={workOrder.createdByName} /> : null}
                        {workOrder.expectedCompletionAt ? <DetailRow icon="clock-alert-outline" label="Deadline" value={formatDate(workOrder.expectedCompletionAt)} /> : null}
                        {workOrder.closedAt ? <DetailRow icon="calendar-check" label="Closed" value={formatDate(workOrder.closedAt)} /> : null}
                        {workOrder.latestOfflineRemark ? (
                            <View style={styles.noteBox}>
                                <MaterialCommunityIcons name="cloud-upload-outline" size={15} color="#0F5FDB" />
                                <Text style={[styles.noteText, styles.pendingSyncText]}>Pending sync remark: {workOrder.latestOfflineRemark}</Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardSectionLabel}>ASSIGNMENT</Text>
                        {workOrder.assignedToName ? (
                            <>
                                <DetailRow icon="account-hard-hat-outline" label="Assigned To" value={workOrder.assignedToName} />
                                {workOrder.assignedToRole ? <DetailRow icon="badge-account-outline" label="Role" value={String(workOrder.assignedToRole).replace(/_/g, ' ')} /> : null}
                            </>
                        ) : (
                            <Text style={styles.unassignedText}>Not yet assigned to anyone</Text>
                        )}
                        {workOrder.assignedNote ? (
                            <View style={styles.noteBox}>
                                <MaterialCommunityIcons name="note-text-outline" size={15} color="#64748B" />
                                <Text style={styles.noteText}>{workOrder.assignedNote}</Text>
                            </View>
                        ) : null}
                    </View>

                    {Array.isArray(workOrder.history) && workOrder.history.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.cardSectionLabel}>STATUS TIMELINE</Text>
                            {workOrder.history.map((item: any, index: number) => {
                                const historyStatus = STATUS_CFG[(item.status as WOStatus)] || STATUS_CFG.open;
                                const isLast = index === workOrder.history.length - 1;
                                return (
                                    <View key={item.id ?? index} style={styles.timelineRow}>
                                        <View style={styles.timelineLeft}>
                                            <View style={[styles.timelineDot, { backgroundColor: historyStatus.color }]} />
                                            {!isLast && <View style={styles.timelineLine} />}
                                        </View>
                                        <View style={styles.timelineContent}>
                                            <View style={styles.timelineHeader}>
                                                <View style={[styles.timelineStatusBadge, { backgroundColor: historyStatus.bg }]}>
                                                    <Text style={[styles.timelineStatusText, { color: historyStatus.color }]}>{historyStatus.label}</Text>
                                                </View>
                                                {item.updatedByName ? <Text style={styles.timelineBy}>by {item.updatedByName}</Text> : null}
                                            </View>
                                            {item.remarks ? <Text style={styles.timelineRemark}>{item.remarks}</Text> : null}
                                            <Text style={styles.timelineTs}>{formatDate(item.timestamp)}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {Array.isArray(workOrder.escalationHistory) && workOrder.escalationHistory.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.cardSectionLabel}>ESCALATION HISTORY</Text>
                            {workOrder.escalationHistory.map((item: any, index: number) => (
                                <View key={item.id ?? index} style={[styles.timelineRow, styles.escalationRow]}>
                                    <View style={styles.timelineLeft}>
                                        <View style={[styles.timelineDot, styles.escalationDot]} />
                                        {index < workOrder.escalationHistory.length - 1 && <View style={styles.timelineLine} />}
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.timelineHeader}>
                                            <View style={[styles.timelineStatusBadge, styles.escalationBadge]}>
                                                <Text style={[styles.timelineStatusText, styles.escalationBadgeText]}>LEVEL {item.escalationLevel}</Text>
                                            </View>
                                        </View>
                                        {item.previousAssigneeName || item.newAssigneeName ? (
                                            <Text style={styles.timelineRemark}>{item.previousAssigneeName ? `${item.previousAssigneeName} -> ` : ''}{item.newAssigneeName || 'No new assignee'}</Text>
                                        ) : null}
                                        <Text style={styles.timelineTs}>{formatDate(item.escalatedAt)}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    <View style={styles.bottomSpace} />
                </View>
            </ScrollView>

            {canChangeStatus && (
                <View style={[styles.fabWrap, { paddingHorizontal: metrics.horizontalPadding }] }>
                    <View style={[styles.contentWrap, { maxWidth: metrics.contentMaxWidth }]}>
                        <TouchableOpacity style={styles.fab} onPress={openStatusModal} activeOpacity={0.85}>
                            <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#FFFFFF" />
                            <Text style={styles.fabText}>Change Status</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <Modal visible={showStatusModal} transparent animationType="slide" onRequestClose={() => setShowStatusModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Update Work Order Status</Text>
                            <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle} numberOfLines={2}>{workOrder.issueDescription || workOrder.workOrderNumber}</Text>
                        <Text style={styles.modalSectionLabel}>SELECT STATUS</Text>
                        {STATUS_ORDER.map((status) => {
                            const cfg = STATUS_CFG[status];
                            const isActive = selectedStatus === status;
                            return (
                                <TouchableOpacity
                                    key={status}
                                    style={[styles.statusOption, isActive && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
                                    onPress={() => setSelectedStatus(status)}
                                >
                                    <MaterialCommunityIcons name={cfg.icon as any} size={20} color={isActive ? cfg.color : '#94A3B8'} />
                                    <Text style={[styles.statusOptionText, isActive && { color: cfg.color }]}>{cfg.label}</Text>
                                    {isActive && <MaterialCommunityIcons name="check-circle" size={20} color={cfg.color} style={styles.modalCheck} />}
                                </TouchableOpacity>
                            );
                        })}
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
                        <TouchableOpacity
                            style={[styles.confirmBtn, (isUpdating || selectedStatus === workOrder.status) && styles.confirmBtnDisabled]}
                            onPress={handleStatusUpdate}
                            disabled={isUpdating || selectedStatus === workOrder.status}
                            activeOpacity={0.85}
                        >
                            {isUpdating ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                                    <Text style={styles.confirmBtnText}>{selectedStatus === workOrder.status ? 'No Change' : `Update to ${STATUS_CFG[selectedStatus].label}`}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    scrollView: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    contentWrap: { width: '100%', alignSelf: 'center' },
    flexOne: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 14,
        backgroundColor: '#F4F7FB',
    },
    headerBtn: { width: 36, padding: 4 },
    headerTitle: { flex: 1, textAlign: 'center', fontWeight: '800', color: '#1E293B' },
    scroll: { paddingBottom: 40 },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
    },
    statusBannerText: { fontSize: 15, fontWeight: '800', flex: 1 },
    priorityPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1.5,
        backgroundColor: '#FFFFFF',
    },
    priorityPillText: { fontSize: 11, fontWeight: '700' },
    escalationBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F5F3FF',
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    escalationTitle: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
    escalationNote: { fontSize: 12, color: '#6D28D9', marginTop: 2, lineHeight: 17 },
    overduePill: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
    overduePillText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
    atRiskPill: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
    atRiskText: { color: '#C2410C' },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E7EDF5',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    cardSectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 12 },
    issueText: { fontSize: 16, color: '#1E293B', fontWeight: '600', lineHeight: 24 },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    detailIcon: { marginRight: 8, marginTop: 2, flexShrink: 0 },
    detailLabel: { width: 100, fontSize: 13, color: '#94A3B8', fontWeight: '600', marginRight: 8 },
    detailValue: { flex: 1, fontSize: 13, color: '#1E293B', fontWeight: '500' },
    unassignedText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
    noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 10 },
    noteText: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 20 },
    pendingSyncText: { color: '#0F5FDB' },
    timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    escalationRow: { marginBottom: 8 },
    timelineLeft: { alignItems: 'center', width: 16 },
    timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    escalationDot: { backgroundColor: '#7C3AED' },
    timelineLine: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginTop: 4, minHeight: 20 },
    timelineContent: { flex: 1, paddingBottom: 18 },
    timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    timelineStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    escalationBadge: { backgroundColor: '#F5F3FF' },
    timelineStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
    escalationBadgeText: { color: '#7C3AED' },
    timelineBy: { fontSize: 12, color: '#94A3B8' },
    timelineRemark: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 3 },
    timelineTs: { fontSize: 11, color: '#94A3B8' },
    bottomSpace: { height: 100 },
    fabWrap: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        paddingTop: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E7EDF5',
    },
    fab: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#0F5FDB',
        borderRadius: 16,
        paddingVertical: 15,
        shadowColor: '#0F5FDB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    fabText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    modalSubtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
    modalSectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
    statusOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
    },
    statusOptionText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
    modalCheck: { marginLeft: 'auto' },
    remarkInput: {
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: '#1E293B',
        minHeight: 80,
        marginBottom: 16,
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0F5FDB',
        borderRadius: 14,
        paddingVertical: 15,
    },
    confirmBtnDisabled: { backgroundColor: '#93C5FD' },
    confirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#0F5FDB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});