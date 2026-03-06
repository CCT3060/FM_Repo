import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import { getWorkOrders, getStoredUser } from '../utils/api';
import { TechBottomNav } from './tech-dashboard';

// Status helpers
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    open: { label: 'Open', bg: '#FEF3C7', color: '#D97706', icon: 'alert-circle-outline' },
    in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#2563EB', icon: 'progress-wrench' },
    completed: { label: 'Completed', bg: '#DCFCE7', color: '#16A34A', icon: 'check-circle-outline' },
    closed: { label: 'Closed', bg: '#F1F5F9', color: '#64748B', icon: 'lock-outline' },
    on_hold: { label: 'On Hold', bg: '#FEE2E2', color: '#DC2626', icon: 'pause-circle-outline' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    low: { label: 'Low', color: '#64748B' },
    medium: { label: 'Medium', color: '#D97706' },
    high: { label: 'High', color: '#DC2626' },
    urgent: { label: 'Urgent', color: '#9333EA' },
};

const FILTER_TABS = ['All', 'Open', 'In Progress', 'Completed'];

export default function TechWorkOrdersScreen() {
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState('All');

    const loadWorkOrders = useCallback(async () => {
        try {
            setError(null);
            const data = await getWorkOrders(50, true);
            setWorkOrders(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load work orders');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    React.useEffect(() => {
        loadWorkOrders();
    }, [loadWorkOrders]);

    const onRefresh = () => {
        setRefreshing(true);
        loadWorkOrders();
    };

    const filteredOrders = workOrders.filter(wo => {
        if (activeFilter === 'All') return true;
        if (activeFilter === 'Open') return wo.status === 'open';
        if (activeFilter === 'In Progress') return wo.status === 'in_progress';
        if (activeFilter === 'Completed') return wo.status === 'completed' || wo.status === 'closed';
        return true;
    });

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Work Orders</Text>
                <View style={{ width: 32 }} />
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
                    {FILTER_TABS.map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.filterChip, activeFilter === tab && styles.filterChipActive]}
                            onPress={() => setActiveFilter(tab)}
                        >
                            <Text style={[styles.filterChipText, activeFilter === tab && styles.filterChipTextActive]}>
                                {tab}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                contentContainerStyle={styles.scroll}
            >
                {isLoading ? (
                    <View style={styles.centeredMsg}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading work orders...</Text>
                    </View>
                ) : error ? (
                    <Animated.View entering={FadeInUp.duration(400)} style={styles.centeredMsg}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={loadWorkOrders}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </Animated.View>
                ) : filteredOrders.length === 0 ? (
                    <View style={styles.centeredMsg}>
                        <MaterialCommunityIcons name="clipboard-list-outline" size={56} color="#CBD5E0" />
                        <Text style={styles.emptyText}>No work orders found</Text>
                        <Text style={styles.emptySubText}>
                            {activeFilter === 'All'
                                ? 'Work orders assigned to you will appear here'
                                : `No ${activeFilter.toLowerCase()} work orders`}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.listContainer}>
                        <Text style={styles.countText}>{filteredOrders.length} work order{filteredOrders.length !== 1 ? 's' : ''}</Text>
                        {filteredOrders.map((wo, idx) => {
                            const statusCfg = STATUS_CONFIG[wo.status] || STATUS_CONFIG.open;
                            const priorityCfg = PRIORITY_CONFIG[wo.priority] || PRIORITY_CONFIG.medium;
                            return (
                                <Animated.View key={wo.id ?? idx} entering={FadeInUp.delay(40 * idx).duration(400).springify()}>
                                    <TouchableOpacity
                                        style={styles.woCard}
                                        activeOpacity={0.7}
                                        onPress={() =>
                                            router.push({ pathname: '/work-order-details', params: { id: String(wo.id) } } as any)
                                        }
                                    >
                                        {/* Status stripe */}
                                        <View style={[styles.statusStripe, { backgroundColor: statusCfg.color }]} />

                                        <View style={styles.woContent}>
                                            {/* Top row */}
                                            <View style={styles.woTopRow}>
                                                <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                                                    <MaterialCommunityIcons name={statusCfg.icon as any} size={13} color={statusCfg.color} />
                                                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                                                </View>
                                                <View style={styles.priorityBadge}>
                                                    <View style={[styles.priorityDot, { backgroundColor: priorityCfg.color }]} />
                                                    <Text style={[styles.priorityText, { color: priorityCfg.color }]}>
                                                        {priorityCfg.label}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Title */}
                                            <Text style={styles.woTitle} numberOfLines={2}>
                                                {wo.workOrderNumber || `WO-${wo.id}`}
                                            </Text>

                                            {/* Description */}
                                            {wo.issueDescription ? (
                                                <Text style={styles.woDesc} numberOfLines={2}>{wo.issueDescription}</Text>
                                            ) : null}

                                            {/* Footer */}
                                            <View style={styles.woFooter}>
                                                {wo.assetName ? (
                                                    <View style={styles.metaItem}>
                                                        <MaterialCommunityIcons name="office-building" size={14} color="#64748B" />
                                                        <Text style={styles.metaText}>{wo.assetName}</Text>
                                                    </View>
                                                ) : null}
                                                <View style={styles.metaItem}>
                                                    <MaterialCommunityIcons name="calendar-outline" size={14} color="#64748B" />
                                                    <Text style={styles.metaText}>{formatDate(wo.createdAt || wo.created_at)}</Text>
                                                </View>
                                                <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" style={{ marginLeft: 'auto' as any }} />
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            );
                        })}
                    </View>
                )}
                <View style={{ height: 24 }} />
            </ScrollView>

            <TechBottomNav activeRoute="workorders" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' }, // Light bg matching other screens
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 48 : 20, // Taller header to match Dashboard
        paddingBottom: 16,
        backgroundColor: '#FAF9F6',
    },
    headerBtn: { padding: 4, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

    filterRow: {
        backgroundColor: '#FAF9F6',
        paddingVertical: 12,
    },
    filterContent: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
    filterChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
    },
    filterChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    filterChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    filterChipTextActive: { color: '#FFFFFF' },

    scroll: { padding: 16 },
    listContainer: { gap: 14 },
    countText: { fontSize: 12, color: '#94A3B8', fontWeight: '700', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },

    centeredMsg: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        gap: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        borderStyle: 'dashed',
    },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    loadingText: { fontSize: 15, color: '#64748B', fontWeight: '500', marginTop: 8 },
    errorText: { fontSize: 15, color: '#EF4444', textAlign: 'center', paddingHorizontal: 20 },
    retryBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    emptyText: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 8 },
    emptySubText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 32 },

    woCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        flexDirection: 'row',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    statusStripe: { width: 4 },
    woContent: { flex: 1, padding: 16 },
    woTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    priorityText: { fontSize: 11, fontWeight: '700' },
    woTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6, lineHeight: 22, letterSpacing: -0.2 },
    woDesc: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 12 },
    woFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
});
