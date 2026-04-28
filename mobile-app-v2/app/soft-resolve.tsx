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
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
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

function getBoolLabels(q: any): [string, string, string] {
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

// ─── Before cell (read-only: client supervisor's answer) ─────────────────────

function BeforeCell({ q, beforeAnswers }: { q: any; beforeAnswers: any[] }) {
  const { theme } = useTheme();
  const entry = beforeAnswers.find((a: any) => String(a.questionId) === String(q.id));
  const val   = entry?.answer ?? entry?.value ?? null;

  if (val && typeof val === 'string' && val.startsWith('http') && /\.(jpe?g|png|gif|webp)/i.test(val)) {
    return (
      <View style={bStyles.photoWrap}>
        <Image source={{ uri: val }} style={bStyles.photo} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={[bStyles.cell, { backgroundColor: theme.inputBg }]}>
      <Text style={[bStyles.cellText, { color: val ? theme.textPrimary : theme.textMuted }]} numberOfLines={4}>
        {val ?? '—'}
      </Text>
    </View>
  );
}

const bStyles = StyleSheet.create({
  cell:      { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 8 },
  cellText:  { fontSize: 13, fontWeight: '500' },
  photoWrap: { borderRadius: 8, overflow: 'hidden', marginTop: 4 },
  photo:     { width: '100%', height: 100 },
});

// ─── After input (catalyst fills in) ─────────────────────────────────────────

function AfterInput({
  type, boolLabels, options, value, onChange, uploading, setUploading,
}: {
  type: string; boolLabels: [string, string, string]; options: string[];
  value: any; onChange: (v: any) => void; uploading: boolean; setUploading: (v: boolean) => void;
}) {
  const { theme } = useTheme();

  const pickPhoto = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Permission Required', 'Please grant permission in settings.'); return; }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try { onChange(await uploadFile(result.assets[0].uri)); }
    catch (err: any) { Alert.alert('Upload Failed', err.message ?? 'Could not upload.'); }
    finally { setUploading(false); }
  };

  if (type === 'boolean') {
    return (
      <View style={aStyles.boolRow}>
        {boolLabels.map((opt) => (
          <TouchableOpacity key={opt}
            style={[aStyles.boolBtn, { backgroundColor: value === opt ? theme.primary : theme.inputBg, borderColor: value === opt ? theme.primary : theme.inputBorder }]}
            onPress={() => onChange(opt)}>
            <Text style={[aStyles.boolText, { color: value === opt ? '#fff' : theme.textSecondary }]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (type === 'select' && options.length > 0) {
    return (
      <View style={aStyles.selectWrap}>
        {options.map((opt) => (
          <TouchableOpacity key={opt}
            style={[aStyles.optBtn, { backgroundColor: value === opt ? theme.primary : theme.inputBg, borderColor: value === opt ? theme.primary : theme.inputBorder }]}
            onPress={() => onChange(opt)}>
            <Text style={[aStyles.optText, { color: value === opt ? '#fff' : theme.textSecondary }]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (type === 'photo') {
    if (value) {
      return (
        <View>
          <Image source={{ uri: value }} style={aStyles.photo} resizeMode="cover" />
          <TouchableOpacity style={[aStyles.removeBtn, { borderColor: theme.danger }]} onPress={() => onChange(null)}>
            <Text style={[aStyles.removeBtnText, { color: theme.danger }]}>Remove</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={aStyles.photoRow}>
        <TouchableOpacity style={[aStyles.photoBtn, { backgroundColor: theme.primary, opacity: uploading ? 0.6 : 1 }]} onPress={() => pickPhoto(true)} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="camera" size={15} color="#fff" />}
          <Text style={aStyles.photoBtnText}>{uploading ? '…' : 'Camera'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[aStyles.photoBtn, { backgroundColor: theme.inputBg, borderWidth: 1.5, borderColor: theme.primary, opacity: uploading ? 0.6 : 1 }]} onPress={() => pickPhoto(false)} disabled={uploading}>
          <MaterialCommunityIcons name="image-multiple-outline" size={15} color={theme.primary} />
          <Text style={[aStyles.photoBtnText, { color: theme.primary }]}>Gallery</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[aStyles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
      <TextInput
        style={[aStyles.input, type === 'textarea' ? aStyles.textarea : null, { color: theme.inputText }]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={type === 'number' ? 'Enter value' : 'Enter response'}
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
        multiline={type === 'textarea'}
        numberOfLines={type === 'textarea' ? 3 : 1}
        textAlignVertical={type === 'textarea' ? 'top' : 'center'}
      />
    </View>
  );
}

const aStyles = StyleSheet.create({
  boolRow:      { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  boolBtn:      { flex: 1, minWidth: 44, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: 'center' },
  boolText:     { fontSize: 11, fontWeight: '700' },
  selectWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  optBtn:       { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  optText:      { fontSize: 11, fontWeight: '600' },
  photo:        { width: '100%', height: 100, borderRadius: 8 },
  removeBtn:    { marginTop: 4, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  removeBtnText:{ fontSize: 12, fontWeight: '600' },
  photoRow:     { flexDirection: 'row', gap: 5 },
  photoBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 8 },
  photoBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  inputWrap:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10 },
  input:        { fontSize: 13, paddingVertical: 10, minHeight: 44 },
  textarea:     { minHeight: 64, paddingTop: 8 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SoftResolveScreen() {
  const { theme } = useTheme();
  const { requestId, assetName } = useLocalSearchParams<{ requestId: string; assetName: string }>();

  const [request,    setRequest]    = useState<SoftRequest | null>(null);
  const [questions,  setQuestions]  = useState<any[]>([]);
  const [answers,    setAnswers]    = useState<Record<string, any>>({});
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

  const beforeAnswers: any[] = (request as any)?.beforeAnswers ?? [];

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answerArray = questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? null }));
      const submission: any = await submitChecklistAuth({
        templateId: request!.templateId,
        assetId:    request!.assetId,
        answers:    answerArray,
      });
      const submissionId: number | undefined = submission?.submissionId ?? submission?.id ?? undefined;
      await resolveSoftRequest(Number(requestId), submissionId);
      Alert.alert('Resolved!', 'The issue has been marked as resolved.', [
        { text: 'OK', onPress: () => router.back() },
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
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Resolve Issue" subtitle={assetName ?? undefined} showBack />

      {/* Before / After column labels */}
      <View style={styles.colHeaderBar}>
        <View style={[styles.colHeader, { backgroundColor: '#FEF3C7', flex: 1 }]}>
          <MaterialCommunityIcons name="account-clock-outline" size={13} color="#92400E" />
          <Text style={[styles.colHeaderText, { color: '#92400E' }]}>BEFORE (Client)</Text>
        </View>
        <View style={{ width: 9 }} />
        <View style={[styles.colHeader, { backgroundColor: '#D1FAE5', flex: 1 }]}>
          <MaterialCommunityIcons name="account-check-outline" size={13} color="#065F46" />
          <Text style={[styles.colHeaderText, { color: '#065F46' }]}>AFTER (Your Response)</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {questions.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface }]}>
            <MaterialCommunityIcons name="clipboard-alert-outline" size={40} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No questions found for this checklist.</Text>
          </View>
        ) : (
          questions.map((q, idx) => {
            const type       = getFieldType(q);
            const boolLabels = getBoolLabels(q);
            const options    = parseOptions(q);
            const label      = q.questionText || q.text || `Question ${idx + 1}`;
            return (
              <View key={String(q.id ?? idx)} style={[styles.qCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
                <Text style={[styles.qLabel, { color: theme.textPrimary }]}>
                  <Text style={{ color: theme.textMuted }}>{idx + 1}. </Text>
                  {label}
                  {q.isRequired ? <Text style={{ color: theme.danger }}> *</Text> : null}
                </Text>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <BeforeCell q={q} beforeAnswers={beforeAnswers} />
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.col}>
                    <AfterInput
                      type={type} boolLabels={boolLabels} options={options}
                      value={answers[q.id]}
                      onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      uploading={uploading} setUploading={setUploading}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.resolveBtn, { backgroundColor: submitting ? theme.textMuted : '#059669' }]}
          onPress={handleSubmit}
          disabled={submitting || uploading}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={22} color="#fff" />
                <Text style={styles.resolveBtnText}>Mark as Resolved</Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  colHeaderBar:  { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: 0 },
  colHeader:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  colHeaderText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scroll:        { padding: Spacing.md, gap: Spacing.md, paddingBottom: 120 },
  qCard:         { borderRadius: Radius.lg, padding: Spacing.md, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 5, elevation: 3 },
  qLabel:        { fontSize: 14, fontWeight: '600', marginBottom: Spacing.sm },
  twoCol:        { flexDirection: 'row', gap: 0, alignItems: 'flex-start' },
  col:           { flex: 1 },
  divider:       { width: 1, alignSelf: 'stretch', backgroundColor: '#E2E8F0', marginHorizontal: 6 },
  emptyBox:      { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyText:     { fontSize: 14, textAlign: 'center' },
  footer:        { borderTopWidth: 1, padding: Spacing.lg },
  resolveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, height: 56, borderRadius: Radius.lg },
  resolveBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },
});
