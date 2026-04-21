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
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import { getMyAssets } from '../utils/api';
import { SupervisorBottomNav } from './supervisor-dashboard';

interface Asset {
    id: number;
    assetName: string;
    assetUniqueId?: string;
    assetType: string;
    status: string;
    departmentName?: string;
    building?: string;
    floor?: string;
    room?: string;
}

function getHealth(asset: Asset): { label: string; color: string; textColor: string; dot: string } {
    const s = (asset.status || '').toLowerCase();
    if (s === 'active') return { label: 'Healthy', color: '#DCFCE7', textColor: '#166534', dot: '#22C55E' };
    if (s === 'maintenance') return { label: 'Warning', color: '#FEF9C3', textColor: '#854D0E', dot: '#EAB308' };
    if (s === 'critical') return { label: 'Critical', color: '#FFE4E6', textColor: '#9F1239', dot: '#F43F5E' };
    return { label: 'Offline', color: '#F1F5F9', textColor: '#64748B', dot: '#94A3B8' };
}

const ASSET_ICONS: { [key: string]: string } = {
    hvac: 'air-conditioner', electrical: 'lightning-bolt', plumbing: 'pipe',
    elevator: 'elevator', generator: 'engine', server: 'server',
    pump: 'pump', fire: 'fire-extinguisher',
};
function assetIcon(type: string): string {
    const k = (type || '').toLowerCase();
    for (const key of Object.keys(ASSET_ICONS)) if (k.includes(key)) return ASSET_ICONS[key];
    return 'office-building-cog';
}

const STATUS_FILTERS = ['All', 'Active', 'Maintenance', 'Critical', 'Inactive'];
const HEALTH_FILTERS = ['All', 'Healthy', 'Warning', 'Critical', 'Offline'];

export default function AssetListScreen() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('Active');
    const [healthFilter, setHealthFilter] = useState('All');
    const [deptFilter, setDeptFilter] = useState('All');

    const departments = ['All', ...Array.from(new Set(assets.map((a) => a.departmentName || 'General').filter(Boolean))) as string[]];

    useEffect(() => { loadAssets(); }, []);

    const loadAssets = async () => {
        try {
            setError(null);
            const data = await getMyAssets();
            setAssets(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load assets');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadAssets(); };

    const filtered = assets.filter((a) => {
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            if (!(a.assetName || '').toLowerCase().includes(q) &&
                !(a.assetUniqueId || '').toLowerCase().includes(q) &&
                !(a.departmentName || '').toLowerCase().includes(q) &&
                !(a.assetType || '').toLowerCase().includes(q)) return false;
        }
        if (statusFilter !== 'All' && (a.status || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
        if (healthFilter !== 'All' && getHealth(a).label !== healthFilter) return false;
        if (deptFilter !== 'All' && (a.departmentName || 'General') !== deptFilter) return false;
        return true;
    });

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <Header onBack={() => router.back()} />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.centerText}>Loading assets...</Text>
                </View>
                <SupervisorBottomNav activeRoute="assets" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Header onBack={() => router.back()} />

            {/* Search */}
            <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search assets, technicians..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity style={styles.chip} onPress={() => setDeptFilter(departments[(departments.indexOf(deptFilter) + 1) % departments.length])}>
                    <Text style={styles.chipText}>{deptFilter === 'All' ? 'Department' : deptFilter}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#475569" />
                </TouchableOpacity>
                {statusFilter !== 'All' ? (
                    <View style={[styles.chip, styles.chipActive]}>
                        <Text style={styles.chipActiveText}>Status: {statusFilter}</Text>
                        <TouchableOpacity onPress={() => setStatusFilter('All')}>
                            <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.chip} onPress={() => setStatusFilter(STATUS_FILTERS[(STATUS_FILTERS.indexOf(statusFilter) + 1) % STATUS_FILTERS.length])}>
                        <Text style={styles.chipText}>Status</Text>
                        <MaterialCommunityIcons name="chevron-down" size={14} color="#475569" />
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.chip} onPress={() => setHealthFilter(HEALTH_FILTERS[(HEALTH_FILTERS.indexOf(healthFilter) + 1) % HEALTH_FILTERS.length])}>
                    <Text style={styles.chipText}>{healthFilter === 'All' ? 'Health' : healthFilter}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#475569" />
                </TouchableOpacity>
            </ScrollView>

            {error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text style={[styles.centerText, { color: '#EF4444' }]}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadAssets}><Text style={styles.retryTxt}>Retry</Text></TouchableOpacity>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}>
                    {filtered.length === 0 ? (
                        <View style={styles.center}>
                            <MaterialCommunityIcons name="cube-off-outline" size={64} color="#CBD5E1" />
                            <Text style={styles.emptyTitle}>No Assets Found</Text>
                            <Text style={styles.centerText}>{searchQuery ? 'Try a different search term' : 'Adjust your filters'}</Text>
                        </View>
                    ) : (
                        <Animated.View layout={Layout.springify()}>
                            {filtered.map((asset, idx) => (
                                <Animated.View key={asset.id} entering={FadeInUp.delay(50 * idx).duration(400).springify()}>
                                    <AssetCard asset={asset} />
                                </Animated.View>
                            ))}
                        </Animated.View>
                    )}
                    <View style={{ height: 24 }} />
                </ScrollView>
            )}

            <SupervisorBottomNav activeRoute="assets" />
        </SafeAreaView>
    );
}

