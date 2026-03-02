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
import { getMyTeam, clearAuth, getDashboardStats, getStoredUser, getTeamStats } from '../utils/api';

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

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/assets-list')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'assets' ? 'office-building' : 'office-building-outline'}
                    size={24}
                    color={activeRoute === 'assets' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'assets' && navStyles.navTextActive]}>Assets</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/checklists')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'checklists' ? 'clipboard-check' : 'clipboard-check-outline'}
                    size={24}
                    color={activeRoute === 'checklists' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'checklists' && navStyles.navTextActive]}>Checklists</Text>
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
    const [dashboardStats, setDashboardStats] = useState<{ totalAssets: number; activeAssets: number } | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [teamStatsData, teamData, statsData, userData] = await Promise.all([
                getTeamStats().catch(() => []),
                getMyTeam(),
                getDashboardStats().catch(() => null),
                getStoredUser(),
            ]);
            setTeamStats(teamStatsData);
            setTeamMembers(teamData);
            if (statsData) setDashboardStats(statsData);
            if (userData) setCurrentUser(userData);
        } catch (error: any) {
            console.error('Failed to load dashboard data:', error);
            // If authentication error, clear tokens and go back to login
            if (error.message?.includes('authentication') || error.message?.includes('token')) {
                Alert.alert(
                    'Session Expired',
                    'Please log in again',
                    [
                        {
                            text: 'OK',
                            onPress: async () => {
                                await clearAuth();
                                router.replace('/');
                            },
                        },
                    ]
                );
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const totalAssigned = teamStats.reduce((sum, m) => sum + Number(m.totalCount || 0), 0);

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading dashboard...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.logoCircle}>
                        <Text style={styles.logoText}>FM</Text>
                    </View>
                    <View>
                        <Text style={styles.portalSub}>SUPERVISOR PORTAL</Text>
                        <Text style={styles.greetingText}>
                            {currentUser?.fullName
                                ? `Welcome, ${currentUser.fullName.split(' ')[0]}!`
                                : 'Welcome Back!'}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.allAssignmentsBtn} onPress={() => router.push('/team-assignments')}>
                    <MaterialCommunityIcons name="clipboard-list-outline" size={18} color="#1E3A8A" />
                    <Text style={styles.allAssignmentsBtnText}>All</Text>
                </TouchableOpacity>
            </View>

            <ScrollView 
                style={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
                }
            >
                <View style={styles.contentPadding}>

                    {/* Quick Stats */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#EBF8FF' }]}>
                            <MaterialCommunityIcons name="account-group" size={28} color="#2B6CB0" />
                            <Text style={styles.statNumber}>{teamMembers.length}</Text>
                            <Text style={styles.statLabel}>Team Members</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FFF5F5' }]}>
                            <MaterialCommunityIcons name="clipboard-check" size={28} color="#7C3AED" />
                            <Text style={styles.statNumber}>{totalAssigned}</Text>
                            <Text style={styles.statLabel}>Assigned Tasks</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
                            <MaterialCommunityIcons name="office-building" size={28} color="#38A169" />
                            <Text style={styles.statNumber}>{dashboardStats?.activeAssets ?? '—'}</Text>
                            <Text style={styles.statLabel}>Active Assets</Text>
                        </View>
                    </View>

                    {/* Main Feature Cards */}
                    <Text style={styles.sectionTitle}>Management</Text>

                    {/* Assets Card */}
                    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push('/assets-list')}>
                        <View style={styles.cardTopRow}>
                            <View style={[styles.iconBox, { backgroundColor: '#EBF8FF' }]}>
                                <MaterialCommunityIcons name="office-building" size={24} color="#2B6CB0" />
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E0" />
                        </View>

                        <Text style={styles.cardTitle}>Assets</Text>
                        <Text style={styles.cardSubtitle}>Manage facility assets and equipment</Text>

                        <View style={styles.divider} />

                        <View style={styles.cardBottomRow}>
                            <Text style={styles.largeNumber}>{dashboardStats?.activeAssets ?? '—'}</Text>
                            <View style={[styles.pill, { backgroundColor: '#F0FDF4' }]}>
                                <Text style={[styles.pillText, { color: '#38A169' }]}>Active</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Team Assignment Overview */}
                    <View style={styles.teamSection}>
                        <View style={styles.teamSectionHeader}>
                            <Text style={styles.sectionTitle}>Team Assignments</Text>
                            <TouchableOpacity onPress={() => router.push('/team-assignments')} style={styles.viewAllBtn}>
                                <Text style={styles.viewAllText}>View All →</Text>
                            </TouchableOpacity>
                        </View>
                        {teamStats.length === 0 ? (
                            <View style={styles.noTeamBox}>
                                <MaterialCommunityIcons name="account-group-outline" size={32} color="#CBD5E0" />
                                <Text style={styles.noTeamText}>No team members yet</Text>
                            </View>
                        ) : (
                            teamStats.map((member: any) => (
                                <View key={member.id} style={styles.memberStatCard}>
                                    <View style={styles.memberStatAvatar}>
                                        <Text style={styles.memberStatInitials}>
                                            {String(member.fullName || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.memberStatInfo}>
                                        <Text style={styles.memberStatName}>{member.fullName}</Text>
                                        <Text style={styles.memberStatRole}>{member.role}</Text>
                                    </View>
                                    <View style={styles.memberStatCounts}>
                                        <View style={styles.countPill}>
                                            <MaterialCommunityIcons name="clipboard-check-outline" size={12} color="#7C3AED" />
                                            <Text style={styles.countText}>{member.checklistCount}</Text>
                                        </View>
                                        <View style={[styles.countPill, { backgroundColor: '#DBEAFE' }]}>
                                            <MaterialCommunityIcons name="notebook-outline" size={12} color="#2563EB" />
                                            <Text style={[styles.countText, { color: '#2563EB' }]}>{member.logsheetCount}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>

                    {/* My Team Card */}
                    <TouchableOpacity style={styles.card} activeOpacity={0.8}>
                        <View style={styles.cardTopRow}>
                            <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                                <MaterialCommunityIcons name="account-group" size={24} color="#059669" />
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E0" />
                        </View>

                        <Text style={styles.cardTitle}>My Team</Text>
                        <Text style={styles.cardSubtitle}>Manage technicians and assignments</Text>

                        <View style={styles.divider} />

                        <View style={styles.cardBottomRow}>
                            <Text style={styles.largeNumber}>{teamMembers.length}</Text>
                            <View style={[styles.pill, { backgroundColor: '#EFF6FF' }]}>
                                <Text style={[styles.pillText, { color: '#1E40AF' }]}>Members</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Warnings Card */}
                    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push('/warnings')}>
                        <View style={styles.cardTopRow}>
                            <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
                                <MaterialCommunityIcons name="alert-circle" size={24} color="#DC2626" />
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E0" />
                        </View>

                        <Text style={styles.cardTitle}>Warnings & Alerts</Text>
                        <Text style={styles.cardSubtitle}>View critical issues</Text>

                        <View style={styles.divider} />

                        <View style={styles.cardBottomRow}>
                            <Text style={styles.largeNumber}>-</Text>
                            <View style={[styles.pill, { backgroundColor: '#F0FDF4' }]}>
                                <Text style={[styles.pillText, { color: '#16A34A' }]}>View All</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                </View>
            </ScrollView>

            {/* Bottom Nav */}
            <SupervisorBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#718096',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#1E3A8A',
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#1E3A8A',
        letterSpacing: 0.5,
    },
    portalSub: {
        fontSize: 10,
        color: '#A0AEC0',
        fontWeight: '600',
        letterSpacing: 1,
    },
    greetingText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginTop: 2,
    },
    bellIconBtn: {
        position: 'relative',
        padding: 8,
    },
    notificationDot: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E53E3E',
    },
    scrollContent: {
        flex: 1,
    },
    contentPadding: {
        padding: 20,
        paddingBottom: 40,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1A202C',
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: '#718096',
        fontWeight: '600',
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#718096',
        lineHeight: 18,
    },
    divider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 16,
    },
    cardBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    largeNumber: {
        fontSize: 32,
        fontWeight: '800',
        color: '#1A202C',
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    allAssignmentsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 4,
    },
    allAssignmentsBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E3A8A',
    },
    teamSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    teamSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    viewAllBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2563EB',
    },
    noTeamBox: {
        alignItems: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    noTeamText: {
        fontSize: 13,
        color: '#A0AEC0',
    },
    memberStatCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        gap: 12,
    },
    memberStatAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#EBF8FF',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    memberStatInitials: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2B6CB0',
    },
    memberStatInfo: { flex: 1 },
    memberStatName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1A202C',
    },
    memberStatRole: {
        fontSize: 11,
        color: '#718096',
        textTransform: 'capitalize',
    },
    memberStatCounts: {
        flexDirection: 'row',
        gap: 6,
        flexShrink: 0,
    },
    countPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EDE9FE',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        gap: 3,
    },
    countText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#7C3AED',
    },
});
