import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Alert, Dimensions, Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { loginEmployee } from '../utils/api';
import { registerForPushNotifications } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_MAX = Math.min(SCREEN_W - Spacing.xl * 2, 440);

export default function LoginScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const { companyId, companyName } = useLocalSearchParams<{ companyId: string; companyName: string }>();

  const [employeeId, setEmployeeId] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);

  const pwdRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!employeeId.trim() || !password) {
      Alert.alert('Required', 'Please enter your employee ID and password.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await loginEmployee(Number(companyId), employeeId.trim(), password);
      setUser(user);
      void registerForPushNotifications();
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          {/* Catalyst Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../assets/images/catalyst-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Catalyst Solutions logo"
            />
          </View>

          {/* Change Company */}
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.backRow}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.textSecondary} />
            <Text style={[styles.backText, { color: theme.textSecondary }]}>Change Company</Text>
          </TouchableOpacity>

          {/* Company badge */}
          <View style={[styles.companyBadge, { backgroundColor: theme.primaryBg }]}>
            <MaterialCommunityIcons name="office-building" size={16} color={theme.primary} />
            <Text style={[styles.companyName, { color: theme.primary }]} numberOfLines={1}>
              {companyName ?? 'Unknown Company'}
            </Text>
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>Welcome back</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>Sign in with your employee credentials</Text>

          {/* Form card */}
          <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, width: CARD_MAX }]}>
            {/* Employee ID */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Employee ID</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.inputText }]}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="Enter your employee ID"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            {/* Password */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={pwdRef}
                style={[styles.input, { color: theme.inputText }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
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

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? theme.textMuted : theme.primary }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Sign In</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={[styles.footer, { color: theme.textMuted }]}>
            Powered by Catalyst Solutions
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  flex:         { flex: 1 },
  scroll:       { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, paddingBottom: Spacing.xxl },
  logoWrap:     { marginBottom: Spacing.lg, alignItems: 'center' },
  logo:         { width: 160, height: 70 },
  backRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  backText:     { ...Typography.body },
  companyBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, marginBottom: Spacing.md },
  companyName:  { ...Typography.label, flexShrink: 1 },
  title:        { ...Typography.h2, marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  sub:          { ...Typography.body, marginBottom: Spacing.xl, alignSelf: 'flex-start' },
  card:         { alignSelf: 'center', borderRadius: Radius.xl, padding: Spacing.xl, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8, marginBottom: Spacing.xl },
  label:        { ...Typography.label, marginBottom: Spacing.xs },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 52 },
  inputIcon:    { marginRight: Spacing.sm },
  input:        { flex: 1, ...Typography.body },
  btn:          { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  btnText:      { ...Typography.h4, color: '#fff' },
  footer:       { ...Typography.micro, textAlign: 'center' },
});
