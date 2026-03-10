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
import { getMyAssets, getTemplateDetails, submitChecklist, submitLogsheet, submitTabularLogsheet, type TemplateDetails, type TabularColumnGroup } from '../utils/api';

export default function AssignmentFormScreen() {
    const params = useLocalSearchParams();
    const templateType = params.templateType as 'checklist' | 'logsheet';
    const templateId = parseInt(params.templateId as string);
    const templateName = params.templateName as string;
    const assignmentId = parseInt(params.assignmentId as string);
    // Asset passed from the assignments list (from the supervisor-assigned template's linked asset)
    const routeAssetId = params.assetId ? parseInt(params.assetId as string) : null;
    const routeAssetName = params.assetName as string | undefined;

    const [template, setTemplate] = useState<TemplateDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [assetId, setAssetId] = useState<string>('');
    const [assets, setAssets] = useState<Array<{id: number; assetName: string; assetType: string}>>([]);
    const [showAssetPicker, setShowAssetPicker] = useState(false);

    // --- Tabular logsheet state ---
    const _now = new Date();
    const [tabReadings, setTabReadings] = useState<Record<string, string>>({});
    const [tabMonth, setTabMonth] = useState(_now.getMonth() + 1);
    const [tabYear, setTabYear] = useState(_now.getFullYear());
    const [tabShift, setTabShift] = useState('');
    const MONTHS_LIST = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    useEffect(() => {
        loadTemplate();
        loadAssets();
    }, []);

    const loadAssets = async () => {
        try {
            const data = await getMyAssets();
            setAssets(data);
            // Auto-select the first asset so users never need to tap the picker
            if (data.length > 0) {
                setAssetId(prev => prev || String(data[0].id));
            }
        } catch (_) {
            // non-critical
        }
    };

    const loadTemplate = async () => {
        try {
            const data = await getTemplateDetails(templateType, templateId);
            setTemplate(data);
            // Auto-fill asset: prefer template's directly linked asset, then fall back to
            // the asset associated with the assignment (passed via route params).
            if (data.assetId) {
                setAssetId(String(data.assetId));
            } else if (routeAssetId) {
                setAssetId(String(routeAssetId));
            }
            // Initialize answers with empty values
            const initialAnswers: Record<number, any> = {};
            data.questions.forEach(q => {
                initialAnswers[q.id] = '';
            });
            setAnswers(initialAnswers);
        } catch (error) {
            console.error('Failed to load template:', error);
            Alert.alert('Error', 'Failed to load template details');
            router.back();
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        // Validate required fields
        if (!template) return;

        // --- Tabular logsheet submit ---
        if (template.layoutType === 'tabular') {
            // Tabular templates may not have a pre-bound asset; asset is optional
            const effectiveAssetId = template.assetId ?? routeAssetId ?? (assetId ? parseInt(assetId) : null);
            const readingsMap: Record<string, Record<string, string>> = {};
            for (const [key, val] of Object.entries(tabReadings)) {
                if (!val) continue;
                const parts = key.split('__');
                const rowId = parts[0];
                const colKey = parts.slice(1).join('__');
                if (!readingsMap[rowId]) readingsMap[rowId] = {};
                readingsMap[rowId][colKey] = val;
            }
            setIsSubmitting(true);
            try {
                await submitTabularLogsheet(
                    templateId,
                    effectiveAssetId,
                    tabMonth,
                    tabYear,
                    tabShift || null,
                    { readings: readingsMap, summary: {}, footer: {} }
                );
                Alert.alert('Success', 'Logsheet submitted successfully!', [{ text: 'OK', onPress: () => router.back() }]);
            } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to submit. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        const missingRequired = template.questions
            .filter(q => q.isRequired && !answers[q.id])
            .map(q => q.questionText);

        if (templateType === 'logsheet' && !assetId) {
            Alert.alert('Asset Required', 'Please select an asset for the logsheet.');
            return;
        }

        if (missingRequired.length > 0) {
            Alert.alert(
                'Missing Required Fields',
                `Please fill in: ${missingRequired.join(', ')}`,
                [{ text: 'OK' }]
            );
            return;
        }

        // Convert answers to API format
        const formattedAnswers = Object.entries(answers).map(([questionId, value]) => ({
            questionId: parseInt(questionId),
            answer: value?.toString() || null,
        }));

        setIsSubmitting(true);
        try {
            if (templateType === 'checklist') {
                await submitChecklist(
                    templateId,
                    assetId ? parseInt(assetId) : null,
                    formattedAnswers
                );
            } else {
                await submitLogsheet(
                    templateId,
                    assetId ? parseInt(assetId) : null,
                    formattedAnswers
                );
            }

            Alert.alert(
                'Success',
                `${templateType === 'checklist' ? 'Checklist' : 'Logsheet'} submitted successfully!`,
                [
                    {
                        text: 'OK',
                        onPress: () => router.back(),
                    },
                ]
            );
        } catch (error: any) {
            console.error('Failed to submit:', error);
            Alert.alert('Error', error.message || 'Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderQuestionInput = (question: any) => {
        const value = answers[question.id];

        switch (question.answerType) {
            case 'yes_no':
                return (
                    <View style={styles.yesNoContainer}>
                        <TouchableOpacity
                            style={[styles.yesNoButton, value === 'Yes' && styles.yesNoButtonActive]}
                            onPress={() => setAnswers({ ...answers, [question.id]: 'Yes' })}
                        >
                            <MaterialCommunityIcons
                                name="check-circle"
                                size={20}
                                color={value === 'Yes' ? '#10B981' : '#A0AEC0'}
                            />
                            <Text style={[styles.yesNoText, value === 'Yes' && styles.yesNoTextActive]}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.yesNoButton, value === 'No' && styles.yesNoButtonActive]}
                            onPress={() => setAnswers({ ...answers, [question.id]: 'No' })}
                        >
                            <MaterialCommunityIcons
                                name="close-circle"
                                size={20}
                                color={value === 'No' ? '#EF4444' : '#A0AEC0'}
                            />
                            <Text style={[styles.yesNoText, value === 'No' && styles.yesNoTextActive]}>No</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 'text':
                return (
                    <TextInput
                        style={styles.textInput}
                        value={value}
                        onChangeText={(text) => setAnswers({ ...answers, [question.id]: text })}
                        placeholder="Enter your answer..."
                        placeholderTextColor="#A0AEC0"
                        multiline
                    />
                );

            case 'number':
                return (
                    <TextInput
                        style={styles.textInput}
                        value={value}
                        onChangeText={(text) => setAnswers({ ...answers, [question.id]: text })}
                        placeholder="Enter number..."
                        placeholderTextColor="#A0AEC0"
                        keyboardType="numeric"
                    />
                );

            case 'date':
                return (
                    <TextInput
                        style={styles.textInput}
                        value={value}
                        onChangeText={(text) => setAnswers({ ...answers, [question.id]: text })}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#A0AEC0"
                    />
                );

            case 'dropdown':
            case 'radio':
                const options = question.options?.options || [];
                return (
                    <View style={styles.optionsContainer}>
                        {options.map((option: string, index: number) => (
                            <TouchableOpacity
                                key={index}
                                style={[styles.optionButton, value === option && styles.optionButtonActive]}
                                onPress={() => setAnswers({ ...answers, [question.id]: option })}
                            >
                                <View
                                    style={[
                                        styles.radioCircle,
                                        value === option && styles.radioCircleActive,
                                    ]}
                                >
                                    {value === option && <View style={styles.radioInner} />}
                                </View>
                                <Text style={[styles.optionText, value === option && styles.optionTextActive]}>
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            default:
                return (
                    <TextInput
                        style={styles.textInput}
                        value={value}
                        onChangeText={(text) => setAnswers({ ...answers, [question.id]: text })}
                        placeholder="Enter your answer..."
                        placeholderTextColor="#A0AEC0"
                    />
                );
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading form...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!template) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#EF4444" />
                    <Text style={styles.errorText}>Failed to load template</Text>
                    <TouchableOpacity style={styles.backButton2} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>{templateName}</Text>
                    <Text style={styles.headerSubtitle}>
                        {templateType === 'checklist' ? 'Checklist' : 'Logsheet'}
                        {(template?.assetName || routeAssetName) ? ` · ${template?.assetName || routeAssetName}` : ''}
                    </Text>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.contentPadding}>
                    {/* Asset Selector */}
                        <View style={styles.questionCard}>
                            <Text style={styles.questionLabel}>
                                Asset {templateType === 'logsheet' ? '(Required)' : '(Optional)'}
                            </Text>
                            {(template?.assetId || routeAssetId || assetId) ? (
                                // Asset is known — show badge; locked if from template/assignment, tappable if auto-selected
                                <TouchableOpacity
                                    style={[styles.assetPickerBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                                    onPress={!template?.assetId && !routeAssetId ? () => setShowAssetPicker(v => !v) : undefined}
                                    activeOpacity={template?.assetId || routeAssetId ? 1 : 0.7}
                                >
                                    <MaterialCommunityIcons name="office-building" size={18} color="#1E3A8A" />
                                    <Text style={[styles.assetPickerText, { color: '#1E3A8A', flex: 1 }]}>
                                        {template?.assetName || routeAssetName ||
                                            (assetId ? (assets.find(a => String(a.id) === assetId)?.assetName ?? `Asset #${assetId}`) : '')}
                                    </Text>
                                    {(template?.assetId || routeAssetId) ? (
                                        <View style={{ backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Auto</Text>
                                        </View>
                                    ) : (
                                        <MaterialCommunityIcons name={showAssetPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#718096" />
                                    )}
                                </TouchableOpacity>
                            ) : (
                                // Assets still loading
                                <View style={[styles.assetPickerBtn, { backgroundColor: '#F7FAFC' }]}>
                                    <MaterialCommunityIcons name="office-building" size={18} color="#A0AEC0" />
                                    <Text style={[styles.assetPickerText, styles.assetPickerPlaceholder]}>Loading assets...</Text>
                                </View>
                            )}
                            {!template?.assetId && !routeAssetId && showAssetPicker && (
                                <View style={styles.assetList}>
                                    {templateType !== 'logsheet' && (
                                        <TouchableOpacity
                                            style={styles.assetListItem}
                                            onPress={() => { setAssetId(''); setShowAssetPicker(false); }}
                                        >
                                            <Text style={styles.assetListItemText}>— No Asset —</Text>
                                        </TouchableOpacity>
                                    )}
                                    {assets.length === 0 && (
                                        <Text style={styles.assetListEmpty}>No assets found</Text>
                                    )}
                                    {assets.map(a => (
                                        <TouchableOpacity
                                            key={a.id}
                                            style={[styles.assetListItem, String(a.id) === assetId && styles.assetListItemActive]}
                                            onPress={() => { setAssetId(String(a.id)); setShowAssetPicker(false); }}
                                        >
                                            <Text style={[styles.assetListItemText, String(a.id) === assetId && styles.assetListItemTextActive]}>
                                                {a.assetName}
                                            </Text>
                                            <Text style={styles.assetListItemType}>{a.assetType}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* Questions */}
                        {template.layoutType === 'tabular' ? (
                            // ---- Tabular logsheet grid ----
                            <View>
                                {/* Month / Year / Shift pickers */}
                                <View style={tabStyles.metaRow}>
                                    <View style={[tabStyles.metaField, { flex: 2 }]}>
                                        <Text style={tabStyles.metaLabel}>Year</Text>
                                        <TextInput
                                            style={tabStyles.metaInput}
                                            keyboardType="numeric"
                                            value={String(tabYear)}
                                            onChangeText={t => setTabYear(parseInt(t) || tabYear)}
                                            maxLength={4}
                                        />
                                    </View>
                                    <View style={[tabStyles.metaField, { flex: 2 }]}>
                                        <Text style={tabStyles.metaLabel}>Shift (opt.)</Text>
                                        <TextInput
                                            style={tabStyles.metaInput}
                                            placeholder="e.g. Day"
                                            value={tabShift}
                                            onChangeText={setTabShift}
                                        />
                                    </View>
                                </View>
                                <View style={tabStyles.monthRow}>
                                    {MONTHS_LIST.map((m, i) => (
                                        <TouchableOpacity
                                            key={m}
                                            style={[tabStyles.monthChip, tabMonth === i + 1 && tabStyles.monthChipActive]}
                                            onPress={() => setTabMonth(i + 1)}
                                        >
                                            <Text style={[tabStyles.monthChipText, tabMonth === i + 1 && tabStyles.monthChipTextActive]}>{m}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Scrollable table */}
                                {template.headerConfig && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator
                                        style={{ marginTop: 12 }}
                                        contentContainerStyle={{ flexDirection: 'column' }}
                                    >
                                        {/* Group header row */}
                                        <View style={{ flexDirection: 'row' }}>
                                            <View style={[tabStyles.headerCell, tabStyles.rowLabelCell]}>
                                                <Text style={tabStyles.headerText}>
                                                    {template.headerConfig.rowLabelHeader || 'Time'}
                                                </Text>
                                            </View>
                                            {(template.headerConfig.columnGroups as TabularColumnGroup[]).map((g: TabularColumnGroup) => (
                                                <View key={g.id}
                                                    style={[tabStyles.headerCell, { width: g.columns.length * 80 }]}>
                                                    <Text style={tabStyles.headerText}>{g.label}</Text>
                                                </View>
                                            ))}
                                        </View>
                                        {/* Sub-column header row */}
                                        <View style={{ flexDirection: 'row' }}>
                                            <View style={[tabStyles.subHeaderCell, tabStyles.rowLabelCell]} />
                                            {(template.headerConfig.columnGroups as TabularColumnGroup[]).flatMap((g: TabularColumnGroup) =>
                                                g.columns.map((c) => (
                                                    <View key={`${g.id}_${c.id}`} style={tabStyles.subHeaderCell}>
                                                        <Text style={tabStyles.subHeaderText}>{c.label}</Text>
                                                        {c.subLabel ? <Text style={tabStyles.subLabelText}>{c.subLabel}</Text> : null}
                                                    </View>
                                                ))
                                            )}
                                        </View>
                                        {/* Data rows */}
                                        {(template.headerConfig.rows as Array<{id:string;label:string}>).map((row) => (
                                            <View key={row.id} style={{ flexDirection: 'row' }}>
                                                <View style={[tabStyles.dataCell, tabStyles.rowLabelCell]}>
                                                    <Text style={tabStyles.rowLabelText}>{row.label}</Text>
                                                </View>
                                                {(template.headerConfig!.columnGroups as TabularColumnGroup[]).flatMap((g: TabularColumnGroup) =>
                                                    g.columns.map((c) => {
                                                        const key = `${row.id}__${g.id}__${c.id}`;
                                                        return (
                                                            <View key={key} style={tabStyles.dataCell}>
                                                                <TextInput
                                                                    style={tabStyles.cellInput}
                                                                    keyboardType="numeric"
                                                                    placeholder="-"
                                                                    value={tabReadings[key] || ''}
                                                                    onChangeText={v => setTabReadings(prev => ({ ...prev, [key]: v }))}
                                                                />
                                                            </View>
                                                        );
                                                    })
                                                )}
                                            </View>
                                        ))}
                                    </ScrollView>
                                )}
                            </View>
                        ) : (
                        template.questions.map((question, index) => (
                            <View key={question.id} style={styles.questionCard}>
                                <View style={styles.questionHeader}>
                                    <Text style={styles.questionNumber}>Q{index + 1}</Text>
                                    {!!question.isRequired && <View style={styles.requiredBadge}>
                                        <Text style={styles.requiredText}>Required</Text>
                                    </View>}
                                </View>
                                <Text style={styles.questionText}>{question.questionText}</Text>
                                {renderQuestionInput(question)}
                            </View>
                        ))
                        )}

                        {/* Submit Button */}
                        <TouchableOpacity
                            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Submitting...</Text>
                                </>
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Submit</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#718096',
    },
    errorText: {
        fontSize: 16,
        color: '#EF4444',
        marginTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 8,
    },
    backButton2: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 20,
    },
    backButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#718096',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    headerSpacer: {
        width: 40,
    },
    scrollContent: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
        paddingBottom: 40,
    },
    questionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    questionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    questionNumber: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E3A8A',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    requiredBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    requiredText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#DC2626',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    questionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4A5568',
        marginBottom: 12,
    },
    questionText: {
        fontSize: 15,
        color: '#1A202C',
        lineHeight: 22,
        marginBottom: 16,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        color: '#1A202C',
        backgroundColor: '#FFFFFF',
        minHeight: 48,
    },
    yesNoContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    yesNoButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        gap: 8,
    },
    yesNoButtonActive: {
        borderColor: '#1E3A8A',
        backgroundColor: '#EFF6FF',
    },
    yesNoText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#718096',
    },
    yesNoTextActive: {
        color: '#1E3A8A',
    },
    optionsContainer: {
        gap: 10,
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        gap: 12,
    },
    optionButtonActive: {
        borderColor: '#1E3A8A',
        backgroundColor: '#EFF6FF',
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CBD5E0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioCircleActive: {
        borderColor: '#1E3A8A',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#1E3A8A',
    },
    optionText: {
        fontSize: 15,
        color: '#4A5568',
        flex: 1,
    },
    optionTextActive: {
        color: '#1E3A8A',
        fontWeight: '600',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1E3A8A',
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        gap: 8,
    },
    submitButtonDisabled: {
        backgroundColor: '#94A3B8',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    assetPickerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#FFFFFF',
        gap: 10,
    },
    assetPickerBtnRequired: {
        borderColor: '#F87171',
    },
    assetPickerText: {
        flex: 1,
        fontSize: 15,
        color: '#1A202C',
    },
    assetPickerPlaceholder: {
        color: '#A0AEC0',
    },
    assetList: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
    },
    assetListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    assetListItemActive: {
        backgroundColor: '#EFF6FF',
    },
    assetListItemText: {
        fontSize: 14,
        color: '#1A202C',
    },
    assetListItemTextActive: {
        color: '#1E3A8A',
        fontWeight: '600',
    },
    assetListItemType: {
        fontSize: 12,
        color: '#94A3B8',
    },
    assetListEmpty: {
        padding: 14,
        color: '#A0AEC0',
        fontSize: 14,
        textAlign: 'center',
    },
});

const tabStyles = StyleSheet.create({
    metaRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    metaField: { flex: 1 },
    metaLabel: { fontSize: 11, fontWeight: '600', color: '#718096', marginBottom: 4, textTransform: 'uppercase' },
    metaInput: {
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
        padding: 10, fontSize: 14, color: '#1A202C', backgroundColor: '#FFFFFF',
    },
    monthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    monthChip: {
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
        borderWidth: 1, borderColor: '#CBD5E0', backgroundColor: '#F8F9FA',
    },
    monthChipActive: { backgroundColor: '#1E3A8A', borderColor: '#1E3A8A' },
    monthChipText: { fontSize: 12, fontWeight: '600', color: '#718096' },
    monthChipTextActive: { color: '#FFFFFF' },
    headerCell: {
        minWidth: 80, height: 40, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#1E3A8A', borderWidth: 1, borderColor: '#2D4EAA',
        paddingHorizontal: 4,
    },
    headerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', textAlign: 'center' },
    subHeaderCell: {
        width: 80, height: 44, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
        paddingHorizontal: 2,
    },
    subHeaderText: { fontSize: 10, fontWeight: '600', color: '#1E3A8A', textAlign: 'center' },
    subLabelText: { fontSize: 9, color: '#3B82F6', textAlign: 'center' },
    rowLabelCell: { width: 70, backgroundColor: '#F1F5F9' },
    dataCell: {
        width: 80, height: 44, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
    },
    rowLabelText: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
    cellInput: {
        width: '100%', height: '100%', textAlign: 'center',
        fontSize: 13, color: '#1A202C', paddingHorizontal: 2,
    },
});
