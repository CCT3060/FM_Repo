import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
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
  id:           number | string;
  label:        string;
  type:         FieldType;
  required?:    boolean;
  options?:     string[];
  unit?:        string;
  boolLabels?:  [string, string, string]; // e.g. Yes/No/N/A  or  OK/Not OK/N/A
  sectionName?: string;
}

// ─── Field normalizer ─────────────────────────────────────────────────────────
// Maps the backend's answerType / inputType to the FieldType used by the UI,
// and enriches each field with label/options from the raw API shape.

function normalizeField(q: any, idx: number): Field {
  const rawType = String(q.answerType || q.inputType || 'text')
    .toLowerCase()
    .trim();

  let type: FieldType;
  let boolLabels: [string, string, string] | undefined;

  switch (rawType) {
    case 'yes_no':
    case 'yes/no':
      type       = 'boolean';
      boolLabels = ['Yes', 'No', 'N/A'];
      break;
    case 'ok_not_ok':
    case 'ok/not_ok':
      type       = 'boolean';
      boolLabels = ['OK', 'Not OK', 'N/A'];
      break;
    case 'cleaned_not_cleaned':
    case 'cleaned/not_cleaned':
      type       = 'boolean';
      boolLabels = ['Cleaned', 'Not Cleaned', 'N/A'];
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
    id:          q.id ?? idx,
    label:       q.questionText || q.text || q.label || `Question ${idx + 1}`,
    type,
    boolLabels,
    required:    !!(q.isRequired ?? q.is_required ?? q.required),
    options,
    unit:        q.unit,
    sectionName: q.sectionName,
  };
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

  const pick = async (fromCamera: boolean) => {
    // ── Request permissions ────────────────────────────────────────────────
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera permission is required to take photos. Please enable it in your device settings.'
        );
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Gallery permission is required to select photos. Please enable it in your device settings.'
        );
        return;
      }
    }

    // ── Launch picker ──────────────────────────────────────────────────────
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          quality: 0.75,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.75,
          allowsEditing: false,
        });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    // ── Upload to server ───────────────────────────────────────────────────
    setUploading(true);
    try {
      const url = await uploadFile(result.assets[0].uri);
      onChange(url);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload the image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Preview (image already selected) ──────────────────────────────────────
  if (value) {
    return (
      <View style={styles.photoPreviewWrap}>
        <Image source={{ uri: value }} style={styles.photoPreview} resizeMode="cover" />
        <TouchableOpacity
          style={[styles.removePhotoBtn, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}
          onPress={() => onChange(null)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="close-circle-outline" size={16} color={theme.danger} />
          <Text style={[styles.removePhotoText, { color: theme.danger }]}>Remove photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Picker buttons ─────────────────────────────────────────────────────────
  return (
    <View style={styles.photoActions}>
      {/* Take photo */}
      <TouchableOpacity
        style={[
          styles.photoBtn,
          { backgroundColor: theme.primary, opacity: uploading ? 0.65 : 1 },
        ]}
        onPress={() => pick(true)}
        disabled={uploading}
        activeOpacity={0.85}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialCommunityIcons name="camera" size={18} color="#fff" />
        )}
        <Text style={[styles.photoBtnText, { color: '#fff' }]}>
          {uploading ? 'Uploading…' : 'Take Photo'}
        </Text>
      </TouchableOpacity>

      {/* Choose from gallery */}
      <TouchableOpacity
        style={[
          styles.photoBtn,
          {
            backgroundColor: theme.inputBg,
            borderWidth: 1.5,
            borderColor: theme.primary,
            opacity: uploading ? 0.65 : 1,
          },
        ]}
        onPress={() => pick(false)}
        disabled={uploading}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="image-multiple-outline" size={18} color={theme.primary} />
        <Text style={[styles.photoBtnText, { color: theme.primary }]}>Choose from Gallery</Text>
      </TouchableOpacity>
    </View>
  );
}



function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const { theme } = useTheme();

  // ── Boolean (Yes/No, OK/Not OK, Cleaned/Not Cleaned) ────────────────────
  if (field.type === 'boolean') {
    const labels = field.boolLabels ?? ['Yes', 'No', 'N/A'];
    return (
      <View style={styles.boolRow}>
        {labels.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.boolBtn, {
              backgroundColor: value === opt ? theme.primary : theme.inputBg,
              borderColor:     value === opt ? theme.primary : theme.inputBorder,
            }]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.boolBtnText, { color: value === opt ? '#fff' : theme.textSecondary }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
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
            onPress={() => onChange(opt)}
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

  useEffect(() => {
    const type = templateType === 'logsheet' ? 'logsheet' : 'checklist';
    const tid  = Number(templateId);

    fetchTemplateWithQuestions(type, tid)
      .then((data: any) => {
        const rawQuestions: any[] = Array.isArray(data?.questions) ? data.questions : [];
        const normalized = rawQuestions.map((q, idx) => normalizeField(q, idx));
        setFields(normalized);
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

      if (isSoftRaise) {
        // Submit checklist AND raise a soft service request in one step
        const submission = await submitChecklistAuth({ templateId: tid, assetId: aid, answers: answerArray });
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
        await submitLogsheetAuth({ templateId: tid, assetId: aid, answers: answerArray });
        Alert.alert('Submitted!', 'Your response has been recorded.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
      } else {
        await submitChecklistAuth({ templateId: tid, assetId: aid, answers: answerArray });
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
                    <View style={[styles.fieldCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
                      <View style={styles.fieldHeader}>
                        <Text style={[styles.fieldIdx, { color: theme.textMuted }]}>{idx + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                            {field.label}
                            {field.required ? <Text style={{ color: theme.danger }}> *</Text> : null}
                          </Text>
                          {field.unit ? (
                            <Text style={[styles.fieldUnit, { color: theme.textMuted }]}>Unit: {field.unit}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: theme.primaryBg }]}>
                          <Text style={[styles.typeBadgeText, { color: theme.primary }]}>
                            {field.type === 'boolean'
                              ? (field.boolLabels ? `${field.boolLabels[0]}/${field.boolLabels[1]}` : 'Yes/No')
                              : field.type}
                          </Text>
                        </View>
                      </View>
                      <FieldInput
                        field={field}
                        value={answers[field.id]}
                        onChange={(v) => setAnswer(field.id, v)}
                      />
                      {/* Optional photo attachment for every non-photo field */}
                      {field.type !== 'photo' && (
                        <View style={styles.attachPhotoSection}>
                          <View style={styles.attachPhotoLabel}>
                            <MaterialCommunityIcons name="camera-plus-outline" size={13} color={theme.textSecondary} />
                            <Text style={[styles.attachPhotoText, { color: theme.textSecondary }]}>Attach Photo (optional)</Text>
                          </View>
                          <PhotoInput
                            value={photos[String(field.id)] ?? null}
                            onChange={(v) => setPhotos((prev) => ({ ...prev, [String(field.id)]: v }))}
                          />
                        </View>
                      )}
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
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitText}>{isSoftRaise ? 'Submit Request' : 'Submit'}</Text>
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
  scroll:            { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 120 },

  // Section headers (logsheets with multiple sections)
  sectionHeader:     { marginTop: Spacing.md, marginBottom: -Spacing.xs, paddingHorizontal: Spacing.xs },
  sectionHeaderText: { ...Typography.label, letterSpacing: 0.8 },

  // Field card
  fieldCard:         {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  fieldHeader:       { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, alignItems: 'flex-start' },
  fieldIdx:          { ...Typography.label, width: 22, textAlign: 'center', marginTop: 2 },
  fieldLabel:        { ...Typography.h4 },
  fieldUnit:         { ...Typography.micro, marginTop: 2 },

  // Type badge (shows the input type in the card header)
  typeBadge:         { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  typeBadgeText:     { ...Typography.micro, textTransform: 'lowercase' },

  // Boolean row
  boolRow:           { flexDirection: 'row', gap: Spacing.sm },
  boolBtn:           { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5 },
  boolBtnText:       { ...Typography.label },

  // Select chips (wrapping)
  selectGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optBtn:            { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1.5 },
  optBtnText:        { ...Typography.label },

  // Text / number inputs
  inputWrap:         { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  inputIcon:         { marginRight: Spacing.sm },
  input:             { ...Typography.body, flex: 1 },
  textarea:          { height: 88, textAlignVertical: 'top' },

  // Photo picker
  photoActions:      { flexDirection: 'column', gap: Spacing.sm },
  photoBtn:          {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  photoBtnText:      { ...Typography.label },
  photoPreviewWrap:  { gap: Spacing.sm },
  photoPreview:      {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: '#E2E8F0',
  },
  removePhotoBtn:    {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  removePhotoText:   { ...Typography.label },

  // Empty state
  noFields:          { alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xxl },
  noFieldsText:      { ...Typography.body, textAlign: 'center' },

  // Optional photo attachment section (shown below every non-photo field)
  attachPhotoSection: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  attachPhotoLabel:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: Spacing.sm },
  attachPhotoText:    { ...Typography.micro, fontWeight: '600' },

  // Submit footer
  footer:            { borderTopWidth: 1, padding: Spacing.lg },
  submitBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.md },
  submitText:        { ...Typography.h4, color: '#fff' },
});
