import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { verifyToken, verifyCompanyCode } from '../utils/api';
import { useTheme } from '../utils/theme';

export default function LoginScreen() {
    const { colors } = useTheme();
    const [companyCode, setCompanyCode] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);

    // Auto-login: Check for stored token on mount
    useEffect(() => {
        checkStoredAuth();
    }, []);

    const checkStoredAuth = async () => {
        try {
            const result = await verifyToken();

            if (result && result.user) {
                // Route by soft-service capabilities first, then legacy role names
                const caps = result.user.roleCapabilities;
                if (caps?.canResolveSoftIssue) {
                    router.replace('/supervisor-dashboard');
                } else if (caps?.isSoftManager) {
                    router.replace('/soft-manager-dashboard');
                } else if (caps?.canRaiseSoftIssue) {
                    router.replace('/dashboard');
                } else {
                    const role = result.user.role?.toLowerCase();
                    if (role === 'supervisor') {
                        router.replace('/supervisor-dashboard');
                    } else if (role === 'technician') {
                        router.replace('/tech-dashboard');
                    } else {
                        router.replace('/dashboard');
                    }
                }
            } else {
                // No stored token, stay on login page
                console.log('No stored authentication found');
            }
        } catch (error) {
            // Error checking stored auth, silently continue to login page
            console.log('Auth check failed (expected on first launch):', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsCheckingAuth(false);
        }
    };

    // Show loading screen while checking auth
    if (isCheckingAuth) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.formContainer, styles.centerContent]}>
                    <Image source={require('../assets/logo.webp')} style={{ width: 200, height: 66, resizeMode: 'contain' }} />
                    <ActivityIndicator size="large" color={colors.loaderColor} style={styles.loader} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const handleVerifyCompany = async () => {
        if (!companyCode.trim()) {
            Alert.alert('Error', 'Please enter your company code');
            return;
        }

        setIsVerifying(true);

        try {
            await verifyCompanyCode(companyCode.trim());
            // Navigate to employee login after successful verification
            router.push('/employee-login');
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Company verification failed. Please try again.';

            Alert.alert('Verification Failed', errorMessage);
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.formContainer}>
                    {/* Header section */}
                    <Text style={[styles.header, { color: colors.textPrimary }]}>Welcome</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Enter your company code to continue</Text>

                    {/* Catalyst Logo */}
                    <View style={styles.logoWrapper}>
                        <Image source={require('../assets/logo.webp')} style={{ width: 200, height: 66, resizeMode: 'contain' }} />
                    </View>

                    {/* Input section */}
                    <View style={styles.inputSection}>
                        <Text style={[styles.label, { color: colors.textLabel }]}>Company Code</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <MaterialCommunityIcons
                                name="office-building"
                                size={24}
                                color={colors.inputIcon}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { color: colors.inputText }]}
                                placeholder="Enter company code"
                                placeholderTextColor={colors.inputPlaceholder}
                                value={companyCode}
                                onChangeText={setCompanyCode}
                                autoCapitalize="characters"
                                editable={!isVerifying}
                            />
                        </View>
                    </View>

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.buttonPrimary, shadowColor: colors.buttonPrimary }, isVerifying && [styles.buttonDisabled, { backgroundColor: colors.buttonDisabled }]]}
                        activeOpacity={0.8}
                        onPress={handleVerifyCompany}
                        disabled={isVerifying}
                    >
                        {isVerifying ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={[styles.buttonText, { color: colors.buttonPrimaryText }]}>Continue</Text>
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
    keyboardView: {
        flex: 1,
    },
    formContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    centerContent: {
        alignItems: 'center',
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
    loader: {
        marginTop: 24,
    },
    loadingText: {
        fontSize: 16,
        marginTop: 12,
    },
    inputSection: {
        marginBottom: 24,
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
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
    },
});
