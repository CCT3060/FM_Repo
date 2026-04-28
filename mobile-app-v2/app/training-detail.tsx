import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchTrainingById, startTraining, completeTrainingModule } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function TrainingDetailScreen() {
  const { theme } = useTheme();
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const [training, setTraining] = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(false);

  useEffect(() => {
    fetchTrainingById(Number(trainingId))
      .then(setTraining)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trainingId]);

  const handleStart = async () => {
    setActing(true);
    try {
      await startTraining(Number(trainingId));
      setTraining((prev: any) => ({ ...prev, status: 'in_progress' }));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setActing(false); }
  };

  const handleComplete = async (moduleId: number) => {
    setActing(true);
    try {
      await completeTrainingModule(Number(trainingId), { moduleId });
      setTraining((prev: any) => ({
        ...prev,
        modules: prev.modules?.map((m: any) => m.id === moduleId ? { ...m, completed: true } : m),
      }));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setActing(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Training" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (!training) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Training" showBack />
        <Text style={[styles.error, { color: theme.textSecondary }]}>Training not found.</Text>
      </SafeAreaView>
    );
  }

  const modules: any[] = training.modules ?? [];
  const completedCount = modules.filter((m) => m.completed).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={training.title} showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
          <MaterialCommunityIcons name="school" size={36} color="rgba(255,255,255,0.9)" />
          <Text style={styles.heroTitle}>{training.title}</Text>
          <Text style={styles.heroSub}>{completedCount}/{modules.length} modules complete</Text>
          <View style={[styles.progressBg, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
            <View style={[styles.progressFill, { width: `${modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0}%` as any }]} />
          </View>
        </View>

        {/* Start button if not started */}
        {training.status === 'assigned' ? (
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: theme.success }]}
            onPress={handleStart}
            disabled={acting}
          >
            {acting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="play-circle-outline" size={22} color="#fff" />
                <Text style={styles.startBtnText}>Start Training</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Modules list */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>MODULES</Text>
        {modules.map((m, idx) => (
          <View
            key={m.id}
            style={[styles.moduleCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderLeftColor: m.completed ? theme.success : theme.border, borderLeftWidth: 4 }]}
          >
            <View style={styles.moduleHeader}>
              <View style={[styles.moduleNum, { backgroundColor: m.completed ? theme.successBg : theme.primaryBg }]}>
                {m.completed
                  ? <MaterialCommunityIcons name="check" size={16} color={theme.success} />
                  : <Text style={[styles.moduleNumText, { color: theme.primary }]}>{idx + 1}</Text>
                }
              </View>
              <Text style={[styles.moduleTitle, { color: theme.textPrimary }]}>{m.title}</Text>
            </View>
            {m.description ? <Text style={[styles.moduleSub, { color: theme.textSecondary }]}>{m.description}</Text> : null}
            {!m.completed && training.status === 'in_progress' ? (
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: theme.successBg }]}
                onPress={() => handleComplete(m.id)}
                disabled={acting}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.success} />
                <Text style={[styles.completeBtnText, { color: theme.success }]}>Mark Complete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1 },
  scroll:           { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  heroCard:         { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md, alignItems: 'center' },
  heroTitle:        { ...Typography.h3, color: '#fff', textAlign: 'center' },
  heroSub:          { ...Typography.body, color: 'rgba(255,255,255,0.8)' },
  progressBg:       { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:     { height: 6, borderRadius: 3, backgroundColor: '#fff' },
  startBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.lg },
  startBtnText:     { ...Typography.h4, color: '#fff' },
  sectionTitle:     { ...Typography.label, letterSpacing: 1 },
  moduleCard:       { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  moduleHeader:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  moduleNum:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  moduleNumText:    { ...Typography.label },
  moduleTitle:      { ...Typography.h4, flex: 1 },
  moduleSub:        { ...Typography.bodyS },
  completeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
  completeBtnText:  { ...Typography.label },
  error:            { ...Typography.body, textAlign: 'center', marginTop: Spacing.xxl },
});
