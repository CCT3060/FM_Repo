import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyAssets, getTemplateDetails, submitChecklist, submitLogsheet, submitTabularLogsheet, checkShiftAccess, API_BASE, type TemplateDetails, type TabularColumnGroup } from '../utils/api';

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
    const [answerNotes, setAnswerNotes] = useState<Record<number, string>>({});
    const [assetId, setAssetId] = useState<string>('');
    const [assets, setAssets] = useState<Array<{id: number; assetName: string; assetType: string}>>([]);
    const [showAssetPicker, setShowAssetPicker] = useState(false);
    const [shiftLocked, setShiftLocked] = useState<{ message: string; shiftName?: string } | null>(null);

    // --- Tabular logsheet state ---
    const _now = new Date();
    const [tabReadings, setTabReadings] = useState<Record<string, string>>({});
    const [tabMonth, setTabMonth] = useState(_now.getMonth() + 1);
    const [tabYear, setTabYear] = useState(_now.getFullYear());
    const [tabShift, setTabShift] = useState('');
    const MONTHS_LIST = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const filteredAssets = useMemo(() => {
        const tType = (template?.assetType || '').toLowerCase();
        if (!tType) return assets;
        return assets.filter((a) => String(a.assetType || '').toLowerCase() === tType);
    }, [assets, template?.assetType]);

    useEffect(() => {
        loadTemplate();
        loadAssets();
    }, []);

    useEffect(() => {
        if (!template?.assetId && !routeAssetId && assetId) {
            const stillValid = filteredAssets.some((a) => String(a.id) === String(assetId));
            if (!stillValid) {
                setAssetId(filteredAssets[0] ? String(filteredAssets[0].id) : '');
            }
        }
    }, [filteredAssets, template?.assetId, routeAssetId, assetId]);

    // Re-check shift access every 60 seconds while the form is open.
    // This ensures the form locks if the shift ends while the user is filling it.
    useEffect(() => {
        if (!template?.shiftId) return;
        const interval = setInterval(async () => {
            const access = await checkShiftAccess(template.shiftId).catch(() => ({ allowed: true }));
            if (!access.allowed) {
                setShiftLocked({ message: access.message || 'Your shift has ended.', shiftName: access.shiftName });
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [template?.shiftId]);

    const loadAssets = async () => {
        try {
            const data = await getMyAssets();
            setAssets(data);
            // Auto-select first matching asset type only when template/route did not lock one
            if (!template?.assetId && !routeAssetId) {
                const tType = (template?.assetType || '').toLowerCase();
                const typeMatched = tType ? data.filter((a) => String(a.assetType || '').toLowerCase() === tType) : data;
                if (typeMatched.length > 0) {
                    setAssetId(prev => prev || String(typeMatched[0].id));
                }
            }
        } catch (_) {
            // non-critical
        }
    };

    const questionType = (question: any) => {
        const raw = String(question?.answerType || question?.inputType || 'text')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_');

        if (['yes_no', 'yes/no', 'yesno', 'boolean'].includes(raw)) return 'yes_no';
        if (['ok_not_ok', 'ok/not_ok', 'ok_notok'].includes(raw)) return 'ok_not_ok';
        if (['cleaned_not_cleaned', 'cleaned/not_cleaned', 'clean_unclean', 'cleaned'].includes(raw)) return 'cleaned_not_cleaned';
        if (['photo', 'photo_upload', 'image', 'image_upload', 'file'].includes(raw)) return 'photo';
        if (['upload', 'video', 'video_upload', 'document', 'document_upload'].includes(raw)) return 'upload';
        if (['single_select', 'single_choice', 'radio', 'multi_select', 'multiple_select', 'checkbox'].includes(raw)) return 'dropdown';
        if (['long_text', 'textarea', 'remark', 'remarks', 'notes'].includes(raw)) return 'text';
        if (['datetime', 'date_time'].includes(raw)) return 'date';
        return raw || 'text';
    };

    const uploadFileToServer = async (uri: string, name: string, mimeType: string): Promise<string> => {
        const formData = new FormData();
        formData.append('file', { uri, name, type: mimeType } as any);
        const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const json = await res.json();
        return json.url;
    };

    const handleTakePhoto = async (questionId: number) => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission required', 'Camera permission is needed to take photos.'); return; }
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
            if (result.canceled || !result.assets?.[0]) return;
            const asset = result.assets[0];
            const name = asset.fileName || `photo_${Date.now()}.jpg`;
            const mimeType = asset.mimeType || 'image/jpeg';
            try {
                const serverUrl = await uploadFileToServer(asset.uri, name, mimeType);
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name, uri: serverUrl, url: serverUrl, mimeType }) }));
            } catch {
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name, uri: asset.uri, mimeType }) }));
            }
        } catch {
            Alert.alert('Error', 'Could not open camera. Please try again.');
        }
    };

    const handlePickPhoto = async (questionId: number) => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission required', 'Photo library permission is needed to upload photos.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
            if (result.canceled || !result.assets?.[0]) return;
            const asset = result.assets[0];
            const name = asset.fileName || `photo_${Date.now()}.jpg`;
            const mimeType = asset.mimeType || 'image/jpeg';
            try {
                const serverUrl = await uploadFileToServer(asset.uri, name, mimeType);
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name, uri: serverUrl, url: serverUrl, mimeType }) }));
            } catch {
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name, uri: asset.uri, mimeType }) }));
            }
        } catch {
            Alert.alert('Error', 'Could not open photo library. Please try again.');
        }
    };

    const handlePickUpload = async (questionId: number) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
            if (result.canceled) return;
            const file = result.assets?.[0];
            if (!file) return;
            try {
                const serverUrl = await uploadFileToServer(file.uri, file.name, file.mimeType || 'application/octet-stream');
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name: file.name, uri: serverUrl, url: serverUrl, mimeType: file.mimeType }) }));
            } catch {
                setAnswers(prev => ({ ...prev, [questionId]: JSON.stringify({ name: file.name, uri: file.uri, mimeType: file.mimeType || null }) }));
            }
        } catch {
            Alert.alert('Upload Failed', 'Could not select file. Please try again.');
        }
    };

    const loadTemplate = async () => {
        try {
            const data = await getTemplateDetails(templateType, templateId);

            // Shift-based access control: check if user is allowed at this time
            if (data.shiftId) {
                const access = await checkShiftAccess(data.shiftId).catch(() => ({ allowed: true }));
                if (!access.allowed) {
                    setShiftLocked({ message: access.message || 'Access denied for this shift.', shiftName: access.shiftName });
                    setIsLoading(false);
                    return;
                }
            }

            // Auto-fill asset: prefer template's directly linked asset, then fall back to
            // the asset associated with the assignment (passed via route params).
            if (data.assetId) {
                setAssetId(String(data.assetId));
            } else if (routeAssetId) {
                setAssetId(String(routeAssetId));
            }
            // Initialize answers before setTemplate so render never sees template.questions
            // without a corresponding answers map.
            const initialAnswers: Record<number, any> = {};
            (data.questions || []).forEach(q => {
                initialAnswers[q.id] = '';
            });
            setAnswers(initialAnswers);
            setTemplate(data);
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
                if (error.queued) {
                    Alert.alert('Saved Offline', 'No internet connection. Your logsheet has been saved and will sync automatically when you\'re back online.', [{ text: 'OK', onPress: () => router.back() }]);
                } else if (error.shiftLocked) {
                    setShiftLocked({ message: error.message, shiftName: error.shiftName });
                } else {
                    Alert.alert('Error', error.message || 'Failed to submit. Please try again.');
                }
            } finally {
                setIsSubmitting(false);
            }
            return;
        }
        const missingRequired = (template.questions || [])
            .filter(q => {
                if (!q.isRequired) return false;
                const val = answers[q.id];
                if (val === undefined || val === null) return true;
                if (typeof val === 'string') return val.trim() === '';
                return false;
            })
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

        // Convert answers to API format, appending any notes to yes_no / ok_not_ok answers
        const formattedAnswers = Object.entries(answers).map(([questionId, value]) => {
            const qId = parseInt(questionId);
            const note = answerNotes[qId];
            const needsNote = (value === 'No' || value === 'Not OK') && note;
            const rawAnswer = typeof value === 'string'
                ? value
                : (value == null ? null : JSON.stringify(value));
            return {
                questionId: qId,
                answer: needsNote ? `${rawAnswer}\nNote: ${note}` : (rawAnswer || null),
            };
        });

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
            if (error.queued) {
                Alert.alert(
                    'Saved Offline',
                    `No internet connection. Your ${templateType === 'checklist' ? 'checklist' : 'logsheet'} has been saved and will sync automatically when you're back online.`,
                    [{ text: 'OK', onPress: () => router.back() }]
                );
            } else if (error.shiftLocked) {
                setShiftLocked({ message: error.message, shiftName: error.shiftName });
            } else {
                Alert.alert('Error', error.message || 'Failed to submit. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderQuestionInput = (question: any) => {
        const value = answers[question.id];
        const note = answerNotes[question.id] || '';
        const showNoteBox = (value === 'No' || value === 'Not OK');
        const qType = questionType(question);

        switch (qType) {
            case 'yes_no':
                return (
                    <View>
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
                        {showNoteBox && (
                            <TextInput
                                style={[styles.textInput, { marginTop: 8 }]}
                                value={note}
                                onChangeText={(t) => setAnswerNotes({ ...answerNotes, [question.id]: t })}
                                placeholder="Describe the issue..."
                                placeholderTextColor="#A0AEC0"
                                multiline
                            />
                        )}
                    </View>
                );

            case 'ok_not_ok':
                return (
                    <View>
                        <View style={styles.yesNoContainer}>
                            <TouchableOpacity
                                style={[styles.yesNoButton, value === 'OK' && styles.yesNoButtonActive]}
                                onPress={() => setAnswers({ ...answers, [question.id]: 'OK' })}
                            >
                                <MaterialCommunityIcons
                                    name="check-circle"
                                    size={20}
                                    color={value === 'OK' ? '#10B981' : '#A0AEC0'}
                                />
                                <Text style={[styles.yesNoText, value === 'OK' && styles.yesNoTextActive]}>OK</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.yesNoButton, value === 'Not OK' && styles.yesNoButtonActive]}
                                onPress={() => setAnswers({ ...answers, [question.id]: 'Not OK' })}
                            >
                                <MaterialCommunityIcons
                                    name="close-circle"
                                    size={20}
                                    color={value === 'Not OK' ? '#EF4444' : '#A0AEC0'}
                                />
                                <Text style={[styles.yesNoText, value === 'Not OK' && styles.yesNoTextActive]}>Not OK</Text>
                            </TouchableOpacity>
                        </View>
                        {showNoteBox && (
                            <TextInput
                                style={[styles.textInput, { marginTop: 8 }]}
                                value={note}
                                onChangeText={(t) => setAnswerNotes({ ...answerNotes, [question.id]: t })}
                                placeholder="Describe the issue..."
                                placeholderTextColor="#A0AEC0"
                                multiline
                            />
                        )}
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
                        value={value || ''}
                        onChangeText={(text) => {
                            if (text === '' || /^-?\d*\.?\d*$/.test(text)) {
                                setAnswers({ ...answers, [question.id]: text });
                            }
                        }}
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
            case 'custom_options': {
                const rawOpts = question.options?.options || question.options || [];
                // Normalise: options may be plain strings or {label, value} objects
                const options: string[] = (Array.isArray(rawOpts) ? rawOpts : []).map((o: any) =>
                    typeof o === 'string' ? o : (o?.label ?? o?.value ?? o?.text ?? String(o))
                );
                return (
                    <View style={styles.optionsContainer}>
                        {options.map((option, index) => (
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
            }

            case 'cleaned_not_cleaned':
                return (
                    <View style={styles.yesNoContainer}>
                        <TouchableOpacity
                            style={[styles.yesNoButton, value === 'Cleaned' && { backgroundColor: '#F0FDF4', borderColor: '#16A34A' }]}
                            onPress={() => setAnswers({ ...answers, [question.id]: 'Cleaned' })}
                        >
                            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" style={{ marginRight: 6 }} />
                            <Text style={[styles.yesNoText, value === 'Cleaned' && { color: '#16A34A' }]}>Cleaned</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.yesNoButton, value === 'Not Cleaned' && { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }]}
                            onPress={() => setAnswers({ ...answers, [question.id]: 'Not Cleaned' })}
                        >
                            <MaterialCommunityIcons name="close-circle-outline" size={18} color={value === 'Not Cleaned' ? '#DC2626' : '#DC2626'} style={{ marginRight: 6 }} />
                            <Text style={[styles.yesNoText, value === 'Not Cleaned' && { color: '#DC2626' }]}>Not Cleaned</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 'upload':
            case 'file':
            case 'signature': {
                let fileLabel = 'No file selected';
                let fileUri: string | null = null;
                if (typeof value === 'string' && value) {
                    try {
                        const parsed = JSON.parse(value);
                        fileLabel = parsed?.name || 'Selected file';
                        fileUri = parsed?.url || parsed?.uri || null;
                    } catch {
                        fileLabel = value;
                    }
                }
                return (
                    <View style={styles.uploadWrap}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.uploadBtn, { flex: 1 }]} onPress={() => handlePickUpload(question.id)}>
                                <MaterialCommunityIcons name="paperclip" size={18} color="#1E3A8A" />
                                <Text style={styles.uploadBtnText}>Choose File</Text>
                            </TouchableOpacity>
                        </View>
                        {fileUri ? (
                            <Text style={styles.uploadFileName} numberOfLines={1}>✓ {fileLabel}</Text>
                        ) : (
                            <Text style={styles.uploadFileName} numberOfLines={1}>{fileLabel}</Text>
                        )}
                    </View>
                );
            }

            case 'photo':
            case 'image': {
                let photoLabel = 'No photo selected';
                let photoUri: string | null = null;
                if (typeof value === 'string' && value) {
                    try {
                        const parsed = JSON.parse(value);
                        photoLabel = parsed?.name || 'Photo selected';
                        photoUri = parsed?.url || parsed?.uri || null;
                    } catch {
                        photoLabel = value;
                    }
                }
                const isServer = photoUri?.startsWith('http');
                return (
                    <View style={styles.uploadWrap}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.uploadBtn, { flex: 1 }]} onPress={() => handleTakePhoto(question.id)}>
                                <MaterialCommunityIcons name="camera" size={18} color="#1E3A8A" />
                                <Text style={styles.uploadBtnText}>Take Photo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.uploadBtn, { flex: 1 }]} onPress={() => handlePickPhoto(question.id)}>
                                <MaterialCommunityIcons name="image-multiple-outline" size={18} color="#1E3A8A" />
                                <Text style={styles.uploadBtnText}>Upload Photo</Text>
                            </TouchableOpacity>
                        </View>
                        {photoUri ? (
                            isServer ? (
                                <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                            ) : (
                                <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                            )
                        ) : (
                            <Text style={styles.uploadFileName}>{photoLabel}</Text>
                        )}
                    </View>
                );
            }

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

    // Shift access denied — show locked screen
    if (shiftLocked) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <MaterialCommunityIcons name="lock-clock" size={64} color="#7C3AED" />
                    <Text style={[styles.errorText, { color: '#7C3AED', marginTop: 16 }]}>
                        {shiftLocked.shiftName ? `Shift: ${shiftLocked.shiftName}` : 'Shift Restricted'}
                    </Text>
                    <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, paddingHorizontal: 32, lineHeight: 20 }}>
                        {shiftLocked.message}
                    </Text>
                    <TouchableOpacity style={[styles.backButton2, { marginTop: 24 }]} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </TouchableOpacity>
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
                    {/* Asset Selector — only shown for logsheets */}
                    {templateType === 'logsheet' && <View style={styles.questionCard}>
                            <Text style={styles.questionLabel}>Asset (Required)</Text>
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
                                    {filteredAssets.length === 0 && (
                                        <Text style={styles.assetListEmpty}>No assets found</Text>
                                    )}
                                    {filteredAssets.map(a => (
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
                        </View>}

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
                                {(() => {
                                    // Guard: headerConfig must have valid rows and columnGroups arrays
                                    const hc = template.headerConfig as TabularHeaderConfig | null;
                                    const hasValidConfig = hc &&
                                        Array.isArray(hc.columnGroups) && hc.columnGroups.length > 0 &&
                                        Array.isArray(hc.rows);
                                    if (!hasValidConfig) {
                                        return (
                                            <View style={{ padding: 16, backgroundColor: '#FEF3C7', borderRadius: 8, marginTop: 12 }}>
                                                <Text style={{ color: '#92400E', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
                                                    This logsheet template has not been configured yet.
                                                </Text>
                                                <Text style={{ color: '#92400E', textAlign: 'center', fontSize: 12, marginTop: 4 }}>
                                                    Please ask your administrator to set up the column/row structure.
                                                </Text>
                                            </View>
                                        );
                                    }
                                    return (
                                    <ScrollView horizontal showsHorizontalScrollIndicator
                                        style={{ marginTop: 12 }}
                                        contentContainerStyle={{ flexDirection: 'column' }}
                                    >
                                        {/* Group header row */}
                                        <View style={{ flexDirection: 'row' }}>
                                            <View style={[tabStyles.headerCell, tabStyles.rowLabelCell]}>
                                                <Text style={tabStyles.headerText}>
                                                    {hc!.rowLabelHeader || 'Time'}
                                                </Text>
                                            </View>
                                            {hc!.columnGroups.map((g: TabularColumnGroup) => (
                                                <View key={g.id}
                                                    style={[tabStyles.headerCell, { width: g.columns.length * 80 }]}>
                                                    <Text style={tabStyles.headerText}>{g.label}</Text>
                                                </View>
                                            ))}
                                        </View>
                                        {/* Sub-column header row */}
                                        <View style={{ flexDirection: 'row' }}>
                                            <View style={[tabStyles.subHeaderCell, tabStyles.rowLabelCell]} />
                                            {hc!.columnGroups.flatMap((g: TabularColumnGroup) =>
                                                g.columns.map((c) => (
                                                    <View key={`${g.id}_${c.id}`} style={tabStyles.subHeaderCell}>
                                                        <Text style={tabStyles.subHeaderText}>{c.label}</Text>
                                                        {c.subLabel ? <Text style={tabStyles.subLabelText}>{c.subLabel}</Text> : null}
                                                    </View>
                                                ))
                                            )}
                                        </View>
                                        {/* Data rows */}
                                        {hc!.rows.map((row) => (
                                            <View key={row.id} style={{ flexDirection: 'row' }}>
                                                <View style={[tabStyles.dataCell, tabStyles.rowLabelCell]}>
                                                    <Text style={tabStyles.rowLabelText}>{row.label}</Text>
                                                </View>
                                                {hc!.columnGroups.flatMap((g: TabularColumnGroup) =>
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
                                    );
                                })()}
                            </View>
                        ) : (
                        (template.questions || []).map((question, index) => {
                            let inputEl: React.ReactNode;
                            try { inputEl = renderQuestionInput(question); }
                            catch { inputEl = (
                                <TextInput
                                    style={styles.textInput}
                                    value={answers[question.id] || ''}
                                    onChangeText={t => setAnswers({ ...answers, [question.id]: t })}
                                    placeholder="Enter your answer..."
                                    placeholderTextColor="#A0AEC0"
                                />
                            ); }
                            return (
                                <View key={question.id} style={styles.questionCard}>
                                    <View style={styles.questionHeader}>
                                        <Text style={styles.questionNumber}>Q{index + 1}</Text>
                                        {!!question.isRequired && <View style={styles.requiredBadge}>
                                            <Text style={styles.requiredText}>Required</Text>
                                        </View>}
                                    </View>
                                    <Text style={styles.questionText}>{question.questionText}</Text>
                                    {inputEl}
                                </View>
                            );
                        })
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
    uploadWrap: {
        gap: 10,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
        paddingVertical: 12,
    },
    uploadBtnText: {
        color: '#1E3A8A',
        fontSize: 14,
        fontWeight: '700',
    },
    uploadFileName: {
        fontSize: 12,
        color: '#64748B',
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