function Header({ onBack }: { onBack: () => void }) {
    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
                <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Assigned Assets</Text>
            <TouchableOpacity style={styles.addBtn}>
                <MaterialCommunityIcons name="plus" size={22} color="#0F172A" />
            </TouchableOpacity>
        </View>
    );
}

function AssetCard({ asset }: { asset: Asset }) {
    const health = getHealth(asset);
    const icon = assetIcon(asset.assetType);
    const location = [asset.building, asset.floor, asset.room].filter(Boolean).join(', ') || asset.departmentName || '';
    const isOffline = health.label === 'Offline';
    const isCritical = health.label === 'Critical';

    return (
        <View style={[styles.card, isOffline && styles.cardOffline]}>
            <View style={styles.cardTop}>
                <View style={[styles.assetImg, { backgroundColor: isOffline ? '#94A3B8' : '#1E293B' }]}>
                    <MaterialCommunityIcons name={icon as any} size={28} color="#FFFFFF" />
                </View>
                <View style={styles.cardMeta}>
                    <Text style={[styles.assetName, isOffline && styles.textMuted]} numberOfLines={2}>{asset.assetName}</Text>
                    {location ? (
                        <View style={styles.locationRow}>
                            <MaterialCommunityIcons name="map-marker-outline" size={13} color={isOffline ? '#94A3B8' : '#64748B'} />
                            <Text style={[styles.locationText, isOffline && styles.textMuted]} numberOfLines={1}>{location}</Text>
                        </View>
                    ) : null}
                </View>
                <View style={[styles.healthBadge, { backgroundColor: health.color }]}>
                    <View style={[styles.healthDot, { backgroundColor: health.dot }]} />
                    <Text style={[styles.healthText, { color: health.textColor }]}>{health.label}</Text>
                </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardBottom}>
                {isCritical ? (
                    <>
                        <View style={styles.avatarCircle}><Text style={styles.avatarTxt}>UN</Text></View>
                        <Text style={[styles.techText, { color: '#94A3B8', fontStyle: 'italic', flex: 1 }]}>Tech: Unassigned</Text>
                        <TouchableOpacity onPress={() => router.push(`/asset-details?id=${asset.id}&name=${encodeURIComponent(asset.assetName)}`)}>
                            <Text style={styles.assignNow}>Assign Now</Text>
                        </TouchableOpacity>
                    </>
                ) : isOffline ? (
                    <>
                        <View style={[styles.avatarCircle, { backgroundColor: '#E2E8F0' }]}><Text style={[styles.avatarTxt, { color: '#94A3B8' }]}>NA</Text></View>
                        <Text style={[styles.techText, { color: '#94A3B8', flex: 1 }]}>Tech: --</Text>
                        <TouchableOpacity onPress={() => router.push(`/asset-details?id=${asset.id}&name=${encodeURIComponent(asset.assetName)}`)}>
                            <Text style={styles.historyLink}>History</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <View style={styles.avatarCircle}><MaterialCommunityIcons name="account" size={16} color="#2563EB" /></View>
                        <Text style={styles.techText} numberOfLines={1}>
                            Tech: <Text style={styles.techName}>{asset.departmentName || 'Assigned'}</Text>
                        </Text>
                        <TouchableOpacity onPress={() => router.push(`/asset-details?id=${asset.id}&name=${encodeURIComponent(asset.assetName)}`)}>
                            <Text style={styles.viewDetails}>View Details</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        backgroundColor: '#FAF9F6',
    },
    headerBtn: { width: 40, alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
    searchBox: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
        marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 14, gap: 10,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#0F172A' },
    chipScroll: { flexGrow: 0, marginBottom: 16 },
    chipRow: { paddingHorizontal: 16, gap: 10, flexDirection: 'row' },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
    },
    chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
    chipActiveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    listContent: { paddingHorizontal: 16, paddingBottom: 16 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
    },
    cardOffline: { opacity: 0.7 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    assetImg: { width: 68, height: 68, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    cardMeta: { flex: 1 },
    assetName: { fontSize: 16, fontWeight: '800', color: '#0F172A', lineHeight: 22, marginBottom: 6, letterSpacing: -0.2 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    locationText: { fontSize: 13, color: '#64748B', flex: 1, fontWeight: '500' },
    textMuted: { color: '#94A3B8' },
    healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, flexShrink: 0 },
    healthDot: { width: 8, height: 8, borderRadius: 4 },
    healthText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },
    cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    avatarTxt: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
    techText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    techName: { fontWeight: '800', color: '#0F172A' },
    viewDetails: { fontSize: 14, fontWeight: '800', color: '#2563EB' },
    assignNow: { fontSize: 14, fontWeight: '800', color: '#EF4444' },
    historyLink: { fontSize: 14, fontWeight: '700', color: '#64748B' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
    centerText: { fontSize: 15, color: '#64748B', textAlign: 'center', fontWeight: '500' },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    retryBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
    retryTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
