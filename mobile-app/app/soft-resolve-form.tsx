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
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { submitChecklist, resolveSoftRequest, getTemplateDetails, getStoredUser, isTechSupervisor, isTechnicianUser } from '../utils/api';

interface Question {
    id: number;
    questionText: string;
    answerType: string;   // normalised: yes_no, ok_not_ok, text, number, photo, dropdown, date, remark …
    options?: string[];
    isRequired?: boolean;
}

interface BeforeAnswer {
    questionId: number | null;
    questionText?: string;
    answer: string | null;
    optionSelected?: string | null;
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

    const getBeforeAnswer = (questionId: number, questionText: string) => {
        // question_id is NULL in DB for JSONB templates; match by questionText instead
        let a = beforeAnswers.find(x => x.questionId != null && x.questionId === questionId);
        if (!a) {
            const qt = (questionText || '').trim().toLowerCase();
            a = beforeAnswers.find(x =>
                x.questionText && x.questionText.trim().toLowerCase() === qt
            );
        }
        return a?.optionSelected || a?.answer || '—';
    };

    useEffect(() => {
        getTemplateDetails('checklist', templateId)
            .then(data => setQuestions((data as any)?.questions || []))
            .catch(() => setQuestions([]))
            .finally(() => setLoading(false));
    }, [templateId]);

    const setAfterAnswer = (qId: number, val: string) =>
        setAfterAnswers(prev => ({ ...prev, [qId]: val }));

