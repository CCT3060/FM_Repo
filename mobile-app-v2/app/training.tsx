import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyTrainings } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge, { statusVariant } from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function TrainingScreen() {
  const { theme } = useTheme();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyTrainings();
      setTrainings(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Training (OJT)" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={trainings.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {trainings.length === 0 ? (
            <EmptyState icon="school-outline" title="No trainings assigned" message="Your assigned OJT training modules will appear here." />
          ) : trainings.map((t) => {
            const progress = t.modulesCompleted && t.totalModules
              ? Math.round((t.modulesCompleted / t.totalModules) * 100)
              : 0;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
                onPress={() => router.push({ pathname: '/training-detail', params: { trainingId: t.id } })}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.icon, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="school-outline" size={24} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{t.title}</Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{t.totalModules ?? 0} modules</Text>
                  </View>
                  <StatusBadge label={t.status ?? 'Assigned'} variant={statusVariant(t.status ?? 'assigned')} />
                </View>
                {/* Progress bar */}
                <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: '#059669', width: `${progress}%` as any }]} />
                </View>
                <Text style={[styles.progressText, { color: theme.textMuted }]}>{progress}% complete</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  list:         { padding: Spacing.lg, gap: Spacing.md },
  card:         { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3, gap: Spacing.md },
  cardHeader:   { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  icon:         { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { ...Typography.h4 },
  cardSub:      { ...Typography.bodyS, marginTop: 2 },
  progressBg:   { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { ...Typography.micro },
});
