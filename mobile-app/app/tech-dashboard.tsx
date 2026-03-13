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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getMyAssignments, getMyShifts, getMySubmissionHistory, getMyWarnings, getStoredUser, getTodayProgress, type Assignment, type Shift, type SubmissionHistoryItem } from '../utils/api';

// Reusable Navigation Bar Component for Tech Flow
export const TechBottomNav = ({ activeRoute }: { activeRoute: string }) => {
    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-dashboard')}>
                <View style={[navStyles.iconWrapper, activeRoute === 'home' && navStyles.iconWrapperActive]}>
                    <MaterialCommunityIcons
                        name={activeRoute === 'home' ? 'clipboard-list' : 'clipboard-list-outline'}
                        size={22}
                        color={activeRoute === 'home' ? '#2563EB' : '#64748B'}
                    />
                </View>
                <Text style={[navStyles.navText, activeRoute === 'home' && navStyles.navTextActive]}>Tasks</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-training' as any)}>
                <View style={[navStyles.iconWrapper, activeRoute === 'training' && navStyles.iconWrapperActive]}>
                    <MaterialCommunityIcons
                        name={activeRoute === 'training' ? 'school' : 'school-outline'}
                        size={22}
                        color={activeRoute === 'training' ? '#2563EB' : '#64748B'}
                    />
                </View>
                <Text style={[navStyles.navText, activeRoute === 'training' && navStyles.navTextActive]}>Training</Text>
            </TouchableOpacity>

            {/* QR Scanner center FAB */}
            <TouchableOpacity style={navStyles.qrBtn} activeOpacity={0.85} onPress={() => router.push('/qr-scanner' as any)}>
                <MaterialCommunityIcons name="qrcode-scan" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-work-orders' as any)}>
                <View style={[navStyles.iconWrapper, activeRoute === 'workorders' && navStyles.iconWrapperActive]}>
                    <MaterialCommunityIcons
                        name={activeRoute === 'workorders' ? 'wrench-clock' : 'wrench-clock-outline'}
                        size={22}
                        color={activeRoute === 'workorders' ? '#2563EB' : '#64748B'}
                    />
                </View>
                <Text style={[navStyles.navText, activeRoute === 'workorders' && navStyles.navTextActive]}>W.O.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/profile' as any)}>
                <View style={[navStyles.iconWrapper, activeRoute === 'profile' && navStyles.iconWrapperActive]}>
                    <MaterialCommunityIcons name="account-outline" size={22} color="#64748B" />
                </View>
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
        backgroundColor: '#FCFBFC',
        paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        borderTopWidth: 1,
        borderTopColor: '#EAEAEA',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    iconWrapper: {
        padding: 4,
        borderRadius: 12,
    },
    iconWrapperActive: {
        backgroundColor: '#EFF6FF',
    },
    qrBtn: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -30,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        borderWidth: 3,
        borderColor: '#FFFFFF',
    },
    navText: {
        fontSize: 10,
        color: '#64748B',
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
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [todayProgress, setTodayProgress] = useState({ checklistsDone: 0, logsheetsDone: 0, totalDone: 0 });
    const [openWarningCount, setOpenWarningCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'Checklists' | 'Log Sheets' | 'History'>('Checklists');
    const [historyItems, setHistoryItems] = useState<SubmissionHistoryItem[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (activeTab === 'History' && !historyLoaded) {
            getMySubmissionHistory(30).then(d => { setHistoryItems(d); setHistoryLoaded(true); }).catch(() => {});
        }
    }, [activeTab, historyLoaded]);

    const loadData = async () => {
        try {
            const [data, storedUser, myShifts, progress, warnings] = await Promise.all([
                getMyAssignments(),
                getStoredUser(),
                getMyShifts().catch(() => [] as Shift[]),
                getTodayProgress().catch(() => ({ checklistsDone: 0, logsheetsDone: 0, totalDone: 0 })),
                getMyWarnings(20).catch(() => []),
            ]);
            setAssignments(data);
            setUser(storedUser);
            setShifts(myShifts);
            setTodayProgress(progress);
            setOpenWarningCount(warnings.filter(w => w.status === 'open' || w.status === 'in_progress').length);
            // refresh history too
            const hist = await getMySubmissionHistory(30).catch(() => [] as SubmissionHistoryItem[]);
            setHistoryItems(hist);
            setHistoryLoaded(true);
        } catch (error: any) {
            console.warn('Failed to load dashboard:', error instanceof Error ? error.message : error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const total = assignments.length;
    const completed = todayProgress.totalDone;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressRatio = total > 0 ? Math.min(completed / total, 1) : 0;

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
        if (pct > 0) return "Good start! Keep up the momentum.";
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
                <View>
                    <Text style={styles.headerGreeting}>Good Morning,</Text>
                    <Text style={styles.headerTitle}>{userName}</Text>
                </View>
                <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/tech-notifications' as any)}>
                    <MaterialCommunityIcons name="bell-outline" size={24} color="#334155" />
                    {openWarningCount > 0 && (
                        <View style={styles.notifDot}>
                            {openWarningCount <= 9 && (
                                <Text style={styles.notifDotTxt}>{openWarningCount}</Text>
                            )}
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={['#2563EB']} />}
            >
                {/* Progress card */}
                <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.progressCard}>
                    <View style={styles.progressTop}>
                        <View>
                            <Text style={styles.progressLabel}>Today&apos;s Progress</Text>
                            <Text style={styles.progressFraction}>
                                <Text style={styles.progressDone}>{completed}</Text>
                                <Text style={styles.progressTotal}> / {total} Tasks</Text>
                            </Text>
                        </View>
                        <View style={styles.pctBadge}>
                            <Text style={styles.pctText}>{pct}%</Text>
                        </View>
                    </View>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.max(progressRatio * 100, 4)}%` as any }]} />
                    </View>
                    <Text style={styles.motivationText}>{getMotivation()}</Text>
                </Animated.View>

                {/* Assigned Tasks header with tabs */}
                <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.rowBetween}>
                    <Text style={styles.assignedTitle}>My Tasks</Text>
                    <TouchableOpacity onPress={() => router.push('/tech-tasks' as any)}>
                        <Text style={styles.viewAll}>See All →</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Tab bar */}
                <Animated.View entering={FadeInUp.delay(120).duration(350)} style={styles.tabRow}>
                    {(['Checklists', 'Log Sheets', 'History'] as const).map(tab => {
                        const count = tab === 'Checklists'
                            ? assignments.filter(a => a.templateType === 'checklist').length
                            : tab === 'Log Sheets'
                            ? assignments.filter(a => a.templateType === 'logsheet').length
                            : historyItems.length;
                        return (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                                onPress={() => setActiveTab(tab)}
                            >
                                <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                                    {tab} {count > 0 && `(${count})`}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>

                {/* Active shift banner */}
                {shifts.length > 0 && (() => {
                    const fmt12 = (t: string) => {
                        const [h, m] = t.split(':');
                        const hr = parseInt(h, 10);
                        return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
                    };
                    const isActive = (s: Shift) => {
                        const now = new Date();
                        const nowMins = now.getHours() * 60 + now.getMinutes();
                        const [sh, sm] = s.startTime.split(':').map(Number);
                        const [eh, em] = s.endTime.split(':').map(Number);
                        const startMins = sh * 60 + sm;
                        const endMins = eh * 60 + em;
                        if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
                        return nowMins >= startMins || nowMins <= endMins;
                    };
                    const activeShift = shifts.find(isActive);
                    const currentShift = activeShift || shifts[0];
                    return (
                        <Animated.View entering={FadeInDown.delay(50).duration(350)} style={[shiftBannerStyles.container, activeShift ? shiftBannerStyles.active : shiftBannerStyles.inactive]}>
                            <View style={shiftBannerStyles.iconWrap}>
                                <MaterialCommunityIcons name="clock-outline" size={18} color={activeShift ? '#16a34a' : '#64748b'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[shiftBannerStyles.name, !activeShift && { color: '#64748b' }]}>{currentShift.name}</Text>
                                <Text style={shiftBannerStyles.time}>{fmt12(currentShift.startTime)} – {fmt12(currentShift.endTime)}</Text>
                            </View>
                            {activeShift && (
                                <View style={shiftBannerStyles.activeBadge}>
                                    <Text style={shiftBannerStyles.activeBadgeText}>ACTIVE</Text>
                                </View>
                            )}
                        </Animated.View>
                    );
                })()}

                {/* Task cards or History list */}
                {(() => {
                    if (activeTab === 'History') {
                        if (historyItems.length === 0) {
                            return (
                                <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyBox}>
                                    <MaterialCommunityIcons name="history" size={36} color="#CBD5E1" />
                                    <Text style={styles.emptyTitle}>No history yet</Text>
                                    <Text style={styles.emptyText}>Completed submissions will appear here.</Text>
                                </Animated.View>
                            );
                        }
                        return historyItems.slice(0, 10).map((item, i) => (
                            <Animated.View key={`hist-${item.type}-${item.id}`} entering={FadeInUp.delay(80 + i * 40).duration(350)}>
                                <TouchableOpacity
                                    style={styles.histCard}
                                    activeOpacity={0.75}
                                    onPress={() => router.push({ pathname: '/tech-history-detail', params: { type: item.type, id: item.id, name: item.templateName } } as any)}
                                >
                                    <View style={[styles.histIcon, { backgroundColor: item.type === 'checklist' ? '#EEF2FF' : '#EFF6FF' }]}>
                                        <MaterialCommunityIcons
                                            name={item.type === 'checklist' ? 'clipboard-check' : 'notebook'}
                                            size={18}
                                            color={item.type === 'checklist' ? '#6366F1' : '#2563EB'}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.histName} numberOfLines={1}>{item.templateName}</Text>
                                        <Text style={styles.histDate}>
                                            {new Date(item.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {item.assetName ? ` · ${item.assetName}` : ''}
                                        </Text>
                                    </View>
                                    <View style={[styles.histStatus, { backgroundColor: item.status === 'completed' ? '#ECFDF5' : '#FFF7ED' }]}>
                                        <Text style={[styles.histStatusTxt, { color: item.status === 'completed' ? '#10B981' : '#F59E0B' }]}>
                                            {item.status === 'completed' ? 'Done' : 'Submitted'}
                                        </Text>
                                    </View>
                                    <MaterialCommunityIcons name="chevron-right" size={16} color="#CBD5E1" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            </Animated.View>
                        ));
                    }

                    const filteredAssignments = assignments.filter(a =>
                        activeTab === 'Checklists' ? a.templateType === 'checklist' : a.templateType === 'logsheet'
                    );

                    if (filteredAssignments.length === 0) {
                        return (
                            <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyBox}>
                                <View style={styles.emptyIconCircle}>
                                    <MaterialCommunityIcons name="check-all" size={32} color="#10B981" />
                                </View>
                                <Text style={styles.emptyTitle}>You&apos;re all caught up!</Text>
                                <Text style={styles.emptyText}>No pending {activeTab.toLowerCase()} for now.</Text>
                            </Animated.View>
                        );
                    }

                    return filteredAssignments.slice(0, 10).map((a, idx) => {
                        const pc = getPriorityConfig(a.frequency || '');
                        const isFirst = idx === 0;
                        const initials = getInitials(userName);
                        return (
                            <Animated.View key={a.assignmentId ?? idx} entering={FadeInUp.delay(100 + idx * 50).duration(400).springify()}>
                                <TouchableOpacity
                                    style={[styles.taskCard, isFirst && styles.taskCardHighlight]}
                                    activeOpacity={0.7}
                                    onPress={() => router.push({ pathname: '/tech-execution', params: { assignmentId: String(a.assignmentId), templateType: a.templateType, templateId: String(a.templateId), templateName: a.templateName, assetId: a.assetId ? String(a.assetId) : '', assetName: a.assetName || '' } } as any)}
                                >
                                    {isFirst && <View style={styles.cardIndicator} />}
                                    <View style={styles.taskContent}>
                                        <View style={styles.taskTopRow}>
                                            <View style={[styles.priorityBadge, { backgroundColor: isFirst ? '#FEE2E2' : '#F1F5F9' }]}>
                                                {pc.icon && <MaterialCommunityIcons name={isFirst ? 'alert-circle' : 'circle-medium'} size={12} color={isFirst ? '#DC2626' : '#64748B'} />}
                                                <Text style={[styles.priorityText, { color: isFirst ? '#DC2626' : '#64748B' }]}>{isFirst ? 'High Priority' : 'Standard'}</Text>
                                            </View>
                                            <Text style={styles.dueText}>Due {idx === 0 ? '10:00 AM' : idx === 1 ? '1:30 PM' : 'End of Shift'}</Text>
                                        </View>

                                        <Text style={styles.taskName}>{a.templateName}</Text>

                                        <View style={styles.taskLocRow}>
                                            <MaterialCommunityIcons name="office-building" size={14} color="#94A3B8" />
                                            <Text style={styles.taskLoc}>{a.assetType || a.assetName || 'General Facility'}</Text>
                                        </View>

                                        <View style={styles.taskBottom}>
                                            <View style={styles.avatarCircle}>
                                                <Text style={styles.avatarText}>{initials}</Text>
                                            </View>
                                            <View
                                                style={[styles.startBtn, isFirst ? styles.startBtnSolid : styles.startBtnOutline]}
                                            >
                                                <Text style={[styles.startBtnText, !isFirst && styles.startBtnTextOutline]}>
                                                    Start Task
                                                </Text>
                                                <MaterialCommunityIcons name="arrow-right" size={16} color={isFirst ? '#FFFFFF' : '#2563EB'} style={{ marginLeft: 4 }} />
                                            </View>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        );
                    });
                })()}

                <View style={{ height: 30 }} />
            </ScrollView>

            <TechBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' }, // Slight off-white, light professional bg
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        paddingBottom: 16,
        backgroundColor: '#FAF9F6',
    },
    headerGreeting: { fontSize: 13, color: '#64748B', fontWeight: '500', marginBottom: 2 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    notifDot: {
        position: 'absolute', top: 8, right: 10,
        minWidth: 16, height: 16, borderRadius: 8,
        backgroundColor: '#EF4444',
        justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 3,
    },
    notifDotTxt: {
        color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 11,
    },

    scroll: { padding: 20, paddingTop: 4 },

    // Progress card
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        marginBottom: 28,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    progressLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 4 },
    progressFraction: { flexDirection: 'row', alignItems: 'baseline' },
    progressDone: { fontSize: 36, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
    progressTotal: { fontSize: 16, fontWeight: '600', color: '#94A3B8' },
    pctBadge: {
        backgroundColor: '#EFF6FF', borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 6,
    },
    pctText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
    progressBarBg: {
        height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginBottom: 12, overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%', backgroundColor: '#2563EB', borderRadius: 3,
    },
    motivationText: { fontSize: 13, color: '#64748B', fontWeight: '500' },

    // Section row
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    assignedTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    viewAll: { fontSize: 14, fontWeight: '600', color: '#2563EB' },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 3,
        marginBottom: 14,
        gap: 2,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
    },
    tabBtnActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
    },
    tabBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    tabBtnTextActive: {
        color: '#0F172A',
        fontWeight: '800',
    },

    // History cards (compact)
    histCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        gap: 10,
    },
    histIcon: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    histName: {
        fontSize: 13.5,
        fontWeight: '700',
        color: '#0F172A',
    },
    histDate: {
        fontSize: 11.5,
        color: '#94A3B8',
        marginTop: 2,
    },
    histStatus: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    histStatusTxt: {
        fontSize: 11,
        fontWeight: '700',
    },

    // Task card
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 14,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
        borderWidth: 1, borderColor: '#F1F5F9',
        flexDirection: 'row',
        overflow: 'hidden',
    },
    taskCardHighlight: {
        shadowOpacity: 0.08,
        shadowRadius: 12,
        borderColor: '#E2E8F0',
    },
    cardIndicator: {
        width: 4,
        backgroundColor: '#2563EB',
    },
    taskContent: {
        flex: 1,
        padding: 16,
    },
    taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    priorityBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    },
    priorityText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    dueText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
    taskName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8, letterSpacing: -0.2 },
    taskLocRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    taskLoc: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    taskBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
    avatarCircle: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    avatarText: { fontSize: 11, fontWeight: '700', color: '#475569' },
    startBtn: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    },
    startBtnSolid: { backgroundColor: '#2563EB' },
    startBtnOutline: { backgroundColor: '#EFF6FF' },
    startBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
    startBtnTextOutline: { color: '#2563EB' },

    emptyBox: { alignItems: 'center', paddingVertical: 48, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed' },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    emptyText: { fontSize: 14, color: '#94A3B8' },
});

const shiftBannerStyles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1 },
    active: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
    inactive: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
    iconWrap: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 14, fontWeight: '700', color: '#15803d', marginBottom: 1 },
    time: { fontSize: 12, color: '#4ade80' },
    activeBadge: { backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    activeBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
});
