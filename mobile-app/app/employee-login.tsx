import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginEmployee, getStoredCompany } from '../utils/api';
import { useTheme } from '../utils/theme';

export default function EmployeeLoginScreen() {
    const { colors } = useTheme();
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingCompany, setIsLoadingCompany] = useState(true);
    const [companyName, setCompanyName] = useState('');
    const [companyId, setCompanyId] = useState<number | null>(null);

    useEffect(() => {
        loadCompanyData();
    }, []);

    const loadCompanyData = async () => {
        console.log('Loading company data...');
        setIsLoadingCompany(true);
        const company = await getStoredCompany();
        console.log('Stored company:', company);

        if (!company) {
            // No company data, go back to company code screen
            Alert.alert('Error', 'Please enter company code first');
            router.replace('/');
            return;
        }

        console.log('Setting company name:', company.companyName);
        console.log('Setting company ID:', company.companyId);
        setCompanyName(company.companyName);
        setCompanyId(company.companyId);
        setIsLoadingCompany(false);
    };

    const handleLogin = async () => {
        // Validation
        if (!employeeId.trim() || !password.trim()) {
            Alert.alert('Error', 'Please enter both username and password');
            return;
        }

        if (!companyId || companyId === null) {
            Alert.alert('Error', 'Company information missing. Please restart the app.');
            console.error('CompanyId is null or undefined:', companyId);
            router.replace('/');
            return;
        }

        setIsLoading(true);

        try {
            console.log('Attempting login with username:', employeeId.trim());
            console.log('Company ID:', companyId);
            console.log('Company name:', companyName);

            // Call authentication API with company ID (companyId is guaranteed to be number here)
            const response = await loginEmployee(employeeId.trim(), password, companyId as number);

            console.log('Login successful, user:', response.user);
            console.log('User role:', response.user.role);

            // Don't reset loading here - let the navigation happen with loading state
            // Route based on user role (case-insensitive)
            const userRole = response.user.role?.toLowerCase();
            if (userRole === 'supervisor') {
                router.replace('/supervisor-dashboard');
            } else if (userRole === 'technician') {
                router.replace('/tech-dashboard');
            } else {
                router.replace('/dashboard');
            }
        } catch (error) {
            console.error('Login error:', error);

            const errorMessage = error instanceof Error
                ? error.message
                : 'Login failed. Please try again.';

            Alert.alert('Login Failed', errorMessage);
        } finally {
            // Always reset loading state
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Back Button */}
            <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
            >
                <MaterialCommunityIcons name="arrow-left" size={24} color={colors.backIcon} />
            </TouchableOpacity>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.formContainer}>
                    {/* Header section */}
                    <Text style={[styles.header, { color: colors.textPrimary }]}>Welcome Back</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{companyName || 'Please enter your employee details.'}</Text>

                    {/* Catalyst Logo */}
                    <View style={styles.logoWrapper}>
                        <Image source={require('../assets/logo.webp')} style={{ width: 200, height: 66, resizeMode: 'contain' }} />
                    </View>

                    {/* Input section */}
                    <View style={styles.inputSection}>
                        <Text style={[styles.label, { color: colors.textLabel }]}>Username</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <MaterialCommunityIcons
                                name="account-outline"
                                size={24}
                                color={colors.inputIcon}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { color: colors.inputText }]}
                                placeholder="Enter username"
                                placeholderTextColor={colors.inputPlaceholder}
                                value={employeeId}
                                onChangeText={setEmployeeId}
                                autoCapitalize="none"
                                editable={!isLoading}
                            />
                        </View>
                    </View>

                    <View style={styles.inputSection}>
                        <Text style={[styles.label, { color: colors.textLabel }]}>Password</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <MaterialCommunityIcons
                                name="lock-outline"
                                size={24}
                                color={colors.inputIcon}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { color: colors.inputText }]}
                                placeholder="Enter Password"
                                placeholderTextColor={colors.inputPlaceholder}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                editable={!isLoading}
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword(!showPassword)}
                                disabled={isLoading}
                            >
                                <MaterialCommunityIcons
                                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                                    size={24}
                                    color={colors.inputIcon}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.buttonPrimary, shadowColor: colors.buttonPrimary }, (isLoading || isLoadingCompany) && [styles.buttonDisabled, { backgroundColor: colors.buttonDisabled }]]}
                        activeOpacity={0.8}
                        onPress={handleLogin}
                        disabled={isLoading || isLoadingCompany}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : isLoadingCompany ? (
                            <Text style={[styles.buttonText, { color: colors.buttonPrimaryText }]}>Loading...</Text>
                        ) : (
                            <Text style={[styles.buttonText, { color: colors.buttonPrimaryText }]}>Sign in</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 20,
        zIndex: 10,
        padding: 8,
    },
    keyboardView: {
        flex: 1,
    },
    formContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    header: {
        fontSize: 32,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 40,
    },
    logoWrapper: {
        marginBottom: 40,
        alignSelf: 'center',
    },
    inputSection: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 52,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        fontSize: 16,
    },
    button: {
        borderRadius: 8,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        marginTop: 16,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
    },
});
