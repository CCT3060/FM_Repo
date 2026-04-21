import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getAssetQrData } from '../utils/api';

export default function AssetScanScreen() {
    const { assetId } = useLocalSearchParams<{ assetId: string }>();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (assetId) {
            getAssetQrData(assetId)
                .then(setData)
                .catch((e: Error) => setError(e.message || 'Failed to load asset'))
                .finally(() => setLoading(false));
        }
    }, [assetId]);

    if (loading) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading asset details…</Text>
            </SafeAreaView>
        );
    }

    if (error || !data) {
        return (
            <SafeAreaView style={styles.centered}>
                <MaterialCommunityIcons name="alert-circle" size={50} color="#DC2626" />
                <Text style={styles.errorText}>{error || 'Asset not found'}</Text>
                <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
                    <Text style={styles.btnText}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const { asset, ojtTrainings = [], checklistTemplates = [], logsheetTemplates = [] } = data;

    if (!asset) {
        return (
            <SafeAreaView style={styles.centered}>
                <MaterialCommunityIcons name="alert-circle" size={50} color="#DC2626" />
                <Text style={styles.errorText}>Asset data unavailable</Text>
                <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
                    <Text style={styles.btnText}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Asset Details</Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Asset Info Card */}
                <View style={styles.card}>
                    <View style={styles.assetIconRow}>
                        <MaterialCommunityIcons
                            name={asset.assetType === 'technical' ? 'cog' : asset.assetType === 'fleet' ? 'truck' : 'broom'}
                            size={32}
                            color="#2563EB"
                        />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={styles.assetName}>{asset.assetName}</Text>
                            <Text style={styles.assetIdText}>ID: {asset.assetUniqueId || `#${asset.id}`}</Text>
                        </View>
                        <View style={[styles.badge, asset.status === 'Active' ? styles.badgeGreen : styles.badgeGray]}>
                            <Text style={[styles.badgeText, asset.status === 'Active' ? styles.badgeTextGreen : styles.badgeTextGray]}>
                                {asset.status}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <InfoRow icon="office-building-outline" label="Department" value={asset.departmentName || '—'} />
                    <InfoRow
                        icon="map-marker-outline"
                        label="Location"
                        value={[asset.building, asset.floor, asset.room].filter(Boolean).join(' / ') || '—'}
                    />
                    <InfoRow icon="tag-outline" label="Type" value={asset.assetType} />
                </View>

                {/* OJT Trainings */}
                {ojtTrainings.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📚 Required Training</Text>
                        {ojtTrainings.map((t: any) => (
                            <TouchableOpacity
                                key={t.id}
                                style={styles.trainingCard}
                                onPress={() => router.push({ pathname: '/ojt-training-detail', params: { id: t.id } } as any)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.trainingTitle}>{t.title}</Text>
                                    {t.description ? <Text style={styles.trainingDesc}>{t.description}</Text> : null}
                                    {t.passingPercentage ? (
                                        <Text style={styles.passingPct}>Required score: {t.passingPercentage}%</Text>
                                    ) : null}
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Checklists */}
                {checklistTemplates.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>✅ Checklists</Text>
                        {checklistTemplates.map((c: any) => (
                            <View key={c.id} style={styles.listItem}>
                                <MaterialCommunityIcons name="checkbox-marked-outline" size={18} color="#16A34A" />
                                <Text style={styles.listItemText}>{c.templateName || c.name}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Logsheets */}
                {logsheetTemplates.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📋 Logsheets</Text>
                        {logsheetTemplates.map((l: any) => (
                            <View key={l.id} style={styles.listItem}>
                                <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#2563EB" />
                                <Text style={styles.listItemText}>{l.templateName || l.name}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {ojtTrainings.length === 0 && checklistTemplates.length === 0 && logsheetTemplates.length === 0 && (
                    <View style={styles.emptySection}>
                        <MaterialCommunityIcons name="information-outline" size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
                        <Text style={styles.emptyText}>No checklists or training assigned to this asset.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={styles.infoRow}>
            <MaterialCommunityIcons name={icon as any} size={16} color="#64748B" style={{ marginRight: 8 }} />
            <Text style={styles.infoLabel}>{label}:</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 20 },
    header: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    backBtn: { marginRight: 12, padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    scroll: { flex: 1 },
    card: {
        margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    assetIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    assetName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    assetIdText: { fontSize: 12, color: '#64748B', marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeGreen: { backgroundColor: '#F0FDF4' },
    badgeGray: { backgroundColor: '#F1F5F9' },
    badgeText: { fontSize: 11, fontWeight: '700' },
    badgeTextGreen: { color: '#16A34A' },
    badgeTextGray: { color: '#94A3B8' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    infoLabel: { fontSize: 13, color: '#64748B', marginRight: 6 },
    infoValue: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
    section: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
    trainingCard: {
        backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
        flexDirection: 'row', alignItems: 'center',
        borderLeftWidth: 3, borderLeftColor: '#2563EB',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    trainingTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    trainingDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
    passingPct: { fontSize: 11, color: '#2563EB', marginTop: 4, fontWeight: '600' },
    listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 6 },
    listItemText: { fontSize: 13, color: '#334155', marginLeft: 8, fontWeight: '500' },
    emptySection: { margin: 16, padding: 24, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center' },
    emptyText: { color: '#94A3B8', fontSize: 14, textAlign: 'center' },
    loadingText: { marginTop: 16, color: '#64748B', fontSize: 14 },
    errorText: { marginTop: 12, color: '#DC2626', fontSize: 15, textAlign: 'center', marginBottom: 20 },
    btn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
