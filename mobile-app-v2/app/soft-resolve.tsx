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
  if (raw.includes('ok_not_ok') || raw.includes('ok/not_ok')) return ['OK', 'Not OK'];
  if (raw.includes('cleaned')) return ['Cleaned', 'Not Cleaned'];
  return ['Yes', 'No'];
}

function getBoolOptColors(opt: string, isSelected: boolean): { bg: string; text: string } {
  const lower = opt.toLowerCase().trim();
  const isNegative = lower === 'no' || lower === 'n/a' || lower.startsWith('not ') || lower === 'fail' || lower === 'failed';
  if (isNegative) {
    return { bg: isSelected ? '#dc2626' : '#fee2e2', text: isSelected ? '#fff' : '#dc2626' };
  }
  return { bg: isSelected ? '#16a34a' : '#dcfce7', text: isSelected ? '#fff' : '#16a34a' };
}

function parseOptions(q: any): string[] {
  if (!q.options) return [];
  if (Array.isArray(q.options)) return q.options.map(String);
  try {
    const p = JSON.parse(q.options);
    return Array.isArray(p) ? p.map(String) : Array.isArray(p?.options) ? p.options.map(String) : [];
  } catch { return []; }
}

function parseAnswerEntry(entry: any): { text: string | null; photoUrl: string | null } {
  const rawValue = entry?.answer ?? entry?.optionSelected ?? entry?.value ?? null;
  let text: string | null = null;
  let photoUrl: string | null = null;

  if (rawValue !== null && rawValue !== undefined) {
    const raw = String(rawValue).trim();
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw);
        text = obj?.value != null ? String(obj.value) : null;
        photoUrl = obj?.photoUrl ?? null;
      } catch {
        text = raw || null;
      }
    } else {
      text = raw || null;
    }
  }

  if (!photoUrl && entry?.photoUrl) {
    photoUrl = String(entry.photoUrl);
  }

  return { text, photoUrl };
}

