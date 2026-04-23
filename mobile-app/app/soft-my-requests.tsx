/**
 * soft-my-requests.tsx
 * Client supervisor's view of their own raised requests and their statuses.
 * This screen is also the target of the push notification when a request is resolved.
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
import { getMySoftRequests, SoftServiceRequest } from '../utils/api';

export default function SoftMyRequestsScreen() {
    const [requests, setRequests] = useState<SoftServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await getMySoftRequests();
            setRequests(data);
        } catch { /* silent */ }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useEffect(() => { load(); }, []);

    const onRefresh = () => { setRefreshing(true); load(); };

    const renderItem = ({ item }: { item: SoftServiceRequest }) => {
        const isOpen = item.status === 'open';
        const raisedDate = item.raisedAt ? new Date(item.raisedAt).toLocaleString() : '—';
        const resolvedDate = item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : null;

        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <View style={[styles.statusPill, isOpen ? styles.pillOpen : styles.pillResolved]}>
                        <MaterialCommunityIcons
                            name={isOpen ? 'clock-outline' : 'check-circle-outline'}
                            size={12}
                            color={isOpen ? '#b45309' : '#166534'}
                        />
                        <Text style={[styles.pillText, isOpen ? styles.pillTextOpen : styles.pillTextResolved]}>
                            {isOpen ? 'Pending' : 'Resolved'}
                        </Text>
                    </View>
                    <Text style={styles.assetName} numberOfLines={1}>{item.assetName}</Text>
                </View>

                <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="calendar-outline" size={13} color="#64748B" />
                    <Text style={styles.metaText}>Raised {raisedDate}</Text>
                </View>

                {resolvedDate && (
                    <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="check-circle-outline" size={13} color="#16a34a" />
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
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Requests</Text>
            </View>

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
                            <Text style={styles.emptyText}>No requests raised yet.</Text>
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
    header:               { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    backBtn:              { marginRight: 12, padding: 4 },
    headerTitle:          { fontSize: 18, fontWeight: '700', color: '#0F172A' },
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
