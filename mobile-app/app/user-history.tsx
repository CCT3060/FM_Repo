import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { getMySubmissionHistory, getWorkOrders, type SubmissionHistoryItem } from '../utils/api';
import { TechBottomNav } from './tech-dashboard';

type HistoryFilter = 'all' | 'checklist' | 'logsheet' | 'workorder';

type WorkOrderHistoryItem = {
    id: number;
    workOrderNumber?: string;
    issueDescription?: string;
    assetName?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
};

export default function UserHistoryScreen() {
    const [submissions, setSubmissions] = useState<SubmissionHistoryItem[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrderHistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');

    const loadData = useCallback(async () => {
        setError(null);
        try {
            const [mySubmissions, myWorkOrders] = await Promise.all([
                getMySubmissionHistory(120),
                getWorkOrders(120, true),
            ]);

            setSubmissions(mySubmissions);
            setWorkOrders(myWorkOrders as WorkOrderHistoryItem[]);
        } catch (e: any) {
            setError(e?.message || 'Failed to load history');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const mergedItems = useMemo(() => {
        const submissionRows = submissions.map(item => ({
            key: `submission-${item.type}-${item.id}`,
            kind: item.type as 'checklist' | 'logsheet',
            id: item.id,
            title: item.templateName || 'Submission',
            subtitle: item.assetName ? `Asset: ${item.assetName}` : 'No asset linked',
            status: item.status || 'submitted',
            date: item.submittedAt,
            onPress: () =>
                router.push({
                    pathname: '/tech-history-detail',
                    params: { type: item.type, id: String(item.id), name: item.templateName || 'Submission' },
                } as any),
        }));

        const workOrderRows = workOrders.map(wo => ({
            key: `workorder-${wo.id}`,
            kind: 'workorder' as const,
            id: wo.id,
            title: wo.workOrderNumber || `WO-${wo.id}`,
            subtitle: wo.assetName || wo.issueDescription || 'Work order',
            status: wo.status || 'open',
            date: wo.updatedAt || wo.createdAt || '',
            onPress: () =>
                router.push({
                    pathname: '/work-order-details',
                    params: { id: String(wo.id) },
                } as any),
        }));

        const combined = [...submissionRows, ...workOrderRows];
        combined.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        return combined;
    }, [submissions, workOrders]);

    const filteredItems = useMemo(() => {
        if (activeFilter === 'all') return mergedItems;
        return mergedItems.filter(item => item.kind === activeFilter);
    }, [activeFilter, mergedItems]);

    const countByType = useMemo(() => {
        return {
            all: mergedItems.length,
            checklist: mergedItems.filter(i => i.kind === 'checklist').length,
            logsheet: mergedItems.filter(i => i.kind === 'logsheet').length,
            workorder: mergedItems.filter(i => i.kind === 'workorder').length,
        };
    }, [mergedItems]);

    const getBadgeColor = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'completed' || s === 'closed') return { bg: '#DCFCE7', text: '#166534' };
        if (s === 'in_progress' || s === 'in progress') return { bg: '#DBEAFE', text: '#1D4ED8' };
        if (s === 'open') return { bg: '#FEF3C7', text: '#92400E' };
        return { bg: '#F1F5F9', text: '#475569' };
    };

    const getIcon = (kind: 'checklist' | 'logsheet' | 'workorder') => {
        if (kind === 'checklist') return { name: 'clipboard-check-outline' as const, color: '#7C3AED', bg: '#F3E8FF' };
        if (kind === 'logsheet') return { name: 'notebook-outline' as const, color: '#2563EB', bg: '#EFF6FF' };
        return { name: 'wrench-clock-outline' as const, color: '#0F766E', bg: '#ECFEFF' };
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>My History</Text>
                    <Text style={styles.headerSub}>Only your logsheets, checklists, and work orders</Text>
                </View>
                <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{countByType.all}</Text>
                </View>
            </View>

            <View style={styles.filterRow}>
                {([
                    ['all', 'All'],
                    ['checklist', 'Checklist'],
                    ['logsheet', 'Logsheet'],
                    ['workorder', 'W.O.'],
                ] as [HistoryFilter, string][]).map(([key, label]) => (
                    <TouchableOpacity
                        key={key}
                        style={[styles.filterBtn, activeFilter === key && styles.filterBtnActive]}
                        onPress={() => setActiveFilter(key)}
                    >
                        <Text style={[styles.filterText, activeFilter === key && styles.filterTextActive]}>
                            {label} ({countByType[key]})
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.centerText}>Loading your history...</Text>
                </View>
            ) : error ? (
                <View style={styles.centerBox}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />}
                >
                    <View style={styles.content}>
                        {filteredItems.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <MaterialCommunityIcons name="history" size={52} color="#CBD5E1" />
                                <Text style={styles.emptyTitle}>No records yet</Text>
                                <Text style={styles.emptyText}>Your completed or assigned activity will appear here.</Text>
                            </View>
                        ) : (
                            filteredItems.map((item, idx) => {
                                const icon = getIcon(item.kind);
                                const badge = getBadgeColor(item.status);

                                return (
                                    <Animated.View key={item.key} entering={FadeInUp.delay(35 * idx).duration(280)}>
                                        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={item.onPress}>
                                            <View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
                                                <MaterialCommunityIcons name={icon.name} size={20} color={icon.color} />
                                            </View>

                                            <View style={styles.cardBody}>
                                                <View style={styles.cardTop}>
                                                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                                                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                                                        <Text style={[styles.badgeText, { color: badge.text }]}>
                                                            {item.status.replace('_', ' ').toUpperCase()}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.cardSub} numberOfLines={1}>{item.subtitle}</Text>
                                                <View style={styles.cardMetaRow}>
                                                    <Text style={styles.cardType}>{item.kind === 'workorder' ? 'WORK ORDER' : item.kind.toUpperCase()}</Text>
                                                    <Text style={styles.cardDate}>
                                                        {item.date ? new Date(item.date).toLocaleString() : 'No date'}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                );
                            })
                        )}
                        <View style={{ height: 20 }} />
                    </View>
                </ScrollView>
            )}

            <TechBottomNav activeRoute="history" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
    headerSub: { marginTop: 2, fontSize: 12.5, color: '#64748B' },
    countPill: {
        minWidth: 36,
        height: 32,
        borderRadius: 16,
        paddingHorizontal: 10,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    countPillText: { fontSize: 13, fontWeight: '800', color: '#334155' },

    filterRow: {
        marginHorizontal: 12,
        marginBottom: 10,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 4,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    filterBtn: {
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        backgroundColor: 'transparent',
    },
    filterBtnActive: { backgroundColor: '#FFFFFF' },
    filterText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    filterTextActive: { color: '#0F172A', fontWeight: '800' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    centerText: { marginTop: 10, color: '#64748B', fontSize: 14 },
    errorText: { marginTop: 10, fontSize: 14, color: '#B91C1C', textAlign: 'center' },
    retryBtn: {
        marginTop: 14,
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 10,
    },
    retryText: { color: '#FFFFFF', fontWeight: '700' },

    scroll: { flex: 1 },
    content: { paddingHorizontal: 12 },
    emptyBox: {
        marginTop: 20,
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        paddingVertical: 32,
        paddingHorizontal: 20,
    },
    emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '700', color: '#0F172A' },
    emptyText: { marginTop: 4, fontSize: 13, color: '#64748B', textAlign: 'center' },

    card: {
        marginBottom: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
        flexDirection: 'row',
        gap: 10,
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    cardBody: { flex: 1 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 10.5, fontWeight: '800' },
    cardSub: { marginTop: 4, fontSize: 12.5, color: '#64748B' },
    cardMetaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardType: { fontSize: 11, fontWeight: '800', color: '#475569' },
    cardDate: { fontSize: 11.5, color: '#94A3B8' },
});
