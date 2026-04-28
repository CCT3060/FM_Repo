import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { resolveSoftRequest } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function SoftResolveScreen() {
  const { theme } = useTheme();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleResolve = async () => {
    if (!notes.trim()) {
      Alert.alert('Required', 'Please add resolution notes before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await resolveSoftRequest(Number(requestId), {
        answers: [{ questionId: 'resolution_notes', value: notes.trim() }],
      });
      Alert.alert('Resolved', 'The issue has been marked as resolved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to resolve request.');
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Resolve Issue" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoCard, { backgroundColor: theme.primaryBg }]}>
          <MaterialCommunityIcons name="information-outline" size={20} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.primary }]}>
            Add your resolution notes before marking this request as resolved.
          </Text>
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Resolution Notes</Text>
        <View style={[styles.textArea, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <TextInput
            style={[styles.textAreaInput, { color: theme.inputText }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Describe what was done to resolve this issue…"
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[styles.resolveBtn, { backgroundColor: submitting ? theme.textMuted : theme.success }]}
          onPress={handleResolve}
          disabled={submitting}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  scroll:        { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  infoCard:      { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', padding: Spacing.lg, borderRadius: Radius.lg },
  infoText:      { ...Typography.body, flex: 1 },
  label:         { ...Typography.label, letterSpacing: 0.5 },
  textArea:      { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md },
  textAreaInput: { ...Typography.body, minHeight: 130 },
  resolveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, height: 56, borderRadius: Radius.lg },
  resolveBtnText:{ ...Typography.h3, color: '#fff' },
});
