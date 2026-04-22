import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyAssignments, getMyWarnings, authenticatedFetch, type Assignment, type WarningItem } from '../utils/api';

type NotifType = 'task' | 'warning';

interface NotifItem {
    id: string;
    type: NotifType;
    title: string;
    subtitle: string;
    meta: string;
    createdAt?: string;
    raw?: any;
}

async function getInAppNotifications(): Promise<any[]> {
    try {
        const res = await authenticatedFetch('/api/notifications?limit=50');
        if (!res.ok) return [];
        return res.json();
    } catch {
        return [];
    }
}

export default function TechNotificationsScreen() {
    const [items, setItems] = useState<NotifItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'tasks' | 'alerts'>('all');

    const load = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        setError(null);
        try {
            const [assignments, warnings, inApp] = await Promise.allSettled([
                getMyAssignments(),
                getMyWarnings(30),
                getInAppNotifications(),
            ]);

            const notifs: NotifItem[] = [];

            // Task assignment notifications
            if (assignments.status === 'fulfilled') {
                (assignments.value as Assignment[]).forEach((a) => {
                    notifs.push({
                        id: `task-${a.assignmentId}`,
                        type: 'task',
                        title: a.templateName || 'New Task Assigned',
                        subtitle: [a.assetName, a.assetType].filter(Boolean).join(' · ') || 'No asset',
                        meta: a.assignedBy ? `Assigned by ${a.assignedBy}` : 'Assigned to you',
                        createdAt: a.assignedAt,
                        raw: a,
                    });
                });
            }

            // In-app notifications (flag-based)
            if (inApp.status === 'fulfilled') {
                (inApp.value as any[]).forEach((n) => {
                    notifs.push({
                        id: `inapp-${n.id}`,
                        type: 'warning',
                        title: n.title || 'Alert',
                        subtitle: n.assetName ? `Asset: ${n.assetName}` : n.message || '',
                        meta: n.severity ? `${n.severity.toUpperCase()} · ${n.flagStatus || ''}` : '',
                        createdAt: n.createdAt,
                        raw: n,
                    });
                });
            }

            // Warnings (flag items)
            if (warnings.status === 'fulfilled') {
                (warnings.value as WarningItem[]).forEach((w) => {
                    const existing = notifs.find(n => n.id === `inapp-${w.id}`);
                    if (!existing) {
                        notifs.push({
                            id: `warn-${w.id}`,
                            type: 'warning',
                            title: w.description?.slice(0, 60) || 'Warning',
                            subtitle: w.assetName ? `Asset: ${w.assetName}` : '',
                            meta: `${w.severity?.toUpperCase() || ''} · ${w.status || ''}`,
                            createdAt: w.createdAt,
                            raw: w,
                        });
                    }
                });
            }

            // Sort newest first
            notifs.sort((a, b) => {
                if (!a.createdAt && !b.createdAt) return 0;
                if (!a.createdAt) return 1;
                if (!b.createdAt) return -1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            setItems(notifs);
        } catch {
            setError('Could not load notifications. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

    const filtered = items.filter(i => {
        if (filter === 'tasks') return i.type === 'task';
        if (filter === 'alerts') return i.type === 'warning';
        return true;
    });

    const taskCount = items.filter(i => i.type === 'task').length;
    const alertCount = items.filter(i => i.type === 'warning').length;

    const handlePress = (item: NotifItem) => {
        if (item.type === 'task' && item.raw) {
            router.push({
                pathname: '/assignment-form',
                params: {
                    templateType: item.raw.templateType,
                    templateId: String(item.raw.templateId),
                    templateName: item.raw.templateName,
                    assignmentId: String(item.raw.assignmentId),
                    assetId: item.raw.assetId ? String(item.raw.assetId) : '',
                    assetName: item.raw.assetName || '',
                },
            } as any);
        } else if (item.type === 'warning') {
            router.push('/warnings' as any);
        }
    };

    const renderItem = ({ item }: { item: NotifItem }) => {
        const isTask = item.type === 'task';
        const accent = isTask ? '#2563EB' : '#DC2626';
        const bg = isTask ? '#EFF6FF' : '#FEF2F2';
        const iconName = isTask ? 'clipboard-check-outline' : 'alert-circle-outline';

        const timeAgo = item.createdAt ? (() => {
            try {
                const diff = Date.now() - new Date(item.createdAt).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs}h ago`;
                return `${Math.floor(hrs / 24)}d ago`;
            } catch { return ''; }
        })() : '';

        return (
            <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => handlePress(item)}
            >
                <View style={[styles.iconBox, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={iconName as any} size={22} color={accent} />
                </View>
                <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                        <View style={[styles.typePill, { backgroundColor: bg }]}>
                            <Text style={[styles.typePillText, { color: accent }]}>
                                {isTask ? 'TASK' : 'ALERT'}
                            </Text>
                        </View>
                        {timeAgo ? <Text style={styles.timeText}>{timeAgo}</Text> : null}
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    {item.subtitle ? <Text style={styles.cardSub} numberOfLines={1}>{item.subtitle}</Text> : null}
                    {item.meta ? <Text style={styles.cardMeta} numberOfLines={1}>{item.meta}</Text> : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    <Text style={styles.headerSub}>
                        {taskCount} task{taskCount !== 1 ? 's' : ''} · {alertCount} alert{alertCount !== 1 ? 's' : ''}
                    </Text>
                </View>
                <TouchableOpacity onPress={() => load(true)} style={styles.refreshBtn}>
                    <MaterialCommunityIcons name="refresh" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRow}>
                {([
                    { k: 'all',    label: `All (${items.length})` },
                    { k: 'tasks',  label: `Tasks (${taskCount})` },
                    { k: 'alerts', label: `Alerts (${alertCount})` },
                ] as const).map(({ k, label }) => (
                    <TouchableOpacity
                        key={k}
                        style={[styles.filterBtn, filter === k && styles.filterBtnActive]}
                        onPress={() => setFilter(k)}
                    >
                        <Text style={[styles.filterTxt, filter === k && styles.filterTxtActive]}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingTxt}>Loading notifications…</Text>
                </View>
            ) : error ? (
                <View style={styles.centered}>
                    <MaterialCommunityIcons name="wifi-off" size={48} color="#CBD5E1" />
                    <Text style={styles.errorTxt}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                        <Text style={styles.retryTxt}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : filtered.length === 0 ? (
                <View style={styles.centered}>
                    <MaterialCommunityIcons name="bell-off-outline" size={52} color="#CBD5E1" />
                    <Text style={styles.emptyTxt}>No {filter === 'all' ? '' : filter} notifications</Text>
                    <Text style={styles.emptySub}>You're all caught up!</Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={i => i.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        backgroundColor: '#1E3A8A',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    backBtn: { padding: 4 },
    refreshBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    filterRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    filterBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
    },
    filterBtnActive: { backgroundColor: '#2563EB' },
    filterTxt: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    filterTxtActive: { color: '#fff' },
    list: { padding: 16, gap: 10, paddingBottom: 32 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    cardBody: { flex: 1 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    typePill: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    typePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    timeText: { fontSize: 11, color: '#94A3B8', marginLeft: 'auto' },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20 },
    cardSub: { fontSize: 12, color: '#475569', marginTop: 2 },
    cardMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    loadingTxt: { color: '#64748B', fontSize: 14 },
    errorTxt: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
    retryBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyTxt: { color: '#475569', fontSize: 16, fontWeight: '700' },
    emptySub: { color: '#94A3B8', fontSize: 13 },
});
