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
import { getMyAssignments, getStoredUser, type Assignment } from '../utils/api';

// Reusable Navigation Bar Component for Tech Flow
export const TechBottomNav = ({ activeRoute }: { activeRoute: string }) => {
    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-dashboard')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'home' ? 'clipboard-list' : 'clipboard-list-outline'}
                    size={24}
                    color={activeRoute === 'home' ? '#2563EB' : '#94A3B8'}
                />
                <Text style={[navStyles.navText, activeRoute === 'home' && navStyles.navTextActive]}>Tasks</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/assets-list' as any)}>
                <MaterialCommunityIcons name="wrench-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.navText}>Assets</Text>
            </TouchableOpacity>

            {/* QR Scanner center FAB */}
            <TouchableOpacity style={navStyles.qrBtn} activeOpacity={0.85}>
                <MaterialCommunityIcons name="qrcode-scan" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem}>
                <MaterialCommunityIcons name="calendar-month-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.navText}>Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/profile' as any)}>
                <MaterialCommunityIcons name="account-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.navText}>Profile</Text>
            </TouchableOpacity>
        </View>
    );
};

const navStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    qrBtn: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -22,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    navText: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 4,
        fontWeight: '500',
    },
    navTextActive: {
        color: '#2563EB',
        fontWeight: '700',
    },
});

