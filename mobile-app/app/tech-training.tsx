import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
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
import { getMyOjtTrainings } from '../utils/api';
import { TechBottomNav } from './tech-dashboard';

interface OjtTraining {
    id: number;
    title: string;
    description?: string;
    passingPercentage: number;
    assetName?: string;
    moduleCount: number;
    hasTest: number;
    myProgress?: {
        status: string;
        score?: number;
        completedModules?: number[];
        certificateUrl?: string;
    } | null;
}

type FilterKey = 'all' | 'completed' | 'in_progress' | 'not_started';

function getStatusInfo(t: OjtTraining) {
    const p = t.myProgress;
    if (!p) return { label: 'Not Started', bg: '#F1F5F9', color: '#64748B', iconName: 'play-circle-outline' as const, isCompleted: false, isInProgress: false };
    if (p.status === 'completed') return { label: 'Completed', bg: '#DCFCE7', color: '#16A34A', iconName: 'check-circle' as const, isCompleted: true, isInProgress: false };
    if (p.status === 'failed') return { label: 'Failed', bg: '#FEE2E2', color: '#DC2626', iconName: 'close-circle-outline' as const, isCompleted: false, isInProgress: false };
    return { label: 'In Progress', bg: '#DBEAFE', color: '#2563EB', iconName: 'progress-clock' as const, isCompleted: false, isInProgress: true };
}

function getCompletedModulesCount(t: OjtTraining): number {
    const p = t.myProgress;
    if (!p) return 0;
    if (p.status === 'completed') return Number(t.moduleCount) || 0;
    return Array.isArray(p.completedModules) ? p.completedModules.length : 0;
}

function getProgressPct(t: OjtTraining): number {
    const p = t.myProgress;
    if (!p) return 0;
    if (p.status === 'completed') return 100;
    const done = Array.isArray(p.completedModules) ? p.completedModules.length : 0;
    const total = Number(t.moduleCount) || 1;
    return Math.round((done / total) * 100);
}

