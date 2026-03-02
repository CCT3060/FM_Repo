import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    SafeAreaView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { getMyAssets } from '../utils/api';

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

interface Section {
    title: string;
    data: Asset[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    Active: { bg: '#C6F6D5', text: '#22543D' },
    Maintenance: { bg: '#FEEBC8', text: '#9C4221' },
    Critical: { bg: '#FED7D7', text: '#9B2C2C' },
    Inactive: { bg: '#E2E8F0', text: '#4A5568' },
};

const TYPE_ICONS: Record<string, string> = {
    soft: 'broom',
    technical: 'tools',
    fleet: 'truck',
};

export default function AssetListScreen() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [filteredSections, setFilteredSections] = useState<Section[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All Assets');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAssets();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [assets, searchQuery, activeFilter]);

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

    const onRefresh = () => {
        setRefreshing(true);
        loadAssets();
    };

    const applyFilters = () => {
        let filtered = [...assets];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (a) =>
                    (a.assetName || '').toLowerCase().includes(q) ||
                    (a.assetUniqueId || '').toLowerCase().includes(q) ||
                    (a.departmentName || '').toLowerCase().includes(q)
            );
        }

        if (activeFilter !== 'All Assets') {
            filtered = filtered.filter(
                (a) => a.assetType?.toLowerCase() === activeFilter.toLowerCase()
            );
        }

        // Group by department
        const grouped: Record<string, Asset[]> = {};
        for (const asset of filtered) {
            const dept = (asset.departmentName || 'General').toUpperCase();
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push(asset);
        }

        setSections(
            Object.entries(grouped).map(([title, data]) => ({ title, data }))
        );
        setFilteredSections(
            Object.entries(grouped).map(([title, data]) => ({ title, data }))
        );
    };

    const renderSectionHeader = ({ section: { title, data } }: any) => (
        <View style={styles.sectionHeaderContainer}>
            <Text style={styles.sectionHeader}>{title}</Text>
            <Text style={styles.sectionCount}>{data.length} asset{data.length !== 1 ? 's' : ''}</Text>
        </View>
    );

    const renderAssetItem = ({ item }: { item: Asset }) => {
        const statusColors = STATUS_COLORS[item.status] || STATUS_COLORS.Inactive;
        const iconName = TYPE_ICONS[item.assetType] || 'office-building';
        const location = [item.building, item.floor, item.room].filter(Boolean).join(', ');

        return (
            <TouchableOpacity
                style={styles.cardContainer}
                activeOpacity={0.7}
                onPress={() => router.push(`/asset-details?id=${item.id}&name=${encodeURIComponent(item.assetName)}`)}
            >
                <View style={styles.cardLeft}>
                    <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
                        <MaterialCommunityIcons name={iconName as any} size={22} color="#2B6CB0" />
                    </View>
                    <View style={styles.assetInfo}>
                        <Text style={styles.assetName} numberOfLines={1}>{item.assetName}</Text>
                        <Text style={styles.assetId}>{item.assetUniqueId || `#${item.id}`}</Text>
                        {location ? <Text style={styles.assetLocation} numberOfLines={1}>{location}</Text> : null}
                    </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                    <Text style={[styles.statusText, { color: statusColors.text }]}>{item.status}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.headerContainer}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Assets</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading assets...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.headerContainer}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Assets</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color="#A0AEC0" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search assets..."
                    placeholderTextColor="#A0AEC0"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                {['All Assets', 'soft', 'technical', 'fleet'].map((f) => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
                        onPress={() => setActiveFilter(f)}
                    >
                        <Text style={[styles.filterTabText, activeFilter === f && styles.filterTabTextActive]}>
                            {f === 'All Assets' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {error ? (
                <View style={styles.centerContent}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E53E3E" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadAssets}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : filteredSections.length === 0 ? (
                <View style={styles.centerContent}>
                    <MaterialCommunityIcons name="office-building-off-outline" size={64} color="#CBD5E0" />
                    <Text style={styles.emptyTitle}>No Assets Found</Text>
                    <Text style={styles.emptyText}>
                        {searchQuery ? 'Try a different search term' : 'No assets have been added yet'}
                    </Text>
                </View>
            ) : (
                <SectionList
                    sections={filteredSections}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderAssetItem}
                    renderSectionHeader={renderSectionHeader}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
                    }
                    ListFooterComponent={() => (
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>{assets.length} total asset{assets.length !== 1 ? 's' : ''}</Text>
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    headerContainer: {
        backgroundColor: '#1E3A8A',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backBtn: {
        padding: 4,
        width: 40,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#1A202C',
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    filterTab: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    filterTabActive: {
        backgroundColor: '#1E3A8A',
        borderColor: '#1E3A8A',
    },
    filterTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4A5568',
    },
    filterTabTextActive: {
        color: '#FFFFFF',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    sectionHeaderContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 10,
        paddingHorizontal: 2,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '700',
        color: '#718096',
        letterSpacing: 0.8,
    },
    sectionCount: {
        fontSize: 12,
        color: '#A0AEC0',
        fontWeight: '500',
    },
    cardContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    cardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    assetInfo: {
        flex: 1,
    },
    assetName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 2,
    },
    assetId: {
        fontSize: 12,
        color: '#718096',
        marginBottom: 2,
    },
    assetLocation: {
        fontSize: 12,
        color: '#718096',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        marginLeft: 8,
        flexShrink: 0,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        fontSize: 14,
        color: '#718096',
        marginTop: 14,
    },
    errorText: {
        fontSize: 14,
        color: '#E53E3E',
        marginTop: 12,
        textAlign: 'center',
    },
    retryBtn: {
        marginTop: 16,
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 14,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#718096',
        textAlign: 'center',
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 13,
        color: '#A0AEC0',
    },
});
