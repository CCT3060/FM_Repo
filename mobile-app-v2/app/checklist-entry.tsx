import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Image, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  fetchTemplateWithQuestions,
  submitChecklistAuth,
  submitLogsheetAuth,
  uploadFile,
  raiseSoftRequest,
  API_BASE,
} from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'photo'
  | 'date'
  | 'signature';

interface Field {
  id:                number | string;
  label:             string;
  type:              FieldType;
  required?:         boolean;
  options?:          string[];
  unit?:             string;
  boolLabels?:       [string, string]; // e.g. Yes/No  or  OK/Not OK  or  Cleaned/Not Cleaned
  sectionName?:      string;
  referenceImageUrl?: string | null;
  questionImageUrl?:  string | null;
}

// ─── Field normalizer ─────────────────────────────────────────────────────────
// Maps the backend's answerType / inputType to the FieldType used by the UI,
// and enriches each field with label/options from the raw API shape.

function normalizeField(q: any, idx: number): Field {
  const rawType = String(q.answerType || q.inputType || 'text')
    .toLowerCase()
    .trim();

  let type: FieldType;
  let boolLabels: [string, string] | undefined;

  switch (rawType) {
    case 'yes_no':
    case 'yes/no':
      type       = 'boolean';
      boolLabels = ['Yes', 'No'];
      break;
    case 'ok_not_ok':
    case 'ok/not_ok':
      type       = 'boolean';
      boolLabels = ['OK', 'Not OK'];
      break;
    case 'cleaned_not_cleaned':
    case 'cleaned/not_cleaned':
      type       = 'boolean';
      boolLabels = ['Cleaned', 'Not Cleaned'];
      break;
    case 'dropdown':
    case 'custom_options':
    case 'single_select':
    case 'multi_select':
      type = 'select';
      break;
    case 'remark':
    case 'textarea':
    case 'long_text':
      type = 'textarea';
      break;
    case 'number':
      type = 'number';
      break;
    case 'photo':
    case 'photo_upload':
    case 'image':
      type = 'photo';
      break;
    case 'date':
    case 'datetime':
    case 'date_time':
      type = 'date';
      break;
    case 'signature':
      type = 'signature';
      break;
    default:
      type = 'text';
  }

  // Parse options — backend can return array, JSON string, or { options: [] }
  let options: string[] = [];
  if (q.options) {
    if (Array.isArray(q.options)) {
      options = q.options.map(String);
    } else if (typeof q.options === 'string') {
      try {
        const parsed = JSON.parse(q.options);
        options = Array.isArray(parsed)
          ? parsed.map(String)
          : Array.isArray(parsed?.options) ? parsed.options.map(String) : [];
      } catch { options = []; }
    } else if (typeof q.options === 'object' && Array.isArray((q.options as any).options)) {
      options = ((q.options as any).options as any[]).map(String);
    }
  }

  return {
    id:                q.id ?? idx,
    label:             q.questionText || q.text || q.label || `Question ${idx + 1}`,
    type,
    boolLabels,
    required:          !!(q.isRequired ?? q.is_required ?? q.required),
    options,
    unit:              q.unit,
    sectionName:       q.sectionName,
    referenceImageUrl: resolveUrl(q.referenceImageUrl || q.reference_image_url),
    questionImageUrl:  resolveUrl(q.questionImageUrl  || q.question_image_url),
  };
}

// Resolve relative /uploads/ URLs to full URL for mobile display
function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Image that shows a placeholder when missing (avoids silent blank gray boxes)
function QuestionImage({ uri, style }: { uri: string; style?: any }) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.questionImage, style, { backgroundColor: theme.inputBg, alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
        <MaterialCommunityIcons name="image-broken-variant" size={28} color={theme.textMuted} />
        <Text style={{ fontSize: 10, color: theme.textMuted, textAlign: 'center' }}>Image unavailable{'\n'}(re-upload in portal)</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.questionImage, style]}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