export default function TechTrainingScreen() {
    const [trainings, setTrainings] = useState<OjtTraining[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const load = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        try {
            const data = await getMyOjtTrainings();
            setTrainings(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn('Failed to load trainings:', e instanceof Error ? e.message : e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = () => { setRefreshing(true); load(true); };

    const total = trainings.length;
    const doneCount = trainings.filter(t => t.myProgress?.status === 'completed').length;
    const inProgressCount = trainings.filter(t => t.myProgress?.status === 'in_progress').length;
    const notStartedCount = trainings.filter(t => !t.myProgress).length;

    const filteredTrainings = trainings.filter(t => {
        if (activeFilter === 'completed') return t.myProgress?.status === 'completed';
        if (activeFilter === 'in_progress') return t.myProgress?.status === 'in_progress';
        if (activeFilter === 'not_started') return !t.myProgress;
        return true;
    });

    const stats: { key: FilterKey; label: string; value: number }[] = [
        { key: 'all', label: 'Total', value: total },
        { key: 'completed', label: 'Done', value: doneCount },
        { key: 'in_progress', label: 'In Progress', value: inProgressCount },
        { key: 'not_started', label: 'Not Started', value: notStartedCount },
    ];

    return (
        <SafeAreaView style={styles.container}>
            {/* Blue Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Training Programs</Text>
                    <Text style={styles.headerSubtitle}>{total} available</Text>
                </View>
                <View style={styles.headerIconBtn}>
                    <MaterialCommunityIcons name="school" size={20} color="#1D4ED8" />
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading trainings...</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scroll}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                >
                    {/* Stats / Filter Row */}
                    <View style={styles.statsRow}>
                        {stats.map(s => (
                            <TouchableOpacity
                                key={s.key}
                                style={[styles.statCard, activeFilter === s.key && styles.statCardActive]}
                                onPress={() => setActiveFilter(s.key)}
                                activeOpacity={0.75}
                            >
                                <Text style={[styles.statValue, activeFilter === s.key && styles.statValueActive]}>{s.value}</Text>
                                <Text style={[styles.statLabel, activeFilter === s.key && styles.statLabelActive]}>{s.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Training list */}
                    {filteredTrainings.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <MaterialCommunityIcons name="school-outline" size={56} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>No Trainings Found</Text>
                            <Text style={styles.emptyText}>
                                {activeFilter === 'all'
                                    ? 'Published training programs will appear here.'
                                    : `No ${activeFilter.replace('_', ' ')} trainings.`}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.listContainer}>
                            {filteredTrainings.map((t) => {
                                const status = getStatusInfo(t);
                                const pct = getProgressPct(t);
                                const doneMods = getCompletedModulesCount(t);
                                const totalMods = Number(t.moduleCount) || 0;
                                const isCertified = !!(t.myProgress?.certificateUrl);
                                const barColor = status.isCompleted ? '#16A34A' : pct > 0 ? '#2563EB' : '#E2E8F0';

                                return (
                                    <TouchableOpacity
                                        key={t.id}
                                        style={styles.card}
                                        activeOpacity={0.75}
                                        onPress={() => router.push({ pathname: '/ojt-training-detail', params: { id: String(t.id) } } as any)}
                                    >
                                        {/* Card Top Row */}
                                        <View style={styles.cardTopRow}>
                                            {/* Circle Icon */}
                                            <View style={[
                                                styles.circleIcon,
                                                status.isCompleted
                                                    ? styles.circleCompleted
                                                    : status.isInProgress
                                                        ? styles.circleInProgress
                                                        : styles.circleNotStarted,
                                            ]}>
                                                <MaterialCommunityIcons
                                                    name={status.iconName}
                                                    size={26}
                                                    color={status.isCompleted ? '#FFFFFF' : status.color}
                                                />
                                            </View>

                                            {/* Title + Status */}
                                            <View style={styles.cardTitleArea}>
                                                <View style={styles.cardTitleRow}>
                                                    <Text style={styles.cardTitle} numberOfLines={2}>{t.title}</Text>
                                                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                                                        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                                                    </View>
                                                </View>
                                                {t.assetName ? (
                                                    <Text style={styles.assetSubtitle}>Asset: {t.assetName}</Text>
                                                ) : null}
                                            </View>
                                        </View>

                                        {/* Description */}
                                        {!!t.description && (
                                            <Text style={styles.cardDescription} numberOfLines={2}>{t.description}</Text>
                                        )}

                                        {/* Progress */}
                                        <View style={styles.progressRow}>
                                            <Text style={styles.progressText}>{doneMods}/{totalMods} modules completed</Text>
                                            <Text style={[styles.progressPct, { color: barColor === '#E2E8F0' ? '#94A3B8' : barColor }]}>{pct}%</Text>
                                        </View>
                                        <View style={styles.progressBarBg}>
                                            <View style={[styles.progressBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                                        </View>

                                        {/* Footer chips */}
                                        <View style={styles.chipRow}>
                                            <View style={styles.chip}>
                                                <MaterialCommunityIcons name="view-list-outline" size={12} color="#64748B" />
                                                <Text style={styles.chipText}>{totalMods} {totalMods === 1 ? 'Module' : 'Modules'}</Text>
                                            </View>
                                            {!!t.hasTest && (
                                                <View style={styles.chip}>
                                                    <MaterialCommunityIcons name="help-circle-outline" size={12} color="#64748B" />
                                                    <Text style={styles.chipText}>Has Test</Text>
                                                </View>
                                            )}
                                            <View style={styles.chip}>
                                                <MaterialCommunityIcons name="percent" size={12} color="#64748B" />
                                                <Text style={styles.chipText}>Pass: {t.passingPercentage}%</Text>
                                            </View>
                                            {isCertified && (
                                                <View style={[styles.chip, styles.chipCertified]}>
                                                    <MaterialCommunityIcons name="certificate-outline" size={12} color="#16A34A" />
                                                    <Text style={[styles.chipText, { color: '#16A34A' }]}>Certified</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    <View style={{ height: 24 }} />
                </ScrollView>
            )}

            <TechBottomNav activeRoute="training" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F1F5F9' },

    /* Header */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 44 : 16,
        paddingBottom: 20,
        backgroundColor: '#1D4ED8',
        gap: 12,
    },
    headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: '#BFDBFE', marginTop: 2, fontWeight: '500' },
    headerIconBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
    },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    loadingText: { color: '#64748B', marginTop: 12, fontSize: 14 },
    scroll: { padding: 16, paddingBottom: 40 },

    /* Stats Row */
    statsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 6,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    statCardActive: {
        backgroundColor: '#EFF6FF',
        borderColor: '#2563EB',
    },
    statValue: { fontSize: 22, fontWeight: '800', color: '#64748B', letterSpacing: -0.5 },
    statValueActive: { color: '#1D4ED8' },
    statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontWeight: '600', textAlign: 'center' },
    statLabelActive: { color: '#2563EB' },

    /* Empty */
    emptyBox: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#475569', marginTop: 16 },
    emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },

    /* List & Card */
    listContainer: { gap: 14 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },

    /* Card top row */
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
    circleIcon: {
        width: 52, height: 52, borderRadius: 26,
        justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
    },
    circleCompleted: { backgroundColor: '#16A34A' },
    circleInProgress: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#2563EB', borderStyle: 'dashed' },
    circleNotStarted: { backgroundColor: '#F1F5F9' },
    cardTitleArea: { flex: 1 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0F172A', lineHeight: 21, letterSpacing: -0.3 },
    statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, flexShrink: 0, marginTop: 1 },
    statusText: { fontSize: 11, fontWeight: '700' },
    assetSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontWeight: '500' },

    /* Description */
    cardDescription: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 12 },

    /* Progress */
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    progressText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
    progressPct: { fontSize: 13, fontWeight: '800' },
    progressBarBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
    progressBarFill: { height: 8, borderRadius: 4 },

    /* Footer chips */
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4,
        backgroundColor: '#F8FAFC', borderRadius: 6,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    chipText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    chipCertified: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
});