    const handlePickPhoto = async (qId: number) => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission required', 'Allow photo library access to attach photos.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            base64: false,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            setAfterAnswer(qId, result.assets[0].uri);
        }
    };

    const handleTakePhoto = async (qId: number) => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Permission required', 'Allow camera access to take photos.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            quality: 0.7,
            base64: false,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            setAfterAnswer(qId, result.assets[0].uri);
        }
    };

    const handleResolve = async () => {
        const unanswered = questions.filter(q => q.isRequired && !afterAnswers[q.id]?.trim());
        if (unanswered.length > 0) {
            Alert.alert('Required Fields', `Please fill: ${unanswered.map(q => q.questionText).join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const answerList = questions.map(q => ({
                questionId: q.id,
                answer: afterAnswers[q.id] ?? null,
            }));
            const resolveSubmissionId = await submitChecklist(templateId, assetId, answerList);
            await resolveSoftRequest(requestId, resolveSubmissionId);

            // Navigate back to the user's actual home based on their role
            const storedUser = await getStoredUser().catch(() => null);
            const homePath = isTechSupervisor(storedUser) ? '/supervisor-dashboard'
                           : isTechnicianUser(storedUser) ? '/tech-dashboard'
                           : '/soft-supervisor-dashboard';

            Alert.alert(
                'Request Resolved',
                'The issue has been closed. The client supervisor has been notified.',
                [{ text: 'OK', onPress: () => router.replace(homePath as any) }]
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
                                {q.isRequired && <Text style={{ color: '#dc2626' }}> *</Text>}
                            </Text>

                            <View style={styles.beforeAfterRow}>
                                {/* BEFORE — read-only answer from client supervisor */}
                                <View style={styles.beforeCol}>
                                    <Text style={styles.beforeValue}>
                                        {getBeforeAnswer(q.id, q.questionText)}
                                    </Text>
                                </View>

                                {/* AFTER — catalyst fills this */}
                                <View style={styles.afterCol}>
                                    <AfterInput
                                        question={q}
                                        value={afterAnswers[q.id] ?? ''}
                                        onChange={val => setAfterAnswer(q.id, val)}
                                        onPickPhoto={() => handlePickPhoto(q.id)}
                                        onTakePhoto={() => handleTakePhoto(q.id)}
                                    />
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

/* ── After-column input renderer ─────────────────────────────────────────── */
function AfterInput({
    question, value, onChange, onPickPhoto, onTakePhoto,
}: {
    question: Question;
    value: string;
    onChange: (v: string) => void;
    onPickPhoto: () => void;
    onTakePhoto: () => void;
}) {
    const type = (question.answerType || 'text').toLowerCase();

    if (type === 'yes_no') {
        return <ToggleButtons value={value} onChange={onChange} options={['Yes', 'No']} colors={['#16a34a', '#DC2626']} />;
    }
    if (type === 'ok_not_ok') {
        return <ToggleButtons value={value} onChange={onChange} options={['Ok', 'Not Ok']} colors={['#16a34a', '#DC2626']} />;
    }
    if (type === 'cleaned_not_cleaned') {
        return <ToggleButtons value={value} onChange={onChange} options={['Cleaned', 'Not Cleaned']} colors={['#16a34a', '#DC2626']} />;
    }
    if (type === 'photo' || type === 'image') {
        return (
            <View>
                <View style={s.photoRow}>
                    <TouchableOpacity style={s.photoBtn} onPress={onTakePhoto}>
                        <MaterialCommunityIcons name="camera" size={18} color="#2563EB" />
                        <Text style={s.photoBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.photoBtn} onPress={onPickPhoto}>
                        <MaterialCommunityIcons name="image-multiple" size={18} color="#2563EB" />
                        <Text style={s.photoBtnText}>Gallery</Text>
                    </TouchableOpacity>
                </View>
                {value ? (
                    <View style={s.photoPreview}>
                        <Image source={{ uri: value }} style={s.photoImg} resizeMode="cover" />
                        <TouchableOpacity style={s.photoRemove} onPress={() => onChange('')}>
                            <MaterialCommunityIcons name="close-circle" size={20} color="#DC2626" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={s.photoPlaceholder}>
                        <MaterialCommunityIcons name="image-outline" size={32} color="#CBD5E1" />
                        <Text style={s.photoPlaceholderText}>No photo</Text>
                    </View>
                )}
            </View>
        );
    }
    if ((type === 'dropdown' || type === 'multiple_choice' || type === 'custom_options') && question.options?.length) {
        return (
            <View>
                {question.options.map(opt => (
                    <TouchableOpacity
                        key={opt}
                        style={[s.optionBtn, value === opt && s.optionBtnActive]}
                        onPress={() => onChange(opt)}
                    >
                        <View style={[s.radio, value === opt && s.radioActive]} />
                        <Text style={[s.optionText, value === opt && s.optionTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }
    if (type === 'number') {
        return (
            <TextInput
                style={styles.textInput}
                placeholder="Enter number"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    if (type === 'date') {
        return (
            <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    if (type === 'remark' || type === 'textarea' || type === 'long_text') {
        return (
            <TextInput
                style={[styles.textInput, { minHeight: 70 }]}
                placeholder="Enter remarks…"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    return (
        <TextInput
            style={styles.textInput}
            placeholder="Your answer…"
            placeholderTextColor="#94A3B8"
            value={value}
            onChangeText={onChange}
        />
    );
}

function ToggleButtons({ value, onChange, options, colors }: {
    value: string; onChange: (v: string) => void; options: string[]; colors: string[];
}) {
    return (
        <View style={s.toggleRow}>
            {options.map((opt, i) => {
                const active = value === opt;
                return (
                    <TouchableOpacity
                        key={opt}
                        style={[s.toggleBtn, active && { borderColor: colors[i], backgroundColor: colors[i] + '15' }]}
                        onPress={() => onChange(opt)}
                    >
                        <Text style={[s.toggleText, active && { color: colors[i], fontWeight: '800' }]}>{opt}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
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
    textInput:          { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, fontSize: 13, color: '#0F172A', minHeight: 44, textAlignVertical: 'top', backgroundColor: '#F8FAFC' },
    emptyBox:           { margin: 24, padding: 20, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center' },
    emptyText:          { color: '#94A3B8', fontSize: 14 },
    resolveBar:         { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    resolveBtn:         { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    resolveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const s = StyleSheet.create({
    toggleRow:              { flexDirection: 'row', gap: 6 },
    toggleBtn:              { flex: 1, paddingVertical: 8, borderRadius: 7, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', backgroundColor: '#F8FAFC' },
    toggleText:             { fontSize: 12, fontWeight: '600', color: '#64748B' },
    photoRow:               { flexDirection: 'row', gap: 6, marginBottom: 8 },
    photoBtn:               { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8, borderRadius: 7, borderWidth: 1.5, borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    photoBtnText:           { fontSize: 12, fontWeight: '700', color: '#2563EB' },
    photoPreview:           { position: 'relative' },
    photoImg:               { width: '100%', height: 120, borderRadius: 7 },
    photoRemove:            { position: 'absolute', top: 4, right: 4 },
    photoPlaceholder:       { alignItems: 'center', justifyContent: 'center', height: 70, borderRadius: 7, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
    photoPlaceholderText:   { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    optionBtn:              { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderRadius: 6 },
    optionBtnActive:        { backgroundColor: '#EFF6FF' },
    radio:                  { width: 15, height: 15, borderRadius: 7.5, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff' },
    radioActive:            { borderColor: '#2563EB', backgroundColor: '#2563EB' },
    optionText:             { fontSize: 12, color: '#334155' },
    optionTextActive:       { color: '#2563EB', fontWeight: '700' },
});