// ─── PhotoInput component ─────────────────────────────────────────────────────

// value is either null (no photo) or the server URL of the uploaded image.

function PhotoInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { theme } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [fileSize,  setFileSize]  = useState<string | null>(null);

  const pick = async (fromCamera: boolean) => {
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery permission is required.');
        return;
      }
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    const fileBytes = asset.fileSize ?? 0;
    if (fileBytes > MAX_BYTES) {
      const sizeMB = (fileBytes / (1024 * 1024)).toFixed(1);
      Alert.alert('Image Too Large', `This image is ${sizeMB} MB. Please choose an image smaller than 5 MB.`);
      return;
    }

    setUploading(true);
    try {
      const url = await uploadFile(asset.uri);
      onChange(url);
      if (fileBytes > 0) {
        setFileSize(fileBytes > 1024 * 1024
          ? `${(fileBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(fileBytes / 1024)} KB`);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  };

  // ── Preview ──────────────────────────────────────────────────────────────
  if (value) {
    return (
      <View style={styles.photoPreviewWrap}>
        <Image source={{ uri: value }} style={styles.photoPreview} resizeMode="cover" />
        <TouchableOpacity
          style={styles.removePhotoOverlay}
          onPress={() => { onChange(null); setFileSize(null); }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="close" size={13} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera-only icon button ──────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[styles.cameraIconBtn, { backgroundColor: theme.primaryBg, opacity: uploading ? 0.6 : 1 }]}
      onPress={() => pick(true)}
      disabled={uploading}
      activeOpacity={0.7}
    >
      {uploading
        ? <ActivityIndicator size="small" color={theme.primary} style={{ width: 18, height: 18 }} />
        : <MaterialCommunityIcons name="camera-outline" size={18} color={theme.primary} />}
    </TouchableOpacity>
  );
}



// Returns background and text color for a boolean option based on positive/negative sentiment
function getBoolOptColors(opt: string, isSelected: boolean): { bg: string; text: string } {
  const lower = opt.toLowerCase().trim();
  const isNegative = lower === 'no' || lower === 'n/a' || lower.startsWith('not ') || lower === 'fail' || lower === 'failed';
  if (isNegative) {
    return { bg: isSelected ? '#dc2626' : '#fee2e2', text: isSelected ? '#fff' : '#dc2626' };
  }
  return { bg: isSelected ? '#16a34a' : '#dcfce7', text: isSelected ? '#fff' : '#16a34a' };
}

function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const { theme } = useTheme();

  // ── Boolean (Yes/No, OK/Not OK, Cleaned/Not Cleaned) ────────────────────
  if (field.type === 'boolean') {
    const labels = field.boolLabels ?? ['Yes', 'No'];
    return (
      <View style={[styles.boolContainer, { backgroundColor: theme.inputBg }]}>
        {labels.map((opt) => {
          const { bg, text } = getBoolOptColors(opt, value === opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.boolBtn,
                { backgroundColor: bg },
                value === opt && { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
              ]}
              onPress={() => onChange(value === opt ? null : opt)}
              activeOpacity={0.7}
            >
              <Text style={[styles.boolBtnText, { color: text, fontWeight: value === opt ? '700' : '500' }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Select / Dropdown (wrapping chips) ──────────────────────────────────
  if (field.type === 'select' && field.options && field.options.length > 0) {
    return (
      <View style={styles.selectGrid}>
        {field.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optBtn, {
              backgroundColor: value === opt ? theme.primary : theme.inputBg,
              borderColor:     value === opt ? theme.primary : theme.inputBorder,
            }]}
            onPress={() => onChange(value === opt ? null : opt)}
          >
            <Text style={[styles.optBtnText, { color: value === opt ? '#fff' : theme.textSecondary }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // ── Textarea / Remark ────────────────────────────────────────────────────
  if (field.type === 'textarea') {
    return (
      <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <TextInput
          style={[styles.input, styles.textarea, { color: theme.inputText }]}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder="Enter remarks…"
          placeholderTextColor={theme.inputPlaceholder}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    );
  }

  // ── Date ─────────────────────────────────────────────────────────────────
  if (field.type === 'date') {
    return (
      <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="calendar-outline" size={18} color={theme.textMuted} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: theme.inputText }]}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.inputPlaceholder}
          keyboardType="numbers-and-punctuation"
        />
      </View>
    );
  }

  // ── Signature ────────────────────────────────────────────────────────────
  if (field.type === 'signature') {
    return (
      <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="draw-pen" size={18} color={theme.textMuted} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: theme.inputText }]}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder="Enter name as signature"
          placeholderTextColor={theme.inputPlaceholder}
          autoCapitalize="words"
        />
      </View>
    );
  }

  // ── Photo — real camera / gallery picker ────────────────────────────────
  if (field.type === 'photo') {
    return <PhotoInput value={value ?? null} onChange={onChange} />;
  }

  // ── Number / Text (default) ───────────────────────────────────────────────
  return (
    <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
      <TextInput
        style={[styles.input, { color: theme.inputText }]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={
          field.type === 'number'
            ? `Enter value${field.unit ? ` (${field.unit})` : ''}`
            : 'Enter response'
        }
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChecklistEntryScreen() {
  const { theme } = useTheme();
  const { assetId, templateId, templateType, templateName, assetName, softRaise } =
    useLocalSearchParams<{
      assetId: string;
      templateId: string;
      templateType: string;
      templateName: string;
      assetName: string;
      assignmentId: string;
      softRaise: string;
    }>();

  const isSoftRaise = softRaise === '1';

  const [fields,     setFields]    = useState<Field[]>([]);
  const [answers,    setAnswers]   = useState<Record<string, any>>({});
  const [photos,     setPhotos]    = useState<Record<string, string | null>>({});
  const [loading,    setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [templateDesc, setTemplateDesc] = useState<string | null>(null);

  // Location captured silently in background
  const locationRef = useRef<{ latitude: number; longitude: number; address?: string } | null>(null);

  useEffect(() => {
    // Request location permission and capture silently — failure is non-blocking
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = pos.coords;
          let address: string | undefined;
          try {
            const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (geo?.[0]) {
              const g = geo[0];
              address = [g.name, g.street, g.city, g.region, g.country].filter(Boolean).join(', ');
            }
          } catch { /* address is optional */ }
          locationRef.current = { latitude, longitude, address };
        }
      } catch { /* location is optional — never block submission */ }
    })();
  }, []);

  useEffect(() => {
    const type = templateType === 'logsheet' ? 'logsheet' : 'checklist';
    const tid  = Number(templateId);

    fetchTemplateWithQuestions(type, tid)
      .then((data: any) => {
        const rawQuestions: any[] = Array.isArray(data?.questions) ? data.questions : [];
        const normalized = rawQuestions.map((q, idx) => normalizeField(q, idx));
        setFields(normalized);
        setTemplateDesc(data?.description || null);
      })
      .catch(() => { /* empty state handles this */ })
      .finally(() => setLoading(false));
  }, [templateId, templateType]);

  const setAnswer = (fieldId: string | number, val: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async () => {
    const missing = fields.filter(
      (f) => f.required &&
             (answers[f.id] === undefined || answers[f.id] === null || answers[f.id] === '')
    );
    if (missing.length > 0) {
      Alert.alert('Required Fields', `Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const answerArray = fields.map((f) => {
        const mainVal  = answers[f.id] ?? null;
        const photoUrl = photos[String(f.id)] ?? null;
        const finalVal = f.type === 'photo'
          ? mainVal
          : (photoUrl ? { value: mainVal, photoUrl } : mainVal);
        return { questionId: f.id, answer: finalVal };
      });

      const tid = Number(templateId);
      const aid = assetId && Number(assetId) > 0 ? Number(assetId) : null;
      const loc = locationRef.current;

      if (isSoftRaise) {
        // Submit checklist AND raise a soft service request in one step
        const submission = await submitChecklistAuth({
          templateId: tid, assetId: aid, answers: answerArray,
          latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null,
          locationAddress: loc?.address ?? null,
        });
        const submissionId = (submission as any)?.submissionId ?? (submission as any)?.id ?? undefined;
        await raiseSoftRequest({
          assetId: aid ?? 0,
          templateId: tid,
          submissionId,
          answers: answerArray,
        });
        Alert.alert('Request Raised!', 'Your issue has been submitted successfully.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
      } else if (templateType === 'logsheet') {
        await submitLogsheetAuth({
          templateId: tid, assetId: aid, answers: answerArray,
          latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null,
          locationAddress: loc?.address ?? null,
        });
        Alert.alert('Submitted!', 'Your response has been recorded.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
      } else {
        await submitChecklistAuth({
          templateId: tid, assetId: aid, answers: answerArray,
          latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null,
          locationAddress: loc?.address ?? null,
        });
        Alert.alert('Submitted!', 'Your response has been recorded.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header
        title={templateName ?? (templateType === 'logsheet' ? 'Log Sheet' : 'Checklist')}
        subtitle={assetName}
        showBack
      />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Template header */}
            <View style={styles.templateHeader}>
              <Text style={[styles.templateTitle, { color: theme.textPrimary }]}>{templateName}</Text>
              {templateDesc ? (
                <Text style={[styles.templateDesc, { color: theme.textSecondary }]}>{templateDesc}</Text>
              ) : null}
            </View>
            {fields.length === 0 ? (
              <View style={styles.noFields}>
                <MaterialCommunityIcons name="clipboard-alert-outline" size={48} color={theme.textMuted} />
                <Text style={[styles.noFieldsText, { color: theme.textSecondary }]}>
                  No fields found for this template.{'\n'}Contact your administrator.
                </Text>
              </View>
            ) : (
              fields.map((field, idx) => {
                const prevSection = idx > 0 ? fields[idx - 1].sectionName : undefined;
                const showSectionHeader = field.sectionName && field.sectionName !== prevSection;
                return (
                  <React.Fragment key={String(field.id)}>
                    {showSectionHeader ? (
                      <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionHeaderText, { color: theme.textMuted }]}>
                          {field.sectionName?.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.fieldCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderColor: theme.inputBorder }]}>
                      <View style={styles.fieldHeader}>
                        <View style={[styles.fieldIdxBadge, { backgroundColor: theme.primaryBg }]}>
                          <Text style={[styles.fieldIdxText, { color: theme.primary }]}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          {/* Show question text only if it's not the photo-question placeholder */}
                          {field.label && field.label !== '[Photo Question]' ? (
                            <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                              {field.label}
                              {field.required ? <Text style={{ color: theme.danger }}> *</Text> : null}
                            </Text>
                          ) : field.required ? (
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                              (Required) <Text style={{ color: theme.danger }}>*</Text>
                            </Text>
                          ) : null}
                          {field.unit ? (
                            <Text style={[styles.fieldUnit, { color: theme.textMuted }]}>Unit: {field.unit}</Text>
                          ) : null}
                        </View>
                        {/* Camera icon — top-right of every question */}
                        {field.type !== 'photo' && (
                          <PhotoInput
                            value={photos[String(field.id)] ?? null}
                            onChange={(v) => setPhotos((prev) => ({ ...prev, [String(field.id)]: v }))}
                          />
                        )}
                      </View>
                      {/* Question image (photo-as-question) */}
                      {field.questionImageUrl ? (
                        <QuestionImage uri={field.questionImageUrl} />
                      ) : null}
                      {/* Reference image (admin-uploaded for this question) */}
                      {field.referenceImageUrl ? (
                        <View style={styles.refImageWrap}>
                          <Text style={[styles.refImageLabel, { color: theme.textMuted }]}>Reference</Text>
                          <QuestionImage uri={field.referenceImageUrl} style={styles.refImage} />
                        </View>
                      ) : null}
                      <FieldInput
                        field={field}
                        value={answers[field.id]}
                        onChange={(v) => setAnswer(field.id, v)}
                      />
                    </View>
                  </React.Fragment>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: submitting ? theme.textMuted : theme.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitText}>{isSoftRaise ? 'Submit Request' : 'Submit Checklist'}</Text>
                  <MaterialCommunityIcons name="send" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:              { flex: 1 },
  scroll:            { padding: Spacing.md, gap: Spacing.xs, paddingBottom: 120 },

  // Template name / description header
  templateHeader:    { marginBottom: Spacing.sm },
  templateTitle:     { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  templateDesc:      { fontSize: 13, lineHeight: 20, marginTop: 4 },

  // Section headers (logsheets with multiple sections)
  sectionHeader:     { marginTop: Spacing.sm, marginBottom: -Spacing.xs, paddingHorizontal: Spacing.xs },
  sectionHeaderText: { ...Typography.micro, letterSpacing: 0.8, fontWeight: '700' as const },

  // Field card
  fieldCard:         {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  fieldHeader:       { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, alignItems: 'flex-start' },
  fieldIdxBadge:     { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldIdxText:      { fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
  fieldLabel:        { fontSize: 13, fontWeight: '500' as const, lineHeight: 19, flex: 1 },
  fieldUnit:         { ...Typography.micro, marginTop: 1 },

  // Type badge (shows the input type in the card header)
  typeBadge:         { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.sm, alignSelf: 'flex-start', opacity: 0.7 },
  typeBadgeText:     { fontSize: 9, textTransform: 'lowercase' },

  // Boolean segmented control
  boolContainer:     { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md },
  boolBtn:           { flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  boolBtnActive:     {},
  boolBtnText:       { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },

  // Select chips (wrapping)
  selectGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  optBtn:            { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  optBtnText:        { fontSize: 11, fontWeight: '400' as const, lineHeight: 16 },

  // Text / number inputs
  inputWrap:         { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 1, flexDirection: 'row', alignItems: 'center' },
  inputIcon:         { marginRight: Spacing.xs },
  input:             { fontSize: 12, fontWeight: '300' as const, lineHeight: 18, flex: 1 },
  textarea:          { height: 72, textAlignVertical: 'top' },

  // Camera icon button (top-right of field header)
  cameraIconBtn:     {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },

  // Photo preview (thumbnail with overlapping X badge)
  photoPreviewWrap:  { position: 'relative' as const, alignSelf: 'flex-start' as const },
  photoPreview:      {
    width: 90,
    height: 90,
    borderRadius: Radius.md,
    backgroundColor: '#E2E8F0',
  },
  removePhotoOverlay: {
    position: 'absolute' as const,
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    elevation: 3,
  },

  // Empty state
  noFields:          { alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xxl },
  noFieldsText:      { ...Typography.body, textAlign: 'center' },

  // Optional photo attachment section (shown below every non-photo field)
  attachPhotoSection: { marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: Spacing.sm },

  // Submit footer
  footer:            { borderTopWidth: 1, padding: Spacing.md },
  submitBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg },

  // Reference image (shown above answer input when admin has set one)
  refImageWrap:   { marginBottom: Spacing.sm },
  refImageLabel:  { ...Typography.micro, marginBottom: 4 },
  refImage:       { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: '#E2E8F0' },
  // Question image (photo used as the question itself — shown as small icon)
  questionImage:  { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: '#E2E8F0', marginBottom: Spacing.sm },
  submitText:        { fontSize: 14, fontWeight: '700' as const, color: '#fff' },
});