// ─── Photo picker (for photo-type questions) ──────────────────────────────────
function PhotoPicker({ value, onChange, uploading, setUploading }: {
  value: string | null; onChange: (v: string | null) => void;
  uploading: boolean; setUploading: (v: boolean) => void;
}) {
  const { theme } = useTheme();

  const pick = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Permission Required', 'Camera permission is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try { onChange(await uploadFile(result.assets[0].uri) as string); }
    catch (err: any) { Alert.alert('Upload Failed', err.message ?? 'Could not upload.'); }
    finally { setUploading(false); }
  };

  if (value) {
    return (
      <View style={{ gap: 8 }}>
        <Image source={{ uri: value }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" />
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 8, borderColor: theme.danger }}
          onPress={() => onChange(null)}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.danger }}>Remove photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, opacity: uploading ? 0.6 : 1 }, { backgroundColor: theme.primary }]}
      onPress={pick}
      disabled={uploading}
    >
      {uploading
        ? <ActivityIndicator size="small" color="#fff" />
        : <MaterialCommunityIcons name="camera" size={16} color="#fff" />}
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{uploading ? 'Uploading…' : 'Take Photo'}</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SoftResolveScreen() {
  const { theme } = useTheme();
  const { requestId, assetId, assetName, readOnly } = useLocalSearchParams<{
    requestId: string; assetId?: string; assetName: string; readOnly?: string;
  }>();
  const isReadOnly = readOnly === 'true';

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
  const afterAnswers: any[] = Array.isArray((request as any)?.afterAnswers)
    ? (request as any).afterAnswers
    : [];

  const filterNonEmpty = (arr: any[]) => arr.filter((a: any) => {
    const raw = a.answer ?? a.optionSelected ?? a.value ?? null;
    if (raw === null || raw === undefined) return false;
    const s = String(raw).trim();
    return s !== '' && s !== 'null';
  });

  // Only show questions where a raised issue exists (beforeAnswers = client supervisor noted)
  const actuallyAnswered = filterNonEmpty(beforeAnswers); // client raised answers
  const actuallyResolvedAnswered = filterNonEmpty(afterAnswers);

  // Filter template questions to only those with a raised issue
  const visibleQuestions = questions.filter((q) => {
    const qId   = String(q.id ?? '');
    const qText = (q.questionText || q.text || '').trim().toLowerCase();
    return actuallyAnswered.some((a: any) => {
      const matchId   = a.questionId != null && String(a.questionId) === qId;
      const matchText = a.questionText?.trim().toLowerCase() === qText;
      return matchId || matchText;
    });
  });
  // Fallback: derive question list from the raised answers when template not loaded
  const derivedQuestions = actuallyAnswered.map((a: any, idx: number) => ({
    id: a.questionId ?? `derived-${idx}`,
    questionText: a.questionText || `Question ${idx + 1}`,
    inputType: a.inputType || 'text',
    options: [],
    isRequired: false,
  }));
  // In read-only mode, prefer question rows derived from submitted answers when template mapping is unavailable.
  const displayQuestions = visibleQuestions.length > 0
    ? visibleQuestions
    : (derivedQuestions.length > 0 ? derivedQuestions : questions);

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
                ? `  ·  ${new Date((request as any).raisedAt).toLocaleString()}`
                : ''}
            </Text>
          )}
          {isReadOnly && (request as any)?.resolvedByName && (
            <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
              {'Resolved by '}{(request as any).resolvedByName}
              {(request as any).resolvedAt
                ? `  ·  ${new Date((request as any).resolvedAt).toLocaleString()}`
                : ''}
            </Text>
          )}
        </View>
        <View style={[styles.badge, isReadOnly ? { backgroundColor: '#EFF6FF' } : {}]}>
          <Text style={[styles.badgeTxt, isReadOnly ? { color: '#1D4ED8' } : {}]}>
            {isReadOnly ? ((request as any)?.status?.toUpperCase() ?? 'PENDING') : 'OPEN'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Template title */}
        <View style={styles.templateHeader}>
          <Text style={[styles.templateTitle, { color: theme.textPrimary }]}>{reqName}</Text>
        </View>

        {displayQuestions.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface }]}>
            <MaterialCommunityIcons name="clipboard-alert-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No questions found for this checklist.
            </Text>
          </View>
        ) : (
          displayQuestions.map((q, idx) => {
            const label    = q.questionText || q.text || `Question ${idx + 1}`;
            const type     = getFieldType(q);
            const boolOpts = getBoolLabels(q);
            const selOpts  = parseOptions(q);
            const photoVal = photos[q.id] ?? null;

            // Find client supervisor's raised-issue answer
            const beforeEntry = actuallyAnswered.find((a: any) => {
              const matchId   = a.questionId != null && String(a.questionId) === String(q.id ?? '');
              const matchText = a.questionText?.trim().toLowerCase() === (q.questionText || q.text || '').trim().toLowerCase();
              return matchId || matchText;
            });
            const afterEntry = actuallyResolvedAnswered.find((a: any) => {
              const matchId   = a.questionId != null && String(a.questionId) === String(q.id ?? '');
              const matchText = a.questionText?.trim().toLowerCase() === (q.questionText || q.text || '').trim().toLowerCase();
              return matchId || matchText;
            });

            const { text: beforeDisplay, photoUrl: parsedBeforePhotoUrl } = parseAnswerEntry(beforeEntry);
            const { text: afterDisplay, photoUrl: parsedAfterPhotoUrl } = parseAnswerEntry(afterEntry);

            const hasClientRaised = beforeDisplay !== null || parsedBeforePhotoUrl !== null;

            return (
              <View key={String(q.id ?? idx)} style={[styles.fieldCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderColor: theme.border }]}>
                {/* Header row: number + label + camera icon */}
                <View style={styles.fieldHeader}>
                  <View style={[styles.fieldIdxBadge, { backgroundColor: theme.primaryBg }]}>
                    <Text style={[styles.fieldIdxText, { color: theme.primary }]}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]} numberOfLines={4}>
                    {label}
                    {q.isRequired ? <Text style={{ color: theme.danger }}> *</Text> : null}
                  </Text>
                  {/* Camera icon — top-right */}
                  {type !== 'photo' && !isReadOnly && (
                    <TouchableOpacity
                      style={[styles.cameraIconBtn, { backgroundColor: theme.primaryBg }]}
                      onPress={async () => {
                        const perm = await ImagePicker.requestCameraPermissionsAsync();
                        if (perm.status !== 'granted') { Alert.alert('Permission Required', 'Camera permission is required.'); return; }
                        const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
                        if (result.canceled || !result.assets?.[0]?.uri) return;
                        setUploading(true);
                        try { const url = await uploadFile(result.assets[0].uri) as string; setPhotos((prev) => ({ ...prev, [q.id]: url })); }
                        catch (err: any) { Alert.alert('Upload Failed', err.message ?? 'Could not upload.'); }
                        finally { setUploading(false); }
                      }}
                      disabled={uploading}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="camera-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* CLIENT RAISED ISSUE RESPONSE — what the client supervisor noted */}
                {hasClientRaised && (
                  <View style={[styles.beforeBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.beforeLabel, { color: theme.textMuted }]}>RAISED ISSUE</Text>
                    {beforeDisplay && beforeDisplay.startsWith('http') && /\.(jpe?g|png|gif|webp)/i.test(beforeDisplay) ? (
                      <Image source={{ uri: beforeDisplay }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                    ) : (
                      beforeDisplay !== null ? <Text style={[styles.beforeValue, { color: theme.textSecondary }]}>{beforeDisplay}</Text> : null
                    )}
                    {parsedBeforePhotoUrl ? (
                      <Image source={{ uri: parsedBeforePhotoUrl }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                    ) : null}
                  </View>
                )}

                {isReadOnly && (request as any)?.status === 'resolved' && (afterDisplay !== null || parsedAfterPhotoUrl) && (
                  <View style={[styles.beforeBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.beforeLabel, { color: theme.textMuted }]}>SOLVED RESPONSE</Text>
                    {afterDisplay && afterDisplay.startsWith('http') && /\.(jpe?g|png|gif|webp)/i.test(afterDisplay) ? (
                      <Image source={{ uri: afterDisplay }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                    ) : (
                      afterDisplay !== null ? <Text style={[styles.beforeValue, { color: theme.textSecondary }]}>{afterDisplay}</Text> : null
                    )}
                    {parsedAfterPhotoUrl ? (
                      <Image source={{ uri: parsedAfterPhotoUrl }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                    ) : null}
                  </View>
                )}

                {/* Fallback: resolved read-only but no responses stored */}
                {isReadOnly && !hasClientRaised && afterDisplay === null && !parsedAfterPhotoUrl && (
                  <View style={[styles.beforeBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.beforeLabel, { color: theme.textMuted }]}>RESPONSE</Text>
                    <Text style={[styles.beforeValue, { color: theme.textMuted, fontStyle: 'italic' }]}>No response recorded</Text>
                  </View>
                )}

                {/* AFTER section — hidden in read-only mode */}
                {!isReadOnly && (<>
                <Text style={[styles.afterLabel, { color: theme.textMuted }]}>AFTER</Text>

                {/* After — catalyst's answer input */}
                {type === 'boolean' && (
                  <View style={[styles.boolContainer, { backgroundColor: theme.inputBg }]}>
                    {boolOpts.map((opt) => {
                      const { bg, text } = getBoolOptColors(opt, answers[q.id] === opt);
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.boolBtn,
                            { backgroundColor: bg },
                            answers[q.id] === opt && { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
                          ]}
                          onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: prev[q.id] === opt ? null : opt }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.boolBtnText, { color: text, fontWeight: answers[q.id] === opt ? '700' : '500' }]}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {type === 'select' && selOpts.length > 0 && (
                  <View style={styles.selectGrid}>
                    {selOpts.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optBtn, { backgroundColor: answers[q.id] === opt ? theme.primary : theme.inputBg, borderColor: answers[q.id] === opt ? theme.primary : theme.inputBorder }]}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: prev[q.id] === opt ? null : opt }))}
                      >
                        <Text style={[styles.optBtnText, { color: answers[q.id] === opt ? '#fff' : theme.textSecondary }]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {(type === 'text' || type === 'textarea' || type === 'number') && (
                  <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                    <TextInput
                      style={[styles.input, type === 'textarea' && styles.textarea, { color: theme.inputText }]}
                      value={answers[q.id] ?? ''}
                      onChangeText={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      placeholder={type === 'number' ? 'Enter number' : 'Type your response…'}
                      placeholderTextColor={theme.inputPlaceholder}
                      keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
                      multiline={type === 'textarea'}
                      numberOfLines={type === 'textarea' ? 3 : 1}
                      textAlignVertical={type === 'textarea' ? 'top' : 'center'}
                    />
                  </View>
                )}
                {type === 'photo' && (
                  <PhotoPicker value={photoVal} onChange={(v) => setPhotos((prev) => ({ ...prev, [q.id]: v }))} uploading={uploading} setUploading={setUploading} />
                )}

                {/* Photo preview (when taken via camera icon) */}
                {type !== 'photo' && photoVal && (
                  <View style={styles.attachPhotoSection}>
                    <Image source={{ uri: photoVal }} style={styles.photoPreview} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.removePhotoOverlay}
                      onPress={() => setPhotos((prev) => ({ ...prev, [q.id]: null }))}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="close" size={13} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
                </>)}
              </View>
            );
          })
        )}
      </ScrollView>

      {!isReadOnly && (
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
      )}
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
  // Template header
  templateHeader:{ marginBottom: Spacing.sm },
  templateTitle: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  // Field card (matches checklist-entry style)
  fieldCard:     { borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  fieldHeader:   { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, alignItems: 'flex-start' },
  fieldIdxBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  fieldIdxText:  { fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
  fieldLabel:    { fontSize: 13, fontWeight: '500' as const, lineHeight: 19, flex: 1 },
  // Before / After column styles
  beforeBox:     { borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1 },
  beforeLabel:   { fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.8, marginBottom: 4 },
  beforeValue:   { fontSize: 13, fontWeight: '500' as const, lineHeight: 19 },
  afterLabel:    { fontSize: 9, fontWeight: '700' as const, letterSpacing: 0.8, marginBottom: 4 },
  // Camera icon button (top-right)
  cameraIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Boolean
  boolContainer: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md },
  boolBtn:       { flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: 'center' },
  boolBtnActive: {},
  boolBtnText:   { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  // Select
  selectGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  optBtn:        { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  optBtnText:    { fontSize: 11, fontWeight: '400' as const, lineHeight: 16 },
  // Text input
  inputWrap:     { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 1 },
  input:         { fontSize: 12, fontWeight: '300' as const, lineHeight: 18 },
  textarea:      { height: 72, textAlignVertical: 'top' },
  // Photo preview
  attachPhotoSection: { marginTop: Spacing.sm, position: 'relative', alignSelf: 'flex-start' },
  photoPreview:  { width: 90, height: 90, borderRadius: Radius.md, backgroundColor: '#E2E8F0' },
  removePhotoOverlay: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  // Empty
  emptyBox:      { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyText:     { fontSize: 14, textAlign: 'center' },
  // Footer
  footer:        { borderTopWidth: 1, padding: Spacing.md, paddingBottom: Spacing.lg },
  resolveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: Radius.lg },
  resolveBtnTxt: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
