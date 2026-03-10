import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
        certificateUrl?: string;
        completedModules?: number[];
        startedAt?: string;
        completedAt?: string;
    } | null;
}

function getStatusInfo(t: OjtTraining) {
    const p = t.myProgress;
    if (!p) return { label: 'Not Started', bg: '#F1F5F9', color: '#64748B', icon: 'play-circle-outline' as const };
    if (p.status === 'completed') return { label: 'Completed', bg: '#DCFCE7', color: '#16A34A', icon: 'check-circle-outline' as const };
    if (p.status === 'failed') return { label: 'Failed Test', bg: '#FEE2E2', color: '#DC2626', icon: 'close-circle-outline' as const };
    return { label: 'In Progress', bg: '#DBEAFE', color: '#2563EB', icon: 'progress-clock' as const };
}

function getProgressPct(t: OjtTraining): number {
    const p = t.myProgress;
    if (!p) return 0;
    if (p.status === 'completed') return 100;
    const completed = Array.isArray(p.completedModules) ? p.completedModules.length : 0;
    const total = Number(t.moduleCount) || 1;
    return Math.round((completed / total) * 100);
}

export default function OjtTrainingListScreen() {
    const [trainings, setTrainings] = useState<OjtTraining[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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

    const stats = {
        total: trainings.length,
        completed: trainings.filter(t => t.myProgress?.status === 'completed').length,
        inProgress: trainings.filter(t => t.myProgress?.status === 'in_progress').length,
        notStarted: trainings.filter(t => !t.myProgress).length,
    };

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
                <View style={styles.certBadge}>
                    <MaterialCommunityIcons name="school-outline" size={22} color="#FFFFFF" />
                </View>
            </View>

            {/* Summary Cards */}
            {!loading && trainings.length > 0 && (
                <View style={styles.summaryRow}>
                    <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.summaryNum, { color: '#2563EB' }]}>{stats.total}</Text>
                        <Text style={styles.summaryLabel}>Total</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: '#F0FDF4' }]}>
                        <Text style={[styles.summaryNum, { color: '#16A34A' }]}>{stats.completed}</Text>
                        <Text style={styles.summaryLabel}>Done</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.summaryNum, { color: '#1D4ED8' }]}>{stats.inProgress}</Text>
                        <Text style={styles.summaryLabel}>In Progress</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={[styles.summaryNum, { color: '#64748B' }]}>{stats.notStarted}</Text>
                        <Text style={styles.summaryLabel}>Not Started</Text>
                    </View>
                </View>
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
                    {trainings.length === 0 ? (
                        <View style={styles.center}>
                            <MaterialCommunityIcons name="school-outline" size={64} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>No Trainings Available</Text>
                            <Text style={styles.emptyText}>Published training programs will appear here.</Text>
                        </View>
                    ) : trainings.map(t => {
                        const statusInfo = getStatusInfo(t);
                        const pct = getProgressPct(t);
                        const completedMods = Array.isArray(t.myProgress?.completedModules) ? t.myProgress!.completedModules.length : 0;

                        return (
                            <TouchableOpacity
                                key={t.id}
                                style={styles.card}
                                activeOpacity={0.8}
                                onPress={() => router.push({ pathname: '/ojt-training-detail', params: { id: String(t.id) } } as any)}
                            >
                                {/* Card Header */}
                                <View style={styles.cardTop}>
                                    <View style={[styles.iconCircle, { backgroundColor: statusInfo.bg }]}>
                                        <MaterialCommunityIcons name={statusInfo.icon} size={24} color={statusInfo.color} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                                        {t.assetName ? (
                                            <Text style={styles.cardSub}>Asset: {t.assetName}</Text>
                                        ) : null}
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                                        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                                    </View>
                                </View>

                                {/* Description */}
                                {t.description ? (
                                    <Text style={styles.description} numberOfLines={2}>{t.description}</Text>
                                ) : null}

                                {/* Progress */}
                                <View style={styles.progressRow}>
                                    <Text style={styles.progressLabel}>
                                        {completedMods}/{t.moduleCount} modules completed
                                    </Text>
                                    <Text style={styles.progressPct}>{pct}%</Text>
                                </View>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: pct === 100 ? '#16A34A' : '#2563EB' }]} />
                                </View>

                                {/* Footer */}
                                <View style={styles.cardFooter}>
                                    <View style={styles.footerItem}>
                                        <MaterialCommunityIcons name="book-open-outline" size={14} color="#94A3B8" />
                                        <Text style={styles.footerText}>{t.moduleCount} Modules</Text>
                                    </View>
                                    <View style={styles.footerItem}>
                                        <MaterialCommunityIcons name="help-circle-outline" size={14} color="#94A3B8" />
                                        <Text style={styles.footerText}>{t.hasTest ? 'Has Test' : 'No Test'}</Text>
                                    </View>
                                    <View style={styles.footerItem}>
                                        <MaterialCommunityIcons name="percent" size={14} color="#94A3B8" />
                                        <Text style={styles.footerText}>Pass: {t.passingPercentage}%</Text>
                                    </View>
                                    {t.myProgress?.certificateUrl && (
                                        <View style={styles.footerItem}>
                                            <MaterialCommunityIcons name="certificate-outline" size={14} color="#16A34A" />
                                            <Text style={[styles.footerText, { color: '#16A34A' }]}>Certified</Text>
                                        </View>
                                    )}
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
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
    certBadge: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    summaryRow: { flexDirection: 'row', padding: 12, gap: 8 },
    summaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
    summaryNum: { fontSize: 22, fontWeight: '800' },
    summaryLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    loadingText: { color: '#64748B', marginTop: 12, fontSize: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
    listContent: { padding: 12, paddingBottom: 32, gap: 12 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    cardSub: { fontSize: 12, color: '#64748B' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },
    description: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 12 },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
    progressPct: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
    progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
    progressFill: { height: '100%', borderRadius: 3 },
    cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
});
