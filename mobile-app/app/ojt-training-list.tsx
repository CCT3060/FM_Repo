import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { getMyOjtTrainings } from '../utils/api';

interface OjtTraining {
    id: number;
    title: string;
    description?: string;
    passingPercentage: number;
    assetName?: string;
    moduleCount: number;
    hasTest: number;
    category?: string;
    estimatedDurationMinutes?: number;
    isSequential?: boolean;
    maxAttempts?: number;
    myProgress?: {
        status: string;
        score?: number;
        certificateUrl?: string;
        completedModules?: number[];
        startedAt?: string;
        completedAt?: string;
        dueDate?: string;
        attemptNumber?: number;
        isAssigned?: boolean;
    } | null;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
    safety:      { bg: '#FEE2E2', text: '#991B1B' },
    equipment:   { bg: '#DBEAFE', text: '#1E40AF' },
    compliance:  { bg: '#FEF9C3', text: '#92400E' },
    technical:   { bg: '#EDE9FE', text: '#6D28D9' },
    procedural:  { bg: '#D1FAE5', text: '#065F46' },
    emergency:   { bg: '#FFE4E6', text: '#BE123C' },
    general:     { bg: '#F1F5F9', text: '#475569' },
};

function getCategoryStyle(cat?: string) {
    return CATEGORY_COLORS[cat?.toLowerCase() || 'general'] || CATEGORY_COLORS.general;
}

function formatDuration(mins?: number) {
    if (!mins) return null;
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getStatusInfo(t: OjtTraining) {
    const p = t.myProgress;
    if (!p) return { label: 'Not Started', bg: '#F1F5F9', color: '#64748B', icon: 'play-circle-outline' as const, filter: 'not_started' };
    if (p.status === 'completed') return { label: 'Completed', bg: '#DCFCE7', color: '#16A34A', icon: 'check-circle-outline' as const, filter: 'completed' };
    if (p.status === 'failed') return { label: 'Failed', bg: '#FEE2E2', color: '#DC2626', icon: 'close-circle-outline' as const, filter: 'in_progress' };
    if (p.status === 'not_started') return { label: 'Assigned', bg: '#EDE9FE', color: '#7C3AED', icon: 'clipboard-check-outline' as const, filter: 'assigned' };
    return { label: 'In Progress', bg: '#DBEAFE', color: '#2563EB', icon: 'progress-clock' as const, filter: 'in_progress' };
}

function getProgressPct(t: OjtTraining): number {
    const p = t.myProgress;
    if (!p) return 0;
    if (p.status === 'completed') return 100;
    const completed = Array.isArray(p.completedModules) ? p.completedModules.length : 0;
    const total = Number(t.moduleCount) || 1;
    return Math.round((completed / total) * 100);
}

type FilterKey = 'all' | 'assigned' | 'in_progress' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
];

