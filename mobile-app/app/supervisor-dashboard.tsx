import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { getMyTeam, clearAuth, getDashboardStats, getStoredUser, getTeamStats, getChecklistSubmissions, getRecentLogsheetEntries, getTodayProgress, getWorkOrders, getAllSoftRequests, type SoftServiceRequest } from '../utils/api';

// Reusable Navigation Bar Component for Supervisor
export const SupervisorBottomNav = ({ activeRoute }: { activeRoute: string }) => {
    const [hasSoftCaps, setHasSoftCaps] = React.useState(false);

    React.useEffect(() => {
        getStoredUser().then(u => {
            const caps = u?.roleCapabilities;
            setHasSoftCaps(!!(caps?.canRaiseSoftIssue || caps?.canResolveSoftIssue || caps?.isSoftManager));
        }).catch(() => {});
    }, []);

    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/supervisor-dashboard')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'home' ? 'view-grid' : 'view-grid-outline'}
                    size={24}
                    color={activeRoute === 'home' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'home' && navStyles.navTextActive]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/checklists')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'checklists' ? 'format-list-checks' : 'format-list-checkbox'}
                    size={24}
                    color={activeRoute === 'checklists' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'checklists' && navStyles.navTextActive]}>Tasks</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/qr-scanner')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'scanner' ? 'qrcode-scan' : 'qrcode-scan'}
                    size={24}
                    color={activeRoute === 'scanner' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'scanner' && navStyles.navTextActive]}>Scanner</Text>
            </TouchableOpacity>

            {hasSoftCaps ? (
                <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/soft-supervisor-dashboard' as any)}>
                    <MaterialCommunityIcons
                        name={activeRoute === 'requests' ? 'clipboard-alert' : 'clipboard-alert-outline'}
                        size={24}
                        color={activeRoute === 'requests' ? '#1E3A8A' : '#A0AEC0'}
                    />
                    <Text style={[navStyles.navText, activeRoute === 'requests' && navStyles.navTextActive]}>Requests</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/assets-list')}>
                    <MaterialCommunityIcons
                        name={activeRoute === 'assets' ? 'wrench' : 'wrench-outline'}
                        size={24}
                        color={activeRoute === 'assets' ? '#1E3A8A' : '#A0AEC0'}
                    />
                    <Text style={[navStyles.navText, activeRoute === 'assets' && navStyles.navTextActive]}>Assets</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/profile')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'profile' ? 'account' : 'account-outline'}
                    size={24}
                    color={activeRoute === 'profile' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'profile' && navStyles.navTextActive]}>Profile</Text>
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
        paddingBottom: Platform.OS === 'ios' ? 30 : 10,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    navText: {
        fontSize: 11,
        color: '#A0AEC0',
        marginTop: 4,
        fontWeight: '500',
    },
    navTextActive: {
        color: '#1E3A8A',
        fontWeight: '700',
    },
});

