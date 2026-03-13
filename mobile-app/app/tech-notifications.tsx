import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getMyWarnings, type WarningItem } from '../utils/api';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    critical: { color: '#991b1b', bg: '#fee2e2', label: 'Critical', icon: 'alert-octagon' },
    high:     { color: '#92400e', bg: '#fef3c7', label: 'High',     icon: 'alert-circle' },
    medium:   { color: '#1e40af', bg: '#dbeafe', label: 'Medium',   icon: 'alert' },
    low:      { color: '#166534', bg: '#dcfce7', label: 'Low',      icon: 'information-outline' },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    open:        { color: '#991b1b', bg: '#fee2e2', label: 'Open' },
    in_progress: { color: '#854d0e', bg: '#fef9c3', label: 'In Progress' },
    resolved:    { color: '#166534', bg: '#dcfce7', label: 'Resolved' },
    closed:      { color: '#475569', bg: '#f1f5f9', label: 'Closed' },
};

function WarningCard({ item }: { item: WarningItem }) {
    const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.medium;
    const sta = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;

    const formattedDate = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <View style={styles.card}>
            {/* Severity stripe */}
            <View style={[styles.cardStripe, { backgroundColor: sev.color }]} />

            <View style={styles.cardBody}>
                {/* Top row: severity badge + status pill + escalated */}
                <View style={styles.cardTopRow}>
                    <View style={[styles.badge, { backgroundColor: sev.bg }]}>
                        <MaterialCommunityIcons name={sev.icon as any} size={12} color={sev.color} />
                        <Text style={[styles.badgeTxt, { color: sev.color }]}>{sev.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sta.bg }]}>
                        <Text style={[styles.badgeTxt, { color: sta.color }]}>{sta.label}</Text>
                    </View>
                    {item.escalated && (
                        <View style={styles.escalatedBadge}>
                            <MaterialCommunityIcons name="arrow-up-bold" size={11} color="#7c3aed" />
                            <Text style={styles.escalatedTxt}>Escalated</Text>
                        </View>
                    )}
                </View>

                {/* Description */}
                <Text style={styles.cardDesc} numberOfLines={3}>
                    {item.description || 'No description provided.'}
                </Text>

                {/* Asset + source + date */}
                <View style={styles.cardMeta}>
                    {item.assetName ? (
                        <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="cog-outline" size={13} color="#94a3b8" />
                            <Text style={styles.metaTxt}>{item.assetName}</Text>
                        </View>
                    ) : null}
                    <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="source-repository" size={13} color="#94a3b8" />
                        <Text style={styles.metaTxt}>{item.source}</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#94a3b8" />
                        <Text style={styles.metaTxt}>{formattedDate}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

export default function TechNotificationsScreen() {
    const [warnings, setWarnings] = useState<WarningItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'open' | 'critical'>('open');
    const prevOpenCount = useRef(0);

    const load = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        setError(null);
        try {
            const data = await getMyWarnings(50);
            // Haptic if new open/critical warnings appeared
            const openCount = data.filter(w => w.status === 'open' || w.status === 'in_progress').length;
            const critCount = data.filter(w => w.severity === 'critical' && w.status === 'open').length;
            if (isRefresh && openCount > prevOpenCount.current) {
                if (critCount > 0) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                }
            }
            prevOpenCount.current = openCount;
            setWarnings(data);
        } catch {
            setError('Could not load warnings. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        load(true);
    }, [load]);

    const filtered = warnings.filter(w => {
        if (filter === 'open') return w.status === 'open' || w.status === 'in_progress';
        if (filter === 'critical') return w.severity === 'critical';
        return true;
    });

    const openCount = warnings.filter(w => w.status === 'open' || w.status === 'in_progress').length;
    const criticalCount = warnings.filter(w => w.severity === 'critical' && w.status === 'open').length;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <Text style={styles.headerSub}>
                            {openCount > 0 ? `${openCount} active warning${openCount > 1 ? 's' : ''}` : 'All clear'}
                        </Text>
                    </View>
                </View>
                {criticalCount > 0 && (
                    <View style={styles.critBadge}>
                        <MaterialCommunityIcons name="alert-octagon" size={14} color="#fff" />
                        <Text style={styles.critBadgeTxt}>{criticalCount} Critical</Text>
                    </View>
                )}
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRow}>
                {([
                    { k: 'open', label: 'Active' },
                    { k: 'critical', label: 'Critical' },
                    { k: 'all', label: 'All' },
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

            {/* Body */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text style={styles.loadingTxt}>Loading warnings…</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="wifi-alert" size={56} color="#cbd5e1" />
                    <Text style={styles.errorTxt}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                        <Text style={styles.retryTxt}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : filtered.length === 0 ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="bell-check-outline" size={72} color="#cbd5e1" />
                    <Text style={styles.emptyTitle}>
                        {filter === 'open' ? 'No Active Warnings' : filter === 'critical' ? 'No Critical Warnings' : 'No Warnings'}
                    </Text>
                    <Text style={styles.emptyTxt}>
                        {filter === 'open'
                            ? 'All systems are operating normally.'
                            : filter === 'critical'
                            ? 'No critical alerts at this time.'
                            : 'No warnings have been raised.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => <WarningCard item={item} />}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1e3a8a',
        paddingHorizontal: 16,
        paddingVertical: 16,
        paddingTop: Platform.OS === 'android' ? 46 : 16,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backBtn: { padding: 4 },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    headerSub: { color: '#93c5fd', fontSize: 12, marginTop: 1 },
    critBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    critBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

    // Filter tabs
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    filterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9' },
    filterBtnActive: { backgroundColor: '#2563eb' },
    filterTxt: { fontSize: 13, fontWeight: '600', color: '#64748b' },
    filterTxtActive: { color: '#fff' },

    // List
    list: { padding: 16, gap: 12, paddingBottom: 40 },

    // Card
    card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    cardStripe: { width: 4 },
    cardBody: { flex: 1, padding: 14 },
    cardTopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeTxt: { fontSize: 11, fontWeight: '700' },
    escalatedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#ede9fe' },
    escalatedTxt: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
    cardDesc: { fontSize: 14, color: '#334155', lineHeight: 20, marginBottom: 10 },
    cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaTxt: { fontSize: 12, color: '#94a3b8' },

    // States
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
    loadingTxt: { fontSize: 14, color: '#94a3b8', marginTop: 8 },
    errorTxt: { fontSize: 14, color: '#dc2626', textAlign: 'center' },
    retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 10 },
    retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#334155', textAlign: 'center' },
    emptyTxt: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});
