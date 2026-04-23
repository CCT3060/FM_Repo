/**
 * soft-manager-dashboard.tsx
 * Client Manager — view-only dashboard showing all soft-service requests
 * (raised and resolved) for their company. No actions available.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllSoftRequests, getStoredUser, SoftServiceRequest } from '../utils/api';

type FilterStatus = 'all' | 'open' | 'resolved';

export default function SoftManagerDashboard() {
    const [requests, setRequests] = useState<SoftServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [userName, setUserName] = useState('');

    useEffect(() => {
        getStoredUser().then(u => setUserName(u?.fullName || ''));
        loadRequests();
    }, []);

    useEffect(() => {
        loadRequests();
    }, [filter]);

    const loadRequests = useCallback(async () => {
        try {
            const status = filter === 'all' ? undefined : filter;
            const data = await getAllSoftRequests({ status });
            setRequests(data);
        } catch { /* silent */ }
        finally { setLoading(false); setRefreshing(false); }
    }, [filter]);

    const onRefresh = () => { setRefreshing(true); loadRequests(); };

    const openCount     = requests.filter(r => r.status === 'open').length;
    const resolvedCount = requests.filter(r => r.status === 'resolved').length;

    const renderItem = ({ item }: { item: SoftServiceRequest }) => {
        const isOpen     = item.status === 'open';
        const raisedDate = item.raisedAt ? new Date(item.raisedAt).toLocaleString() : '—';
        const resolvedDate = item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : null;

        return (
            <View style={styles.card}>
                {/* Status pill + asset */}
                <View style={styles.cardTop}>
                    <View style={[styles.statusPill, isOpen ? styles.pillOpen : styles.pillResolved]}>
                        <MaterialCommunityIcons
                            name={isOpen ? 'clock-outline' : 'check-circle-outline'}
                            size={12}
                            color={isOpen ? '#b45309' : '#166534'}
                        />
                        <Text style={[styles.pillText, isOpen ? styles.pillTextOpen : styles.pillTextResolved]}>
                            {isOpen ? 'Open' : 'Resolved'}
                        </Text>
                    </View>
                    <Text style={styles.assetName} numberOfLines={1}>{item.assetName}</Text>
                </View>

                <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="account-alert-outline" size={13} color="#64748B" />
                    <Text style={styles.metaText}>Raised by {item.raisedByName || '—'} · {raisedDate}</Text>
                </View>

                {resolvedDate && (
                    <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="account-check-outline" size={13} color="#16a34a" />
                        <Text style={[styles.metaText, { color: '#166534' }]}>
                            Resolved by {item.resolvedByName || '—'} · {resolvedDate}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Manager Dashboard</Text>
                    {userName ? <Text style={styles.headerSub}>{userName}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => router.push('/profile' as any)} style={styles.profileBtn}>
                    <MaterialCommunityIcons name="account-circle-outline" size={28} color="#64748B" />
                </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
                <View style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}>
                    <Text style={styles.statNum}>{openCount}</Text>
                    <Text style={styles.statLabel}>Open</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: '#16a34a' }]}>
                    <Text style={styles.statNum}>{resolvedCount}</Text>
                    <Text style={styles.statLabel}>Resolved</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: '#2563EB' }]}>
                    <Text style={styles.statNum}>{requests.length}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRow}>
                {(['all', 'open', 'resolved'] as FilterStatus[]).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterTab, filter === f && styles.filterTabActive]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#2563EB" />
                </View>
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={item => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <MaterialCommunityIcons name="clipboard-text-off-outline" size={40} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No requests found.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:            { flex: 1, backgroundColor: '#F8FAFC' },
    centered:             { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    header:               { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    headerTitle:          { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    headerSub:            { fontSize: 12, color: '#64748B', marginTop: 2 },
    profileBtn:           { padding: 4 },
    statsRow:             { flexDirection: 'row', gap: 10, padding: 14 },
    statCard:             { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderLeftWidth: 3, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    statNum:              { fontSize: 26, fontWeight: '800', color: '#0F172A' },
    statLabel:            { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
    filterRow:            { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
    filterTab:            { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
    filterTabActive:      { backgroundColor: '#2563EB' },
    filterTabText:        { fontSize: 13, fontWeight: '600', color: '#64748B' },
    filterTabTextActive:  { color: '#fff' },
    card:                 { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
    cardTop:              { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    statusPill:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    pillOpen:             { backgroundColor: '#fef9c3' },
    pillResolved:         { backgroundColor: '#dcfce7' },
    pillText:             { fontSize: 11, fontWeight: '700' },
    pillTextOpen:         { color: '#b45309' },
    pillTextResolved:     { color: '#166534' },
    assetName:            { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
    metaRow:              { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    metaText:             { fontSize: 12, color: '#64748B' },
    emptyBox:             { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyText:            { fontSize: 14, color: '#94A3B8' },
});