export default function SupervisorDashboardScreen() {
    const [teamStats, setTeamStats] = useState<any[]>([]);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [dashboardStats, setDashboardStats] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
    const [recentLogsheets, setRecentLogsheets] = useState<any[]>([]);
    const [todayProgress, setTodayProgress] = useState<{ checklistsDone: number; logsheetsDone: number; totalDone: number } | null>(null);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [openSoftRequests, setOpenSoftRequests] = useState<SoftServiceRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [teamStatsData, teamData, statsData, userData, submissions, logsheets, progress, orders] = await Promise.all([
                getTeamStats().catch(() => []),
                getMyTeam().catch(() => []),
                getDashboardStats().catch(() => null),
                getStoredUser(),
                getChecklistSubmissions().catch(() => []),
                getRecentLogsheetEntries().catch(() => []),
                getTodayProgress().catch(() => null),
                getWorkOrders(4).catch(() => []),
            ]);
            setTeamStats(teamStatsData);
            setTeamMembers(teamData);
            if (statsData) setDashboardStats(statsData);
            if (userData) setCurrentUser(userData);
            setRecentSubmissions(submissions);
            setRecentLogsheets(logsheets);
            if (progress) setTodayProgress(progress);
            setWorkOrders(orders);

            // Load soft-service requests only if this user has any soft caps
            const caps = userData?.roleCapabilities;
            if (caps?.canResolveSoftIssue || caps?.canRaiseSoftIssue || caps?.isSoftManager) {
                const softReqs = await getAllSoftRequests({ status: 'open' }).catch(() => []);
                setOpenSoftRequests(softReqs);
            }
        } catch (error: any) {
            if (error.message?.includes('authentication') || error.message?.includes('token')) {
                Alert.alert('Session Expired', 'Please log in again', [{
                    text: 'OK',
                    onPress: async () => { await clearAuth(); router.replace('/'); },
                }]);
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    // Derived stats
    const safeTeamStats = Array.isArray(teamStats) ? teamStats : [];
    const pendingLogsheets = safeTeamStats.reduce((s, m) => s + Number(m.logsheetCount || 0), 0);
    const activeChecklists = safeTeamStats.reduce((s, m) => s + Number(m.checklistCount || 0), 0);
    const urgentAlerts = dashboardStats?.flags?.critical ?? 0;
    const totalTasks = safeTeamStats.reduce((s, m) => s + Number(m.totalCount || 0), 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const checklistsDoneToday = recentSubmissions.filter(s => s.submittedAt?.startsWith(todayStr)).length;
    const logsheetsDoneToday = recentLogsheets.filter(e => e.submittedAt?.startsWith(todayStr)).length;
    // Prefer the dedicated today-progress endpoint if available; fall back to counting recent submissions
    const completedToday = todayProgress
        ? todayProgress.totalDone
        : checklistsDoneToday + logsheetsDoneToday;
    const inProgressCount = Math.max(0, Math.min(totalTasks - completedToday, Math.ceil(totalTasks * 0.2)));
    const pendingCount = Math.max(0, totalTasks - completedToday - inProgressCount);
    const pct = totalTasks > 0 ? Math.round((completedToday / totalTasks) * 100) : 0;

    const firstName = currentUser?.fullName?.split(' ')[0] || currentUser?.fullname?.split(' ')[0] || 'Supervisor';

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading dashboard...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* ── Header ────────────────────────────────────────────── */}
            <View style={styles.header}>
                <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.headerAvatar}>
                    <MaterialCommunityIcons name="account" size={28} color="#2563EB" />
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.headerText}>
                    <Text style={styles.headerWelcome}>Welcome back,</Text>
                    <Text style={styles.headerName}>Supervisor {firstName}</Text>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
                    <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/warnings')}>
                        <View style={styles.bellCircle}>
                            <MaterialCommunityIcons name="bell-outline" size={22} color="#64748B" />
                            {urgentAlerts > 0 && <View style={styles.bellDot} />}
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
            >
                <View style={styles.content}>

                    {/* ── Stat Cards ─────────────────────────────────────── */}
                    <Animated.View entering={FadeInUp.delay(300).duration(400).springify()} style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#DBEAFE' }]}>
                                <MaterialCommunityIcons name="notebook-outline" size={20} color="#2563EB" />
                            </View>
                            <Text style={[styles.statNum, { color: '#1E3A8A' }]}>{pendingLogsheets}</Text>
                            <Text style={styles.statLabel}>Pending{'\n'}Logsheets</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#D1FAE5' }]}>
                                <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#059669" />
                            </View>
                            <Text style={[styles.statNum, { color: '#065F46' }]}>{activeChecklists}</Text>
                            <Text style={styles.statLabel}>Active{'\n'}Checklists</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEF2F2' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#FEE2E2' }]}>
                                <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
                            </View>
                            <Text style={[styles.statNum, { color: '#991B1B' }]}>{urgentAlerts}</Text>
                            <Text style={styles.statLabel}>Urgent{'\n'}Alerts</Text>
                        </View>
                    </Animated.View>

                    {/* ── Daily Task Progress ───────────────────────────────── */}
                    <Animated.View entering={FadeInUp.delay(400).duration(400).springify()} style={styles.progressCard}>
                        <View style={styles.progressCardHeader}>
                            <View>
                                <Text style={styles.progressTitle}>Daily Task Progress</Text>
                                <Text style={styles.progressSub}>Overview of today's workload</Text>
                            </View>
                            {totalTasks > 0 && (
                                <View style={styles.trendBadge}>
                                    <MaterialCommunityIcons name="trending-up" size={14} color="#059669" />
                                    <Text style={styles.trendText}>+{pct}%</Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.progressBody}>
                            {/* Partial-arc donut ring using two-halves technique */}
                            <View style={styles.ringOuter}>
                                <DonutRing pct={pct} />
                            </View>
                            {/* Legend */}
                            <View style={styles.legend}>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                                    <Text style={styles.legendLabel}>Completed</Text>
                                    <Text style={styles.legendCount}>{completedToday}</Text>
                                </View>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#60A5FA' }]} />
                                    <Text style={styles.legendLabel}>In Progress</Text>
                                    <Text style={styles.legendCount}>{inProgressCount}</Text>
                                </View>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#CBD5E1' }]} />
                                    <Text style={styles.legendLabel}>Pending</Text>
                                    <Text style={styles.legendCount}>{pendingCount}</Text>
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* ── Work Orders ─────────────────────────────────── */}
                    {workOrders.length > 0 && (
                        <Animated.View entering={FadeInUp.delay(500).duration(400).springify()} style={styles.woSection}>
                            <View style={styles.techHeader}>
                                <Text style={styles.sectionTitle}>Work Orders</Text>
                                <TouchableOpacity onPress={() => router.push('/warnings' as any)}>
                                    <Text style={styles.viewAllText}>View All</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 4, paddingBottom: 10 }}>
                                {workOrders.map((wo: any, idx) => {
                                    const status = (wo.status || 'open').toLowerCase();
                                    const priority = (wo.priority || 'medium').toLowerCase();
                                    const statusMap: Record<string, { label: string; bg: string; color: string }> = {
                                        in_progress: { label: 'IN PROGRESS', bg: '#FFF7ED', color: '#D97706' },
                                        open: { label: 'ASSIGNED', bg: '#EFF6FF', color: '#2563EB' },
                                        closed: { label: 'CLOSED', bg: '#ECFDF5', color: '#10B981' },
                                    };
                                    const sc = statusMap[status] || statusMap.open;
                                    const priorityMap: Record<string, { icon: string; color: string; label: string }> = {
                                        high: { icon: 'alert', color: '#EF4444', label: 'High Priority' },
                                        critical: { icon: 'alert', color: '#DC2626', label: 'Critical' },
                                        medium: { icon: 'format-list-bulleted', color: '#64748B', label: 'Medium Priority' },
                                        low: { icon: 'arrow-down-circle-outline', color: '#94A3B8', label: 'Low Priority' },
                                    };
                                    const pc = priorityMap[priority] || priorityMap.medium;
                                    return (
                                        <Animated.View key={wo.id} entering={FadeInUp.delay(550 + (idx * 50)).duration(400).springify()}>
                                            <TouchableOpacity
                                                style={styles.woCard}
                                                activeOpacity={0.7}
                                                onPress={() => router.push({ pathname: '/work-order-details' as any, params: { id: wo.id } })}
                                            >
                                                <View style={styles.woCardTop}>
                                                    <View style={[styles.woStatusBadge, { backgroundColor: sc.bg }]}>
                                                        <Text style={[styles.woStatusText, { color: sc.color }]}>{sc.label}</Text>
                                                    </View>
                                                    <Text style={styles.woNumber}>#{wo.workOrderNumber || `WO-${wo.id}`}</Text>
                                                </View>
                                                <Text style={styles.woTitle} numberOfLines={2}>{wo.issueDescription || wo.assetName || 'Work Order'}</Text>
                                                <View style={styles.woPriorityRow}>
                                                    <MaterialCommunityIcons name={pc.icon as any} size={14} color={pc.color} />
                                                    <Text style={[styles.woPriorityText, { color: pc.color }]}>{pc.label}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })}
                            </ScrollView>
                        </Animated.View>
                    )}

                    {/* ── Soft Services Section (shown only if user has soft caps) ─── */}
                    {(() => {
                        const caps = currentUser?.roleCapabilities;
                        if (!caps?.canResolveSoftIssue && !caps?.canRaiseSoftIssue && !caps?.isSoftManager) return null;

                        return (
                            <Animated.View entering={FadeInUp.delay(520).duration(400).springify()} style={styles.softSection}>
                                {/* Header row */}
                                <View style={styles.techHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={styles.softBadge}>
                                            <Text style={styles.softBadgeText}>SOFT SERVICES</Text>
                                        </View>
                                        <Text style={styles.sectionTitle}>Service Requests</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => router.push('/soft-supervisor-dashboard' as any)}>
                                        <Text style={styles.viewAllText}>View All</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Resolver: show open requests to act on */}
                                {caps.canResolveSoftIssue && (
                                    openSoftRequests.length > 0 ? (
                                        openSoftRequests.slice(0, 3).map(req => (
                                            <TouchableOpacity
                                                key={req.id}
                                                style={styles.softReqCard}
                                                activeOpacity={0.8}
                                                onPress={() => router.push('/qr-scanner' as any)}
                                            >
                                                <View style={styles.softReqLeft}>
                                                    <MaterialCommunityIcons name="alert-circle" size={22} color="#DC2626" />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.softReqAsset} numberOfLines={1}>{req.assetName}</Text>
                                                    <Text style={styles.softReqMeta}>
                                                        Raised by {req.raisedByName || 'Client Supervisor'} · {req.raisedAt ? new Date(req.raisedAt).toLocaleDateString() : '—'}
                                                    </Text>
                                                </View>
                                                <View style={styles.softOpenBadge}>
                                                    <Text style={styles.softOpenBadgeText}>Open</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))
                                    ) : (
                                        <View style={styles.softEmptyRow}>
                                            <MaterialCommunityIcons name="check-circle-outline" size={20} color="#16A34A" />
                                            <Text style={styles.softEmptyText}>No open service requests</Text>
                                        </View>
                                    )
                                )}

                                {/* Raiser: show quick action to raise an issue */}
                                {caps.canRaiseSoftIssue && !caps.canResolveSoftIssue && (
                                    <TouchableOpacity
                                        style={styles.softRaiseBtn}
                                        activeOpacity={0.85}
                                        onPress={() => router.push('/qr-scanner' as any)}
                                    >
                                        <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
                                        <Text style={styles.softRaiseBtnText}>Scan Asset to Raise Issue</Text>
                                        <MaterialCommunityIcons name="chevron-right" size={18} color="#fff" />
                                    </TouchableOpacity>
                                )}

                                {/* Manager: view-only summary */}
                                {caps.isSoftManager && !caps.canResolveSoftIssue && !caps.canRaiseSoftIssue && (
                                    <TouchableOpacity
                                        style={styles.softManagerBtn}
                                        activeOpacity={0.85}
                                        onPress={() => router.push('/soft-manager-dashboard' as any)}
                                    >
                                        <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#7C3AED" />
                                        <Text style={styles.softManagerBtnText}>View Service Request Reports</Text>
                                        <MaterialCommunityIcons name="chevron-right" size={18} color="#7C3AED" />
                                    </TouchableOpacity>
                                )}
                            </Animated.View>
                        );
                    })()}

                    {/* ── Assign New Task button ─────────────────────── */}
                    <Animated.View entering={SlideInDown.delay(200).duration(800)}>
                        <TouchableOpacity
                            style={styles.assignBtn}
                            activeOpacity={0.8}
                            onPress={() => router.push('/checklists')}
                        >
                            <MaterialCommunityIcons name="clipboard-plus-outline" size={22} color="#FFFFFF" />
                            <Text style={styles.assignBtnText}>Assign New Task</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    <View style={{ height: 24 }} />
                </View>
            </ScrollView>

            <SupervisorBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

