import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity,
  View, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssets, raiseSoftRequest } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function SoftRaiseScreen() {
  const { theme } = useTheme();
  const [assets,      setAssets]      = useState<any[]>([]);
  const [asset,       setAsset]       = useState<any>(null);
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    fetchAssets().then((data) => setAssets(data as any[])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!asset) { Alert.alert('Required', 'Please select an asset.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'Please describe the issue.'); return; }

    setSubmitting(true);
    try {
      await raiseSoftRequest({
        assetId: asset.id,
        templateId: 0,
        answers: [{ questionId: 'description', value: description.trim() }],
      });
      Alert.alert('Request Raised', 'Your issue has been submitted successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to submit request.');
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header title="Raise Issue" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Asset selector */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Select Asset</Text>
        {assets.slice(0, 20).map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.assetRow, {
              backgroundColor: asset?.id === a.id ? theme.primaryBg : theme.surface,
              borderColor: asset?.id === a.id ? theme.primary : theme.border,
              shadowColor: theme.cardShadow,
            }]}
            onPress={() => setAsset(a)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="package-variant" size={20} color={asset?.id === a.id ? theme.primary : theme.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>{a.assetName ?? a.name}</Text>
              <Text style={[styles.assetId, { color: theme.textMuted }]}>{a.assetUniqueId ?? a.uniqueId}</Text>
            </View>
            {asset?.id === a.id ? <MaterialCommunityIcons name="check-circle" size={20} color={theme.primary} /> : null}
          </TouchableOpacity>
        ))}

        {/* Description */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Describe the Issue</Text>
        <View style={[styles.textArea, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <TextInput
            style={[styles.textAreaInput, { color: theme.inputText }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in detail…"
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: submitting ? theme.textMuted : theme.danger }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>Submit Issue</Text>
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
  scroll:        { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  label:         { ...Typography.label, letterSpacing: 0.5 },
  assetRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
  assetName:     { ...Typography.body, fontWeight: '500' },
  assetId:       { ...Typography.micro },
  textArea:      { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md },
  textAreaInput: { ...Typography.body, minHeight: 100 },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg, marginTop: Spacing.md },
  submitText:    { ...Typography.h4, color: '#fff' },
});
