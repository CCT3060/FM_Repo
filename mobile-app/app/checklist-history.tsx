import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { getChecklistSubmissions } from '../utils/api';

interface Submission {
    id: number;
    submittedAt: string | null;
    templateName: string;
    templateId: number;
    assetName: string | null;
    assetId: number | null;
    status: string | null;
    completionPct: number | null;
    submittedBy: string | null;
}

interface DayGroup {
    label: string;
    isoDate: string;
    items: Submission[];
}

function formatDayLabel(isoDate: string): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (isoDate === fmt(today)) return 'Today';
    if (isoDate === fmt(yesterday)) return 'Yesterday';
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
}

function groupByDate(submissions: Submission[]): DayGroup[] {
    const map: Record<string, Submission[]> = {};
    for (const s of submissions) {
        const date = s.submittedAt ? s.submittedAt.split('T')[0] : 'unknown';
        if (!map[date]) map[date] = [];
        map[date].push(s);
    }
    return Object.entries(map)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([isoDate, items]) => ({
            label: isoDate === 'unknown' ? 'Date Unknown' : formatDayLabel(isoDate),
            isoDate,
            items,
        }));
}

function statusColor(status: string | null): { bg: string; text: string; label: string } {
    switch ((status || '').toLowerCase()) {
        case 'completed': return { bg: '#C6F6D5', text: '#276749', label: 'COMPLETED' };
        case 'in_progress':
        case 'in-progress': return { bg: '#FEFCBF', text: '#975A16', label: 'IN PROGRESS' };
        case 'failed': return { bg: '#FED7D7', text: '#C53030', label: 'FAILED' };
        default: return { bg: '#E2E8F0', text: '#4A5568', label: 'SUBMITTED' };
    }
}

export default function ChecklistHistoryScreen() {
    const [groups, setGroups] = useState<DayGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setError(null);
        try {
            const data = await getChecklistSubmissions();
            setGroups(groupByDate(data));
        } catch (e: any) {
            setError(e.message || 'Failed to load history');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };
    const totalCount = groups.reduce((s, g) => s + g.items.length, 0);

    const renderCard = (item: Submission) => {
        const sc = statusColor(item.status);
        const time = item.submittedAt
            ? new Date(item.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : '';
        const pct = item.completionPct != null ? Math.round(item.completionPct) : null;

        return (
            <View style={styles.card} key={item.id}>
                <View style={[styles.cardAccent, { backgroundColor: sc.text }]} />
                <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                        <View style={[styles.iconCircle, { backgroundColor: sc.bg }]}>
                            <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={sc.text} />
                        </View>
                        <View style={styles.cardTitleWrap}>
                            <Text style={styles.cardTitle} numberOfLines={2}>{item.templateName}</Text>
                            {item.assetName ? <Text style={styles.cardSubtitle}>{item.assetName}</Text> : null}
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="account-outline" size={13} color="#718096" />
                            <Text style={styles.metaText}>{item.submittedBy || '—'}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="clock-outline" size={13} color="#718096" />
                            <Text style={styles.metaText}>{time || '—'}</Text>
                        </View>
                        {pct != null && (
                            <View style={styles.metaItem}>
                                <MaterialCommunityIcons name="chart-pie" size={13} color="#718096" />
                                <Text style={styles.metaText}>{pct}%</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Checklist History</Text>
                    <Text style={styles.headerSub}>Submissions grouped by date</Text>
                </View>
                <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{totalCount}</Text>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.centerText}>Loading history…</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E53E3E" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />}
                >
                    {groups.length === 0 ? (
                        <View style={[styles.center, { marginTop: 60 }]}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#CBD5E0" />
                            <Text style={styles.emptyTitle}>No submissions yet</Text>
                            <Text style={styles.emptyText}>Filled checklists will appear here grouped by date</Text>
                        </View>
                    ) : (
                        groups.map((group) => (
                            <View key={group.isoDate}>
                                <View style={styles.dateHeader}>
                                    <MaterialCommunityIcons name="calendar-today" size={14} color="#1E3A8A" />
                                    <Text style={styles.dateHeaderText}>{group.label}</Text>
                                    <View style={styles.dateHeaderLine} />
                                    <View style={styles.dateCountPill}>
                                        <Text style={styles.dateCountText}>{group.items.length}</Text>
                                    </View>
                                </View>
                                {group.items.map(renderCard)}
                            </View>
                        ))
                    )}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7FAFC' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#1E3A8A',
        paddingTop: Platform.OS === 'android' ? 44 : 14,
        gap: 12,
    },
    backBtn: { padding: 4 },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    headerSub: { color: '#93C5FD', fontSize: 12, marginTop: 2 },
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    countBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    scroll: { padding: 16, paddingBottom: 60 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    centerText: { fontSize: 14, color: '#718096', marginTop: 12 },
    errorText: { fontSize: 14, color: '#E53E3E', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#1E3A8A', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 },
    dateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 10,
        gap: 6,
    },
    dateHeaderText: { fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dateCountPill: {
        backgroundColor: '#DBEAFE',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    dateCountText: { fontSize: 11, fontWeight: '700', color: '#1E3A8A' },
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: 14 },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    cardTitleWrap: { flex: 1 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
    cardSubtitle: { fontSize: 12, color: '#718096', marginTop: 3 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
    statusText: { fontSize: 10, fontWeight: '700' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 10 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: '#718096' },
});

