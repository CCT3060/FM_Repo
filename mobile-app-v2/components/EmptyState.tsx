import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, Spacing, Radius, Typography } from '../utils/theme';

interface Props {
  icon?: string;
  title?: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export default function EmptyState({ icon = 'inbox-outline', title = 'Nothing here yet', message, action }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: theme.primaryBg }]}>
        <MaterialCommunityIcons name={icon as any} size={40} color={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {message ? <Text style={[styles.msg, { color: theme.textSecondary }]}>{message}</Text> : null}
      {action ? (
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={action.onPress}>
          <Text style={[styles.btnText, { color: theme.textInverse }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  title:    { ...Typography.h3, marginBottom: Spacing.sm, textAlign: 'center' },
  msg:      { ...Typography.body, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 22 },
  btn:      { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md },
  btnText:  { ...Typography.h4 },
});
