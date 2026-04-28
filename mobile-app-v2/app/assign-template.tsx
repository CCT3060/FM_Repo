import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyTeam, fetchUnassignedTemplates, assignTemplate } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function AssignTemplateScreen() {
  const { theme } = useTheme();
  const [team,       setTeam]       = useState<any[]>([]);
  const [templates,  setTemplates]  = useState<any[]>([]);
  const [selUser,    setSelUser]    = useState<any>(null);
  const [selTpl,     setSelTpl]     = useState<any>(null);
  const [frequency,  setFrequency]  = useState('daily');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.allSettled([fetchMyTeam(), fetchUnassignedTemplates()])
      .then(([t, tp]) => {
        if (t.status  === 'fulfilled') setTeam(t.value as any[]);
        if (tp.status === 'fulfilled') setTemplates(tp.value as any[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selUser || !selTpl) {
      Alert.alert('Required', 'Select a team member and a template.');
      return;
    }
    setSubmitting(true);
    try {
      await assignTemplate({ templateId: selTpl.id, templateType: selTpl.type ?? 'checklist', userId: selUser.id, frequency });
      Alert.alert('Assigned', `${selTpl.name} assigned to ${selUser.fullName}.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Assign Template" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Assign Template" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Team member */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TEAM MEMBER</Text>
        {team.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.selectRow, { borderColor: selUser?.id === m.id ? theme.primary : theme.border, backgroundColor: selUser?.id === m.id ? theme.primaryBg : theme.surface, shadowColor: theme.cardShadow }]}
            onPress={() => setSelUser(m)}
          >
            <View style={[styles.avatar, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{(m.fullName ?? 'U').charAt(0)}</Text>
            </View>
            <Text style={[styles.selName, { color: theme.textPrimary }]}>{m.fullName}</Text>
            {selUser?.id === m.id ? <MaterialCommunityIcons name="check-circle" size={20} color={theme.primary} /> : null}
          </TouchableOpacity>
        ))}

        {/* Template */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>TEMPLATE</Text>
        {templates.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.selectRow, { borderColor: selTpl?.id === t.id ? theme.primary : theme.border, backgroundColor: selTpl?.id === t.id ? theme.primaryBg : theme.surface, shadowColor: theme.cardShadow }]}
            onPress={() => setSelTpl(t)}
          >
            <MaterialCommunityIcons
              name={t.type === 'logsheet' ? 'table-large' : 'clipboard-check-outline'}
              size={22}
              color={selTpl?.id === t.id ? theme.primary : theme.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.selName, { color: theme.textPrimary }]}>{t.name}</Text>
              <Text style={[styles.selSub, { color: theme.textMuted }]}>{t.assetName}</Text>
            </View>
            {selTpl?.id === t.id ? <MaterialCommunityIcons name="check-circle" size={20} color={theme.primary} /> : null}
          </TouchableOpacity>
        ))}

        {/* Frequency */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>FREQUENCY</Text>
        <View style={styles.freqRow}>
          {['daily', 'weekly', 'monthly'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.freqBtn, { backgroundColor: frequency === f ? theme.primary : theme.surface, borderColor: frequency === f ? theme.primary : theme.border }]}
              onPress={() => setFrequency(f)}
            >
              <Text style={[styles.freqText, { color: frequency === f ? '#fff' : theme.textSecondary }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.assignBtn, { backgroundColor: submitting ? theme.textMuted : theme.primary }]}
          onPress={handleAssign}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="clipboard-plus-outline" size={20} color="#fff" />
              <Text style={styles.assignBtnText}>Assign Template</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  sectionTitle: { ...Typography.label, letterSpacing: 1 },
  selectRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
  avatar:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { ...Typography.h4 },
  selName:      { ...Typography.body, fontWeight: '500', flex: 1 },
  selSub:       { ...Typography.micro },
  freqRow:      { flexDirection: 'row', gap: Spacing.sm },
  freqBtn:      { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5 },
  freqText:     { ...Typography.label },
  assignBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.lg, marginTop: Spacing.md },
  assignBtnText:{ ...Typography.h4, color: '#fff' },
});
