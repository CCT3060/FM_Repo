import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMySubmissionDetail } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';

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
          {detail.hasFlagged ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Status</Text>
              <StatusBadge label="Has Flags" variant="warning" />
            </View>
          ) : null}
        </View>

        {/* Answers */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RESPONSES</Text>
        {answers.map((a, idx) => (
          <View key={a.questionId ?? idx} style={[styles.answerCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderLeftColor: a.flagged ? theme.warning : theme.border, borderLeftWidth: a.flagged ? 4 : 1 }]}>
            <Text style={[styles.question, { color: theme.textSecondary }]}>{a.label ?? a.question}</Text>
            <Text style={[styles.answer, { color: a.flagged ? theme.warning : theme.textPrimary }]}>
              {String(a.value ?? '—')}
            </Text>
            {a.flagged ? (
              <Text style={[styles.flagNote, { color: theme.warning }]}>⚠ Value out of range</Text>
            ) : null}
          </View>
        ))}
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
});
