import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchNotifications();
      setItems(data as any[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        title="Notifications"
        showBack
        right={
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : error ? (
        <EmptyState icon="alert-circle-outline" title="Could not load notifications" message={error} />
      ) : (
        <ScrollView
          contentContainerStyle={items.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <EmptyState icon="bell-outline" title="No notifications" message="You're all caught up!" />
          ) : items.map((n) => {
            const isChecklistReminder = n.type === 'checklist_reminder';
            const cardBg = isChecklistReminder && !n.isRead ? '#fffbeb' : n.isRead ? theme.surface : theme.primaryBg;
            const cardBorder = isChecklistReminder && !n.isRead ? '#fde68a' : n.isRead ? theme.border : (theme.primaryLight ?? theme.primary) + '40';
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder, shadowColor: theme.cardShadow }]}
                onPress={async () => {
                  if (!n.isRead) {
                    await markNotificationRead(n.id);
                    setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, isRead: true } : i));
                  }
                  if (n.targetScreen) router.push(n.targetScreen);
                }}
                activeOpacity={0.8}
              >
                {!n.isRead ? <View style={[styles.dot, { backgroundColor: isChecklistReminder ? '#d97706' : theme.primary }]} /> : null}
                <View style={{ flex: 1 }}>
                  {isChecklistReminder && (
                    <View style={styles.typeBadge}>
                      <MaterialCommunityIcons name="clipboard-clock-outline" size={11} color="#92400e" />
                      <Text style={styles.typeBadgeText}>Checklist Reminder</Text>
                    </View>
                  )}
                  <Text style={[styles.title, { color: theme.textPrimary, fontWeight: n.isRead ? '400' : '600' }]} numberOfLines={2}>{n.title ?? n.message}</Text>
                  {n.body ? <Text style={[styles.body, { color: theme.textSecondary }]}>{n.body}</Text> : null}
                  <Text style={[styles.time, { color: theme.textMuted }]}>{new Date(n.createdAt).toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  markAll:       { ...Typography.label },
  list:          { padding: Spacing.lg, gap: Spacing.sm },
  card:          { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  dot:           { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  title:         { ...Typography.body },
  body:          { ...Typography.bodyS, marginTop: 2 },
  time:          { ...Typography.micro, marginTop: Spacing.sm },
  typeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
});
