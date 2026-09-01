import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  fetchAttendanceToday, submitAttendance,
  fetchCompanyShifts,
  type AttendanceEmployee, type CompanyShift,
} from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

type Mark = 'Present' | 'Absent' | null;

const ALL_SHIFTS = '__all__';

export default function AttendanceMarkScreen() {
  const { theme } = useTheme();
  const today = new Date().toISOString().slice(0, 10);

  const [employees,      setEmployees]      = useState<AttendanceEmployee[]>([]);
  const [marks,          setMarks]          = useState<Record<number, Mark>>({});
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [shifts,         setShifts]         = useState<CompanyShift[]>([]);
  const [selectedShift,  setSelectedShift]  = useState<string>(ALL_SHIFTS);
  const [filterOpen,     setFilterOpen]     = useState(false);

  // Slide-up animation for the filter sheet
  const slideAnim = useRef(new Animated.Value(300)).current;

  const openFilter = () => {
    setFilterOpen(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  };

  const closeFilter = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setFilterOpen(false));
  };

  const selectShift = (value: string) => {
    setSelectedShift(value);
    closeFilter();
  };

  useEffect(() => {
    Promise.all([
      fetchAttendanceToday(),
      fetchCompanyShifts().catch(() => [] as CompanyShift[]),
    ])
      .then(([data, companyShifts]) => {
        setEmployees(data);
        // Only show active shifts in the filter
        setShifts(companyShifts.filter(s => s.status === 'active'));
        const initial: Record<number, Mark> = {};
        for (const emp of data) {
          if (emp.status === 'Present')      initial[emp.employeeId] = 'Present';
          else if (emp.status === 'Absent')  initial[emp.employeeId] = 'Absent';
          else                               initial[emp.employeeId] = null;
        }
        setMarks(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Client-side shift filtering ──────────────────────────────────────────────
  // shiftNames is a comma-separated string from the backend e.g. "Morning, Night"
  const filteredEmployees = selectedShift === ALL_SHIFTS
    ? employees
    : employees.filter((emp) => {
        if (!emp.shiftNames || emp.shiftNames === '—') return false;
        return emp.shiftNames
          .split(',')
          .map(s => s.trim().toLowerCase())
          .includes(selectedShift.toLowerCase());
      });

  const toggle = (id: number, status: Mark) => {
    setMarks((prev) => ({ ...prev, [id]: prev[id] === status ? null : status }));
  };

  const handleSubmit = async () => {
    // Submit marks for ALL employees (across all shifts), not just the filtered view
    const records = employees
      .filter((e) => marks[e.employeeId] !== null && marks[e.employeeId] !== undefined)
      .map((e) => ({ employeeId: e.employeeId, status: marks[e.employeeId] as string }));

    if (!records.length) {
      Alert.alert('Nothing to save', 'Mark at least one employee as Present or Absent.');
      return;
    }
    setSaving(true);
    try {
      await submitAttendance(today, records);
      Alert.alert(
        'Saved',
        `Attendance for ${records.length} employee${records.length !== 1 ? 's' : ''} saved successfully.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Counts reflect the currently visible (filtered) employees
  const presentCount = filteredEmployees.filter((e) => marks[e.employeeId] === 'Present').length;
  const absentCount  = filteredEmployees.filter((e) => marks[e.employeeId] === 'Absent').length;

  // ── Shift filter button rendered in the Header right slot ────────────────────
  const activeShiftName = selectedShift === ALL_SHIFTS
    ? 'All Shifts'
    : (shifts.find(s => s.name === selectedShift)?.name ?? 'All Shifts');

  const filterButton = (
    <TouchableOpacity
      style={[
        styles.filterBtn,
        {
          backgroundColor: selectedShift !== ALL_SHIFTS ? theme.primary : theme.surface,
          borderColor:      selectedShift !== ALL_SHIFTS ? theme.primary : theme.border,
        },
      ]}
      onPress={openFilter}
      activeOpacity={0.75}
    >
      <MaterialCommunityIcons
        name="filter-variant"
        size={14}
        color={selectedShift !== ALL_SHIFTS ? '#fff' : theme.textSecondary}
      />
      <Text
        style={[
          styles.filterBtnText,
          { color: selectedShift !== ALL_SHIFTS ? '#fff' : theme.textSecondary },
        ]}
        numberOfLines={1}
      >
        {activeShiftName}
      </Text>
      <MaterialCommunityIcons
        name="chevron-down"
        size={14}
        color={selectedShift !== ALL_SHIFTS ? '#fff' : theme.textSecondary}
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header title="Mark Attendance" showBack right={filterButton} />

      {/* Date + summary badge */}
      <View style={[styles.dateBadge, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '30' }]}>
        <MaterialCommunityIcons name="calendar-today" size={14} color={theme.primary} />
        <Text style={[styles.dateText, { color: theme.primary }]}>{today}</Text>
        <Text style={[styles.dateSub, { color: theme.primary + '99' }]}>
          · {presentCount} Present · {absentCount} Absent
          {selectedShift !== ALL_SHIFTS ? ` · ${activeShiftName}` : ''}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : filteredEmployees.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-off-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {selectedShift !== ALL_SHIFTS
              ? `No employees found for "${activeShiftName}".`
              : 'No eligible employees found.'}
          </Text>
          {selectedShift !== ALL_SHIFTS && (
            <TouchableOpacity
              style={[styles.clearFilterBtn, { borderColor: theme.primary }]}
              onPress={() => setSelectedShift(ALL_SHIFTS)}
            >
              <Text style={[styles.clearFilterText, { color: theme.primary }]}>Clear filter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {filteredEmployees.map((emp) => {
            const mark = marks[emp.employeeId];
            return (
              <View
                key={emp.employeeId}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                {/* Employee info */}
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                    {emp.fullName}
                  </Text>
                  <View style={styles.meta}>
                    {emp.employeeCode ? (
                      <Text style={[styles.metaText, { color: theme.textMuted }]}>{emp.employeeCode}</Text>
                    ) : null}
                    {emp.shiftNames && emp.shiftNames !== '—' ? (
                      <Text style={[styles.metaText, { color: theme.textMuted }]}>· {emp.shiftNames}</Text>
                    ) : null}
                  </View>
                </View>
                {/* Present / Absent toggles */}
                <View style={styles.toggles}>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      {
                        borderColor:      mark === 'Present' ? '#16a34a' : theme.border,
                        backgroundColor:  mark === 'Present' ? '#dcfce7' : theme.surface,
                      },
                    ]}
                    onPress={() => toggle(emp.employeeId, 'Present')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={mark === 'Present' ? 'check-circle' : 'circle-outline'}
                      size={16}
                      color={mark === 'Present' ? '#16a34a' : theme.textMuted}
                    />
                    <Text style={[styles.toggleText, { color: mark === 'Present' ? '#16a34a' : theme.textSecondary }]}>
                      Present
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      {
                        borderColor:      mark === 'Absent' ? '#dc2626' : theme.border,
                        backgroundColor:  mark === 'Absent' ? '#fee2e2' : theme.surface,
                      },
                    ]}
                    onPress={() => toggle(emp.employeeId, 'Absent')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={mark === 'Absent' ? 'close-circle' : 'circle-outline'}
                      size={16}
                      color={mark === 'Absent' ? '#dc2626' : theme.textMuted}
                    />
                    <Text style={[styles.toggleText, { color: mark === 'Absent' ? '#dc2626' : theme.textSecondary }]}>
                      Absent
                    </Text>
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
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                <Text style={styles.submitText}>Save Attendance</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Shift filter bottom-sheet modal ──────────────────────────────────── */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="none"
        onRequestClose={closeFilter}
      >
        <Pressable style={styles.overlay} onPress={closeFilter}>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.surface, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Sheet handle */}
            <View style={[styles.handle, { backgroundColor: theme.border }]} />

            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Filter by Shift</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* "All Shifts" option */}
              <TouchableOpacity
                style={[
                  styles.shiftOption,
                  {
                    backgroundColor: selectedShift === ALL_SHIFTS ? theme.primaryBg : 'transparent',
                    borderColor:     selectedShift === ALL_SHIFTS ? theme.primary + '40' : theme.border,
                  },
                ]}
                onPress={() => selectShift(ALL_SHIFTS)}
                activeOpacity={0.7}
              >
                <View style={styles.shiftOptionLeft}>
                  <MaterialCommunityIcons name="view-list" size={18} color={selectedShift === ALL_SHIFTS ? theme.primary : theme.textSecondary} />
                  <Text style={[styles.shiftOptionText, { color: selectedShift === ALL_SHIFTS ? theme.primary : theme.textPrimary, fontWeight: selectedShift === ALL_SHIFTS ? '700' : '500' }]}>
                    All Shifts
                  </Text>
                </View>
                {selectedShift === ALL_SHIFTS && (
                  <MaterialCommunityIcons name="check" size={18} color={theme.primary} />
                )}
              </TouchableOpacity>

              {shifts.length === 0 ? (
                <Text style={[styles.noShiftsText, { color: theme.textMuted }]}>No shifts configured for this company.</Text>
              ) : (
                shifts.map((shift) => {
                  const isSelected = selectedShift === shift.name;
                  return (
                    <TouchableOpacity
                      key={shift.id}
                      style={[
                        styles.shiftOption,
                        {
                          backgroundColor: isSelected ? theme.primaryBg : 'transparent',
                          borderColor:     isSelected ? theme.primary + '40' : theme.border,
                        },
                      ]}
                      onPress={() => selectShift(shift.name)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.shiftOptionLeft}>
                        <MaterialCommunityIcons name="clock-time-four-outline" size={18} color={isSelected ? theme.primary : theme.textSecondary} />
                        <View>
                          <Text style={[styles.shiftOptionText, { color: isSelected ? theme.primary : theme.textPrimary, fontWeight: isSelected ? '700' : '500' }]}>
                            {shift.name}
                          </Text>
                          <Text style={[styles.shiftTime, { color: theme.textMuted }]}>
                            {shift.startTime?.slice(0, 5)} – {shift.endTime?.slice(0, 5)}
                          </Text>
                        </View>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons name="check" size={18} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },

  // Date badge
  dateBadge:       { flexDirection: 'row', alignItems: 'center', gap: 6, margin: Spacing.md, marginBottom: 4, padding: 10, borderRadius: Radius.lg, borderWidth: 1 },
  dateText:        { fontSize: 13, fontWeight: '700' },
  dateSub:         { fontSize: 12, flexShrink: 1 },

  // Employee list
  scroll:          { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 20 },
  empty:           { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: Spacing.md },
  emptyText:       { fontSize: 14, textAlign: 'center' },
  clearFilterBtn:  { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  clearFilterText: { fontSize: 13, fontWeight: '700' },

  // Employee row
  row:             { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  info:            { flex: 1, gap: 2 },
  name:            { fontSize: 14, fontWeight: '700' },
  meta:            { flexDirection: 'row', gap: 4 },
  metaText:        { fontSize: 11, fontWeight: '500' },
  toggles:         { flexDirection: 'row', gap: 6 },
  toggleBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.lg, borderWidth: 1.5 },
  toggleText:      { fontSize: 12, fontWeight: '700' },

  // Footer / submit
  footer:          { padding: Spacing.md, borderTopWidth: 1 },
  submitBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.lg, borderRadius: Radius.xl },
  submitText:      { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Header filter button
  filterBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, borderWidth: 1.5, maxWidth: 130 },
  filterBtnText:   { fontSize: 12, fontWeight: '600', flexShrink: 1 },

  // Bottom-sheet modal
  overlay:         { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:           { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 12, maxHeight: '75%' },
  handle:          { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
  sheetTitle:      { fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  shiftOption:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  shiftOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  shiftOptionText: { fontSize: 14 },
  shiftTime:       { fontSize: 11, marginTop: 1 },
  noShiftsText:    { textAlign: 'center', fontSize: 13, paddingVertical: 20 },
});
