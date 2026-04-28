import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyWarnings } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';

export default function WarningsScreen() {
  const { theme } = useTheme();
  const [warnings, setWarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyWarnings();
      setWarnings(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Warnings" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={warnings.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {warnings.length === 0 ? (
            <EmptyState icon="check-circle-outline" title="No warnings" message="You have no flagged submissions. Keep up the good work!" />
          ) : warnings.map((w) => (
            <View
              key={w.id}
              style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderLeftColor: theme.warning, borderLeftWidth: 4 }]}
            >
              <View style={styles.cardTop}>
                <MaterialCommunityIcons name="alert" size={20} color={theme.warning} />
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{w.message ?? w.warning}</Text>
              </View>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                {w.templateName} · {w.assetName}
              </Text>
              <Text style={[styles.cardDate, { color: theme.textMuted }]}>
                {new Date(w.createdAt ?? w.raisedAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  list:      { padding: Spacing.lg, gap: Spacing.md },
  card:      { borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3, gap: Spacing.sm },
  cardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { ...Typography.h4, flex: 1 },
  cardMeta:  { ...Typography.bodyS },
  cardDate:  { ...Typography.micro },
});
