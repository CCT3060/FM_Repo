import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { loginEmployee } from '../utils/api';
import { registerForPushNotifications } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const { companyId, companyName } = useLocalSearchParams<{ companyId: string; companyName: string }>();

  const [employeeId, setEmployeeId] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>

          {/* Back */}
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.backRow}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textSecondary} />
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

          {/* Form */}
          <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
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
              />
            </View>

            {/* Password */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  flex:        { flex: 1 },
  container:   { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  backRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  backText:    { ...Typography.body },
  companyBadge:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, marginBottom: Spacing.md },
  companyName: { ...Typography.label, flexShrink: 1 },
  title:       { ...Typography.h2, marginBottom: Spacing.sm },
  sub:         { ...Typography.body, marginBottom: Spacing.xl },
  card:        { borderRadius: Radius.xl, padding: Spacing.xl, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 8 },
  label:       { ...Typography.label, marginBottom: Spacing.xs },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 52 },
  inputIcon:   { marginRight: Spacing.sm },
  input:       { flex: 1, ...Typography.body },
  btn:         { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  btnText:     { ...Typography.h4, color: '#fff' },
});
