import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, Typography, Spacing } from '../utils/theme';

export default function NotFoundScreen() {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <MaterialCommunityIcons name="map-marker-question-outline" size={72} color={theme.textMuted} />
        <Text style={[styles.code, { color: theme.textMuted }]}>404</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Page Not Found</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>The screen you're looking for doesn't exist.</Text>
        <TouchableOpacity style={[styles.homeBtn, { backgroundColor: theme.primary }]} onPress={() => router.replace('/(tabs)/home')}>
          <MaterialCommunityIcons name="home-outline" size={20} color="#fff" />
          <Text style={styles.homeBtnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  code:       { fontSize: 64, fontWeight: '800', lineHeight: 70 },
  title:      { ...Typography.h2, textAlign: 'center' },
  subtitle:   { ...Typography.body, textAlign: 'center' },
  homeBtn:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: 999, marginTop: Spacing.md },
  homeBtnText:{ ...Typography.h4, color: '#fff' },
});
