import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert, Image, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const _SCREEN_W = Dimensions.get('window').width;
import {
  getSoftRequestById,
  fetchTemplateWithQuestions,
  submitChecklistAuth,
  resolveSoftRequest,
  uploadFile,
} from '../utils/api';
import type { SoftRequest } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

// ─── Field type helpers ───────────────────────────────────────────────────────

function getFieldType(q: any): string {
  const raw = String(q.answerType || q.inputType || 'text').toLowerCase();
  if (['yes_no','yes/no','ok_not_ok','ok/not_ok','cleaned_not_cleaned','cleaned/not_cleaned'].includes(raw)) return 'boolean';
  if (['photo','photo_upload','image'].includes(raw)) return 'photo';
  if (['dropdown','custom_options','single_select'].includes(raw)) return 'select';
  if (['remark','textarea','long_text'].includes(raw)) return 'textarea';
  if (raw === 'number') return 'number';
  return 'text';
}

function getBoolLabels(q: any): string[] {
  const raw = String(q.answerType || q.inputType || '').toLowerCase();
  if (raw.includes('ok_not_ok') || raw.includes('ok/not_ok')) return ['OK', 'Not OK', 'N/A'];
  if (raw.includes('cleaned')) return ['Cleaned', 'Not Cleaned', 'N/A'];
  return ['Yes', 'No', 'N/A'];
}

function parseOptions(q: any): string[] {
  if (!q.options) return [];
  if (Array.isArray(q.options)) return q.options.map(String);
  try {
    const p = JSON.parse(q.options);
    return Array.isArray(p) ? p.map(String) : Array.isArray(p?.options) ? p.options.map(String) : [];
  } catch { return []; }
}

// Parses a raw answer value from the backend into { text, photoUrl }.
// The backend stores answer_json = { value: <answer>, photoUrl?: <url> }.
// Postgres extracts answer_json->>'value' as text, which for object answers
// returns the inner JSON string (e.g. '{"value":null,"photoUrl":"http://..."}').
function parseBeforeEntry(entry: any): { text: string | null; photoUrl: string | null } {
  if (!entry) return { text: null, photoUrl: null };

  const raw = entry.answer ?? entry.optionSelected ?? entry.value ?? entry.answerValue ?? null;

  // Try to parse if raw looks like a JSON string
  let parsed: any = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { parsed = JSON.parse(trimmed); } catch { /* keep as string */ }
    }
  }

  if (parsed === null || parsed === undefined) return { text: null, photoUrl: null };

  // Parsed object — extract value + photoUrl
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    const text     = parsed.value != null ? String(parsed.value).trim() : null;
    const photoUrl = parsed.photoUrl ?? parsed.url ?? parsed.uri ?? null;
    return { text: text || null, photoUrl };
  }

  // Plain string
  const s = String(parsed).trim();
  if (!s) return { text: null, photoUrl: null };
  // Direct photo URL stored as plain string
  if (s.startsWith('http') && /\.(jpe?g|png|gif|webp)/i.test(s)) {
    return { text: null, photoUrl: s };
  }
  return { text: s, photoUrl: null };
}

