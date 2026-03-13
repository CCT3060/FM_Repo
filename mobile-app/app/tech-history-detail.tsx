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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { getMySubmissionDetail, type SubmissionDetail } from '../utils/api';

export default function TechHistoryDetailScreen() {
    const { type, id, name } = useLocalSearchParams<{ type: string; id: string; name: string }>();
    const [detail, setDetail] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!type || !id) return;
        setLoading(true);
        getMySubmissionDetail(type, Number(id))
            .then(d => setDetail(d))
            .catch(e => setError(e.message || 'Failed to load detail'))
            .finally(() => setLoading(false));
    }, [type, id]);

    const isChecklist = type === 'checklist';
    const accentColor = isChecklist ? '#6366F1' : '#2563EB';
    const bgColor = isChecklist ? '#EEF2FF' : '#EFF6FF';

    const renderAnswer = (answer: SubmissionDetail['answers'][number], i: number) => {
        const val = answer.answer;
        const displayVal =
            val === null || val === undefined ? '—' :
            typeof val === 'boolean' ? (val ? 'Yes ✓' : 'No ✗') :
            String(val).trim() === '' ? '—' : String(val);

        const isBool = typeof val === 'boolean';
        const isOk = isBool ? val : null;

        return (
            <Animated.View key={i} entering={FadeInUp.delay(20 * i).duration(250)}>
                <View style={styles.answerRow}>
                    <View style={styles.answerLeft}>
                        <Text style={styles.questionText}>{answer.question || `Item ${i + 1}`}</Text>
                        {answer.type ? (
                            <Text style={styles.questionType}>{answer.type.toUpperCase()}</Text>
                        ) : null}
                    </View>
                    <View style={[
                        styles.answerBubble,
                        isBool && { backgroundColor: isOk ? '#ECFDF5' : '#FEF2F2' }
                    ]}>
                        <Text style={[
                            styles.answerText,
                            isBool && { color: isOk ? '#10B981' : '#EF4444', fontWeight: '700' }
                        ]}>{displayVal}</Text>
                    </View>
                </View>
                {i < (detail?.answers.length ?? 0) - 1 && <View style={styles.divider} />}
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Submission Detail'}</Text>
                    <Text style={styles.headerSub}>{isChecklist ? 'Checklist' : 'Logsheet'} · Response Answers</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: bgColor }]}>
                    <MaterialCommunityIcons
                        name={isChecklist ? 'clipboard-check' : 'notebook'}
                        size={16}
                        color={accentColor}
                    />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Meta card */}
                {detail && (
                    <View style={styles.metaCard}>
                        <View style={styles.metaRow}>
                            <MaterialCommunityIcons name="calendar" size={14} color="#94A3B8" />
                            <Text style={styles.metaText}>
                                {new Date(detail.submittedAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                        {detail.assetName ? (
                            <View style={styles.metaRow}>
                                <MaterialCommunityIcons name="office-building" size={14} color="#94A3B8" />
                                <Text style={styles.metaText}>{detail.assetName}</Text>
                            </View>
                        ) : null}
                        <View style={styles.metaRow}>
                            <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" />
                            <Text style={[styles.metaText, { color: '#10B981', fontWeight: '600' }]}>
                                {detail.status === 'completed' ? 'Completed' : 'Submitted'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Answers */}
                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={accentColor} />
                        <Text style={styles.loadingText}>Loading responses…</Text>
                    </View>
                ) : error ? (
                    <View style={styles.errorBox}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#EF4444" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkBtn}>
                            <Text style={styles.backLinkText}>Go back</Text>
                        </TouchableOpacity>
                    </View>
                ) : !detail || detail.answers.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <MaterialCommunityIcons name="file-document-outline" size={40} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No answers recorded.</Text>
                    </View>
                ) : (
                    <View style={styles.answersCard}>
                        <Text style={styles.answersTitle}>{detail.answers.length} Response{detail.answers.length !== 1 ? 's' : ''}</Text>
                        {detail.answers.map((a, i) => renderAnswer(a, i))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.3,
    },
    headerSub: {
        fontSize: 12,
        color: '#94A3B8',
        marginTop: 1,
    },
    typeBadge: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    metaCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: 8,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaText: {
        fontSize: 13,
        color: '#64748B',
    },
    answersCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        paddingBottom: 4,
    },
    answersTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    answerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    answerLeft: {
        flex: 1,
    },
    questionText: {
        fontSize: 14,
        color: '#0F172A',
        fontWeight: '500',
        lineHeight: 20,
    },
    questionType: {
        fontSize: 10,
        color: '#94A3B8',
        marginTop: 2,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    answerBubble: {
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        maxWidth: '45%',
        alignSelf: 'flex-start',
    },
    answerText: {
        fontSize: 13,
        color: '#374151',
        fontWeight: '600',
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginHorizontal: 16,
    },
    loadingBox: {
        padding: 48,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: '#94A3B8',
        fontSize: 14,
    },
    errorBox: {
        padding: 48,
        alignItems: 'center',
        gap: 12,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 14,
        textAlign: 'center',
    },
    backLinkBtn: {
        marginTop: 8,
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
    },
    backLinkText: {
        color: '#475569',
        fontWeight: '600',
        fontSize: 13,
    },
    emptyBox: {
        padding: 48,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        color: '#94A3B8',
        fontSize: 14,
    },
});