export default function OjtTrainingListScreen() {
    const [trainings, setTrainings] = useState<OjtTraining[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterKey>('all');

    const load = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        try {
            const data = await getMyOjtTrainings();
            setTrainings(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to load trainings:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = () => { setRefreshing(true); load(true); };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = useMemo(() => {
        if (filter === 'all') return trainings;
        if (filter === 'assigned') return trainings.filter(t => t.myProgress?.status === 'not_started' || t.myProgress?.isAssigned);
        if (filter === 'in_progress') return trainings.filter(t => t.myProgress?.status === 'in_progress' || t.myProgress?.status === 'failed');
        if (filter === 'completed') return trainings.filter(t => t.myProgress?.status === 'completed');
        return trainings;
    }, [trainings, filter]);

    const counts = useMemo(() => ({
        all: trainings.length,
        assigned: trainings.filter(t => t.myProgress?.status === 'not_started' || t.myProgress?.isAssigned).length,
        in_progress: trainings.filter(t => t.myProgress?.status === 'in_progress' || t.myProgress?.status === 'failed').length,
        completed: trainings.filter(t => t.myProgress?.status === 'completed').length,
    }), [trainings]);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Training Programs</Text>
                    <Text style={styles.headerSub}>{trainings.length} available</Text>
                </View>
                <View style={styles.headerIcon}>
                    <MaterialCommunityIcons name="school-outline" size={22} color="#FFFFFF" />
                </View>
            </View>

            {/* Filter Tabs */}
            {!loading && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
                    {FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                            onPress={() => setFilter(f.key)}
                        >
                            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
                                {f.label}
                            </Text>
                            {counts[f.key] > 0 && (
                                <View style={[styles.filterCount, filter === f.key && styles.filterCountActive]}>
                                    <Text style={[styles.filterCountText, filter === f.key && styles.filterCountTextActive]}>
                                        {counts[f.key]}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading trainings...</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                >
                    {filtered.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <MaterialCommunityIcons name="school-outline" size={56} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>
                                {filter === 'all' ? 'No Trainings Available' : `No ${FILTERS.find(f => f.key === filter)?.label} Trainings`}
                            </Text>
                            <Text style={styles.emptyText}>
                                {filter === 'all'
                                    ? 'Published training programs will appear here.'
                                    : 'Try a different filter to see other trainings.'}
                            </Text>
                        </View>
                    ) : filtered.map(t => {
                        const statusInfo = getStatusInfo(t);
                        const pct = getProgressPct(t);
                        const completedMods = Array.isArray(t.myProgress?.completedModules) ? t.myProgress!.completedModules.length : 0;
                        const catStyle = getCategoryStyle(t.category);
                        const duration = formatDuration(t.estimatedDurationMinutes);
                        const dueDate = t.myProgress?.dueDate ? new Date(t.myProgress.dueDate) : null;
                        const isOverdue = dueDate && dueDate < today && t.myProgress?.status !== 'completed';
                        const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const attemptNum = t.myProgress?.attemptNumber || 1;
                        const maxAttempts = t.maxAttempts || 3;
                        const attemptsLeft = maxAttempts - attemptNum;

                        return (
                            <TouchableOpacity
                                key={t.id}
                                style={[styles.card, isOverdue && styles.cardOverdue]}
                                activeOpacity={0.8}
                                onPress={() => router.push({ pathname: '/ojt-training-detail', params: { id: String(t.id) } } as any)}
                            >
                                {/* Overdue Banner */}
                                {isOverdue && (
                                    <View style={styles.overdueBanner}>
                                        <Ionicons name="warning-outline" size={13} color="#DC2626" />
                                        <Text style={styles.overdueText}>
                                            Overdue — due {dueDate!.toLocaleDateString()}
                                        </Text>
                                    </View>
                                )}

                                {/* Card Header */}
                                <View style={styles.cardTop}>
                                    <View style={[styles.iconCircle, { backgroundColor: statusInfo.bg }]}>
                                        <MaterialCommunityIcons name={statusInfo.icon} size={24} color={statusInfo.color} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                                        {t.assetName && <Text style={styles.cardSub}>Asset: {t.assetName}</Text>}
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                                        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                                    </View>
                                </View>

                                {/* Tags row: category + duration + sequential */}
                                <View style={styles.tagsRow}>
                                    <View style={[styles.tag, { backgroundColor: catStyle.bg }]}>
                                        <Text style={[styles.tagText, { color: catStyle.text }]}>
                                            {(t.category || 'general').charAt(0).toUpperCase() + (t.category || 'general').slice(1)}
                                        </Text>
                                    </View>
                                    {duration && (
                                        <View style={styles.tag}>
                                            <MaterialCommunityIcons name="clock-outline" size={11} color="#64748B" />
                                            <Text style={styles.tagText}>{duration}</Text>
                                        </View>
                                    )}
                                    {t.isSequential && (
                                        <View style={[styles.tag, { backgroundColor: '#EDE9FE' }]}>
                                            <MaterialCommunityIcons name="lock-outline" size={11} color="#7C3AED" />
                                            <Text style={[styles.tagText, { color: '#7C3AED' }]}>Sequential</Text>
                                        </View>
                                    )}
                                    {t.myProgress?.isAssigned && t.myProgress?.status !== 'not_started' && (
                                        <View style={[styles.tag, { backgroundColor: '#F0FDF4' }]}>
                                            <MaterialCommunityIcons name="clipboard-check-outline" size={11} color="#16A34A" />
                                            <Text style={[styles.tagText, { color: '#16A34A' }]}>Assigned</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Description */}
                                {t.description && (
                                    <Text style={styles.description} numberOfLines={2}>{t.description}</Text>
                                )}

                                {/* Due date (non-overdue) */}
                                {dueDate && !isOverdue && daysUntilDue !== null && (
                                    <View style={styles.dueDateRow}>
                                        <Ionicons name="calendar-outline" size={13} color={daysUntilDue <= 3 ? '#D97706' : '#64748B'} />
                                        <Text style={[styles.dueDateText, daysUntilDue <= 3 && { color: '#D97706', fontWeight: '700' }]}>
                                            {daysUntilDue === 0 ? 'Due today' : daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue} days (${dueDate.toLocaleDateString()})`}
                                        </Text>
                                    </View>
                                )}

                                {/* Progress bar */}
                                <View style={styles.progressRow}>
                                    <Text style={styles.progressLabel}>{completedMods}/{t.moduleCount} modules</Text>
                                    <Text style={styles.progressPct}>{pct}%</Text>
                                </View>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pct === 100 ? '#16A34A' : '#2563EB' }]} />
                                </View>

                                {/* Footer */}
                                <View style={styles.cardFooter}>
                                    {t.hasTest ? (
                                        <View style={styles.footerItem}>
                                            <MaterialCommunityIcons name="help-circle-outline" size={13} color="#94A3B8" />
                                            <Text style={styles.footerText}>Test: {t.passingPercentage}% to pass</Text>
                                        </View>
                                    ) : null}
                                    {t.hasTest && maxAttempts > 1 && (
                                        <View style={styles.footerItem}>
                                            <MaterialCommunityIcons name="refresh" size={13} color={attemptsLeft <= 1 && t.myProgress?.status === 'failed' ? '#DC2626' : '#94A3B8'} />
                                            <Text style={[styles.footerText, attemptsLeft <= 1 && t.myProgress?.status === 'failed' ? { color: '#DC2626', fontWeight: '700' } : {}]}>
                                                {attemptNum}/{maxAttempts} attempts
                                            </Text>
                                        </View>
                                    )}
                                    {t.myProgress?.certificateUrl && (
                                        <View style={styles.footerItem}>
                                            <MaterialCommunityIcons name="certificate-outline" size={13} color="#16A34A" />
                                            <Text style={[styles.footerText, { color: '#16A34A', fontWeight: '700' }]}>Certified</Text>
                                        </View>
                                    )}
                                    <View style={[styles.footerItem, { marginLeft: 'auto' }]}>
                                        <Text style={[styles.footerText, { color: '#2563EB' }]}>View →</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        backgroundColor: '#2563EB',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 12 : 8,
        paddingBottom: 16,
        gap: 12,
    },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
    headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    filterBar: { maxHeight: 52, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    filterContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    filterTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
    filterTabActive: { backgroundColor: '#2563EB' },
    filterLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
    filterLabelActive: { color: '#FFFFFF' },
    filterCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    filterCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
    filterCountText: { fontSize: 10, fontWeight: '700', color: '#475569' },
    filterCountTextActive: { color: '#FFFFFF' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    loadingText: { color: '#64748B', marginTop: 12, fontSize: 14 },
    emptyBox: { alignItems: 'center', padding: 48 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 8 },
    emptyText: { fontSize: 13.5, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
    listContent: { padding: 12, paddingBottom: 32, gap: 12 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    cardOverdue: { borderWidth: 1.5, borderColor: '#FECACA' },
    overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
    overdueText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    cardSub: { fontSize: 12, color: '#64748B' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: '#F1F5F9' },
    tagText: { fontSize: 11, fontWeight: '600', color: '#475569' },
    description: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 10 },
    dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
    dueDateText: { fontSize: 12.5, color: '#64748B', fontWeight: '500' },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    progressLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
    progressPct: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
    progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
    progressFill: { height: '100%', borderRadius: 3 },
    cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', alignItems: 'center' },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
});

