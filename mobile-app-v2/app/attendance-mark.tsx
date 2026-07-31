import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity,
  View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAttendanceToday, submitAttendance, type AttendanceEmployee } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

type Mark = 'Present' | 'Absent' | null; // null = leave unchanged

export default function AttendanceMarkScreen() {
  const { theme } = useTheme();
  const today = new Date().toISOString().slice(0, 10);

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [marks,     setMarks]     = useState<Record<number, Mark>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    fetchAttendanceToday()
      .then((data) => {
        setEmployees(data);
        // Pre-populate marks with existing DB status — only Present/Absent; others leave as null
        const initial: Record<number, Mark> = {};
        for (const emp of data) {
          if (emp.status === 'Present') initial[emp.employeeId] = 'Present';
          else if (emp.status === 'Absent') initial[emp.employeeId] = 'Absent';
          else initial[emp.employeeId] = null; // Half Day / Leave / etc — don't pre-select
        }
        setMarks(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: number, status: Mark) => {
    setMarks((prev) => ({ ...prev, [id]: prev[id] === status ? null : status }));
  };

  const handleSubmit = async () => {
    const records = employees
      .filter((e) => marks[e.employeeId] !== null && marks[e.employeeId] !== undefined)
      .map((e) => ({ employeeId: e.employeeId, status: marks[e.employeeId] as string }));

    if (!records.length) { Alert.alert('Nothing to save', 'Mark at least one employee as Present or Absent.'); return; }

    setSaving(true);
    try {
      await submitAttendance(today, records);
      Alert.alert('Saved', `Attendance for ${records.length} employee${records.length !== 1 ? 's' : ''} saved successfully.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const presentCount = employees.filter((e) => marks[e.employeeId] === 'Present').length;
  const absentCount  = employees.filter((e) => marks[e.employeeId] === 'Absent').length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header title="Mark Attendance" showBack />

      {/* Date badge */}
      <View style={[styles.dateBadge, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '30' }]}>
        <MaterialCommunityIcons name="calendar-today" size={14} color={theme.primary} />
        <Text style={[styles.dateText, { color: theme.primary }]}>{today}</Text>
        <Text style={[styles.dateSub, { color: theme.primary + '99' }]}>· {presentCount} Present · {absentCount} Absent</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : employees.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-off-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No eligible employees found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {employees.map((emp) => {
            const mark = marks[emp.employeeId];
            return (
              <View key={emp.employeeId} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {/* Employee info */}
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>{emp.fullName}</Text>
                  <View style={styles.meta}>
                    {emp.employeeCode ? <Text style={[styles.metaText, { color: theme.textMuted }]}>{emp.employeeCode}</Text> : null}
                    {emp.shiftNames && emp.shiftNames !== '—' ? (
                      <Text style={[styles.metaText, { color: theme.textMuted }]}>· {emp.shiftNames}</Text>
                    ) : null}
                  </View>
                </View>
                {/* Present / Absent toggles */}
                <View style={styles.toggles}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, { borderColor: mark === 'Present' ? '#16a34a' : theme.border, backgroundColor: mark === 'Present' ? '#dcfce7' : theme.surface }]}
                    onPress={() => toggle(emp.employeeId, 'Present')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name={mark === 'Present' ? 'check-circle' : 'circle-outline'} size={16} color={mark === 'Present' ? '#16a34a' : theme.textMuted} />
                    <Text style={[styles.toggleText, { color: mark === 'Present' ? '#16a34a' : theme.textSecondary }]}>Present</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, { borderColor: mark === 'Absent' ? '#dc2626' : theme.border, backgroundColor: mark === 'Absent' ? '#fee2e2' : theme.surface }]}
                    onPress={() => toggle(emp.employeeId, 'Absent')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name={mark === 'Absent' ? 'close-circle' : 'circle-outline'} size={16} color={mark === 'Absent' ? '#dc2626' : theme.textMuted} />
                    <Text style={[styles.toggleText, { color: mark === 'Absent' ? '#dc2626' : theme.textSecondary }]}>Absent</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {!loading && employees.length > 0 && (
        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSubmit} disabled={saving} activeOpacity={0.8}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                <Text style={styles.submitText}>Save Attendance</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  dateBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, margin: Spacing.md, marginBottom: 4, padding: 10, borderRadius: Radius.lg, borderWidth: 1 },
  dateText:    { fontSize: 13, fontWeight: '700' },
  dateSub:     { fontSize: 12 },
  scroll:      { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 20 },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: Spacing.md },
  emptyText:   { fontSize: 14, textAlign: 'center' },
  row:         { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  info:        { flex: 1, gap: 2 },
  name:        { fontSize: 14, fontWeight: '700' },
  meta:        { flexDirection: 'row', gap: 4 },
  metaText:    { fontSize: 11, fontWeight: '500' },
  toggles:     { flexDirection: 'row', gap: 6 },
  toggleBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  toggleText:  { fontSize: 12, fontWeight: '700' },
  footer:      { padding: Spacing.md, borderTopWidth: 1 },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.lg, borderRadius: Radius.xl },
  submitText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
