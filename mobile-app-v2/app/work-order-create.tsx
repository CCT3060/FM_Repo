import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyTeam, fetchAssets, createWorkOrder } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

const PRIORITIES = ['low', 'medium', 'high'];

export default function WorkOrderCreateScreen() {
  const { theme } = useTheme();
  const [team,       setTeam]       = useState<any[]>([]);
  const [assets,     setAssets]     = useState<any[]>([]);
  const [title,      setTitle]      = useState('');
  const [desc,       setDesc]       = useState('');
  const [selAsset,   setSelAsset]   = useState<any>(null);
  const [selUser,    setSelUser]    = useState<any>(null);
  const [priority,   setPriority]   = useState('medium');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.allSettled([fetchMyTeam(), fetchAssets()])
      .then(([t, a]) => {
        if (t.status === 'fulfilled') setTeam(t.value as any[]);
        if (a.status === 'fulfilled') setAssets(a.value as any[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!title.trim())  { Alert.alert('Required', 'Enter a title.'); return; }
    if (!selAsset)      { Alert.alert('Required', 'Select an asset.'); return; }

    setSubmitting(true);
    try {
      await createWorkOrder({ title: title.trim(), description: desc.trim(), assetId: selAsset.id, assignedTo: selUser?.id ?? null, priority });
      Alert.alert('Work Order Created', 'The work order has been created.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Create Work Order" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Create Work Order" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Title */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Title</Text>
        <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <TextInput
            style={[styles.input, { color: theme.inputText }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Replace air filter"
            placeholderTextColor={theme.inputPlaceholder}
          />
        </View>

        {/* Description */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Description</Text>
        <View style={[styles.textArea, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <TextInput
            style={[styles.textAreaInput, { color: theme.inputText }]}
            value={desc}
            onChangeText={setDesc}
            placeholder="Describe the work to be done…"
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Priority */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.priorityBtn, {
                backgroundColor: priority === p ? (p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success) : theme.surface,
                borderColor: p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success,
              }]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.priorityText, { color: priority === p ? '#fff' : (p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success) }]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Asset */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Asset</Text>
        {assets.slice(0, 15).map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.selectRow, { backgroundColor: selAsset?.id === a.id ? theme.primaryBg : theme.surface, borderColor: selAsset?.id === a.id ? theme.primary : theme.border, shadowColor: theme.cardShadow }]}
            onPress={() => setSelAsset(a)}
          >
            <MaterialCommunityIcons name="package-variant" size={20} color={selAsset?.id === a.id ? theme.primary : theme.textMuted} />
            <Text style={[styles.selName, { color: theme.textPrimary, flex: 1 }]} numberOfLines={1}>{a.name}</Text>
            {selAsset?.id === a.id ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.primary} /> : null}
          </TouchableOpacity>
        ))}

        {/* Assign to */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Assign To (Optional)</Text>
        {team.length === 0 && (
          <Text style={[{ color: theme.textMuted, marginBottom: Spacing.sm, fontSize: 13 }]}>No team members assigned to you. Work order will be unassigned.</Text>
        )}
        {team.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.selectRow, { backgroundColor: selUser?.id === m.id ? theme.primaryBg : theme.surface, borderColor: selUser?.id === m.id ? theme.primary : theme.border, shadowColor: theme.cardShadow }]}
            onPress={() => setSelUser(m)}
          >
            <View style={[styles.avatar, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{(m.fullName ?? 'U').charAt(0)}</Text>
            </View>
            <Text style={[styles.selName, { color: theme.textPrimary, flex: 1 }]}>{m.fullName}</Text>
            {selUser?.id === m.id ? <MaterialCommunityIcons name="check-circle" size={18} color={theme.primary} /> : null}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: submitting ? theme.textMuted : theme.primary }]}
          onPress={handleCreate}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#fff" />
              <Text style={styles.createBtnText}>Create Work Order</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  scroll:        { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  label:         { ...Typography.label, letterSpacing: 0.5 },
  inputWrap:     { borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 52, justifyContent: 'center' },
  input:         { ...Typography.body },
  textArea:      { borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md },
  textAreaInput: { ...Typography.body, minHeight: 90 },
  priorityRow:   { flexDirection: 'row', gap: Spacing.sm },
  priorityBtn:   { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5 },
  priorityText:  { ...Typography.label },
  selectRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
  selName:       { ...Typography.body, fontWeight: '500' },
  avatar:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { ...Typography.label },
  createBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.lg, marginTop: Spacing.md },
  createBtnText: { ...Typography.h3, color: '#fff' },
});
