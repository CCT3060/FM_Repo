/**
 * soft-raise-request.tsx
 * Client supervisor scans a soft-service asset QR and raises an issue.
 * They fill the checklist and submit it as a formal request.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { submitChecklist, raiseSoftRequest, getTemplateDetails } from '../utils/api';

interface Question {
    id: number;
    questionText: string;
    answerType: string;   // normalised: yes_no, ok_not_ok, text, number, photo, dropdown, date, remark …
    options?: string[];
    isRequired?: boolean;
}

export default function SoftRaiseRequestScreen() {
    const params = useLocalSearchParams<{
        assetId: string;
        assetName: string;
        templateId: string;
        templateName: string;
    }>();

    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers]     = useState<Record<number, string>>({});
    const [loading, setLoading]     = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const assetId    = Number(params.assetId);
    const templateId = Number(params.templateId);

    useEffect(() => {
        getTemplateDetails('checklist', templateId)
            .then(data => setQuestions((data as any)?.questions || []))
            .catch(() => setQuestions([]))
            .finally(() => setLoading(false));
    }, [templateId]);

    const setAnswer = (qId: number, val: string) =>
        setAnswers(prev => ({ ...prev, [qId]: val }));

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
            setAnswer(qId, result.assets[0].uri);
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
            setAnswer(qId, result.assets[0].uri);
        }
    };

    const handleSubmit = async () => {
        const unanswered = questions.filter(q => q.isRequired && !answers[q.id]?.trim());
        if (unanswered.length > 0) {
            Alert.alert('Required Fields', `Please answer: ${unanswered.map(q => q.questionText).join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const answerList = questions.map(q => ({
                questionId: q.id,
                answer: answers[q.id] ?? null,
            }));

            const submissionId = await submitChecklist(templateId, assetId, answerList);
            await raiseSoftRequest({ assetId, templateId, templateType: 'checklist', submissionId });

            Alert.alert(
                'Request Raised',
                'Your issue has been logged. The service team will resolve it.',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to raise request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={s.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={s.loadingText}>Loading checklist…</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.headerTitle}>Report Issue</Text>
                    <Text style={s.headerSub} numberOfLines={1}>{params.assetName}</Text>
                </View>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 120 }}>
                {questions.length === 0 ? (
                    <View style={s.emptyBox}>
                        <Text style={s.emptyText}>No checklist questions found.</Text>
                    </View>
                ) : (
                    questions.map((q, idx) => (
                        <View key={q.id} style={s.questionCard}>
                            <Text style={s.questionLabel}>
                                {idx + 1}. {q.questionText}
                                {q.isRequired && <Text style={{ color: '#DC2626' }}> *</Text>}
                            </Text>
                            <QuestionInput
                                question={q}
                                value={answers[q.id] ?? ''}
                                onChange={val => setAnswer(q.id, val)}
                                onPickPhoto={() => handlePickPhoto(q.id)}
                                onTakePhoto={() => handleTakePhoto(q.id)}
                            />
                        </View>
                    ))
                )}
            </ScrollView>

            <View style={s.footer}>
                <TouchableOpacity
                    style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#fff" />
                            <Text style={s.submitBtnText}>Raise Request</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

/* ── Question input renderer ─────────────────────────────────────────────── */
function QuestionInput({
    question, value, onChange, onPickPhoto, onTakePhoto,
}: {
    question: Question;
    value: string;
    onChange: (v: string) => void;
    onPickPhoto: () => void;
    onTakePhoto: () => void;
}) {
    const type = (question.answerType || 'text').toLowerCase();

    // Yes / No
    if (type === 'yes_no') {
        return <ToggleButtons value={value} onChange={onChange} options={['Yes', 'No']} colors={['#16a34a', '#DC2626']} />;
    }
    // Ok / Not Ok
    if (type === 'ok_not_ok') {
        return <ToggleButtons value={value} onChange={onChange} options={['Ok', 'Not Ok']} colors={['#16a34a', '#DC2626']} />;
    }
    // Cleaned / Not Cleaned
    if (type === 'cleaned_not_cleaned') {
        return <ToggleButtons value={value} onChange={onChange} options={['Cleaned', 'Not Cleaned']} colors={['#16a34a', '#DC2626']} />;
    }
    // Photo / Image
    if (type === 'photo' || type === 'image') {
        return (
            <View>
                <View style={s.photoRow}>
                    <TouchableOpacity style={s.photoBtn} onPress={onTakePhoto}>
                        <MaterialCommunityIcons name="camera" size={20} color="#2563EB" />
                        <Text style={s.photoBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.photoBtn} onPress={onPickPhoto}>
                        <MaterialCommunityIcons name="image-multiple" size={20} color="#2563EB" />
                        <Text style={s.photoBtnText}>Gallery</Text>
                    </TouchableOpacity>
                </View>
                {value ? (
                    <View style={s.photoPreview}>
                        <Image source={{ uri: value }} style={s.photoImg} resizeMode="cover" />
                        <TouchableOpacity style={s.photoRemove} onPress={() => onChange('')}>
                            <MaterialCommunityIcons name="close-circle" size={22} color="#DC2626" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={s.photoPlaceholder}>
                        <MaterialCommunityIcons name="image-outline" size={40} color="#CBD5E1" />
                        <Text style={s.photoPlaceholderText}>No photo selected</Text>
                    </View>
                )}
            </View>
        );
    }
    // Dropdown / Multiple choice with options
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
    // Number
    if (type === 'number') {
        return (
            <TextInput
                style={s.textInput}
                placeholder="Enter number"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    // Date
    if (type === 'date') {
        return (
            <TextInput
                style={s.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    // Remark / long text
    if (type === 'remark' || type === 'textarea' || type === 'long_text') {
        return (
            <TextInput
                style={[s.textInput, s.textAreaInput]}
                placeholder="Enter remarks…"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={value}
                onChangeText={onChange}
            />
        );
    }
    // Default: text
    return (
        <TextInput
            style={s.textInput}
            placeholder="Enter answer…"
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

const s = StyleSheet.create({
    container:      { flex: 1, backgroundColor: '#F8FAFC' },
    centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText:    { marginTop: 12, color: '#64748B', fontSize: 14 },

    header:         { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    backBtn:        { marginRight: 12, padding: 4 },
    headerTitle:    { fontSize: 17, fontWeight: '700', color: '#0F172A' },
    headerSub:      { fontSize: 12, color: '#64748B', marginTop: 1 },

    scroll:         { flex: 1 },
    questionCard:   { margin: 12, marginBottom: 6, backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
    questionLabel:  { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 10, lineHeight: 19 },

    toggleRow:      { flexDirection: 'row', gap: 8 },
    toggleBtn:      { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', backgroundColor: '#F8FAFC' },
    toggleText:     { fontSize: 13, fontWeight: '600', color: '#64748B' },

    textInput:      { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC' },
    textAreaInput:  { minHeight: 80, textAlignVertical: 'top' },

    optionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
    optionBtnActive:{ backgroundColor: '#EFF6FF' },
    radio:          { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff' },
    radioActive:    { borderColor: '#2563EB', backgroundColor: '#2563EB' },
    optionText:     { fontSize: 14, color: '#334155' },
    optionTextActive:{ color: '#2563EB', fontWeight: '700' },

    photoRow:       { flexDirection: 'row', gap: 10, marginBottom: 10 },
    photoBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    photoBtnText:   { fontSize: 13, fontWeight: '700', color: '#2563EB' },
    photoPreview:   { position: 'relative' },
    photoImg:       { width: '100%', height: 200, borderRadius: 8 },
    photoRemove:    { position: 'absolute', top: 8, right: 8 },
    photoPlaceholder:{ alignItems: 'center', justifyContent: 'center', height: 100, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
    photoPlaceholderText:{ fontSize: 12, color: '#94A3B8', marginTop: 4 },

    emptyBox:       { margin: 24, padding: 24, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center' },
    emptyText:      { color: '#94A3B8', fontSize: 14 },

    footer:         { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    submitBtn:      { backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
