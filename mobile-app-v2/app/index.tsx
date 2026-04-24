import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { verifyCompanyCode, getStoredUser, getStoredCompany } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius, Colors } from '../utils/theme';

export default function CompanyCodeScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    (async () => {
      const user    = await getStoredUser();
      const company = await getStoredCompany();
      if (user && company) {
        setUser(user);
        router.replace('/(tabs)/home');
      } else if (company) {
        router.replace({ pathname: '/login', params: { companyId: String(company.companyId), companyName: company.companyName } });
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (!code.trim()) return;
    setVerifying(true);
    try {
      const company = await verifyCompanyCode(code.trim().toUpperCase());
      router.replace({ pathname: '/login', params: { companyId: String(company.companyId), companyName: company.companyName } });
    } catch (err: any) {
      Alert.alert('Invalid Code', err.message ?? 'Please check the company code and try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadWrap, { backgroundColor: theme.primary }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: theme.primary }]}>
              <MaterialCommunityIcons name="cog-outline" size={36} color="#fff" />
            </View>
            <Text style={[styles.appName, { color: theme.textPrimary }]}>FM App</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>Facility Management</Text>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Enter Company Code</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Contact your administrator for your company's access code.
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="office-building-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.inputText }]}
                value={code}
                onChangeText={setCode}
                placeholder="e.g. ACME2024"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleVerify}
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: verifying || !code.trim() ? theme.textMuted : theme.primary }]}
              onPress={handleVerify}
              disabled={verifying || !code.trim()}
              activeOpacity={0.85}
            >
              {verifying
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Continue</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={[styles.footer, { color: theme.textMuted }]}>
            Powered by Catalyst Solutions
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  flex:      { flex: 1 },
  loadWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  header:    { alignItems: 'center', marginBottom: Spacing.xxl },
  logoWrap:  { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  appName:   { ...Typography.h1, marginBottom: 4 },
  tagline:   { ...Typography.body },
  card:      { borderRadius: Radius.xl, padding: Spacing.xl, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 8, marginBottom: Spacing.xl },
  cardTitle: { ...Typography.h3, marginBottom: Spacing.sm },
  cardSub:   { ...Typography.body, marginBottom: Spacing.xl },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 52 },
  inputIcon: { marginRight: Spacing.sm },
  input:     { flex: 1, ...Typography.body, letterSpacing: 2 },
  btn:       { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText:   { ...Typography.h4, color: '#fff' },
  footer:    { ...Typography.micro, textAlign: 'center' },
});
