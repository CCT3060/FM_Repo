import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing } from '../utils/theme';

export default function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.text, { color: theme.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  text: { ...Typography.body },
});
