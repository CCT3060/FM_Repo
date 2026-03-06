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
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import { getTeamStats } from '../utils/api';
import { SupervisorBottomNav } from './supervisor-dashboard';

type StatusFilter = 'all' | 'active' | 'on_break' | 'offline';

interface TechMember {
    id: number;
    fullName: string;
    role: string;
    checklistCount: number;
    logsheetCount: number;
    totalCount: number;
    // derived
    status: 'active' | 'on_break' | 'offline';
}

function deriveStatus(member: any, idx: number): 'active' | 'on_break' | 'offline' {
    if (Number(member.totalCount) > 0) {
        // Vary for demo: most are active, occasional on_break
        if (idx % 5 === 3) return 'on_break';
        return 'active';
    }
    return 'offline';
}

const STATUS_CFG = {
    active: { label: 'ACTIVE', bg: '#ECFDF5', color: '#059669', dot: '#10B981' },
    on_break: { label: 'ON BREAK', bg: '#FFFBEB', color: '#D97706', dot: '#F59E0B' },
    offline: { label: 'OFFLINE', bg: '#F8FAFC', color: '#64748B', dot: '#94A3B8' },
};

const AVATAR_COLORS = [
    { bg: '#EFF6FF', text: '#1D4ED8' },
    { bg: '#F0FFF4', text: '#15803D' },
    { bg: '#FFF7ED', text: '#C2410C' },
    { bg: '#FAF5FF', text: '#7C3AED' },
    { bg: '#FFF1F2', text: '#BE123C' },
];

export default function TechniciansOverviewScreen() {
    const [members, setMembers] = useState<TechMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setError(null);
            const raw = await getTeamStats();
            setMembers(
                raw.map((m: any, idx: number) => ({
                    ...m,
                    fullName: m.fullName || m.fullname || 'Unknown',
                    checklistCount: Number(m.checklistCount || 0),
                    logsheetCount: Number(m.logsheetCount || 0),
                    totalCount: Number(m.totalCount || 0),
                    status: deriveStatus(m, idx),
                }))
            );
        } catch (err: any) {
            setError(err.message || 'Failed to load technicians');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const filtered = statusFilter === 'all'
        ? members
        : members.filter((m) => m.status === statusFilter);

    const tabCounts = {
        all: members.length,
        active: members.filter((m) => m.status === 'active').length,
        on_break: members.filter((m) => m.status === 'on_break').length,
        offline: members.filter((m) => m.status === 'offline').length,
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Technicians Overview</Text>
                <TouchableOpacity style={styles.headerBtn}>
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#0F172A" />
                </TouchableOpacity>
            </View>

            {/* Status filter tabs */}
            <View style={styles.tabsContainer}>
                {([
                    { key: 'all', label: `All (${tabCounts.all})` },
                    { key: 'active', label: 'Active' },
                    { key: 'on_break', label: 'On Break' },
                    { key: 'offline', label: 'Offline' },
                ] as { key: StatusFilter; label: string }[]).map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tab}
                        onPress={() => setStatusFilter(tab.key)}
                    >
                        <Text style={[styles.tabText, statusFilter === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                        {statusFilter === tab.key && <View style={styles.tabUnderline} />}
                    </TouchableOpacity>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                >
                    {filtered.length === 0 ? (
                        <View style={styles.center}>
                            <MaterialCommunityIcons name="account-group-outline" size={52} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No technicians found</Text>
                        </View>
                    ) : (
                        <Animated.View layout={Layout.springify()}>
                            {filtered.map((member, idx) => {
                                const initials = member.fullName
                                    .split(' ')
                                    .map((n) => n[0] || '')
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase();
                                const sc = STATUS_CFG[member.status];
                                const ac = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                                return (
                                    <Animated.View key={member.id} entering={FadeInUp.delay(50 * idx).duration(400).springify()}>
                                        <TouchableOpacity style={styles.card} activeOpacity={0.8}>
                                            {/* Avatar */}
                                            <View style={[styles.avatar, { backgroundColor: ac.bg }]}>
                                                <Text style={[styles.avatarText, { color: ac.text }]}>{initials}</Text>
                                                <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
                                            </View>

                                            {/* Info */}
                                            <View style={styles.cardInfo}>
                                                <Text style={styles.memberName}>{member.fullName}</Text>
                                                <Text style={styles.memberStats}>
                                                    {member.logsheetCount} Logsheet{member.logsheetCount !== 1 ? 's' : ''}{'  '}
                                                    {member.checklistCount} Checklist{member.checklistCount !== 1 ? 's' : ''}
                                                </Text>
                                            </View>

                                            {/* Status badge + arrow */}
                                            <View style={styles.cardRight}>
                                                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                                                    <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                                                </View>
                                                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" style={{ marginTop: 4 }} />
                                            </View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                );
                            })}
                        </Animated.View>
                    )}
                    <View style={{ height: 20 }} />
                </ScrollView>
            )}

            <SupervisorBottomNav activeRoute="team" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        paddingBottom: 12,
        backgroundColor: '#FAF9F6',
    },
    headerBtn: { padding: 4, width: 36 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

    // Tabs
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        paddingHorizontal: 8,
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 14, position: 'relative' },
    tabText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    tabTextActive: { color: '#2563EB', fontWeight: '800' },
    tabUnderline: {
        position: 'absolute', bottom: 0, left: 16, right: 16,
        height: 3, backgroundColor: '#2563EB', borderRadius: 3,
    },

    // List
    listContent: { padding: 16, paddingBottom: 20 },

    // Cards
    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 16,
        padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
        gap: 14,
    },
    avatar: {
        width: 52, height: 52, borderRadius: 26,
        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    avatarText: { fontSize: 18, fontWeight: '800' },
    statusDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 12, height: 12, borderRadius: 6,
        borderWidth: 2, borderColor: '#FFFFFF',
    },
    cardInfo: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4, letterSpacing: -0.2 },
    memberStats: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    cardRight: { alignItems: 'flex-end', gap: 4 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    statusBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

    // States
    emptyText: { fontSize: 15, color: '#64748B', marginTop: 12, fontWeight: '500' },
    errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
