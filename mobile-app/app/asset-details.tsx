import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { getAssetById } from '../utils/api';

export default function AssetDetailsScreen() {
    const { id, name } = useLocalSearchParams();
    const [asset, setAsset] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'templates' | 'assignments'>('templates');

    useEffect(() => { loadAsset(); }, []);

    const loadAsset = async () => {
        try {
            setError(null);
            if (!id) throw new Error('No asset ID provided');
            const data = await getAssetById(Number(id));
            setAsset(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load asset details');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadAsset(); };

    const displayTitle = asset?.assetName || (name as string) || 'Asset Details';

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.headerContainer}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{name || 'Asset Details'}</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#2B6CB0" />
                    <Text style={styles.loadingText}>Loading asset...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error || !asset) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.headerContainer}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{name || 'Asset Details'}</Text>
                    <View style={{ width: 32 }} />
                </View>
                <View style={styles.centerContent}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E53E3E" />
                    <Text style={styles.errorText}>{error || 'Asset not found'}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadAsset}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const meta = asset.metadata || {};
    const checklists: any[] = asset.checklists || [];
    const assignments: any[] = asset.assignments || [];
    const location = [asset.building, asset.floor, asset.room].filter(Boolean).join(' · ');

    const metaFields = [
        { key: 'Model', value: meta.model },
        { key: 'Serial No.', value: meta.serialNumber },
        { key: 'Manufacturer', value: meta.manufacturer },
        { key: 'Installed', value: meta.installDate ? new Date(meta.installDate).toLocaleDateString() : null },
        { key: 'Next Service', value: meta.nextServiceDate ? new Date(meta.nextServiceDate).toLocaleDateString() : null },
        { key: 'Warranty Until', value: meta.warrantyExpiry ? new Date(meta.warrantyExpiry).toLocaleDateString() : null },
    ].filter((f) => f.value);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerContainer}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.contentScroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2B6CB0']} />}
            >
                {/* Status Banner */}
                <View style={[styles.statusBanner, { backgroundColor: asset.status === 'Active' ? '#F0FDF4' : '#FFF5F5' }]}>
                    <View style={[styles.statusDot, { backgroundColor: asset.status === 'Active' ? '#38A169' : '#E53E3E' }]} />
                    <Text style={[styles.statusText, { color: asset.status === 'Active' ? '#38A169' : '#E53E3E' }]}>
                        {asset.status || 'Unknown'}
                    </Text>
                    {asset.assetUniqueId && <Text style={styles.assetIdText}>ID: {asset.assetUniqueId}</Text>}
                </View>

                {/* Info Cards */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <MaterialCommunityIcons name="cog-outline" size={20} color="#2B6CB0" />
                        <Text style={styles.statLabel}>TYPE</Text>
                        <Text style={styles.statValue}>{asset.assetType || '—'}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <MaterialCommunityIcons name="domain" size={20} color="#D69E2E" />
                        <Text style={styles.statLabel}>DEPARTMENT</Text>
                        <Text style={styles.statValue} numberOfLines={2}>{asset.departmentName || '—'}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <MaterialCommunityIcons name="map-marker-outline" size={20} color="#E53E3E" />
                        <Text style={styles.statLabel}>LOCATION</Text>
                        <Text style={styles.statValue} numberOfLines={2}>{location || '—'}</Text>
                    </View>
                </View>

                {/* Metadata */}
                {metaFields.length > 0 && (
                    <View style={styles.metaSection}>
                        <Text style={styles.sectionLabel}>ASSET INFORMATION</Text>
                        <View style={styles.metaCard}>
                            {metaFields.map((field, idx) => (
                                <View key={field.key} style={[styles.metaRow, idx === metaFields.length - 1 && { borderBottomWidth: 0 }]}>
                                    <Text style={styles.metaKey}>{field.key}</Text>
                                    <Text style={styles.metaValue}>{field.value}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Tabs */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'templates' && styles.activeTab]}
                        onPress={() => setActiveTab('templates')}
                    >
                        <Text style={[styles.tabText, activeTab === 'templates' && styles.activeTabText]}>
                            Templates ({checklists.length})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'assignments' && styles.activeTab]}
                        onPress={() => setActiveTab('assignments')}
                    >
                        <Text style={[styles.tabText, activeTab === 'assignments' && styles.activeTabText]}>
                            Assignments ({assignments.length})
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.listsContainer}>
                    {activeTab === 'templates' ? (
                        checklists.length === 0 ? (
                            <View style={styles.emptySection}>
                                <MaterialCommunityIcons name="clipboard-off-outline" size={40} color="#CBD5E0" />
                                <Text style={styles.emptyText}>No templates for this asset type</Text>
                            </View>
                        ) : (
                            checklists.map((c: any) => (
                                <View key={`${c.templateType}-${c.id}`} style={styles.itemCard}>
                                    <View style={[styles.itemIconBox, { backgroundColor: c.templateType === 'checklist' ? '#EDE9FE' : '#DBEAFE' }]}>
                                        <MaterialCommunityIcons
                                            name={c.templateType === 'checklist' ? 'clipboard-check-outline' : 'notebook-outline'}
                                            size={18}
                                            color={c.templateType === 'checklist' ? '#7C3AED' : '#2563EB'}
                                        />
                                    </View>
                                    <View style={styles.itemContent}>
                                        <Text style={styles.itemTitle}>{c.templateName}</Text>
                                        {c.description && <Text style={styles.itemSubtitle} numberOfLines={1}>{c.description}</Text>}
                                    </View>
                                    <View style={[styles.itemTypePill, { backgroundColor: c.templateType === 'checklist' ? '#EDE9FE' : '#DBEAFE' }]}>
                                        <Text style={[styles.itemTypePillText, { color: c.templateType === 'checklist' ? '#7C3AED' : '#2563EB' }]}>
                                            {c.templateType === 'checklist' ? 'Checklist' : 'Logsheet'}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )
                    ) : (
                        assignments.length === 0 ? (
                            <View style={styles.emptySection}>
                                <MaterialCommunityIcons name="account-off-outline" size={40} color="#CBD5E0" />
                                <Text style={styles.emptyText}>No assignments for this asset type's templates</Text>
                            </View>
                        ) : (
                            assignments.map((a: any) => (
                                <View key={a.id} style={styles.itemCard}>
                                    <View style={[styles.itemIconBox, { backgroundColor: '#F0FDF4' }]}>
                                        <MaterialCommunityIcons name="account-check-outline" size={18} color="#38A169" />
                                    </View>
                                    <View style={styles.itemContent}>
                                        <Text style={styles.itemTitle}>{a.templateName}</Text>
                                        <Text style={styles.itemSubtitle}>Assigned to: {a.assignedToName}</Text>
                                    </View>
                                    <Text style={styles.itemDate}>
                                        {a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : ''}
                                    </Text>
                                </View>
                            ))
                        )
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    headerContainer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#FFFFFF',
        marginTop: Platform.OS === 'android' ? 30 : 0,
        borderBottomWidth: 1, borderBottomColor: '#EDF2F7',
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, textAlign: 'center' },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { fontSize: 14, color: '#718096', marginTop: 12 },
    errorText: { fontSize: 14, color: '#E53E3E', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#2B6CB0', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    contentScroll: { flex: 1 },
    statusBanner: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 12, gap: 8,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontWeight: '700', fontSize: 14, flex: 1 },
    assetIdText: { fontSize: 12, color: '#718096' },
    statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, marginBottom: 16, gap: 8 },
    statCard: {
        flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 12, alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    },
    statLabel: { fontSize: 10, fontWeight: '700', color: '#718096', marginTop: 8, marginBottom: 4, letterSpacing: 0.5 },
    statValue: { fontSize: 12, fontWeight: '700', color: '#1A202C', textAlign: 'center' },
    metaSection: { marginHorizontal: 16, marginBottom: 16 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: '#718096', letterSpacing: 1, marginBottom: 8 },
    metaCard: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
    metaRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    metaKey: { fontSize: 13, color: '#718096', fontWeight: '500' },
    metaValue: { fontSize: 13, fontWeight: '700', color: '#1A202C', maxWidth: '60%', textAlign: 'right' },
    tabContainer: {
        flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF',
    },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: '#2B6CB0' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#718096' },
    activeTabText: { color: '#2B6CB0' },
    listsContainer: { padding: 16 },
    emptySection: { paddingVertical: 40, alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 14, color: '#A0AEC0' },
    itemCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
        borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 12,
    },
    itemIconBox: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    itemContent: { flex: 1 },
    itemTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
    itemSubtitle: { fontSize: 12, color: '#718096', marginTop: 2 },
    itemDate: { fontSize: 11, color: '#A0AEC0', flexShrink: 0 },
    itemTypePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
    itemTypePillText: { fontSize: 11, fontWeight: '700' },
});
