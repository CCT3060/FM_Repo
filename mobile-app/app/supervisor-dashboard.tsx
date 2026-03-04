import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getMyTeam, clearAuth, getDashboardStats, getStoredUser, getTeamStats, getChecklistSubmissions } from '../utils/api';

// Reusable Navigation Bar Component for Supervisor
export const SupervisorBottomNav = ({ activeRoute }: { activeRoute: string }) => {
    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/supervisor-dashboard')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'home' ? 'home' : 'home-outline'}
                    size={24}
                    color={activeRoute === 'home' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'home' && navStyles.navTextActive]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/checklists')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'checklists' ? 'clipboard-check' : 'clipboard-check-outline'}
                    size={24}
                    color={activeRoute === 'checklists' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'checklists' && navStyles.navTextActive]}>Tasks</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/assets-list')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'assets' ? 'office-building' : 'office-building-outline'}
                    size={24}
                    color={activeRoute === 'assets' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'assets' && navStyles.navTextActive]}>Assets</Text>
            </TouchableOpacity>

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
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [teamStatsData, teamData, statsData, userData, submissions] = await Promise.all([
                getTeamStats().catch(() => []),
                getMyTeam().catch(() => []),
                getDashboardStats().catch(() => null),
                getStoredUser(),
                getChecklistSubmissions().catch(() => []),
            ]);
            setTeamStats(teamStatsData);
            setTeamMembers(teamData);
            if (statsData) setDashboardStats(statsData);
            if (userData) setCurrentUser(userData);
            setRecentSubmissions(submissions);
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
    const pendingLogsheets = teamStats.reduce((s, m) => s + Number(m.logsheetCount || 0), 0);
    const activeChecklists = teamStats.reduce((s, m) => s + Number(m.checklistCount || 0), 0);
    const urgentAlerts = dashboardStats?.flags?.critical ?? 0;
    const totalTasks = teamStats.reduce((s, m) => s + Number(m.totalCount || 0), 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const completedToday = recentSubmissions.filter(s => s.submittedAt?.startsWith(todayStr)).length;
    const inProgressCount = Math.max(0, Math.min(dashboardStats?.openIssues ?? 0, totalTasks - completedToday));
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
            {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <View style={styles.header}>
                <View style={styles.headerAvatar}>
                    <MaterialCommunityIcons name="account" size={28} color="#1E3A8A" />
                </View>
                <View style={styles.headerText}>
                    <Text style={styles.headerWelcome}>Welcome back,</Text>
                    <Text style={styles.headerName}>Supervisor {firstName}</Text>
                </View>
                <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/warnings')}>
                    <View style={styles.bellCircle}>
                        <MaterialCommunityIcons name="bell-outline" size={22} color="#4A5568" />
                        {urgentAlerts > 0 && <View style={styles.bellDot} />}
                    </View>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />}
            >
                <View style={styles.content}>

                    {/* â”€â”€ Stat Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#EBF8FF' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#BEE3F8' }]}>
                                <MaterialCommunityIcons name="notebook-outline" size={20} color="#2B6CB0" />
                            </View>
                            <Text style={[styles.statNum, { color: '#2C5282' }]}>{pendingLogsheets}</Text>
                            <Text style={styles.statLabel}>Pending{'\n'}Logsheets</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#F0FFF4' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#C6F6D5' }]}>
                                <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#276749" />
                            </View>
                            <Text style={[styles.statNum, { color: '#276749' }]}>{activeChecklists}</Text>
                            <Text style={styles.statLabel}>Active{'\n'}Checklists</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FFF5F5' }]}>
                            <View style={[styles.statIconWrap, { backgroundColor: '#FED7D7' }]}>
                                <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#C53030" />
                            </View>
                            <Text style={[styles.statNum, { color: '#C53030' }]}>{urgentAlerts}</Text>
                            <Text style={styles.statLabel}>Urgent{'\n'}Alerts</Text>
                        </View>
                    </View>

                    {/* â”€â”€ Daily Task Progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <View style={styles.progressCard}>
                        <View style={styles.progressCardHeader}>
                            <View>
                                <Text style={styles.progressTitle}>Daily Task Progress</Text>
                                <Text style={styles.progressSub}>Overview of today's workload</Text>
                            </View>
                            {totalTasks > 0 && (
                                <View style={styles.trendBadge}>
                                    <MaterialCommunityIcons name="trending-up" size={14} color="#276749" />
                                    <Text style={styles.trendText}>{pct}%</Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.progressBody}>
                            {/* Ring */}
                            <View style={styles.ringOuter}>
                                <View style={[styles.ringBorder, { borderColor: pct > 0 ? '#2563EB' : '#E2E8F0' }]}>
                                    <View style={styles.ringInner}>
                                        <Text style={styles.ringPct}>{pct}%</Text>
                                    </View>
                                </View>
                            </View>
                            {/* Legend */}
                            <View style={styles.legend}>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                                    <Text style={styles.legendLabel}>Completed</Text>
                                    <Text style={styles.legendCount}>{completedToday}</Text>
                                </View>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#93C5FD' }]} />
                                    <Text style={styles.legendLabel}>In Progress</Text>
                                    <Text style={styles.legendCount}>{inProgressCount}</Text>
                                </View>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: '#CBD5E0' }]} />
                                    <Text style={styles.legendLabel}>Pending</Text>
                                    <Text style={styles.legendCount}>{pendingCount}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* â”€â”€ Technicians on Duty â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <View style={styles.techHeader}>
                        <Text style={styles.sectionTitle}>Technicians on Duty</Text>
                        <TouchableOpacity onPress={() => router.push('/team-assignments')}>
                            <Text style={styles.viewAllText}>View All</Text>
                        </TouchableOpacity>
                    </View>

                    {teamMembers.length === 0 ? (
                        <View style={styles.emptyTeam}>
                            <MaterialCommunityIcons name="account-group-outline" size={36} color="#CBD5E0" />
                            <Text style={styles.emptyTeamText}>No team members yet</Text>
                        </View>
                    ) : (
                        teamMembers.map((member: any) => {
                            const name = member.fullName || member.fullname || 'Unknown';
                            const initials = name.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase();
                            const memberStat = teamStats.find((s) => s.id === member.id);
                            const taskInfo = memberStat
                                ? `${String(member.role).replace('_', ' ')} â€¢ ${memberStat.totalCount || 0} task${memberStat.totalCount !== 1 ? 's' : ''}`
                                : String(member.role).replace('_', ' ');
                            return (
                                <View key={member.id} style={styles.techCard}>
                                    <View style={styles.techAvatar}>
                                        <Text style={styles.techInitials}>{initials}</Text>
                                        <View style={styles.statusDot} />
                                    </View>
                                    <View style={styles.techInfo}>
                                        <Text style={styles.techName}>{name}</Text>
                                        <Text style={styles.techRole}>{taskInfo}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.msgBtn} onPress={() => router.push('/checklists')}>
                                        <MaterialCommunityIcons name="message-text-outline" size={20} color="#718096" />
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}

                    {/* â”€â”€ Assign New Task button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <TouchableOpacity
                        style={styles.assignBtn}
                        activeOpacity={0.85}
                        onPress={() => router.push('/checklists')}
                    >
                        <MaterialCommunityIcons name="clipboard-plus-outline" size={22} color="#FFFFFF" />
                        <Text style={styles.assignBtnText}>Assign New Task</Text>
                    </TouchableOpacity>

                    <View style={{ height: 24 }} />
                </View>
            </ScrollView>

            <SupervisorBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    loadingText: { fontSize: 15, color: '#718096' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
        gap: 14,
    },
    headerAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#EBF8FF',
        borderWidth: 2,
        borderColor: '#BEE3F8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: { flex: 1 },
    headerWelcome: { fontSize: 13, color: '#718096', fontWeight: '500' },
    headerName: { fontSize: 18, fontWeight: '800', color: '#1A202C', marginTop: 2 },
    bellBtn: { padding: 4 },
    bellCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F7FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E53E3E',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },

    content: { padding: 20, paddingTop: 16, paddingBottom: 20 },

    // Stat cards
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    statCard: {
        flex: 1,
        borderRadius: 14,
        padding: 14,
        alignItems: 'center',
        gap: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    statIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statNum: { fontSize: 26, fontWeight: '800' },
    statLabel: { fontSize: 11, color: '#4A5568', fontWeight: '600', textAlign: 'center', lineHeight: 15 },

    // Progress card
    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    progressCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 18,
    },
    progressTitle: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
    progressSub: { fontSize: 12, color: '#718096', marginTop: 3 },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0FFF4',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        gap: 4,
    },
    trendText: { fontSize: 13, fontWeight: '700', color: '#276749' },
    progressBody: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    ringOuter: { alignItems: 'center', justifyContent: 'center' },
    ringBorder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ringInner: {
        width: 78,
        height: 78,
        borderRadius: 39,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ringPct: { fontSize: 20, fontWeight: '800', color: '#1A202C' },
    legend: { flex: 1, gap: 12 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { flex: 1, fontSize: 13, color: '#4A5568', fontWeight: '500' },
    legendCount: { fontSize: 14, fontWeight: '800', color: '#1A202C' },

    // Technicians section
    techHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1A202C' },
    viewAllText: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
    emptyTeam: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyTeamText: { fontSize: 13, color: '#A0AEC0' },
    techCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
        gap: 12,
    },
    techAvatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#EBF8FF',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    techInitials: { fontSize: 15, fontWeight: '700', color: '#2B6CB0' },
    statusDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 11,
        height: 11,
        borderRadius: 6,
        backgroundColor: '#38A169',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    techInfo: { flex: 1 },
    techName: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
    techRole: { fontSize: 12, color: '#718096', marginTop: 2, textTransform: 'capitalize' },
    msgBtn: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#F7FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Assign button
    assignBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        borderRadius: 14,
        paddingVertical: 16,
        marginTop: 8,
        gap: 10,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    assignBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
