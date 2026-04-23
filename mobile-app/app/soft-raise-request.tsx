/**
 * soft-raise-request.tsx
 * Client supervisor scans a soft-service asset QR and finds an issue.
 * They fill the checklist and submit it as a formal request for the
 * catalyst supervisor to resolve.
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
import { submitChecklist, raiseSoftRequest, getTemplateDetails } from '../utils/api';

interface Question {
    id: number;
    questionText: string;
    questionType: string;
    options?: string[];
    required?: boolean;
}

export default function SoftRaiseRequestScreen() {
    const params = useLocalSearchParams<{
        assetId: string;
        assetName: string;
        templateId: string;
        templateName: string;
    }>();

    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const assetId   = Number(params.assetId);
    const templateId = Number(params.templateId);

    useEffect(() => {
        getTemplateDetails('checklist', templateId)
            .then(data => setQuestions((data as any)?.questions || []))
            .catch(() => setQuestions([]))
            .finally(() => setLoading(false));
    }, [templateId]);

    const handleSubmit = async () => {
        const unanswered = questions.filter(q => q.required && !answers[q.id]?.trim());
        if (unanswered.length > 0) {
            Alert.alert('Required Fields', 'Please answer all required questions before submitting.');
            return;
        }

        setSubmitting(true);
        try {
            // 1. Submit the checklist as a standard submission
            const answerList = questions.map(q => ({ questionId: q.id, answer: answers[q.id] ?? null }));
            await submitChecklist(templateId, assetId, answerList);

            // 2. Raise the soft-service request (links the submission)
            await raiseSoftRequest({ assetId, templateId, templateType: 'checklist' });

            Alert.alert(
                'Request Submitted',
                'Your issue has been reported. The catalyst supervisor will be notified.',
                [{ text: 'OK', onPress: () => router.replace('/dashboard') }]
            );
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading checklist…</Text>
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
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Raise Issue</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>{params.assetName}</Text>
                </View>
            </View>

            {/* Issue banner */}
            <View style={styles.issueBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#b45309" />
                <Text style={styles.issueBannerText}>
                    Fill the checklist below to report an issue. The catalyst supervisor will be assigned to resolve it.
                </Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
                {questions.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No questions found for this checklist.</Text>
                    </View>
                ) : (
                    questions.map((q, idx) => (
                        <View key={q.id} style={styles.questionCard}>
                            <Text style={styles.questionLabel}>
                                {idx + 1}. {q.questionText}
                                {q.required && <Text style={{ color: '#dc2626' }}> *</Text>}
                            </Text>

                            {q.questionType === 'yes_no' ? (
                                <View style={styles.yesNoRow}>
                                    {['Yes', 'No'].map(opt => (
                                        <TouchableOpacity
                                            key={opt}
                                            style={[
                                                styles.yesNoBtn,
                                                answers[q.id] === opt && styles.yesNoBtnActive,
                                            ]}
                                            onPress={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                        >
                                            <Text style={[
                                                styles.yesNoBtnText,
                                                answers[q.id] === opt && styles.yesNoBtnTextActive,
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
                                            style={[
                                                styles.optionBtn,
                                                answers[q.id] === opt && styles.optionBtnActive,
                                            ]}
                                            onPress={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                        >
                                            <View style={[
                                                styles.radio,
                                                answers[q.id] === opt && styles.radioActive,
                                            ]} />
                                            <Text style={styles.optionText}>{opt}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : (
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Enter your answer…"
                                    placeholderTextColor="#94A3B8"
                                    multiline
                                    value={answers[q.id] || ''}
                                    onChangeText={text => setAnswers(prev => ({ ...prev, [q.id]: text }))}
                                />
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Submit bar */}
            <View style={styles.submitBar}>
                <TouchableOpacity
                    style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="send" size={18} color="#fff" />
                            <Text style={styles.submitBtnText}>Submit Request</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:        { flex: 1, backgroundColor: '#F8FAFC' },
    centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    loadingText:      { marginTop: 12, color: '#64748B', fontSize: 14 },
    header:           { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    backBtn:          { marginRight: 12, padding: 4 },
    headerTitle:      { fontSize: 17, fontWeight: '700', color: '#0F172A' },
    headerSub:        { fontSize: 12, color: '#64748B', marginTop: 1 },
    issueBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, padding: 12, backgroundColor: '#fef9c3', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    issueBannerText:  { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },
    scroll:           { flex: 1 },
    questionCard:     { margin: 16, marginBottom: 0, backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
    questionLabel:    { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 10, lineHeight: 20 },
    textInput:        { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 14, color: '#0F172A', minHeight: 80, textAlignVertical: 'top', backgroundColor: '#F8FAFC' },
    yesNoRow:         { flexDirection: 'row', gap: 10 },
    yesNoBtn:         { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', backgroundColor: '#F8FAFC' },
    yesNoBtnActive:   { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    yesNoBtnText:     { fontSize: 14, fontWeight: '600', color: '#64748B' },
    yesNoBtnTextActive: { color: '#2563EB' },
    optionBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
    optionBtnActive:  {},
    radio:            { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff' },
    radioActive:      { borderColor: '#2563EB', backgroundColor: '#2563EB' },
    optionText:       { fontSize: 14, color: '#334155' },
    emptyBox:         { margin: 24, padding: 20, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center' },
    emptyText:        { color: '#94A3B8', fontSize: 14 },
    submitBar:        { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    submitBtn:        { backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