// ─── Partial-arc donut ring component ────────────────────────────────────────
const RING_SIZE = 110;
const RING_STROKE = 12;
const RING_INNER = RING_SIZE - RING_STROKE * 2;

function DonutRing({ pct }: { pct: number }) {
    const deg = (pct / 100) * 360;
    // Right half: sweeps from 0° to MIN(deg,180°). Maps 0%→-180°, 50%→0°
    const rightRot = pct <= 50 ? (pct / 50) * 180 - 180 : 0;
    // Left half: only active when pct>50. Maps 50%→-180°, 100%→0°
    const leftRot = pct > 50 ? ((pct - 50) / 50) * 180 - 180 : -180;

    return (
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
            {/* Grey background ring */}
            <View style={[StyleSheet.absoluteFillObject, {
                borderRadius: RING_SIZE / 2,
                backgroundColor: '#E2E8F0',
            }]} />
            {/* Right half clip — reveals arc from 0° to min(deg,180°) */}
            <View style={{ position: 'absolute', right: 0, top: 0, width: RING_SIZE / 2, height: RING_SIZE, overflow: 'hidden' }}>
                <View style={{
                    position: 'absolute', left: -RING_SIZE / 2, top: 0,
                    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
                    backgroundColor: pct > 0 ? '#2563EB' : '#E2E8F0',
                    transform: [{ rotate: `${rightRot}deg` }],
                }} />
            </View>
            {/* Left half clip — reveals arc from 180° to deg° (only if pct>50) */}
            <View style={{ position: 'absolute', left: 0, top: 0, width: RING_SIZE / 2, height: RING_SIZE, overflow: 'hidden' }}>
                <View style={{
                    position: 'absolute', right: -RING_SIZE / 2, top: 0,
                    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
                    backgroundColor: pct > 50 ? '#2563EB' : '#E2E8F0',
                    transform: [{ rotate: `${leftRot}deg` }],
                }} />
            </View>
            {/* White donut hole */}
            <View style={{
                position: 'absolute',
                top: RING_STROKE, left: RING_STROKE,
                width: RING_INNER, height: RING_INNER,
                borderRadius: RING_INNER / 2,
                backgroundColor: '#FFFFFF',
                justifyContent: 'center', alignItems: 'center',
            }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A202C' }}>{pct}%</Text>
            </View>
        </View>
    );
}
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    loadingText: { fontSize: 15, color: '#64748B', fontWeight: '500' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        backgroundColor: '#FAF9F6',
        gap: 14,
    },
    headerAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#EFF6FF',
        borderWidth: 2,
        borderColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: { flex: 1 },
    headerWelcome: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    headerName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 2, letterSpacing: -0.5 },
    bellBtn: { padding: 4 },
    bellCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellDot: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: '#FAF9F6',
    },

    content: { padding: 20, paddingTop: 16, paddingBottom: 20 },

    // Stat cards
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: {
        flex: 1,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        gap: 8,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#FFFFFF', // Creates a clean edge for light backgrounds
    },
    statIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statNum: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', textAlign: 'center', lineHeight: 15, textTransform: 'uppercase' },

    // Progress card
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    progressCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    progressTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    progressSub: { fontSize: 13, color: '#64748B', marginTop: 3, fontWeight: '500' },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 4,
    },
    trendText: { fontSize: 13, fontWeight: '800', color: '#059669' },
    progressBody: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    ringOuter: { alignItems: 'center', justifyContent: 'center' },
    legend: { flex: 1, gap: 14 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    legendDot: { width: 12, height: 12, borderRadius: 6 },
    legendLabel: { flex: 1, fontSize: 13, color: '#64748B', fontWeight: '600' },
    legendCount: { fontSize: 15, fontWeight: '800', color: '#0F172A' },

    // Technicians section
    techHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    viewAllText: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
    emptyTeam: { alignItems: 'center', paddingVertical: 24, gap: 10 },
    emptyTeamText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
    techCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
        gap: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    techAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    techInitials: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
    statusDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10B981',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    techInfo: { flex: 1 },
    techName: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    techRole: { fontSize: 13, color: '#64748B', marginTop: 3, textTransform: 'capitalize', fontWeight: '500' },
    msgBtn: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Work Orders
    woSection: { marginBottom: 12 },
    woCard: {
        width: 240,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
        marginBottom: 4,
    },
    woCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    woStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    woStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    woNumber: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },
    woTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 12, lineHeight: 22 },
    woPriorityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    woPriorityText: { fontSize: 13, fontWeight: '600' },

    // Soft Services section
    softSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    softBadge: {
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BBF7D0',
    },
    softBadgeText: { fontSize: 9, fontWeight: '800', color: '#166534', letterSpacing: 0.8 },
    softReqCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF7F7',
        borderRadius: 10,
        padding: 12,
        marginTop: 10,
        gap: 10,
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    softReqLeft: { width: 30, alignItems: 'center' },
    softReqAsset: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    softReqMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
    softOpenBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    softOpenBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
    softEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
    softEmptyText: { fontSize: 13, color: '#16A34A', fontWeight: '600' },
    softRaiseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0369A1',
        borderRadius: 10,
        padding: 14,
        marginTop: 10,
        gap: 10,
    },
    softRaiseBtnText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    softManagerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F3FF',
        borderRadius: 10,
        padding: 14,
        marginTop: 10,
        gap: 10,
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    softManagerBtnText: { flex: 1, color: '#7C3AED', fontSize: 14, fontWeight: '700' },

    // Assign button
    assignBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        borderRadius: 16,
        paddingVertical: 18,
        marginTop: 10,
        gap: 12,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    assignBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
