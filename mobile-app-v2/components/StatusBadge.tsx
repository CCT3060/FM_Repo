import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANTS: Record<Variant, { bg: keyof ReturnType<typeof useTheme>['theme']; color: keyof ReturnType<typeof useTheme>['theme'] }> = {
  success: { bg: 'successBg', color: 'success' },
  warning: { bg: 'warningBg', color: 'warning' },
  danger:  { bg: 'dangerBg',  color: 'danger'  },
  info:    { bg: 'infoBg',    color: 'info'    },
  neutral: { bg: 'surfaceAlt', color: 'textSecondary' },
};

interface Props {
  label: string;
  variant?: Variant;
  dot?: boolean;
}

export default function StatusBadge({ label, variant = 'neutral', dot = true }: Props) {
  const { theme } = useTheme();
  const v = VARIANTS[variant];
  const bg    = theme[v.bg as keyof typeof theme] as string;
  const color = theme[v.color as keyof typeof theme] as string;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

export function statusVariant(status: string): Variant {
  const s = status?.toLowerCase() ?? '';
  if (['completed', 'resolved', 'done', 'active', 'open'].includes(s)) return 'success';
  if (['pending', 'in_progress', 'in-progress', 'assigned'].includes(s))  return 'warning';
  if (['failed', 'overdue', 'rejected', 'closed'].includes(s))            return 'danger';
  if (['info', 'review'].includes(s))                                      return 'info';
  return 'neutral';
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  text:  { ...Typography.label },
});