// ─── Before section (read-only) ───────────────────────────────────────────────
function BeforeSection({ q, beforeAnswers }: { q: any; beforeAnswers: any[] }) {
  // Portal-created templates use string IDs (e.g. "1714464000000-abc12") which cannot
  // be stored in the integer question_id column, so beforeAnswers always has questionId=null.
  // Fall back to matching by question text (which IS stored as NOT NULL).
  const qText = (q.questionText || q.text || '').trim().toLowerCase();
  const entry =
    beforeAnswers.find((a: any) => a.questionId != null && String(a.questionId) === String(q.id)) ??
    beforeAnswers.find((a: any) => a.questionText && a.questionText.trim().toLowerCase() === qText);

  const { text, photoUrl } = parseBeforeEntry(entry);
  const hasContent = text || photoUrl;

  return (
    <View style={bStyles.wrap}>
      <View style={bStyles.labelRow}>
        <MaterialCommunityIcons name="account-clock-outline" size={12} color="#92400E" />
        <Text style={bStyles.label}>Client's Answer</Text>
      </View>
      {!hasContent ? (
        <Text style={[bStyles.value, { color: '#B45309' }]}>No answer provided</Text>
      ) : (
        <>
          {text ? (
            <Text style={[bStyles.value, { color: '#78350F' }]}>{text}</Text>
          ) : null}
          {photoUrl ? (
            <View style={text ? { marginTop: 8 } : undefined}>
              <Image source={{ uri: photoUrl }} style={bStyles.photo} resizeMode="cover" />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const bStyles = StyleSheet.create({
  wrap:     { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 12, marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  label:    { fontSize: 11, fontWeight: '700', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4 },
  value:    { fontSize: 14, fontWeight: '600' },
  photo:    { width: '100%', height: 160, borderRadius: 8 },
});

// ─── Photo picker ─────────────────────────────────────────────────────────────
function PhotoPicker({ value, onChange, uploading, setUploading }: {
  value: string | null; onChange: (v: string | null) => void;
  uploading: boolean; setUploading: (v: boolean) => void;
}) {
  const { theme } = useTheme();

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant permission in settings.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try { onChange(await uploadFile(result.assets[0].uri) as string); }
    catch (err: any) { Alert.alert('Upload Failed', err.message ?? 'Could not upload.'); }
    finally { setUploading(false); }
  };

  if (value) {
    return (
      <View style={ppStyles.wrap}>
        <Image source={{ uri: value }} style={ppStyles.preview} resizeMode="cover" />
        <TouchableOpacity
          style={[ppStyles.removeBtn, { borderColor: theme.danger }]}
          onPress={() => onChange(null)}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
          <Text style={[ppStyles.removeTxt, { color: theme.danger }]}>Remove photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={ppStyles.row}>
      <TouchableOpacity
        style={[ppStyles.btn, { backgroundColor: theme.primary, opacity: uploading ? 0.6 : 1 }]}
        onPress={() => pick(true)} disabled={uploading}
      >
        {uploading
          ? <ActivityIndicator size="small" color="#fff" />
          : <MaterialCommunityIcons name="camera" size={16} color="#fff" />}
        <Text style={ppStyles.btnTxt}>{uploading ? 'Uploading…' : 'Camera'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[ppStyles.btn, { backgroundColor: theme.inputBg, borderWidth: 1.5, borderColor: theme.primary, opacity: uploading ? 0.6 : 1 }]}
        onPress={() => pick(false)} disabled={uploading}
      >
        <MaterialCommunityIcons name="image-multiple-outline" size={16} color={theme.primary} />
        <Text style={[ppStyles.btnTxt, { color: theme.primary }]}>Gallery</Text>
      </TouchableOpacity>
    </View>
  );
}

const ppStyles = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 10 },
  btn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  btnTxt:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  wrap:      { gap: 8 },
  preview:   { width: '100%', height: 180, borderRadius: 10 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  removeTxt: { fontSize: 12, fontWeight: '600' },
});

// ─── After input ──────────────────────────────────────────────────────────────
function AfterInput({ q, value, onChange, photoValue, onPhotoChange, uploading, setUploading }: {
  q: any; value: any; onChange: (v: any) => void;
  photoValue: string | null; onPhotoChange: (v: string | null) => void;
  uploading: boolean; setUploading: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  const type    = getFieldType(q);
  const boolOpts = getBoolLabels(q);
  const selOpts  = parseOptions(q);

  return (
    <View style={aiStyles.wrap}>
      <View style={aiStyles.labelRow}>
        <MaterialCommunityIcons name="account-check-outline" size={12} color="#065F46" />
        <Text style={aiStyles.label}>Your Response</Text>
      </View>

      {type === 'boolean' && (
        <View style={aiStyles.chipRow}>
          {boolOpts.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[aiStyles.chip, {
                backgroundColor: value === opt ? theme.primary : theme.inputBg,
                borderColor: value === opt ? theme.primary : theme.inputBorder,
              }]}
              onPress={() => onChange(opt)}
            >
              <Text style={[aiStyles.chipTxt, { color: value === opt ? '#fff' : theme.textSecondary }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {type === 'select' && selOpts.length > 0 && (
        <View style={aiStyles.chipRow}>
          {selOpts.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[aiStyles.chip, {
                backgroundColor: value === opt ? theme.primary : theme.inputBg,
                borderColor: value === opt ? theme.primary : theme.inputBorder,
              }]}
              onPress={() => onChange(opt)}
            >
              <Text style={[aiStyles.chipTxt, { color: value === opt ? '#fff' : theme.textSecondary }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {(type === 'text' || type === 'textarea' || type === 'number') && (
        <View style={[aiStyles.inputBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <TextInput
            style={[aiStyles.input, type === 'textarea' && aiStyles.multiline, { color: theme.inputText }]}
            value={value ?? ''}
            onChangeText={onChange}
            placeholder={type === 'number' ? 'Enter number' : 'Type your response…'}
            placeholderTextColor={theme.inputPlaceholder}
            keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
            multiline={type === 'textarea'}
            numberOfLines={type === 'textarea' ? 3 : 1}
            textAlignVertical={type === 'textarea' ? 'top' : 'center'}
          />
        </View>
      )}

      {/* Photo field type: primary is photo */}
      {type === 'photo' && (
        <PhotoPicker value={photoValue} onChange={onPhotoChange} uploading={uploading} setUploading={setUploading} />
      )}

      {/* All other types: optional photo attachment */}
      {type !== 'photo' && (
        <View style={aiStyles.photoSection}>
          <View style={aiStyles.photoLabelRow}>
            <MaterialCommunityIcons name="camera-plus-outline" size={13} color={theme.textSecondary} />
            <Text style={[aiStyles.photoLabel, { color: theme.textSecondary }]}>Attach Photo (optional)</Text>
          </View>
          <PhotoPicker value={photoValue} onChange={onPhotoChange} uploading={uploading} setUploading={setUploading} />
        </View>
      )}
    </View>
  );
}

const aiStyles = StyleSheet.create({
  wrap:         { backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#A7F3D0', borderRadius: 10, padding: 12 },
  labelRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  label:        { fontSize: 11, fontWeight: '700', color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip:         { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5 },
  chipTxt:      { fontSize: 13, fontWeight: '700' },
  inputBox:     { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, marginBottom: 8 },
  input:        { fontSize: 14, paddingVertical: 11, minHeight: 44 },
  multiline:    { minHeight: 80, paddingTop: 10 },
  photoSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#D1FAE5' },
  photoLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  photoLabel:   { fontSize: 12, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SoftResolveScreen() {
  const { theme } = useTheme();
  const { requestId, assetId, assetName } = useLocalSearchParams<{
    requestId: string; assetId?: string; assetName: string;
  }>();

  const [request,    setRequest]    = useState<SoftRequest | null>(null);
  const [questions,  setQuestions]  = useState<any[]>([]);
  const [answers,    setAnswers]    = useState<Record<string, any>>({});
  const [photos,     setPhotos]     = useState<Record<string, string | null>>({});
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading,  setUploading]  = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const req = await getSoftRequestById(Number(requestId));
        setRequest(req);
        if (req.templateId) {
          const data: any = await fetchTemplateWithQuestions('checklist', req.templateId).catch(() => null);
          setQuestions(Array.isArray(data?.questions) ? data.questions : []);
        }
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Failed to load request');
        router.back();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [requestId]);

  const beforeAnswers: any[] = Array.isArray((request as any)?.beforeAnswers)
    ? (request as any).beforeAnswers
    : [];

  // Only keep answers where the client actually provided a non-empty value.
  // The submission stores ALL questions (even unanswered ones with null), so we
  // must exclude nulls before filtering the template question list.
  const actuallyAnswered = beforeAnswers.filter((a: any) => {
    const raw = a.answer ?? a.optionSelected ?? a.value ?? null;
    if (raw === null || raw === undefined) return false;
    const s = String(raw).trim();
    return s !== '' && s !== 'null';
  });

  // Filter template questions to only those the client actually answered.
  // This way, if the client filled 2 out of 10 questions, catalyst only sees those 2.
  const answeredIds = new Set(
    actuallyAnswered
      .map((a: any) => (a.questionId != null ? String(a.questionId) : null))
      .filter(Boolean)
  );
  const answeredTexts = new Set(
    actuallyAnswered
      .map((a: any) => a.questionText?.trim().toLowerCase())
      .filter(Boolean)
  );
  const visibleQuestions = questions.filter((q) => {
    const qId   = String(q.id ?? '');
    const qText = (q.questionText || q.text || '').trim().toLowerCase();
    return answeredIds.has(qId) || answeredTexts.has(qText);
  });
  // Fall back to all questions if no matching (e.g. template IDs changed)
  const displayQuestions = visibleQuestions.length > 0 ? visibleQuestions : questions;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let submissionId: number | undefined;

      if (displayQuestions.length > 0) {
        const answerArray = displayQuestions.map((q) => {
          const type     = getFieldType(q);
          const mainVal  = answers[q.id] ?? null;
          const photoUrl = photos[q.id] ?? null;
          const finalVal = type === 'photo'
            ? photoUrl
            : (photoUrl ? { value: mainVal, photoUrl } : mainVal);
          return { questionId: q.id, answer: finalVal };
        });

        const submission: any = await submitChecklistAuth({
          templateId: request!.templateId,
          assetId:    request!.assetId,
          answers:    answerArray,
        });
        submissionId = submission?.submissionId ?? submission?.id ?? undefined;
      }

      await resolveSoftRequest(Number(requestId), submissionId);

      Alert.alert('✓ Resolved', 'The issue has been marked as resolved.', [
        {
          text: 'OK',
          onPress: () => {
            if (assetId) {
              router.replace({ pathname: '/asset-details', params: { assetId } });
            } else {
              router.back();
            }
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to resolve request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Resolve Issue" showBack />
        <View style={styles.loadWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadTxt, { color: theme.textSecondary }]}>Loading checklist…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const reqName = (request as any)?.templateName ?? assetName ?? 'Issue';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.infoLeft}>
          <Text style={[styles.infoTitle, { color: theme.textPrimary }]} numberOfLines={1}>{reqName}</Text>
          {(request as any)?.raisedByName && (
            <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
              {'Raised by '}{(request as any).raisedByName}
              {(request as any).raisedAt
                ? `  ·  ${new Date((request as any).raisedAt).toLocaleDateString()}`
                : ''}
            </Text>
          )}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>OPEN</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {displayQuestions.length === 0 ? (
          actuallyAnswered.length > 0 ? (
            // Client raised the request with answers but template questions unavailable —
            // show their recent response as read-only cards so the catalyst can review it.
            <>
              <View style={[styles.clientResponseBanner, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <MaterialCommunityIcons name="account-clock-outline" size={18} color="#92400E" />
                <Text style={[styles.clientResponseTitle, { color: '#92400E' }]}>
                  Client's Recent Response
                </Text>
              </View>
              {actuallyAnswered.map((ans: any, idx: number) => {
                const { text, photoUrl } = parseBeforeEntry(ans);
                const hasContent = text || photoUrl;
                return (
                  <View key={String(ans.questionId ?? idx)} style={[styles.qCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
                    <View style={styles.qLabelRow}>
                      <View style={[styles.qNum, { backgroundColor: '#D97706' }]}>
                        <Text style={styles.qNumTxt}>{idx + 1}</Text>
                      </View>
                      <Text style={[styles.qLabel, { color: theme.textPrimary }]}>
                        {ans.questionText ?? `Question ${idx + 1}`}
                      </Text>
                    </View>
                    <View style={bStyles.wrap}>
                      <View style={bStyles.labelRow}>
                        <MaterialCommunityIcons name="account-clock-outline" size={12} color="#92400E" />
                        <Text style={bStyles.label}>Client's Answer</Text>
                      </View>
                      {!hasContent ? (
                        <Text style={[bStyles.value, { color: '#B45309' }]}>No answer provided</Text>
                      ) : (
                        <>
                          {text ? <Text style={[bStyles.value, { color: '#78350F' }]}>{text}</Text> : null}
                          {photoUrl ? (
                            <View style={text ? { marginTop: 8 } : undefined}>
                              <Image source={{ uri: photoUrl }} style={bStyles.photo} resizeMode="cover" />
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: theme.surface }]}>
              <MaterialCommunityIcons name="clipboard-alert-outline" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No questions found for this checklist.
              </Text>
            </View>
          )
        ) : (
          displayQuestions.map((q, idx) => {
            const label = q.questionText || q.text || `Question ${idx + 1}`;
            return (
              <View key={String(q.id ?? idx)} style={[styles.qCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
                {/* Question label */}
                <View style={styles.qLabelRow}>
                  <View style={[styles.qNum, { backgroundColor: theme.primary }]}>
                    <Text style={styles.qNumTxt}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.qLabel, { color: theme.textPrimary }]}>
                    {label}
                    {q.isRequired ? <Text style={{ color: theme.danger }}> *</Text> : null}
                  </Text>
                </View>

                {/* Client's answer (before) */}
                <BeforeSection q={q} beforeAnswers={actuallyAnswered} />

                {/* Catalyst's response (after) */}
                <AfterInput
                  q={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  photoValue={photos[q.id] ?? null}
                  onPhotoChange={(v) => setPhotos((prev) => ({ ...prev, [q.id]: v }))}
                  uploading={uploading}
                  setUploading={setUploading}
                />
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.resolveBtn, { backgroundColor: submitting ? '#6B7280' : '#059669' }]}
          onPress={handleSubmit}
          disabled={submitting || uploading}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={22} color="#fff" />
              <Text style={styles.resolveBtnTxt}>Mark as Resolved</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  loadWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadTxt:       { fontSize: 14 },
  infoBanner:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  infoLeft:      { flex: 1, gap: 2 },
  infoTitle:     { fontSize: 15, fontWeight: '700' },
  infoSub:       { fontSize: 12 },
  badge:         { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt:      { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
  scroll:        { padding: Spacing.md, gap: Spacing.md, paddingBottom: 120 },
  qCard:         { borderRadius: Radius.lg, padding: Spacing.md, elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  qLabelRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  qNum:          { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  qNumTxt:       { fontSize: 12, fontWeight: '800', color: '#fff' },
  qLabel:        { fontSize: 13, fontWeight: '400', lineHeight: 20, flex: 1 },
  emptyBox:               { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyText:              { fontSize: 14, textAlign: 'center' },
  clientResponseBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radius.lg, borderWidth: 1, marginBottom: 4 },
  clientResponseTitle:    { fontSize: 13, fontWeight: '700' },
  footer:        { borderTopWidth: 1, padding: Spacing.md, paddingBottom: Spacing.lg },
  resolveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: Radius.lg },
  resolveBtnTxt: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
