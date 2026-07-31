import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity,
  View, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAdditionalRequestServices, raiseAdditionalRequest, type AdditionalRequestService } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

const PRIORITIES = ['Critical', 'High', 'Moderate', 'Low'] as const;

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
  High:     { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
  Moderate: { bg: '#fefce8', text: '#92400e', border: '#fde68a' },
  Low:      { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};

/* ── Inline dropdown component ─────────────────────────────────────────────── */
function DropdownField({ label, value, placeholder, options, onChange }: {
  label: string; value: string; placeholder: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.dropdown, { backgroundColor: theme.inputBg, borderColor: value ? theme.primary : theme.inputBorder }]}
        onPress={() => setOpen(!open)} activeOpacity={0.8}
      >
        <Text style={{ flex: 1, fontSize: 15, color: selected ? theme.inputText : theme.inputPlaceholder }}>
          {selected ? selected.label : placeholder}
        </Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.border, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5 }, android: { elevation: 5 } }) }]}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.menuItem, { borderBottomColor: theme.border, borderBottomWidth: i < options.length - 1 ? 1 : 0, backgroundColor: value === opt.value ? theme.primaryBg : undefined }]}
              onPress={() => { onChange(opt.value); setOpen(false); }} activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, flex: 1, color: value === opt.value ? theme.primary : theme.textPrimary, fontWeight: value === opt.value ? '700' : '500' }}>{opt.label}</Text>
              {value === opt.value && <MaterialCommunityIcons name="check" size={16} color={theme.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AdditionalRequestScreen() {
  const { theme } = useTheme();
  const [services,   setServices]   = useState<AdditionalRequestService[]>([]);
  const [serviceId,  setServiceId]  = useState('');
  const [priority,   setPriority]   = useState('');
  const [remark,     setRemark]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAdditionalRequestServices()
      .then((d) => setServices(d as AdditionalRequestService[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!serviceId) { Alert.alert('Required', 'Please select a service.'); return; }
    if (!priority)  { Alert.alert('Required', 'Please select a priority.'); return; }
    if (!remark.trim()) { Alert.alert('Required', 'Please enter a remark.'); return; }
    setSubmitting(true);
    try {
      await raiseAdditionalRequest({ serviceId: Number(serviceId), priority, remark: remark.trim() });
      Alert.alert('Request Raised', 'Your additional request has been submitted successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const pc = priority ? PRIORITY_COLORS[priority] : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header title="Additional Request" showBack />
      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <DropdownField
            label="Select Service *"
            value={serviceId}
            placeholder="— Select a service —"
            options={services.map((s) => ({ label: s.name, value: String(s.id) }))}
            onChange={setServiceId}
          />

          <DropdownField
            label="Priority *"
            value={priority}
            placeholder="— Select priority —"
            options={(['Critical', 'High', 'Moderate', 'Low'] as const).map((p) => ({ label: p, value: p }))}
            onChange={setPriority}
          />

          {/* Priority colour indicator */}
          {pc && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -Spacing.md, marginBottom: Spacing.lg }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pc.text }} />
              <Text style={{ fontSize: 12, color: pc.text, fontWeight: '700' }}>{priority} priority selected</Text>
            </View>
          )}

          {/* Remark */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Remark *</Text>
          <View style={[styles.textArea, { backgroundColor: theme.inputBg, borderColor: remark ? theme.primary : theme.inputBorder }]}>
            <TextInput
              style={[styles.textAreaInput, { color: theme.inputText }]}
              value={remark}
              onChangeText={setRemark}
              placeholder="Describe the issue in detail…"
              placeholderTextColor={theme.inputPlaceholder}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitText}>Submit Request</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, paddingBottom: 40 },
  label:        { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  dropdown:     { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, minHeight: 50 },
  menu:         { borderRadius: Radius.lg, borderWidth: 1, marginTop: 4, overflow: 'hidden' },
  menuItem:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: Spacing.md },
  textArea:     { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, minHeight: 100, marginBottom: Spacing.lg },
  textAreaInput:{ fontSize: 14, lineHeight: 20, minHeight: 80 },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.lg, borderRadius: Radius.xl },
  submitText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