export default function TechDashboardScreen() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [data, storedUser] = await Promise.all([
                getMyAssignments(),
                getStoredUser(),
            ]);
            setAssignments(data);
            setUser(storedUser);
        } catch (error: any) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const total = assignments.length;
    // Treat assignments without a "completed" status as pending; use a basic heuristic
    const completed = 0; // real completed count would come from submissions — keeping 0 as default
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressRatio = total > 0 ? completed / total : 0;

    const getInitials = (name?: string) => {
        if (!name) return 'U';
        return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    };

    const getPriorityConfig = (frequency?: string) => {
        const f = (frequency || '').toLowerCase();
        if (f === 'daily' || f === 'shift')
            return { label: 'High Priority', bg: '#FFF0ED', color: '#E05C2A', icon: 'alert' as const };
        if (f === 'weekly')
            return { label: 'Routine', bg: '#F1F5F9', color: '#64748B', icon: null };
        return { label: 'Routine', bg: '#F1F5F9', color: '#64748B', icon: null };
    };

    const getMotivation = () => {
        if (pct >= 80) return "Great job! You're ahead of schedule.";
        if (pct >= 50) return "Keep going, you're halfway there!";
        if (pct > 0)   return "Good start! Keep up the momentum.";
        return "Let's get started on today's tasks!";
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

    const userName = user?.fullName || user?.fullname || 'Technician';

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBtn}>
                    <MaterialCommunityIcons name="menu" size={26} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Dashboard</Text>
                <TouchableOpacity style={styles.bellBtn}>
                    <MaterialCommunityIcons name="bell" size={24} color="#1E293B" />
                    <View style={styles.notifDot} />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
            >
                {/* Section title */}
                <Text style={styles.sectionTitle}>Today's Tasks</Text>

                {/* Progress card */}
                <View style={styles.progressCard}>
                    <View style={styles.progressTop}>
                        <Text style={styles.progressFraction}>
                            <Text style={styles.progressDone}>{completed}</Text>
                            <Text style={styles.progressTotal}>/{total}</Text>
                        </Text>
                        <View style={styles.pctBadge}>
                            <Text style={styles.pctText}>{pct}% Complete</Text>
                        </View>
                    </View>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.max(progressRatio * 100, 4)}%` as any }]} />
                    </View>
                    <Text style={styles.motivationText}>{getMotivation()}</Text>
                </View>

                {/* Assigned Tasks header */}
                <View style={styles.rowBetween}>
                    <Text style={styles.assignedTitle}>Assigned Tasks</Text>
                    <TouchableOpacity onPress={() => router.push('/assignments' as any)}>
                        <Text style={styles.viewAll}>View All</Text>
                    </TouchableOpacity>
                </View>

                {/* Task cards */}
                {assignments.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <MaterialCommunityIcons name="clipboard-check-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No tasks assigned yet</Text>
                    </View>
                ) : (
                    assignments.slice(0, 10).map((a, idx) => {
                        const pc = getPriorityConfig(a.frequency);
                        const isFirst = idx === 0;
                        const initials = getInitials(userName);
                        return (
                            <TouchableOpacity
                                key={a.id ?? idx}
                                style={[styles.taskCard, isFirst && styles.taskCardHighlight]}
                                activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/tech-execution', params: { assignmentId: a.id } } as any)}
                            >
                                {/* Priority + Due row */}
                                <View style={styles.taskTopRow}>
                                    <View style={[styles.priorityBadge, { backgroundColor: pc.bg }]}>
                                        {pc.icon && <MaterialCommunityIcons name={pc.icon} size={12} color={pc.color} />}
                                        <Text style={[styles.priorityText, { color: pc.color }]}>{pc.label}</Text>
                                    </View>
                                    <Text style={styles.dueText}>Due {idx === 0 ? '10:00 AM' : idx === 1 ? '1:30 PM' : '—'}</Text>
                                </View>

                                {/* Task name */}
                                <Text style={styles.taskName}>{a.templateName}</Text>

                                {/* Location */}
                                <View style={styles.taskLocRow}>
                                    <MaterialCommunityIcons name="map-marker-outline" size={14} color="#94A3B8" />
                                    <Text style={styles.taskLoc}>{a.assetType || a.assetName || 'General'}</Text>
                                </View>

                                {/* Avatar + action */}
                                <View style={styles.taskBottom}>
                                    <View style={styles.avatarCircle}>
                                        <Text style={styles.avatarText}>{initials}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.startBtn, isFirst ? styles.startBtnSolid : styles.startBtnOutline]}
                                        onPress={() => router.push({ pathname: '/tech-execution', params: { assignmentId: a.id } } as any)}
                                    >
                                        <Text style={[styles.startBtnText, !isFirst && styles.startBtnTextOutline]}>
                                            Start Task
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}

                <View style={{ height: 20 }} />
            </ScrollView>

            <TechBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 36 : 14,
        paddingBottom: 14,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerBtn: { padding: 4, width: 36 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    bellBtn: { width: 36, padding: 4, alignItems: 'center', position: 'relative' },
    notifDot: {
        position: 'absolute', top: 2, right: 2,
        width: 9, height: 9, borderRadius: 5,
        backgroundColor: '#EF4444',
        borderWidth: 1.5, borderColor: '#FFFFFF',
    },

    scroll: { padding: 20 },

    sectionTitle: {
        fontSize: 22, fontWeight: '800', color: '#0F172A',
        marginBottom: 14,
    },

    // Progress card
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    progressFraction: { fontSize: 32 },
    progressDone: { fontSize: 44, fontWeight: '900', color: '#2563EB' },
    progressTotal: { fontSize: 26, fontWeight: '600', color: '#94A3B8' },
    pctBadge: {
        backgroundColor: '#EFF6FF', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 6,
    },
    pctText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
    progressBarBg: {
        height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginBottom: 12, overflow: 'hidden',
    },
    progressBarFill: {
        height: 8, backgroundColor: '#2563EB', borderRadius: 4,
    },
    motivationText: { fontSize: 13, color: '#64748B' },

    // Section row
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    assignedTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
    viewAll: { fontSize: 13, fontWeight: '600', color: '#2563EB' },

    // Task card
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    taskCardHighlight: {
        borderLeftWidth: 4, borderLeftColor: '#2563EB',
    },
    taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    priorityBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    priorityText: { fontSize: 11, fontWeight: '700' },
    dueText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
    taskName: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
    taskLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
    taskLoc: { fontSize: 13, color: '#64748B' },
    taskBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    avatarCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 13, fontWeight: '700', color: '#475569' },
    startBtn: {
        paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22,
    },
    startBtnSolid: { backgroundColor: '#2563EB' },
    startBtnOutline: { borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: 'transparent' },
    startBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
    startBtnTextOutline: { color: '#334155' },

    emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
    emptyText: { fontSize: 14, color: '#94A3B8' },
});
