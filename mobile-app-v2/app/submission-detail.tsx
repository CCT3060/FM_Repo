import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMySubmissionDetail } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';

function AnswerValue({ answer }: { answer: any }) {
  const { theme } = useTheme();

  // Backend stores answers as { value: <answer>, photoUrl?: <url> } JSON objects.
  // These arrive as either a parsed object or a raw JSON string — handle both.
  let raw = answer.value ?? answer.answer ?? null;
  let photoUrl: string | null = answer.photoUrl ?? null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        raw      = parsed.value ?? parsed.answer ?? null;
        photoUrl = photoUrl ?? parsed.photoUrl ?? parsed.url ?? null;
      } catch { /* keep raw as-is */ }
    }
  } else if (raw && typeof raw === 'object') {
    photoUrl = photoUrl ?? (raw as any).photoUrl ?? (raw as any).url ?? null;
    raw      = (raw as any).value ?? (raw as any).answer ?? null;
  }

  const str = raw != null && raw !== '' ? String(raw) : null;

  // Detect photo URLs in value itself
  const valIsPhoto = str && /^https?:\/\/.+\.(jpe?g|png|gif|webp)/i.test(str);
  const displayPhoto = photoUrl ?? (valIsPhoto ? str : null);

  if (displayPhoto) {
    return (
      <View>
        {str && !valIsPhoto && (
          <Text style={[styles.answer, { color: answer.flagged ? theme.warning : theme.textPrimary }]}>
            {str}
          </Text>
        )}
        <TouchableOpacity onPress={() => Linking.openURL(displayPhoto)} activeOpacity={0.85}>
          <Image source={{ uri: displayPhoto }} style={styles.photoThumb} resizeMode="cover" />
          <Text style={[styles.photoCaption, { color: theme.textMuted }]}>Tap to open full image</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <Text style={[styles.answer, { color: answer.flagged ? theme.warning : theme.textPrimary }]}>
      {valIsPhoto ? null : (str || '—')}
    </Text>
  );
}

export default function SubmissionDetailScreen() {
  const { theme } = useTheme();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMySubmissionDetail(type, Number(id))
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Submission" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Submission" showBack />
        <Text style={[styles.error, { color: theme.textSecondary }]}>Submission not found.</Text>
      </SafeAreaView>
    );
  }

  const answers: any[] = detail.answers ?? detail.fields ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={detail.templateName ?? 'Submission'} subtitle={detail.assetName} showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Meta */}
        <View style={[styles.metaCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Submitted</Text>
            <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{new Date(detail.submittedAt).toLocaleString()}</Text>
          </View>
          {(detail.submittedByName || detail.submittedBy) ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Submitted By</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{detail.submittedByName ?? detail.submittedBy}</Text>
            </View>
          ) : null}
          {detail.hasFlagged ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Status</Text>
              <StatusBadge label="Has Flags" variant="warning" />
            </View>
          ) : null}
          {(detail.locationAddress || (detail.latitude && detail.longitude)) ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Location</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]} numberOfLines={2}>
                {detail.locationAddress
                  ? detail.locationAddress
                  : `${Number(detail.latitude).toFixed(5)}, ${Number(detail.longitude).toFixed(5)}`}
              </Text>
            </View>
          ) : null}
          {detail.deviceIp ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Device IP</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{detail.deviceIp}</Text>
            </View>
          ) : null}
        </View>

        {/* Answers */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RESPONSES</Text>
        {answers.map((a, idx) => (
          <View key={a.questionId ?? a.question ?? idx} style={[styles.answerCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderLeftColor: a.flagged ? theme.warning : theme.border, borderLeftWidth: a.flagged ? 4 : 1 }]}>
            <Text style={[styles.question, { color: theme.textSecondary }]}>{a.label ?? a.question ?? a.questionText}</Text>
            <AnswerValue answer={a} />
            {a.flagged ? (
              <Text style={[styles.flagNote, { color: theme.warning }]}>⚠ Value out of range</Text>
            ) : null}
          </View>
        ))}
        {detail.overallRemark ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OVERALL REMARK</Text>
            <View style={[styles.answerCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderLeftColor: theme.border, borderLeftWidth: 1 }]}>
              <Text style={[styles.answer, { color: theme.textPrimary }]}>{detail.overallRemark}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  metaCard:     { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  metaRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel:    { ...Typography.bodyS },
  metaValue:    { ...Typography.body },
  sectionTitle: { ...Typography.label, letterSpacing: 1 },
  answerCard:   { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2, gap: Spacing.xs },
  question:     { ...Typography.bodyS },
  answer:       { ...Typography.h4 },
  flagNote:     { ...Typography.micro },
  error:        { ...Typography.body, textAlign: 'center', marginTop: Spacing.xxl },
  photoThumb:   { width: '100%', height: 160, borderRadius: Radius.md, marginTop: 4 },
  photoCaption: { ...Typography.micro, marginTop: 4, textAlign: 'center' },
});
