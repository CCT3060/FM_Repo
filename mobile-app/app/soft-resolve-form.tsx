/**
 * soft-resolve-form.tsx
 * Catalyst supervisor sees:
 *   - BEFORE column: the client supervisor's checklist submission
 *   - AFTER column: a fresh form for the catalyst to fill and submit
 * Submitting resolves the open request and sends a push notification to the
 * client supervisor who raised it.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitChecklist, resolveSoftRequest, getTemplateDetails } from '../utils/api';

interface Question {
    id: number;
    questionText: string;
    questionType: string;
    options?: string[];
    required?: boolean;
}

interface BeforeAnswer {
    questionId: number;
    answer: string | null;
}

export default function SoftResolveFormScreen() {
    const params = useLocalSearchParams<{
        assetId: string;
        assetName: string;
        requestId: string;
        templateId: string;
        templateType: string;
        beforeAnswers: string;   // JSON string of BeforeAnswer[]
        raisedByName: string;
        raisedAt: string;
    }>();

    const [questions, setQuestions] = useState<Question[]>([]);
    const [afterAnswers, setAfterAnswers] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const assetId    = Number(params.assetId);
    const requestId  = Number(params.requestId);
    const templateId = Number(params.templateId);

    let beforeAnswers: BeforeAnswer[] = [];
    try { beforeAnswers = JSON.parse(params.beforeAnswers || '[]'); } catch { /* ignore */ }

    const getBeforeAnswer = (questionId: number) =>
        beforeAnswers.find(a => a.questionId === questionId)?.answer ?? '—';

    useEffect(() => {
        getTemplateDetails('checklist', templateId)
            .then(data => setQuestions((data as any)?.questions || []))
            .catch(() => setQuestions([]))
            .finally(() => setLoading(false));
    }, [templateId]);

    const handleResolve = async () => {
        const unanswered = questions.filter(q => q.required && !afterAnswers[q.id]?.trim());
        if (unanswered.length > 0) {
            Alert.alert('Required Fields', 'Please fill all required fields in the After column.');
            return;
        }

        setSubmitting(true);
        try {
            // Submit the catalyst's checklist (the "after" record)
            const answerList = questions.map(q => ({
                questionId: q.id,
                answer: afterAnswers[q.id] ?? null,
            }));
            await submitChecklist(templateId, assetId, answerList);

            // Resolve the soft-service request
            await resolveSoftRequest(requestId);

            Alert.alert(
                'Request Resolved',
                'The issue has been closed. The client supervisor has been notified.',
                [{ text: 'OK', onPress: () => router.replace('/supervisor-dashboard') }]
            );
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to resolve request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading…</Text>
            </SafeAreaView>
        );
    }

    const raisedDate = params.raisedAt
        ? new Date(params.raisedAt).toLocaleString()
        : '—';

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Resolve Issue</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>{params.assetName}</Text>
                </View>
            </View>

            {/* Request info banner */}
            <View style={styles.requestBanner}>
                <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#0369a1" />
                <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>
                        Reported by <Text style={{ fontWeight: '700' }}>{params.raisedByName || 'Client Supervisor'}</Text>
                    </Text>
                    <Text style={styles.bannerSub}>{raisedDate}</Text>
                </View>
            </View>

            {/* Column headers */}
            <View style={styles.colHeaders}>
                <View style={[styles.colHeader, styles.colHeaderBefore]}>
                    <MaterialCommunityIcons name="history" size={14} color="#b45309" />
                    <Text style={[styles.colHeaderText, { color: '#b45309' }]}>Before (Client)</Text>
                </View>
                <View style={[styles.colHeader, styles.colHeaderAfter]}>
                    <MaterialCommunityIcons name="check-circle-outline" size={14} color="#166534" />
                    <Text style={[styles.colHeaderText, { color: '#166534' }]}>After (Your Entry)</Text>
                </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
                {questions.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No questions found for this checklist.</Text>
                    </View>
                ) : (
                    questions.map((q, idx) => (
                        <View key={q.id} style={styles.questionBlock}>
                            <Text style={styles.questionLabel}>
                                {idx + 1}. {q.questionText}
                                {q.required && <Text style={{ color: '#dc2626' }}> *</Text>}
                            </Text>

                            <View style={styles.beforeAfterRow}>
                                {/* BEFORE — read-only answer from client supervisor */}
                                <View style={styles.beforeCol}>
                                    <Text style={styles.beforeValue}>
                                        {getBeforeAnswer(q.id) || '—'}
                                    </Text>
                                </View>

                                {/* AFTER — catalyst fills this */}
                                <View style={styles.afterCol}>
                                    {q.questionType === 'yes_no' ? (
                                        <View style={styles.yesNoRow}>
                                            {['Yes', 'No'].map(opt => (
                                                <TouchableOpacity
                                                    key={opt}
                                                    style={[
                                                        styles.yesNoBtn,
                                                        afterAnswers[q.id] === opt && styles.yesNoBtnActive,
                                                    ]}
                                                    onPress={() => setAfterAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                                >
                                                    <Text style={[
                                                        styles.yesNoBtnText,
                                                        afterAnswers[q.id] === opt && styles.yesNoBtnTextActive,
                                                    ]}>
                                                        {opt}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : q.questionType === 'multiple_choice' && q.options?.length ? (
                                        <View>
                                            {q.options.map(opt => (
                                                <TouchableOpacity
                                                    key={opt}
                                                    style={styles.optionBtn}
                                                    onPress={() => setAfterAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                                >
                                                    <View style={[
                                                        styles.radio,
                                                        afterAnswers[q.id] === opt && styles.radioActive,
                                                    ]} />
                                                    <Text style={styles.optionText}>{opt}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : (
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Your answer…"
                                            placeholderTextColor="#94A3B8"
                                            multiline
                                            value={afterAnswers[q.id] || ''}
                                            onChangeText={text => setAfterAnswers(prev => ({ ...prev, [q.id]: text }))}
                                        />
                                    )}
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Resolve bar */}
            <View style={styles.resolveBar}>
                <TouchableOpacity
                    style={[styles.resolveBtn, submitting && { opacity: 0.6 }]}
                    onPress={handleResolve}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="check-circle" size={18} color="#fff" />
                            <Text style={styles.resolveBtnText}>Mark as Resolved</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:          { flex: 1, backgroundColor: '#F8FAFC' },
    centered:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    loadingText:        { marginTop: 12, color: '#64748B', fontSize: 14 },
    header:             { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    backBtn:            { marginRight: 12, padding: 4 },
    headerTitle:        { fontSize: 17, fontWeight: '700', color: '#0F172A' },
    headerSub:          { fontSize: 12, color: '#64748B', marginTop: 1 },
    requestBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: 12, padding: 12, backgroundColor: '#e0f2fe', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#0369a1' },
    bannerTitle:        { fontSize: 13, color: '#0c4a6e' },
    bannerSub:          { fontSize: 11, color: '#0369a1', marginTop: 2 },
    colHeaders:         { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
    colHeader:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 6 },
    colHeaderBefore:    { backgroundColor: '#fef9c3' },
    colHeaderAfter:     { backgroundColor: '#dcfce7' },
    colHeaderText:      { fontSize: 11.5, fontWeight: '700' },
    scroll:             { flex: 1 },
    questionBlock:      { marginHorizontal: 12, marginBottom: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    questionLabel:      { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 8, lineHeight: 19 },
    beforeAfterRow:     { flexDirection: 'row', gap: 8 },
    beforeCol:          { flex: 1, backgroundColor: '#fef9c3', borderRadius: 8, padding: 10, minHeight: 44, justifyContent: 'center' },
    afterCol:           { flex: 1 },
    beforeValue:        { fontSize: 13, color: '#78350f', fontStyle: 'italic' },
    textInput:          { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, fontSize: 13, color: '#0F172A', minHeight: 60, textAlignVertical: 'top', backgroundColor: '#F8FAFC' },
    yesNoRow:           { flexDirection: 'row', gap: 6 },
    yesNoBtn:           { flex: 1, paddingVertical: 8, borderRadius: 7, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', backgroundColor: '#F8FAFC' },
    yesNoBtnActive:     { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
    yesNoBtnText:       { fontSize: 13, fontWeight: '600', color: '#64748B' },
    yesNoBtnTextActive: { color: '#16a34a' },
    optionBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
    radio:              { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff' },
    radioActive:        { borderColor: '#16a34a', backgroundColor: '#16a34a' },
    optionText:         { fontSize: 13, color: '#334155' },
    emptyBox:           { margin: 24, padding: 20, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center' },
    emptyText:          { color: '#94A3B8', fontSize: 14 },
    resolveBar:         { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    resolveBtn:         { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    resolveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
});
