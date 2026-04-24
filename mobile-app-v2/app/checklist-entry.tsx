import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { submitChecklist, submitLogsheet, fetchAssetByQR } from '../utils/api';
import { useTheme, Typography, Spacing, Radius, Colors } from '../utils/theme';
import Header from '../components/Header';
import { getIsOnline } from '../utils/networkStatus';

type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'textarea';

interface Field {
  id: number | string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  unit?: string;
  minValue?: number;
  maxValue?: number;
  flagOnOutOfRange?: boolean;
}

function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const { theme } = useTheme();

  if (field.type === 'boolean') {
    return (
      <View style={styles.boolRow}>
        {(['Yes', 'No', 'N/A'] as const).map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.boolBtn, {
              backgroundColor: value === opt ? theme.primary : theme.inputBg,
              borderColor: value === opt ? theme.primary : theme.inputBorder,
            }]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.boolBtnText, { color: value === opt ? '#fff' : theme.textSecondary }]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optScroll}>
        {field.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optBtn, {
              backgroundColor: value === opt ? theme.primary : theme.inputBg,
              borderColor: value === opt ? theme.primary : theme.inputBorder,
            }]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optBtnText, { color: value === opt ? '#fff' : theme.textSecondary }]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
      <TextInput
        style={[styles.input, { color: theme.inputText }, field.type === 'textarea' && { height: 80, textAlignVertical: 'top' }]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={field.type === 'number' ? `Enter value${field.unit ? ` (${field.unit})` : ''}` : 'Enter response'}
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
        multiline={field.type === 'textarea'}
        numberOfLines={field.type === 'textarea' ? 3 : 1}
      />
    </View>
  );
}

export default function ChecklistEntryScreen() {
  const { theme } = useTheme();
  const { assetId, templateId, templateType, templateName, assetName, assignmentId } =
    useLocalSearchParams<{ assetId: string; templateId: string; templateType: string; templateName: string; assetName: string; assignmentId: string }>();

  const [fields,    setFields]    = useState<Field[]>([]);
  const [answers,   setAnswers]   = useState<Record<string, any>>({});
  const [loading,   setLoading]   = useState(true);
  const [submitting,setSubmitting]= useState(false);

  useEffect(() => {
    // templateType tells us which array to search in the QR response
    fetchAssetByQR(Number(assetId))
      .then((data: any) => {
        const templates =
          templateType === 'logsheet'
            ? (data?.logsheetTemplates ?? [])
            : (data?.checklistTemplates ?? []);
        const tpl = templates.find((t: any) => String(t.id) === String(templateId));
        const rawFields = tpl?.questions ?? tpl?.fields ?? tpl?.columns ?? [];
        setFields(rawFields);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId, templateId, templateType]);

  const setAnswer = (fieldId: string | number, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    // Validate required fields
    const missing = fields.filter((f) => f.required && !answers[f.id]);
    if (missing.length > 0) {
      Alert.alert('Required Fields', `Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const answerArray = fields.map((f) => ({
        questionId: f.id,
        value: answers[f.id] ?? null,
      }));

      const isOffline = !getIsOnline();

      if (templateType === 'logsheet') {
        await submitLogsheet(Number(assetId), Number(templateId), answerArray);
      } else {
        await submitChecklist(Number(assetId), Number(templateId), answerArray, isOffline);
      }

      Alert.alert(
        isOffline ? 'Saved Offline' : 'Submitted!',
        isOffline ? 'Saved locally. Will sync when you reconnect.' : 'Your response has been recorded.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        title={templateName ?? 'Checklist'}
        subtitle={assetName}
        showBack
      />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {fields.length === 0 ? (
              <View style={styles.noFields}>
                <MaterialCommunityIcons name="clipboard-alert-outline" size={48} color={theme.textMuted} />
                <Text style={[styles.noFieldsText, { color: theme.textSecondary }]}>
                  No fields found for this template. Contact your administrator.
                </Text>
              </View>
            ) : fields.map((field, idx) => (
              <View key={String(field.id ?? field.questionId ?? field.question ?? idx)} style={[styles.fieldCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldIdx, { color: theme.textMuted }]}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                      {field.label}
                      {field.required ? <Text style={{ color: theme.danger }}> *</Text> : null}
                    </Text>
                    {field.unit ? <Text style={[styles.fieldUnit, { color: theme.textMuted }]}>Unit: {field.unit}</Text> : null}
                  </View>
                </View>
                <FieldInput field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: submitting ? theme.textMuted : theme.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                    <Text style={styles.submitText}>Submit</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  fieldCard:   { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  fieldHeader: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md, alignItems: 'flex-start' },
  fieldIdx:    { ...Typography.label, width: 24, textAlign: 'center', marginTop: 2 },
  fieldLabel:  { ...Typography.h4 },
  fieldUnit:   { ...Typography.micro, marginTop: 2 },
  inputWrap:   { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  input:       { ...Typography.body },
  boolRow:     { flexDirection: 'row', gap: Spacing.sm },
  boolBtn:     { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5 },
  boolBtnText: { ...Typography.label },
  optScroll:   { marginHorizontal: -2 },
  optBtn:      { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1.5, marginHorizontal: 2 },
  optBtnText:  { ...Typography.label },
  footer:      { borderTopWidth: 1, padding: Spacing.lg },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.md },
  submitText:  { ...Typography.h4, color: '#fff' },
  noFields:    { alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xxl },
  noFieldsText:{ ...Typography.body, textAlign: 'center', color: undefined },
});
