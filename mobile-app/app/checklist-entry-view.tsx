import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getChecklistGridData, type ChecklistGridData } from '../utils/api';

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

/** Abbreviate answer for narrow grid cells */
function cellDisplay(val: string, answerType: string): string {
    if (!val) return '—';
    const v = val.toLowerCase().trim();
    if (answerType === 'yes_no' || answerType === 'checkbox') {
        if (v === 'yes' || v === '1' || v === 'true') return '✓';
        if (v === 'no'  || v === '0' || v === 'false') return '✗';
    }
    if (answerType === 'ok_not_ok') {
        if (v === 'ok')     return '✓';
        if (v === 'not_ok' || v === 'not ok') return '✗';
    }
    return val.length > 7 ? val.slice(0, 6) + '…' : val;
}

const QUESTION_COL = 155;
const DAY_COL      = 44;

export default function ChecklistEntryViewScreen() {
    const params       = useLocalSearchParams();
    const templateId   = parseInt(params.templateId as string);
    const templateName = params.templateName as string;
    const initMonth    = params.month ? parseInt(params.month as string)  : new Date().getMonth() + 1;
    const initYear     = params.year  ? parseInt(params.year  as string)  : new Date().getFullYear();

    const [month,    setMonth]    = useState(initMonth);
    const [year,     setYear]     = useState(initYear);
    const [gridData, setGridData] = useState<ChecklistGridData | null>(null);
    const [isLoading,setIsLoading]= useState(true);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => { loadGrid(); }, [month, year]);

    const loadGrid = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getChecklistGridData(templateId, month, year);
            setGridData(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // Build day → latest submission map  (submissions arrive sorted ASC so last write wins)
    const dayMap: Record<number, ChecklistGridData['submissions'][0]> = {};
    for (const sub of gridData?.submissions || []) {
        dayMap[sub.day] = sub;
    }

    const daysInMonth  = gridData?.daysInMonth || 31;
    const days         = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const questions    = (gridData?.questions || []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
    const submittedDays = new Set(Object.keys(dayMap).map(Number));

    return (
        <SafeAreaView style={styles.container}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {gridData?.template.templateName || templateName}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {gridData?.template.assetName || 'Checklist History'}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* ── Month navigator ─────────────────────────────────────────── */}
            <View style={styles.monthNav}>
                <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                    <MaterialCommunityIcons name="chevron-left" size={22} color="#7C3AED" />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#7C3AED" />
                </TouchableOpacity>
            </View>

            {/* ── Stats bar ───────────────────────────────────────────────── */}
            {gridData && !isLoading && (
                <View style={styles.statsBar}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNum}>{gridData.submissions.length}</Text>
                        <Text style={styles.statLabel}>Submissions</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNum}>{submittedDays.size}</Text>
                        <Text style={styles.statLabel}>Days Filled</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={[styles.statNum, { color: submittedDays.size < daysInMonth ? '#DC2626' : '#16A34A' }]}>
                            {daysInMonth - submittedDays.size}
                        </Text>
                        <Text style={styles.statLabel}>Pending</Text>
                    </View>
                </View>
            )}

            {/* ── Body ───────────────────────────────────────────────────── */}
            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#7C3AED" />
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
            ) : questions.length === 0 ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="clipboard-text-off-outline" size={64} color="#CBD5E0" />
                    <Text style={styles.emptyTitle}>No questions found</Text>
                    <Text style={styles.emptySubtitle}>This checklist has no questions defined</Text>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

                    {/* ── Tabular grid ──────────────────────────────────── */}
                    <ScrollView horizontal showsHorizontalScrollIndicator style={{ margin: 12 }}>
                        <View>
                            {/* Header row: "QUESTION" label + day numbers */}
                            <View style={{ flexDirection: 'row' }}>
                                <View style={[gS.cell, gS.hdrCell, { width: QUESTION_COL, alignItems: 'flex-start', paddingHorizontal: 10 }]}>
                                    <Text style={gS.hdrText}>QUESTION</Text>
                                </View>
                                {days.map(d => (
                                    <View key={d} style={[
                                        gS.cell, gS.hdrCell, { width: DAY_COL },
                                        submittedDays.has(d) && gS.hdrCellFilled,
                                    ]}>
                                        <Text style={gS.hdrText}>{d}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Question rows */}
                            {questions.map((q, qi) => (
                                <View key={q.id} style={{ flexDirection: 'row', backgroundColor: qi % 2 === 0 ? '#FFF' : '#F8FAFC' }}>
                                    {/* Question label */}
                                    <View style={[gS.cell, gS.dataCell, gS.qLabelCell, { width: QUESTION_COL }]}>
                                        <Text style={gS.qLabelText} numberOfLines={2}>{q.questionText}</Text>
                                    </View>
                                    {/* Day answer cells */}
                                    {days.map(d => {
                                        const val     = dayMap[d]?.answers[q.questionText] || '';
                                        const display = cellDisplay(val, q.answerType);
                                        const filled  = !!val;
                                        return (
                                            <View key={d} style={[
                                                gS.cell, gS.dataCell, { width: DAY_COL },
                                                filled && gS.dataCellFilled,
                                            ]}>
                                                <Text style={[
                                                    gS.dataText,
                                                    filled           && gS.dataTextFilled,
                                                    display === '✓'  && gS.textYes,
                                                    display === '✗'  && gS.textNo,
                                                ]}>
                                                    {display}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            ))}

                            {/* Submitter row */}
                            <View style={{ flexDirection: 'row' }}>
                                <View style={[gS.cell, gS.dataCell, gS.submitterLabelCell, { width: QUESTION_COL }]}>
                                    <Text style={[gS.qLabelText, { color: '#6D28D9', fontWeight: '700' }]}>Submitted By</Text>
                                </View>
                                {days.map(d => {
                                    const name     = dayMap[d]?.submittedBy || '';
                                    const initials = name
                                        ? name.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase()
                                        : '';
                                    return (
                                        <View key={d} style={[
                                            gS.cell, gS.dataCell, { width: DAY_COL },
                                            name ? gS.submitterCellFilled : null,
                                        ]}>
                                            <Text style={[gS.dataText, name ? { color: '#6D28D9', fontWeight: '700', fontSize: 9 } : null]}>
                                                {initials || '—'}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Signature footer row */}
                            <View style={{ flexDirection: 'row', marginTop: 2 }}>
                                {['Technician Signature', 'Supervisor Signature', 'Manager Signature'].map((label, i) => (
                                    <View key={i} style={[gS.sigCell, i < 2 && gS.sigCellBorder]}>
                                        <View style={gS.sigLine} />
                                        <Text style={gS.sigLabel}>{label}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </ScrollView>

                    {/* ── Submission list ───────────────────────────────── */}
                    {(gridData?.submissions || []).length > 0 && (
                        <View style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 16 }}>
                            <Text style={styles.detailsHeader}>Submissions This Month</Text>
                            {(gridData?.submissions || []).map(sub => (
                                <View key={sub.id} style={styles.subCard}>
                                    <MaterialCommunityIcons name="clipboard-check" size={16} color="#7C3AED" />
                                    <Text style={styles.subCardDay}>
                                        {sub.date
                                            ? new Date(sub.date).toLocaleDateString('en-IN',
                                                { day: '2-digit', month: 'short', year: 'numeric' })
                                            : `Day ${sub.day}`}
                                    </Text>
                                    {sub.submittedBy ? (
                                        <Text style={styles.subCardBy}>by {sub.submittedBy}</Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    )}

                    {(gridData?.submissions || []).length === 0 && (
                        <View style={[styles.center, { marginTop: 20 }]}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#CBD5E0" />
                            <Text style={styles.emptyTitle}>No submissions yet</Text>
                            <Text style={styles.emptySubtitle}>
                                No entries for {MONTH_NAMES[month - 1]} {year}
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

/* ─── Grid styles ────────────────────────────────────────────────────────── */
const gS = StyleSheet.create({
    cell:             { borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
    hdrCell:          { height: 36, backgroundColor: '#6D28D9', borderColor: '#7C3AED' },
    hdrCellFilled:    { backgroundColor: '#5B21B6' },
    hdrText:          { color: '#FFFFFF', fontSize: 10, fontWeight: '700', textAlign: 'center' },
    dataCell:         { height: 38, backgroundColor: '#FFFFFF' },
    dataCellFilled:   { backgroundColor: '#F5F3FF' },
    qLabelCell:       { backgroundColor: '#F5F3FF', alignItems: 'flex-start', paddingHorizontal: 8 },
    qLabelText:       { fontSize: 10, fontWeight: '600', color: '#374151', lineHeight: 14 },
    dataText:         { fontSize: 11, color: '#94A3B8', textAlign: 'center' },
    dataTextFilled:   { color: '#5B21B6', fontWeight: '700' },
    textYes:          { color: '#16A34A', fontWeight: '800', fontSize: 16 },
    textNo:           { color: '#DC2626', fontWeight: '800', fontSize: 14 },
    submitterLabelCell: { backgroundColor: '#EDE9FE', alignItems: 'flex-start', paddingHorizontal: 8 },
    submitterCellFilled: { backgroundColor: '#EDE9FE' },
    sigCell:          { flex: 1, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    sigCellBorder:    { borderRightWidth: 1, borderRightColor: '#E2E8F0' },
    sigLine:          { width: '80%', height: 1, backgroundColor: '#1E3A8A', marginBottom: 6 },
    sigLabel:         { fontSize: 10, color: '#64748B', textAlign: 'center' },
});

/* ─── Screen styles ──────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
    container:     { flex: 1, backgroundColor: '#F8F9FA' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backBtn:        { padding: 8 },
    headerCenter:   { flex: 1, alignItems: 'center' },
    headerTitle:    { fontSize: 16, fontWeight: '700', color: '#1A202C' },
    headerSubtitle: { fontSize: 11, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    monthNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFFFFF', paddingVertical: 10, gap: 20,
        borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    },
    navBtn:      { padding: 6, borderRadius: 8, backgroundColor: '#F5F3FF' },
    monthLabel:  { fontSize: 16, fontWeight: '700', color: '#6D28D9', minWidth: 170, textAlign: 'center' },
    statsBar: {
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
        margin: 12, padding: 14, backgroundColor: '#FFFFFF',
        borderRadius: 10, borderWidth: 1, borderColor: '#E9D5FF',
    },
    statItem:    { alignItems: 'center', gap: 2 },
    statNum:     { fontSize: 22, fontWeight: '800', color: '#6D28D9' },
    statLabel:   { fontSize: 11, color: '#94A3B8' },
    statDivider: { width: 1, height: 32, backgroundColor: '#E9D5FF' },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    loadingText: { color: '#718096', fontSize: 14 },
    errorText:   { color: '#EF4444', fontSize: 14, textAlign: 'center' },
    retryBtn:    { backgroundColor: '#7C3AED', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    retryText:   { color: '#fff', fontWeight: '700' },
    emptyTitle:  { fontSize: 18, fontWeight: '700', color: '#4A5568', marginTop: 8 },
    emptySubtitle: { fontSize: 14, color: '#A0AEC0', textAlign: 'center' },
    detailsHeader: { fontSize: 12, fontWeight: '700', color: '#6D28D9', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    subCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#FFFFFF', borderRadius: 8, padding: 10,
        borderWidth: 1, borderColor: '#E9D5FF', marginBottom: 6,
    },
    subCardDay:  { fontSize: 13, fontWeight: '700', color: '#1A202C', flex: 1 },
    subCardBy:   { fontSize: 12, color: '#718096' },
});
