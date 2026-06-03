import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Dimensions, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { loginEmployee, clearStoredCompany } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_MAX = Math.min(SCREEN_W - Spacing.xl * 2, 440);

export default function LoginScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const { companyId, companyName } = useLocalSearchParams<{ companyId: string; companyName: string }>();

  const [employeeId,  setEmployeeId]  = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [keepSigned,  setKeepSigned]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);

  const pwdRef = useRef<TextInput>(null);

  // // Check biometric availability on mount
  // useEffect(() => {
  //   (async () => {
  //     const compatible = await LocalAuthentication.hasHardwareAsync();
  //     const enrolled   = await LocalAuthentication.isEnrolledAsync();
  //     setHasBiometric(compatible && enrolled);
  //   })();
  // }, []);

  const handleLogin = async () => {
    if (!employeeId.trim() || !password) {
      Alert.alert('Required', 'Please enter your employee ID and password.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await loginEmployee(Number(companyId), employeeId.trim(), password);
      setUser(user);
      // Dynamic import so expo-notifications never loads in Expo Go
      if (Constants.appOwnership !== 'expo') {
        void import('../utils/notifications').then(m => m.registerForPushNotifications());
      }
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  {/*const handleBiometric = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in with biometrics',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        // Biometric succeeded — if we have stored credentials use them,
        // otherwise prompt user to sign in with password first.
        Alert.alert(
          'Biometric Verified',
          'Please sign in with your Employee ID and password once to enable biometric sign-in.',
        );
      }
    } catch {
      Alert.alert('Biometric Error', 'Could not authenticate. Please try again.');
    }
  }, []);
*/}
  const handleChangeCompany = useCallback(async () => {
    // Clear stored company so index.tsx does NOT auto-redirect back to this login screen
    await clearStoredCompany();
    router.replace('/');
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ─── Top nav bar ─────────────────────────────────────── */}
          <View style={[styles.topBar, { width: CARD_MAX }]}>
            <TouchableOpacity onPress={handleChangeCompany} style={styles.backBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={theme.primary} />
              <Text style={[styles.backText, { color: theme.primary }]}>Change Company</Text>
            </TouchableOpacity>
            <View style={[styles.companyPill, { backgroundColor: theme.primaryBg }]}>
              <MaterialCommunityIcons name="office-building" size={14} color={theme.primary} />
              <Text style={[styles.companyPillText, { color: theme.primary }]} numberOfLines={1}>
                {companyName ?? 'Company'}
              </Text>
            </View>
          </View>

          {/* ─── Heading ─────────────────────────────────────────── */}
          <View style={[styles.headingWrap, { width: CARD_MAX }]}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Welcome back</Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>Sign in with your employee credentials</Text>
          </View>

          {/* ─── Form card ───────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, width: CARD_MAX }]}>

            {/* Employee ID */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Employee ID</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.inputText }]}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="Enter your ID"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            {/* Password label row */}
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
              {/* <TouchableOpacity hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot?</Text>
              </TouchableOpacity> */}
            </View>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={pwdRef}
                style={[styles.input, { color: theme.inputText }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••••"
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <MaterialCommunityIcons
                  name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Keep me signed in */}
            <TouchableOpacity onPress={() => setKeepSigned(!keepSigned)} style={styles.checkRow} activeOpacity={0.7}>
              <View style={[styles.checkbox, { borderColor: keepSigned ? theme.primary : theme.inputBorder, backgroundColor: keepSigned ? theme.primary : 'transparent' }]}>
                {keepSigned && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
              </View>
              <Text style={[styles.checkText, { color: theme.textSecondary }]}>Keep me signed in</Text>
            </TouchableOpacity>

            {/* Sign In button */}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? theme.textMuted : theme.primary }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>Sign In</Text>
                  <MaterialCommunityIcons name="login" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            {/* Biometric divider + button */}
            {/* {hasBiometric && (
              <>
                <View style={styles.divider}>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.divText, { color: theme.textMuted }]}>Or use biometric</Text>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                </View>
                <TouchableOpacity
                  style={[styles.biometricBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={handleBiometric}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="fingerprint" size={22} color={theme.textSecondary} />
                  <Text style={[styles.biometricText, { color: theme.textSecondary }]}>Biometric Sign In</Text>
                </TouchableOpacity>
              </>
            )} */}
          </View>

          {/* ─── Footer ──────────────────────────────────────────── */}
          <View style={[styles.footerWrap, { width: CARD_MAX }]}>
            <Text style={[styles.footerHelp, { color: theme.textSecondary }]}>
              Need help?{' '}
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Contact Facility IT Support</Text>
            </Text>
            <Text style={[styles.footerCopy, { color: theme.textMuted }]}>
              © {new Date().getFullYear()} Catalyst Service Solutions. All rights reserved.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  flex:          { flex: 1 },
  scroll:        { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl, gap: Spacing.md },

  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText:      { fontSize: 14, fontWeight: '600' },
  companyPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
  companyPillText: { fontSize: 13, fontWeight: '700', maxWidth: 130 },

  headingWrap:   {},
  title:         { fontSize: 28, fontWeight: '800', color: '#1a237e', marginBottom: 4 },
  sub:           { fontSize: 14, color: '#475569' },

  card:          { borderRadius: Radius.xl, padding: Spacing.xl, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 10 },
  label:         { ...Typography.label, marginBottom: Spacing.xs },
  labelRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  forgotText:    { fontSize: 13, fontWeight: '700' },
  inputWrap:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 52 },
  inputIcon:     { marginRight: Spacing.sm },
  input:         { flex: 1, fontSize: 15 },

  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.lg },
  checkbox:      { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText:     { fontSize: 14 },

  btn:           { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  btnInner:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText:       { fontSize: 16, fontWeight: '700', color: '#fff' },

  divider:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  divLine:       { flex: 1, height: 1 },
  divText:       { fontSize: 12 },

  biometricBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: Radius.md, borderWidth: 1.5 },
  biometricText: { fontSize: 15, fontWeight: '600' },

  footerWrap:    { alignItems: 'center', gap: 4, paddingTop: Spacing.sm },
  footerHelp:    { fontSize: 13, textAlign: 'center' },
  footerCopy:    { fontSize: 11, textAlign: 'center' },
});
