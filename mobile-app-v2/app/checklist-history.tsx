import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchChecklistHistory } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

export default function ChecklistHistoryScreen() {
  const { theme } = useTheme();
  const [items,      setItems]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchChecklistHistory();
      setItems(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Checklist History" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={items.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <EmptyState icon="clipboard-text-outline" title="No history yet" message="Completed checklist submissions will appear here." />
          ) : items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
              onPress={() => router.push({ pathname: '/submission-detail', params: { type: item.type ?? 'checklist', id: item.id } })}
              activeOpacity={0.8}
            >
              <View style={[styles.iconBg, { backgroundColor: theme.primaryBg }]}>
                <MaterialCommunityIcons
                  name={item.type === 'logsheet' ? 'table-large' : 'clipboard-check-outline'}
                  size={22}
                  color={theme.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.templateName}</Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{item.assetName}</Text>
                <Text style={[styles.cardTime, { color: theme.textMuted }]}>{new Date(item.submittedAt).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <StatusBadge label={item.hasFlagged ? 'Flagged' : 'OK'} variant={item.hasFlagged ? 'warning' : 'success'} />
                <Text style={[styles.userName, { color: theme.textMuted }]}>{item.submittedBy}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1 },
  list:     { padding: Spacing.lg, gap: Spacing.md },
  card:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  iconBg:   { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle:{ ...Typography.h4 },
  cardSub:  { ...Typography.bodyS, marginTop: 2 },
  cardTime: { ...Typography.micro, marginTop: 4 },
  userName: { ...Typography.micro },
});
