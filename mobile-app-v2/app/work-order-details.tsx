import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchWorkOrderById, updateWorkOrderStatus } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge, { statusVariant } from '../components/StatusBadge';

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.row, { borderBottomColor: theme.borderLight }]}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.textPrimary }]}>{String(value)}</Text>
    </View>
  );
}

export default function WorkOrderDetailsScreen() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order,   setOrder]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating,setUpdating]= useState(false);

  useEffect(() => {
    fetchWorkOrderById(Number(orderId))
      .then(setOrder)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      await updateWorkOrderStatus(Number(orderId), status);
      setOrder((prev: any) => ({ ...prev, status }));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setUpdating(false); }
  };

  const canManage = capabilities.isTechnicalSupervisor;
  const canExecute = capabilities.isTechnicalSupervisor || capabilities.isTechnician;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Work Order" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Work Order" showBack />
        <Text style={[styles.error, { color: theme.textSecondary }]}>Work order not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        title={`WO #${order.id}`}
        subtitle={order.title ?? order.description}
        showBack
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          <StatusBadge label={order.status} variant={statusVariant(order.status)} dot />
          {order.priority ? <StatusBadge label={`${order.priority} Priority`} variant={order.priority === 'high' ? 'danger' : order.priority === 'medium' ? 'warning' : 'neutral'} dot={false} /> : null}
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          <InfoRow label="Asset"       value={order.assetName} />
          <InfoRow label="Description" value={order.description} />
          <InfoRow label="Assigned To" value={order.assignedToName ?? order.assignedTo} />
          <InfoRow label="Due Date"    value={order.dueDate ? new Date(order.dueDate).toLocaleDateString() : null} />
          <InfoRow label="Created"     value={order.createdAt ? new Date(order.createdAt).toLocaleDateString() : null} />
          <InfoRow label="Notes"       value={order.notes} />
        </View>

        {/* Actions */}
        {canExecute && order.status !== 'completed' ? (
          <View style={styles.actions}>
            {order.status === 'open' ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.warning }]}
                onPress={() => updateStatus('in_progress')}
                disabled={updating}
              >
                <MaterialCommunityIcons name="play-circle-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Start Work</Text>
              </TouchableOpacity>
            ) : null}
            {order.status === 'in_progress' ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.success }]}
                onPress={() => updateStatus('completed')}
                disabled={updating}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Mark Complete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  statusBanner: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  card:         { borderRadius: Radius.xl, overflow: 'hidden', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1 },
  rowLabel:     { ...Typography.bodyS },
  rowValue:     { ...Typography.body, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  actions:      { gap: Spacing.md },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.lg },
  actionBtnText:{ ...Typography.h4, color: '#fff' },
  error:        { ...Typography.body, textAlign: 'center', marginTop: Spacing.xxl },
});
