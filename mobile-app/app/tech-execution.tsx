import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getTemplateDetails, submitChecklist, submitLogsheet, submitTabularLogsheet, type TabularHeaderConfig, type TemplateDetails } from '../utils/api';

export default function TechExecutionScreen() {
    const params = useLocalSearchParams<{
        assignmentId: string;
        templateType: string;
        templateId: string;
        templateName: string;
        assetId: string;
        assetName: string;
    }>();

    const templateType = (params.templateType || 'checklist') as 'checklist' | 'logsheet';
    const templateId = parseInt(params.templateId || '0', 10);
    const templateName = params.templateName ? decodeURIComponent(params.templateName) : 'Task';
    const routeAssetId = params.assetId ? parseInt(params.assetId, 10) : null;
    const routeAssetName = params.assetName || '';

    const [template, setTemplate] = useState<TemplateDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [loadError, setLoadError] = useState<string | null>(null);

    // Tabular logsheet state
    const [tabReadings, setTabReadings] = useState<Record<string, string>>({});
    const now2 = new Date();
    const [tabMonth, setTabMonth] = useState(now2.getMonth() + 1);
    const [tabYear, setTabYear] = useState(now2.getFullYear());
    const [tabShift, setTabShift] = useState('');
    const tabAssetId = template?.assetId ?? routeAssetId;

    useEffect(() => {
        if (!templateId) {
            setLoadError('Invalid template. Please go back and try again.');
            setIsLoading(false);
            return;
        }
        loadTemplate();
    }, [templateId]);

    const loadTemplate = async () => {
        try {
            setLoadError(null);
            const data = await getTemplateDetails(templateType, templateId);
            setTemplate(data);
            const init: Record<number, any> = {};
            data.questions.forEach(q => { init[q.id] = ''; });
            setAnswers(init);
        } catch (err: any) {
            setLoadError(err.message || 'Failed to load template');
        } finally {
            setIsLoading(false);
        }
    };

    const setAnswer = (questionId: number, value: any) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
    };

    const filledCount = template
        ? template.questions.filter(q => answers[q.id] !== '' && answers[q.id] !== null && answers[q.id] !== undefined).length
        : 0;
    const totalCount = template?.questions.length ?? 0;
    const pct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

    const handleSubmit = async () => {
        if (!template) return;

        const missingRequired = template.questions
            .filter(q => q.isRequired && (answers[q.id] === '' || answers[q.id] == null))
            .map(q => q.questionText);

        if (missingRequired.length > 0) {
            Alert.alert(
                'Missing Required Fields',
                `Please fill in:\n\u2022 ${missingRequired.join('\n\u2022 ')}`,
                [{ text: 'OK' }]
            );
            return;
        }

        const formattedAnswers = template.questions.map(q => ({
            questionId: q.id,
            answer: answers[q.id] !== undefined && answers[q.id] !== null
                ? String(answers[q.id])
                : null,
            answerType: (q.answerType || (q as any).inputType || '').toLowerCase(),
        }));

        const assetIdToSubmit = (template.assetId ?? routeAssetId) || null;

        try {
            setIsSubmitting(true);
            const isTabular = template.layoutType === 'tabular';
            if (isTabular) {
                const tid = template.assetId ?? routeAssetId;
                if (!tid) {
                    Alert.alert('Asset Required', 'No asset linked to this logsheet.');
                    setIsSubmitting(false);
                    return;
                }
                // Build tabularData blob from tabReadings
                const readingsMap: Record<string, Record<string, string>> = {};
                for (const [key, val] of Object.entries(tabReadings)) {
                    if (val === '') continue;
                    const parts = key.split('__');
                    const rowId = parts[0];
                    const colKey = `${parts[1]}__${parts[2]}`;
                    if (!readingsMap[rowId]) readingsMap[rowId] = {};
                    readingsMap[rowId][colKey] = val;
                }
                await submitTabularLogsheet(
                    templateId,
                    tid,
                    tabMonth,
                    tabYear,
                    tabShift || null,
                    { readings: readingsMap, summary: {}, footer: {} }
                );
            } else if (templateType === 'checklist') {
                await submitChecklist(templateId, assetIdToSubmit, formattedAnswers);
            } else {
                await submitLogsheet(templateId, assetIdToSubmit, formattedAnswers);
            }
            setSubmitted(true);
        } catch (err: any) {
            Alert.alert('Submission Failed', err.message || 'Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Success screen ───────────────────────────────────────────────────────
    if (submitted) {
        return (
            <SafeAreaView style={styles.container}>
                <Animated.View entering={FadeInUp.duration(600).springify()} style={styles.successContainer}>
                    <View style={styles.successIcon}>
                        <MaterialCommunityIcons name="check-circle" size={80} color="#10B981" />
                    </View>
                    <Text style={styles.successTitle}>
                        {templateType === 'checklist' ? 'Checklist' : 'Logsheet'} Submitted!
                    </Text>
                    <Text style={styles.successSub}>
                        {template?.templateName || templateName} has been submitted successfully.
                    </Text>
                    <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => router.replace('/tech-dashboard' as any)}
                    >
                        <Text style={styles.doneBtnText}>Back to Dashboard</Text>
                    </TouchableOpacity>
                </Animated.View>
            </SafeAreaView>
        );
    }

    // ─── Loading ──────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2B6CB0" />
                    <Text style={styles.loadingText}>Loading task...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ─── Error ────────────────────────────────────────────────────────────────
    if (loadError || !template) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Task</Text>
                        <View style={{ width: 32 }} />
                    </View>
                </View>
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#EF4444" />
                    <Text style={styles.errorText}>{loadError || 'Template not found'}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadTemplate}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
                        <Text style={styles.backLink}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ─── Main form ────────────────────────────────────────────────────────────
    const isTabularTemplate = template.layoutType === 'tabular';
    const tabCfg = (template.headerConfig || {}) as TabularHeaderConfig;

    // ─── Tabular logsheet ─────────────────────────────────────────────────────
    if (isTabularTemplate) {
        const { rowLabelHeader = 'TIME', rows = [], columnGroups = [] } = tabCfg;
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const getReading = (rowId: string, groupId: string, colId: string) =>
            tabReadings[`${rowId}__${groupId}__${colId}`] ?? '';
        const setReading = (rowId: string, groupId: string, colId: string, val: string) =>
            setTabReadings(prev => ({ ...prev, [`${rowId}__${groupId}__${colId}`]: val }));

        const filledCells = Object.values(tabReadings).filter(v => v !== '').length;
        const totalCells = rows.length * columnGroups.reduce((acc, g) => acc + g.columns.length, 0);
        const tabPct = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.header, { paddingBottom: 16 }]}>
                    <View style={styles.headerTop}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle} numberOfLines={1}>{template.templateName || templateName}</Text>
                        <View style={{ width: 32 }} />
                    </View>
                    <View style={styles.headerSubtitleRow}>
                        <View style={styles.typePillLogsheet}>
                            <Text style={[styles.typePillText, { color: '#2563EB' }]}>LOGSHEET</Text>
                        </View>
                        {(template.assetName || routeAssetName) ? (
                            <View style={styles.assetPill}>
                                <MaterialCommunityIcons name="office-building" size={13} color="#64748B" />
                                <Text style={styles.assetPillText}>{template.assetName || routeAssetName}</Text>
                            </View>
                        ) : null}
                    </View>
                    <View style={styles.progressContainer}>
                        <Animated.View style={[styles.progressFill, { width: `${tabPct}%` as any }]} />
                    </View>
                    <Text style={styles.progressText}>{tabPct}% filled · {filledCells}/{totalCells} cells</Text>
                </View>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                        <View style={{ padding: 12 }}>
                            {/* Month / Year / Shift selectors */}
                            <View style={tabStyles.metaRow}>
                                <View style={tabStyles.metaField}>
                                    <Text style={tabStyles.metaLabel}>Month</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {MONTHS.map((m, i) => (
                                                <TouchableOpacity
                                                    key={i}
                                                    style={[tabStyles.monthChip, tabMonth === i + 1 && tabStyles.monthChipActive]}
                                                    onPress={() => setTabMonth(i + 1)}
                                                >
                                                    <Text style={[tabStyles.monthChipText, tabMonth === i + 1 && tabStyles.monthChipTextActive]}>{m}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={[tabStyles.metaField, { flex: 1 }]}>
                                        <Text style={tabStyles.metaLabel}>Year</Text>
                                        <TextInput
                                            style={tabStyles.metaInput}
                                            value={String(tabYear)}
                                            onChangeText={v => setTabYear(parseInt(v) || tabYear)}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={[tabStyles.metaField, { flex: 1 }]}>
                                        <Text style={tabStyles.metaLabel}>Shift</Text>
                                        <TextInput
                                            style={tabStyles.metaInput}
                                            value={tabShift}
                                            onChangeText={setTabShift}
                                            placeholder="Day / Night"
                                            placeholderTextColor="#A0AEC0"
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* Tabular grid */}
                            {rows.length === 0 || columnGroups.length === 0 ? (
                                <View style={styles.center}>
                                    <MaterialCommunityIcons name="table-off" size={48} color="#CBD5E0" />
                                    <Text style={{ color: '#94A3B8', marginTop: 8 }}>No columns defined for this template</Text>
                                </View>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                    <View>
                                        {/* Header row 1 — group labels */}
                                        <View style={tabStyles.headerRow}>
                                            <View style={[tabStyles.rowLabelCell, tabStyles.headerCell]}>
                                                <Text style={tabStyles.headerText}>{rowLabelHeader}</Text>
                                            </View>
                                            {columnGroups.map(g => (
                                                <View
                                                    key={g.id}
                                                    style={[tabStyles.headerCell, tabStyles.groupCell, { minWidth: g.columns.length * 72 }]}
                                                >
                                                    <Text style={tabStyles.headerText}>{g.label}</Text>
                                                </View>
                                            ))}
                                        </View>
                                        {/* Header row 2 — column labels */}
                                        <View style={tabStyles.headerRow2}>
                                            <View style={[tabStyles.rowLabelCell, tabStyles.subHeaderCell]} />
                                            {columnGroups.flatMap(g => g.columns.map(c => (
                                                <View key={`${g.id}_${c.id}`} style={[tabStyles.dataCell, tabStyles.subHeaderCell]}>
                                                    <Text style={tabStyles.subHeaderText}>{c.label}</Text>
                                                    {c.subLabel ? <Text style={tabStyles.subLabelText}>{c.subLabel}</Text> : null}
                                                </View>
                                            )))}
                                        </View>
                                        {/* Data rows */}
                                        {rows.map((row: any, ri: number) => (
                                            <View key={row.id} style={[tabStyles.dataRow, ri % 2 === 1 && tabStyles.dataRowAlt]}>
                                                <View style={[tabStyles.rowLabelCell, tabStyles.rowLabelBody]}>
                                                    <Text style={tabStyles.rowLabelText}>{row.label}</Text>
                                                </View>
                                                {columnGroups.flatMap(g => g.columns.map(c => (
                                                    <View key={`${g.id}_${c.id}`} style={tabStyles.dataCell}>
                                                        <TextInput
                                                            style={tabStyles.cellInput}
                                                            value={getReading(row.id, g.id, c.id)}
                                                            onChangeText={v => setReading(row.id, g.id, c.id, v)}
                                                            keyboardType="decimal-pad"
                                                            returnKeyType="next"
                                                            selectTextOnFocus
                                                        />
                                                    </View>
                                                )))}
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            )}
                            <View style={{ height: 24 }} />
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>

                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                        activeOpacity={0.85}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting
                            ? <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                            : <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
                        }
                        <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Logsheet'}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{template.templateName || templateName}</Text>
                    <View style={{ width: 32 }} />
                </View>

                <View style={styles.headerSubtitleRow}>
                    <View style={[
                        styles.typePill,
                        templateType === 'checklist' ? styles.typePillChecklist : styles.typePillLogsheet,
                    ]}>
                        <MaterialCommunityIcons
                            name={templateType === 'checklist' ? 'clipboard-check-outline' : 'notebook-outline'}
                            size={13}
                            color={templateType === 'checklist' ? '#7C3AED' : '#2563EB'}
                        />
                        <Text style={[
                            styles.typePillText,
                            { color: templateType === 'checklist' ? '#7C3AED' : '#2563EB' },
                        ]}>
                            {templateType === 'checklist' ? 'Checklist' : 'Logsheet'}
                        </Text>
                    </View>
                    {(template.assetName || routeAssetName) ? (
                        <View style={styles.assetPill}>
                            <MaterialCommunityIcons name="office-building-outline" size={13} color="#718096" />
                            <Text style={styles.assetPillText}>{template.assetName || routeAssetName}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Progress bar */}
                <View style={styles.progressContainer}>
                    <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                </View>
                <Text style={styles.progressText}>{pct}% Complete &middot; {filledCount}/{totalCount} questions</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                    <View style={styles.contentPadding}>
                        {template.questions
                            .sort((a, b) => a.displayOrder - b.displayOrder)
                            .map((q, index) => {
                                const isFilled = answers[q.id] !== '' && answers[q.id] != null;
                                return (
                                    <Animated.View key={q.id} entering={FadeInUp.delay(50 * index).duration(400).springify()} style={[styles.questionCard, isFilled && styles.questionCardFilled]}>
                                        <View style={styles.questionHeader}>
                                            <View style={[styles.questionNumCircle, isFilled && styles.questionNumCircleFilled]}>
                                                <Text style={[styles.questionNum, isFilled && styles.questionNumFilled]}>{index + 1}</Text>
                                            </View>
                                            <Text style={styles.questionText} numberOfLines={3}>{q.questionText}</Text>
                                            {!!q.isRequired && (
                                                <Text style={styles.requiredStar}>*</Text>
                                            )}
                                            {isFilled && (
                                                <Animated.View entering={FadeInDown.duration(300)}>
                                                    <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
                                                </Animated.View>
                                            )}
                                        </View>
                                        <View style={styles.answerArea}>
                                            {renderAnswerWidget(q, answers[q.id], setAnswer)}
                                        </View>
                                    </Animated.View>
                                );
                            })}

                        {template.description ? (
                            <View style={styles.descCard}>
                                <MaterialCommunityIcons name="information" size={18} color="#64748B" />
                                <Text style={styles.descText}>{template.description}</Text>
                            </View>
                        ) : null}

                        <View style={{ height: 24 }} />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom action bar */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                    activeOpacity={0.85}
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    ) : (
                        <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
                    )}
                    <Text style={styles.submitBtnText}>
                        {isSubmitting ? 'Submitting...' : `Submit ${templateType === 'checklist' ? 'Checklist' : 'Logsheet'}`}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// ─── Answer widget factory ────────────────────────────────────────────────────

function renderAnswerWidget(
    q: TemplateDetails['questions'][0],
    value: any,
    setAnswer: (id: number, val: any) => void,
) {
    const answerType = (q.answerType || q.inputType || '').toLowerCase();

    const parseOptions = (): string[] => {
        const raw = (q as any).options;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map((o) => String(o)).filter(Boolean);
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.map((o) => String(o)).filter(Boolean);
            } catch {
                return raw.split(',').map((o) => o.trim()).filter(Boolean);
            }
        }
        return [];
    };

    if (answerType === 'yes_no' || answerType === 'boolean') {
        return (
            <View style={widgetStyles.ynRow}>
                {['Yes', 'No'].map(opt => (
                    <TouchableOpacity
                        key={opt}
                        style={[widgetStyles.ynBtn, value === opt && widgetStyles.ynBtnActive]}
                        onPress={() => setAnswer(q.id, value === opt ? '' : opt)}
                    >
                        <MaterialCommunityIcons
                            name={opt === 'Yes' ? 'check' : 'close'}
                            size={16}
                            color={value === opt ? '#FFFFFF' : opt === 'Yes' ? '#10B981' : '#EF4444'}
                        />
                        <Text style={[widgetStyles.ynText, value === opt && widgetStyles.ynTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    if (answerType === 'pass_fail' || answerType === 'pass/fail') {
        return (
            <View style={widgetStyles.ynRow}>
                {['Pass', 'Fail'].map(opt => (
                    <TouchableOpacity
                        key={opt}
                        style={[
                            widgetStyles.ynBtn,
                            value === opt && (opt === 'Pass' ? widgetStyles.ynBtnActiveGreen : widgetStyles.ynBtnActiveRed),
                        ]}
                        onPress={() => setAnswer(q.id, value === opt ? '' : opt)}
                    >
                        <MaterialCommunityIcons
                            name={opt === 'Pass' ? 'check' : 'close'}
                            size={16}
                            color={value === opt ? '#FFFFFF' : opt === 'Pass' ? '#10B981' : '#EF4444'}
                        />
                        <Text style={[widgetStyles.ynText, value === opt && widgetStyles.ynTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    if (answerType === 'ok_not_ok') {
        return (
            <View style={widgetStyles.ynRow}>
                {['OK', 'Not OK'].map(opt => (
                    <TouchableOpacity
                        key={opt}
                        style={[
                            widgetStyles.ynBtn,
                            value === opt && (opt === 'OK' ? widgetStyles.ynBtnActiveGreen : widgetStyles.ynBtnActiveRed),
                        ]}
                        onPress={() => setAnswer(q.id, value === opt ? '' : opt)}
                    >
                        <MaterialCommunityIcons
                            name={opt === 'OK' ? 'check' : 'close'}
                            size={16}
                            color={value === opt ? '#FFFFFF' : opt === 'OK' ? '#10B981' : '#EF4444'}
                        />
                        <Text style={[widgetStyles.ynText, value === opt && widgetStyles.ynTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    if (answerType === 'number' || answerType === 'numeric') {
        return (
            <TextInput
                style={widgetStyles.textInput}
                value={value ?? ''}
                onChangeText={v => setAnswer(q.id, v)}
                keyboardType="numeric"
                placeholder="Enter number..."
                placeholderTextColor="#A0AEC0"
            />
        );
    }

    if (['select', 'multiple_choice', 'dropdown', 'custom_options'].includes(answerType)) {
        const opts = parseOptions();
        return (
            <View style={widgetStyles.chipsContainer}>
                {opts.map((opt: string) => (
                    <TouchableOpacity
                        key={opt}
                        style={[widgetStyles.chip, value === opt && widgetStyles.chipActive]}
                        onPress={() => setAnswer(q.id, value === opt ? '' : opt)}
                    >
                        <Text style={[widgetStyles.chipText, value === opt && widgetStyles.chipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    if (answerType === 'remark') {
        return (
            <TextInput
                style={[widgetStyles.textInput, { minHeight: 80, textAlignVertical: 'top' }]}
                value={value ?? ''}
                onChangeText={v => setAnswer(q.id, v)}
                placeholder="Enter remark..."
                placeholderTextColor="#A0AEC0"
                multiline
            />
        );
    }

    if (answerType === 'photo') {
        return (
            <View>
                <TextInput
                    style={widgetStyles.textInput}
                    value={value ?? ''}
                    onChangeText={v => setAnswer(q.id, v)}
                    placeholder="Paste photo URL or note"
                    placeholderTextColor="#A0AEC0"
                />
                <Text style={{ marginTop: 6, fontSize: 11, color: '#94A3B8' }}>Photo upload will save as text reference in this version.</Text>
            </View>
        );
    }

    if (answerType === 'signature') {
        return (
            <View>
                <TextInput
                    style={widgetStyles.textInput}
                    value={value ?? ''}
                    onChangeText={v => setAnswer(q.id, v)}
                    placeholder="Enter signer name"
                    placeholderTextColor="#A0AEC0"
                />
                <Text style={{ marginTop: 6, fontSize: 11, color: '#94A3B8' }}>Digital signature pad is not configured; saving signer name.</Text>
            </View>
        );
    }

    if (answerType === 'rating') {
        return (
            <View style={widgetStyles.ratingRow}>
                {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setAnswer(q.id, String(n))}>
                        <MaterialCommunityIcons
                            name={Number(value) >= n ? 'star' : 'star-outline'}
                            size={30}
                            color={Number(value) >= n ? '#F59E0B' : '#CBD5E0'}
                        />
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    // Default: multiline text
    return (
        <TextInput
            style={[widgetStyles.textInput, widgetStyles.textArea]}
            value={value ?? ''}
            onChangeText={v => setAnswer(q.id, v)}
            multiline
            numberOfLines={3}
            placeholder="Enter your answer..."
            placeholderTextColor="#A0AEC0"
            textAlignVertical="top"
        />
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },

    header: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', flex: 1, textAlign: 'center', letterSpacing: -0.5 },
    headerSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    typePill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    typePillChecklist: { backgroundColor: '#EEF2FF' },
    typePillLogsheet: { backgroundColor: '#EFF6FF' },
    typePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    assetPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
        backgroundColor: '#F1F5F9',
    },
    assetPillText: { fontSize: 12, color: '#718096', fontWeight: '500' },
    progressContainer: {
        height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 6,
    },
    progressFill: { height: '100%', backgroundColor: '#2B6CB0', borderRadius: 3 },
    progressText: { fontSize: 12, fontWeight: '600', color: '#2B6CB0' },

    scrollArea: { flex: 1 },
    contentPadding: { padding: 16, paddingBottom: 40 },

    questionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    questionCardFilled: {
        borderColor: '#E2E8F0',
        backgroundColor: '#FCFCFD',
    },
    questionHeader: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14,
    },
    questionNumCircle: {
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    questionNumCircleFilled: {
        backgroundColor: '#ECFDF5',
    },
    questionNum: { fontSize: 12, fontWeight: '800', color: '#64748B' },
    questionNumFilled: { color: '#10B981' },
    questionText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A', lineHeight: 22 },
    requiredStar: { fontSize: 16, color: '#EF4444', fontWeight: '800', marginTop: 2 },
    answerArea: { paddingLeft: 38 },

    descCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: '#F8FAFC', borderRadius: 12,
        padding: 16, marginTop: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    descText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 20 },

    bottomBar: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    submitBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitBtnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0 },
    btnIcon: { marginRight: 8 },
    submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

    loadingText: { fontSize: 15, color: '#64748B', marginTop: 8 },
    errorText: { fontSize: 15, color: '#EF4444', textAlign: 'center' },
    retryBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    backLink: { fontSize: 14, color: '#2563EB', fontWeight: '600' },

    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
    successIcon: {
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center',
        marginBottom: 8,
    },
    successTitle: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    successSub: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
    doneBtn: {
        backgroundColor: '#2563EB', borderRadius: 12,
        paddingHorizontal: 36, paddingVertical: 14, marginTop: 16,
    },
    doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

const widgetStyles = StyleSheet.create({
    textInput: {
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 12,
        fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC',
    },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    ynRow: { flexDirection: 'row', gap: 12 },
    ynBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 10,
        borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    },
    ynBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    ynBtnActiveGreen: { backgroundColor: '#10B981', borderColor: '#10B981' },
    ynBtnActiveRed: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
    ynText: { fontSize: 14, fontWeight: '700', color: '#475569' },
    ynTextActive: { color: '#FFFFFF' },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
        borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    },
    chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    chipText: { fontSize: 14, fontWeight: '600', color: '#475569' },
    chipTextActive: { color: '#FFFFFF' },
    ratingRow: { flexDirection: 'row', gap: 6 },
});
const tabStyles = StyleSheet.create({
    metaRow: { marginBottom: 14, gap: 10 },
    metaField: { gap: 4 },
    metaLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
    metaInput: {
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC',
    },
    monthChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    },
    monthChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    monthChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    monthChipTextActive: { color: '#FFFFFF' },

    headerRow: { flexDirection: 'row' },
    headerRow2: { flexDirection: 'row' },
    dataRow: { flexDirection: 'row', backgroundColor: '#FFFFFF' },
    dataRowAlt: { backgroundColor: '#F8FAFC' },

    rowLabelCell: { width: 64, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
    rowLabelBody: { borderWidth: 1, borderColor: '#E2E8F0', padding: 8 },
    rowLabelText: { fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'center' },

    headerCell: {
        borderWidth: 1, borderColor: '#1e293b',
        padding: 10, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#0f172a',
    },
    groupCell: { flex: 1 },
    headerText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },

    subHeaderCell: {
        borderWidth: 1, borderColor: '#334155',
        padding: 8, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#1e293b',
    },
    subHeaderText: { fontSize: 12, fontWeight: '600', color: '#f8fafc', textAlign: 'center' },
    subLabelText: { fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 2 },

    dataCell: { width: 80, borderWidth: 1, borderColor: '#E2E8F0', padding: 4, justifyContent: 'center', alignItems: 'center' },
    cellInput: {
        width: '100%', textAlign: 'center', fontSize: 14, fontWeight: '500',
        color: '#0F172A', paddingVertical: 6, paddingHorizontal: 4,
        backgroundColor: 'transparent',
    },
});