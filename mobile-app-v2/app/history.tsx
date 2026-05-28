import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMySubmissionHistory } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function HistoryScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMySubmissionHistory();
      setItems(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Submission History" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={items.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <EmptyState icon="history" title="No submissions yet" message="Your submitted checklists and logsheets will appear here." />
          ) : items.map((item) => (
            <TouchableOpacity
              key={`${item.type}-${item.id}`}
              style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
              onPress={() => router.push({ pathname: '/submission-detail', params: { type: item.type, id: item.id } })}
              activeOpacity={0.8}
            >
              <View style={[styles.icon, { backgroundColor: item.type === 'logsheet' ? '#F5F3FF' : theme.primaryBg }]}>
                <MaterialCommunityIcons
                  name={item.type === 'logsheet' ? 'table-large' : 'clipboard-check-outline'}
                  size={22}
                  color={item.type === 'logsheet' ? '#7C3AED' : theme.primary}
                />
              </View>
              <View style={styles.body}>
                <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{item.templateName}</Text>
                <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>{item.assetName}</Text>
                <Text style={[styles.date, { color: theme.textMuted }]}>{new Date(item.submittedAt).toLocaleString()}</Text>
              </View>
              <View style={styles.right}>
                <StatusBadge label={item.status ?? 'Submitted'} variant={item.hasFlagged ? 'warning' : 'success'} />
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1 },
  list:  { padding: Spacing.lg, gap: Spacing.md },
  card:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  icon:  { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  body:  { flex: 1, gap: 2 },
  title: { ...Typography.h4 },
  sub:   { ...Typography.bodyS },
  date:  { ...Typography.micro },
  right: { alignItems: 'flex-end', gap: 2 },
});
