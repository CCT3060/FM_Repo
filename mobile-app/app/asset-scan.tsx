/**
 * asset-scan.tsx
 * Shown after scanning a QR code.
 *
 * Role-aware behaviour:
 *   canRaiseSoftIssue  → "Raise Request" button (client supervisor)
 *   canResolveSoftIssue → shows open requests raised for this asset;
 *                         if requests exist → go to resolve form,
 *                         if none → normal checklist/logsheet list
 *   technical / default → OJT + checklists + logsheets list
 */
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
import {
    getAssetQrData,
    getSoftRequestsForAsset,
    getStoredUser,
} from '../utils/api';
import type { SoftServiceRequest } from '../utils/api';

export default function AssetScanScreen() {
    const { assetId } = useLocalSearchParams<{ assetId: string }>();
    const [data, setData] = useState<any>(null);
    const [user, setUser] = useState<any>(null);
    const [openRequests, setOpenRequests] = useState<SoftServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!assetId) return;
        (async () => {
            try {
                const [assetData, storedUser] = await Promise.all([
                    getAssetQrData(assetId),
                    getStoredUser().catch(() => null),
                ]);
                setData(assetData);
                setUser(storedUser);

                // Catalyst supervisor: fetch open requests for this asset
                const caps = storedUser?.roleCapabilities;
                if (caps?.canResolveSoftIssue) {
                    const reqs = await getSoftRequestsForAsset(assetId).catch(() => []);
                    setOpenRequests(reqs);
                }
            } catch (e: any) {
                setError(e.message || 'Failed to load asset');
            } finally {
                setLoading(false);
            }
        })();
    }, [assetId]);

    if (loading) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading asset…</Text>
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

    const caps = user?.roleCapabilities;
    const canRaise   = !!caps?.canRaiseSoftIssue;
    const canResolve = !!caps?.canResolveSoftIssue;

    // ── Catalyst supervisor with open requests → resolve flow ──────────────
    if (canResolve && openRequests.length > 0) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Open Requests</Text>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
                    {/* Asset card */}
                    <AssetCard asset={asset} />

                    <Text style={styles.sectionTitle}>Requests to Resolve</Text>
                    {openRequests.map(req => (
                        <TouchableOpacity
                            key={req.id}
                            style={styles.requestCard}
                            onPress={() => router.push({
                                pathname: '/soft-resolve-form' as any,
                                params: {
                                    assetId: String(asset.id),
                                    assetName: asset.assetName,
                                    requestId: String(req.id),
                                    templateId: String(req.templateId),
                                    templateType: req.templateType,
                                    beforeAnswers: JSON.stringify(req.beforeAnswers || []),
                                    raisedByName: req.raisedByName || 'Client Supervisor',
                                    raisedAt: req.raisedAt || '',
                                },
                            })}
                        >
                            <View style={styles.requestLeft}>
                                <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#DC2626" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.requestTitle}>Issue #{req.id}</Text>
                                <Text style={styles.requestMeta}>
                                    Raised by {req.raisedByName || 'Client Supervisor'}
                                </Text>
                                <Text style={styles.requestDate}>
                                    {req.raisedAt ? new Date(req.raisedAt).toLocaleString() : '—'}
                                </Text>
                            </View>
                            <View style={styles.resolveChip}>
                                <Text style={styles.resolveChipText}>Resolve →</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Client supervisor → raise request ─────────────────────────────────
    if (canRaise) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Report Issue</Text>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
                    <AssetCard asset={asset} />

                    {checklistTemplates.length > 0 ? (
                        <>
                            <Text style={styles.sectionTitle}>Select Checklist to Fill</Text>
                            {checklistTemplates.map((c: any) => (
                                <TouchableOpacity
                                    key={c.id}
                                    style={styles.templateCard}
                                    onPress={() => router.push({
                                        pathname: '/soft-raise-request' as any,
                                        params: {
                                            assetId: String(asset.id),
                                            assetName: asset.assetName,
                                            templateId: String(c.id),
                                            templateName: c.templateName || c.name,
                                        },
                                    })}
                                >
                                    <MaterialCommunityIcons name="clipboard-alert-outline" size={20} color="#DC2626" />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.templateName}>{c.templateName || c.name}</Text>
                                        <Text style={styles.templateSub}>Tap to report an issue</Text>
                                    </View>
                                    <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                                </TouchableOpacity>
                            ))}
                        </>
                    ) : (
                        <View style={styles.emptySection}>
                            <MaterialCommunityIcons name="information-outline" size={40} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No checklists assigned to this asset.</Text>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Catalyst supervisor with no open requests OR technical/default user ──
    // Show normal view: OJT + checklists + logsheets
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Asset Details</Text>
                {canResolve && (
                    <View style={styles.allClearBadge}>
                        <MaterialCommunityIcons name="check-circle" size={14} color="#16A34A" />
                        <Text style={styles.allClearText}>All Clear</Text>
                    </View>
                )}
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 60 }}>
                <AssetCard asset={asset} />

                {/* OJT Trainings */}
                {ojtTrainings.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Required Training</Text>
                        {ojtTrainings.map((t: any) => (
                            <TouchableOpacity
                                key={t.id}
                                style={[styles.templateCard, { borderLeftColor: '#7C3AED' }]}
                                onPress={() => router.push({ pathname: '/ojt-training-detail', params: { id: t.id } } as any)}
                            >
                                <MaterialCommunityIcons name="school-outline" size={20} color="#7C3AED" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.templateName}>{t.title}</Text>
                                    {t.passingPercentage ? <Text style={styles.templateSub}>Pass: {t.passingPercentage}%</Text> : null}
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Checklists */}
                {checklistTemplates.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Checklists</Text>
                        {checklistTemplates.map((c: any) => (
                            <TouchableOpacity
                                key={c.id}
                                style={[styles.templateCard, { borderLeftColor: '#16A34A' }]}
                                onPress={() => router.push({
                                    pathname: '/assignment-form' as any,
                                    params: {
                                        templateType: 'checklist',
                                        templateId: String(c.id),
                                        templateName: c.templateName || c.name,
                                        assignmentId: '0',
                                        assetId: String(asset.id),
                                        assetName: asset.assetName,
                                    },
                                })}
                            >
                                <MaterialCommunityIcons name="checkbox-marked-outline" size={20} color="#16A34A" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.templateName}>{c.templateName || c.name}</Text>
                                    <Text style={styles.templateSub}>Tap to fill checklist</Text>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Logsheets */}
                {logsheetTemplates.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Logsheets</Text>
                        {logsheetTemplates.map((l: any) => (
                            <TouchableOpacity
                                key={l.id}
                                style={[styles.templateCard, { borderLeftColor: '#2563EB' }]}
                                onPress={() => router.push({
                                    pathname: '/assignment-form' as any,
                                    params: {
                                        templateType: 'logsheet',
                                        templateId: String(l.id),
                                        templateName: l.templateName || l.name,
                                        assignmentId: '0',
                                        assetId: String(asset.id),
                                        assetName: asset.assetName,
                                    },
                                })}
                            >
                                <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#2563EB" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.templateName}>{l.templateName || l.name}</Text>
                                    <Text style={styles.templateSub}>Tap to fill logsheet</Text>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {ojtTrainings.length === 0 && checklistTemplates.length === 0 && logsheetTemplates.length === 0 && (
                    <View style={styles.emptySection}>
                        <MaterialCommunityIcons name="information-outline" size={40} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No checklists or training assigned to this asset.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/* ── Asset info card ───────────────────────────────────────────────────────── */
function AssetCard({ asset }: { asset: any }) {
    return (
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
    centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 20 },
    header: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    backBtn:    { marginRight: 12, padding: 4 },
    headerTitle:{ fontSize: 18, fontWeight: '700', color: '#0F172A', flex: 1 },
    allClearBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    allClearText: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
    scroll: { flex: 1 },
    card: {
        margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    assetIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    assetName:   { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    assetIdText: { fontSize: 12, color: '#64748B', marginTop: 2 },
    badge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeGreen:  { backgroundColor: '#F0FDF4' },
    badgeGray:   { backgroundColor: '#F1F5F9' },
    badgeText:   { fontSize: 11, fontWeight: '700' },
    badgeTextGreen: { color: '#16A34A' },
    badgeTextGray:  { color: '#94A3B8' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    infoLabel:  { fontSize: 13, color: '#64748B', marginRight: 6 },
    infoValue:  { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },

    section:      { marginHorizontal: 16, marginTop: 4, marginBottom: 4 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10, marginTop: 8, marginHorizontal: 16 },

    templateCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
        borderLeftWidth: 3, borderLeftColor: '#E2E8F0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
        marginHorizontal: 16,
    },
    templateName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    templateSub:  { fontSize: 12, color: '#64748B', marginTop: 2 },

    requestCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
        borderLeftWidth: 3, borderLeftColor: '#DC2626',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    requestLeft:  { marginRight: 12 },
    requestTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    requestMeta:  { fontSize: 12, color: '#64748B', marginTop: 2 },
    requestDate:  { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    resolveChip: {
        backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 8, borderWidth: 1, borderColor: '#FECACA',
    },
    resolveChipText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

    emptySection: { margin: 16, padding: 24, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center' },
    emptyText:    { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8 },
    loadingText:  { marginTop: 16, color: '#64748B', fontSize: 14 },
    errorText:    { marginTop: 12, color: '#DC2626', fontSize: 15, textAlign: 'center', marginBottom: 20 },
    btn:          { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    btnText:      { color: '#fff', fontWeight: '700', fontSize: 14 },
});
