/**
 * soft-supervisor-dashboard.tsx
 * Dashboard for users with canResolveSoftIssue = true.
 * Shows: daily checklists to fill + open soft-service requests to resolve.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import {
    clearAuth,
    getAllSoftRequests,
    getMyAssignments,
    getStoredUser,
} from '../utils/api';
import type { SoftServiceRequest } from '../utils/api';

export default function SoftSupervisorDashboard() {
    const [user, setUser]           = useState<any>(null);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [openRequests, setOpenRequests] = useState<SoftServiceRequest[]>([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const loadData = async () => {
        try {
            const [userData, asgn, reqs] = await Promise.all([
                getStoredUser(),
                getMyAssignments().catch(() => []),
                getAllSoftRequests({ status: 'open' }).catch(() => []),
            ]);
            setUser(userData);
            setAssignments(Array.isArray(asgn) ? asgn : []);
            setOpenRequests(Array.isArray(reqs) ? reqs : []);
        } catch { /* silent */ }
        finally { setLoading(false); setRefreshing(false); }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const handleLogout = () =>
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: async () => { await clearAuth(); router.replace('/'); } },
        ]);

    if (loading) {
        return (
            <SafeAreaView style={s.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={s.loadingText}>Loading…</Text>
            </SafeAreaView>
        );
    }

    const firstName = user?.fullName?.split(' ')[0] || user?.fullname?.split(' ')[0] || 'User';
    const checklistsToday = assignments.filter(a => a.templateType === 'checklist').length;
    const logsheetsToday  = assignments.filter(a => a.templateType === 'logsheet').length;

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <View style={s.avatar}>
                    <MaterialCommunityIcons name="account" size={26} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.welcome}>Welcome back,</Text>
                    <Text style={s.name}>{firstName}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/qr-scanner' as any)} style={s.scanBtn}>
                    <MaterialCommunityIcons name="qrcode-scan" size={22} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                    <MaterialCommunityIcons name="logout" size={20} color="#64748B" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            >
                {/* Stats row */}
                <View style={s.statsRow}>
                    <View style={[s.statCard, { backgroundColor: '#EFF6FF' }]}>
                        <MaterialCommunityIcons name="clipboard-list-outline" size={24} color="#2563EB" />
                        <Text style={[s.statNum, { color: '#1E3A8A' }]}>{checklistsToday}</Text>
                        <Text style={s.statLabel}>Checklists{'\n'}Assigned</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: '#FEF2F2' }]}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#DC2626" />
                        <Text style={[s.statNum, { color: '#991B1B' }]}>{openRequests.length}</Text>
                        <Text style={s.statLabel}>Open{'\n'}Requests</Text>
                    </View>
                    <View style={[s.statCard, { backgroundColor: '#ECFDF5' }]}>
                        <MaterialCommunityIcons name="notebook-outline" size={24} color="#059669" />
                        <Text style={[s.statNum, { color: '#065F46' }]}>{logsheetsToday}</Text>
                        <Text style={s.statLabel}>Logsheets{'\n'}Assigned</Text>
                    </View>
                </View>

                {/* Quick action: scan QR */}
                <TouchableOpacity
                    style={s.scanAction}
                    onPress={() => router.push('/qr-scanner' as any)}
                    activeOpacity={0.85}
                >
                    <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={s.scanActionTitle}>Scan Asset QR</Text>
                        <Text style={s.scanActionSub}>Resolve a reported issue or fill checklist</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#fff" />
                </TouchableOpacity>

                {/* Open requests */}
                {openRequests.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>Open Requests</Text>
                        {openRequests.slice(0, 5).map(req => (
                            <View key={req.id} style={s.reqCard}>
                                <View style={s.reqLeft}>
                                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.reqAsset} numberOfLines={1}>{req.assetName}</Text>
                                    <Text style={s.reqMeta}>
                                        Raised by {req.raisedByName || 'Client Supervisor'} · {
                                            req.raisedAt ? new Date(req.raisedAt).toLocaleDateString() : '—'
                                        }
                                    </Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: '#FEF2F2' }]}>
                                    <Text style={[s.badgeText, { color: '#DC2626' }]}>Open</Text>
                                </View>
                            </View>
                        ))}
                        {openRequests.length > 5 && (
                            <Text style={s.moreText}>+{openRequests.length - 5} more open requests</Text>
                        )}
                    </View>
                )}

                {/* Assigned checklists / logsheets */}
                {assignments.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>My Tasks</Text>
                        {assignments.slice(0, 8).map(a => (
                            <TouchableOpacity
                                key={`${a.templateType}-${a.templateId}`}
                                style={s.taskCard}
                                onPress={() => router.push({
                                    pathname: '/assignment-form' as any,
                                    params: {
                                        templateType: a.templateType,
                                        templateId: String(a.templateId),
                                        templateName: a.templateName,
                                        assignmentId: String(a.assignmentId || 0),
                                        assetId: a.assetId ? String(a.assetId) : '0',
                                        assetName: a.assetName || '',
                                    },
                                })}
                            >
                                <MaterialCommunityIcons
                                    name={a.templateType === 'checklist' ? 'checkbox-marked-outline' : 'clipboard-text-outline'}
                                    size={20}
                                    color={a.templateType === 'checklist' ? '#16A34A' : '#2563EB'}
                                />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={s.taskName} numberOfLines={1}>{a.templateName}</Text>
                                    {a.assetName && <Text style={s.taskAsset} numberOfLines={1}>{a.assetName}</Text>}
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                            </TouchableOpacity>
                        ))}
                        {assignments.length > 8 && (
                            <TouchableOpacity style={s.viewAll} onPress={() => router.push('/checklists' as any)}>
                                <Text style={s.viewAllText}>View all {assignments.length} tasks</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {assignments.length === 0 && openRequests.length === 0 && (
                    <View style={s.emptyBox}>
                        <MaterialCommunityIcons name="check-all" size={48} color="#CBD5E1" />
                        <Text style={s.emptyTitle}>All clear!</Text>
                        <Text style={s.emptyText}>No pending tasks or open requests.</Text>
                    </View>
                )}
            </ScrollView>

            {/* Bottom Nav */}
            <View style={s.nav}>
                <NavBtn icon="view-grid" label="Home" active onPress={() => {}} />
                <NavBtn icon="clipboard-list-outline" label="Tasks" onPress={() => router.push('/checklists' as any)} />
                <NavBtn icon="qrcode-scan" label="Scan" onPress={() => router.push('/qr-scanner' as any)} />
                <NavBtn icon="account-outline" label="Profile" onPress={() => router.push('/profile' as any)} />
            </View>
        </SafeAreaView>
    );
}

function NavBtn({ icon, label, active = false, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity style={s.navItem} onPress={onPress}>
            <MaterialCommunityIcons name={icon as any} size={24} color={active ? '#1E3A8A' : '#A0AEC0'} />
            <Text style={[s.navText, active && s.navTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container:      { flex: 1, backgroundColor: '#F8FAFC' },
    centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText:    { marginTop: 12, color: '#64748B', fontSize: 14 },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        paddingTop: Platform.OS === 'android' ? 44 : 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
        gap: 12,
    },
    avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
    welcome:    { fontSize: 12, color: '#64748B' },
    name:       { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    scanBtn:    { padding: 8, borderRadius: 10, backgroundColor: '#EFF6FF' },
    logoutBtn:  { padding: 8 },

    statsRow:   { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard:   { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
    statNum:    { fontSize: 24, fontWeight: '800' },
    statLabel:  { fontSize: 11, color: '#64748B', fontWeight: '600', textAlign: 'center', lineHeight: 15 },

    scanAction: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#2563EB', borderRadius: 14,
        padding: 18, marginBottom: 20,
        shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    scanActionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
    scanActionSub:   { color: '#BFDBFE', fontSize: 12, marginTop: 2 },

    section:        { marginBottom: 20 },
    sectionTitle:   { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 10 },

    reqCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: 10, padding: 12,
        marginBottom: 8, borderWidth: 1, borderColor: '#FEE2E2',
    },
    reqLeft:    { width: 32, alignItems: 'center' },
    reqAsset:   { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    reqMeta:    { fontSize: 12, color: '#64748B', marginTop: 2 },
    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText:  { fontSize: 11, fontWeight: '700' },
    moreText:   { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 },

    taskCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0',
    },
    taskName:   { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    taskAsset:  { fontSize: 12, color: '#64748B', marginTop: 2 },
    viewAll:    { alignItems: 'center', paddingVertical: 10 },
    viewAllText:{ fontSize: 13, color: '#2563EB', fontWeight: '700' },

    emptyBox:   { alignItems: 'center', paddingVertical: 48 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#94A3B8', marginTop: 12 },
    emptyText:  { fontSize: 14, color: '#CBD5E1', marginTop: 4 },

    nav: {
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
        backgroundColor: '#fff', paddingVertical: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        borderTopWidth: 1, borderTopColor: '#E2E8F0',
    },
    navItem:        { alignItems: 'center', flex: 1 },
    navText:        { fontSize: 11, color: '#A0AEC0', marginTop: 3, fontWeight: '500' },
    navTextActive:  { color: '#1E3A8A', fontWeight: '700' },
});
