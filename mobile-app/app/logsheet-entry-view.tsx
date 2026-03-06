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
    Platform,
} from 'react-native';
import { getLogsheetGridData, type LogsheetEntry, type TabularColumnGroup } from '../utils/api';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function LogsheetEntryViewScreen() {
    const params = useLocalSearchParams();
    const templateId = parseInt(params.templateId as string);
    const templateName = params.templateName as string;
    const initMonth = params.month ? parseInt(params.month as string) : new Date().getMonth() + 1;
    const initYear = params.year ? parseInt(params.year as string) : new Date().getFullYear();

    const [month, setMonth] = useState(initMonth);
    const [year, setYear] = useState(initYear);
    const [gridData, setGridData] = useState<any>(null);
    const [allEntries, setAllEntries] = useState<LogsheetEntry[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadGrid();
    }, [month, year]);

    const loadGrid = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getLogsheetGridData(templateId, month, year);
            setGridData(data);
            const entries = (data as any).entries || (data.entry ? [data.entry] : []);
            setAllEntries(entries);
            setSelectedEntryId(entries[0]?.id ?? null);
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    const selectedEntry = allEntries.find(e => e.id === selectedEntryId) || allEntries[0] || null;
    const readings = selectedEntry?.data?.readings || {};
    const summaryData = selectedEntry?.data?.summary || {};

    const headerConfig: any = gridData?.template?.headerConfig || {};
    const isTabular = headerConfig.layoutType === 'tabular';
    const columnGroups: TabularColumnGroup[] = headerConfig.columnGroups || [];
    const rows: Array<{ id: string; label: string }> = headerConfig.rows || [];
    const allCols = columnGroups.flatMap(g =>
        (g.columns || []).map(c => ({ ...c, groupId: g.id, groupLabel: g.label }))
    );

    const tabVal = (rowId: string, col: { groupId: string; id: string }) =>
        readings[rowId]?.[`${col.groupId}__${col.id}`] || '';

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{templateName}</Text>
                    <Text style={styles.headerSubtitle}>Logsheet History</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Month navigator */}
            <View style={styles.monthNav}>
                <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                    <MaterialCommunityIcons name="chevron-left" size={22} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#1E3A8A" />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading data…</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadGrid}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : allEntries.length === 0 ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="clipboard-text-off-outline" size={64} color="#CBD5E0" />
                    <Text style={styles.emptyTitle}>No submissions yet</Text>
                    <Text style={styles.emptySubtitle}>No entries for {MONTH_NAMES[month - 1]} {year}</Text>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }}>
                    {/* Entry selector when multiple submissions exist */}
                    {allEntries.length > 1 && (
                        <View style={styles.entryList}>
                            <Text style={styles.entryListLabel}>Select Submission</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                                {allEntries.map(e => (
                                    <TouchableOpacity
                                        key={e.id}
                                        style={[styles.entryChip, selectedEntryId === e.id && styles.entryChipActive]}
                                        onPress={() => setSelectedEntryId(e.id)}
                                    >
                                        {e.shift ? <Text style={[styles.entryChipShift, selectedEntryId === e.id && styles.entryChipTextActive]}>Shift: {e.shift}</Text> : null}
                                        <Text style={[styles.entryChipDate, selectedEntryId === e.id && styles.entryChipTextActive]}>
                                            {new Date(e.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </Text>
                                        {e.submittedByName ? <Text style={[styles.entryChipBy, selectedEntryId === e.id && styles.entryChipTextActive]}>by {e.submittedByName}</Text> : null}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Submission info */}
                    {selectedEntry && (
                        <View style={styles.infoBar}>
                            <MaterialCommunityIcons name="account-check" size={14} color="#1E3A8A" />
                            <Text style={styles.infoText}>
                                Submitted {selectedEntry.submittedAt ? new Date(selectedEntry.submittedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                {selectedEntry.submittedByName ? ` by ${selectedEntry.submittedByName}` : ''}
                                {selectedEntry.shift ? ` · Shift: ${selectedEntry.shift}` : ''}
                            </Text>
                        </View>
                    )}

                    {/* Tabular grid */}
                    {isTabular && allCols.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator style={{ margin: 12 }}>
                            <View>
                                {/* Group header row */}
                                <View style={{ flexDirection: 'row' }}>
                                    <View style={[gStyles.cell, gStyles.headerCell, gStyles.rowLabel]}>
                                        <Text style={gStyles.headerText}>{headerConfig.rowLabelHeader || 'TIME'}</Text>
                                    </View>
                                    {columnGroups.map(g => (
                                        <View key={g.id} style={[gStyles.cell, gStyles.headerCell, { width: g.columns.length * 72 }]}>
                                            <Text style={gStyles.headerText}>{g.label}</Text>
                                        </View>
                                    ))}
                                </View>
                                {/* Sub-column header */}
                                <View style={{ flexDirection: 'row' }}>
                                    <View style={[gStyles.cell, gStyles.subHeaderCell, gStyles.rowLabel]} />
                                    {allCols.map((col, ci) => (
                                        <View key={ci} style={[gStyles.cell, gStyles.subHeaderCell]}>
                                            <Text style={gStyles.subHeaderText}>{col.label}</Text>
                                            {col.subLabel ? <Text style={gStyles.subLabelText}>{col.subLabel}</Text> : null}
                                        </View>
                                    ))}
                                </View>
                                {/* Data rows */}
                                {rows.map((row, ri) => (
                                    <View key={row.id} style={{ flexDirection: 'row', backgroundColor: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <View style={[gStyles.cell, gStyles.dataCell, gStyles.rowLabel]}>
                                            <Text style={gStyles.rowLabelText}>{row.label}</Text>
                                        </View>
                                        {allCols.map((col, ci) => {
                                            const val = tabVal(row.id, col);
                                            return (
                                                <View key={ci} style={[gStyles.cell, gStyles.dataCell, val ? gStyles.dataCellFilled : null]}>
                                                    <Text style={[gStyles.dataText, val ? gStyles.dataTextFilled : null]}>{val || '—'}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))}
                                {/* Summary rows */}
                                {(headerConfig.summaryRows || []).map((sr: any, sri: number) => (
                                    <View key={`sum-${sri}`} style={{ flexDirection: 'row', backgroundColor: '#EFF6FF' }}>
                                        <View style={[gStyles.cell, gStyles.dataCell, gStyles.rowLabel, { backgroundColor: '#DBEAFE' }]}>
                                            <Text style={[gStyles.rowLabelText, { color: '#1E40AF' }]}>{sr.label}</Text>
                                        </View>
                                        {allCols.map((col, ci) => {
                                            const val = (summaryData[sr.id] || {})[`${col.groupId}__${col.id}`] || '';
                                            return (
                                                <View key={ci} style={[gStyles.cell, gStyles.dataCell, { backgroundColor: val ? '#DBEAFE' : '#EFF6FF' }]}>
                                                    <Text style={[gStyles.dataText, { color: '#1E40AF', fontWeight: val ? '700' : '400' }]}>{val || '—'}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    ) : (
                        <View style={styles.center}>
                            <Text style={styles.emptySubtitle}>No grid data available for this template.</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backBtn: { padding: 8 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
    headerSubtitle: { fontSize: 11, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    monthNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF', paddingVertical: 10, gap: 20,
        borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    navBtn: { padding: 6, borderRadius: 8, backgroundColor: '#EFF6FF' },
    monthLabel: { fontSize: 16, fontWeight: '700', color: '#1E3A8A', minWidth: 160, textAlign: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    loadingText: { color: '#718096', fontSize: 14 },
    errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center' },
    retryBtn: { backgroundColor: '#1E3A8A', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#fff', fontWeight: '700' },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#4A5568', marginTop: 8 },
    emptySubtitle: { fontSize: 14, color: '#A0AEC0', textAlign: 'center' },
    entryList: { margin: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    entryListLabel: { fontSize: 12, fontWeight: '700', color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.5 },
    entryChip: {
        marginRight: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
        borderWidth: 1, borderColor: '#CBD5E0', backgroundColor: '#F8FAFC', alignItems: 'center',
    },
    entryChipActive: { backgroundColor: '#1E3A8A', borderColor: '#1E3A8A' },
    entryChipShift: { fontSize: 11, fontWeight: '700', color: '#4A5568' },
    entryChipDate: { fontSize: 13, fontWeight: '700', color: '#1A202C' },
    entryChipBy: { fontSize: 11, color: '#718096' },
    entryChipTextActive: { color: '#FFFFFF' },
    infoBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 12, marginBottom: 4, padding: 10,
        backgroundColor: '#EFF6FF', borderRadius: 8,
    },
    infoText: { fontSize: 12, color: '#1E3A8A', flex: 1 },
});

const gStyles = StyleSheet.create({
    cell: { borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
    headerCell: { height: 38, backgroundColor: '#1E3A8A', borderColor: '#2D4EAA' },
    subHeaderCell: { width: 72, height: 42, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
    rowLabel: { width: 64, backgroundColor: '#F1F5F9' },
    dataCell: { width: 72, height: 40, backgroundColor: '#FFFFFF' },
    dataCellFilled: { backgroundColor: '#F0FDF4' },
    headerText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', textAlign: 'center' },
    subHeaderText: { fontSize: 9, fontWeight: '600', color: '#1E3A8A', textAlign: 'center' },
    subLabelText: { fontSize: 8, color: '#3B82F6', textAlign: 'center' },
    rowLabelText: { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center' },
    dataText: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
    dataTextFilled: { color: '#15803D', fontWeight: '700' },
});
