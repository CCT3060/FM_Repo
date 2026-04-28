import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { verifyToken, verifyCompanyCode } from '../utils/api';

export default function LoginScreen() {
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
                // Valid token found, navigate to appropriate dashboard
                const role = result.user.role?.toLowerCase();
                if (role === 'supervisor') {
                    router.replace('/supervisor-dashboard');
                } else if (role === 'technician') {
                    router.replace('/tech-dashboard');
                } else {
                    router.replace('/dashboard');
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
            <SafeAreaView style={styles.container}>
                <View style={[styles.formContainer, styles.centerContent]}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>C A T A L Y S T</Text>
                        <Text style={styles.logoTextSub}>PARTNERING FOR SUSTAINABILITY</Text>
                    </View>
                    <ActivityIndicator size="large" color="#1E3A8A" style={styles.loader} />
                    <Text style={styles.loadingText}>Loading...</Text>
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
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.formContainer}>
                    {/* Header section */}
                    <Text style={styles.header}>Welcome</Text>
                    <Text style={styles.subtitle}>Enter your company code to continue</Text>

                    {/* Logo Placeholder */}
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>C A T A L Y S T</Text>
                        <Text style={styles.logoTextSub}>PARTNERING FOR SUSTAINABILITY</Text>
                    </View>

                    {/* Input section */}
                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Company Code</Text>
                        <View style={styles.inputContainer}>
                            <MaterialCommunityIcons
                                name="office-building"
                                size={24}
                                color="#8E8E93"
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Enter company code"
                                placeholderTextColor="#C7C7CC"
                                value={companyCode}
                                onChangeText={setCompanyCode}
                                autoCapitalize="characters"
                                editable={!isVerifying}
                            />
                        </View>
                    </View>

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[styles.button, isVerifying && styles.buttonDisabled]}
                        activeOpacity={0.8}
                        onPress={handleVerifyCompany}
                        disabled={isVerifying}
                    >
                        {isVerifying ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.buttonText}>Continue</Text>
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
        backgroundColor: '#F8F9FA',
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
        color: '#1A202C',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#718096',
        textAlign: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 48,
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    logoTextMain: {
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: 4,
        color: '#2B6CB0',
    },
    logoTextSub: {
        fontSize: 10,
        color: '#718096',
        letterSpacing: 1,
        marginTop: 4,
    },
    loader: {
        marginTop: 24,
    },
    loadingText: {
        fontSize: 16,
        color: '#718096',
        marginTop: 12,
    },
    inputSection: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2D3748',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
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
        color: '#1A202C',
    },
    button: {
        backgroundColor: '#1E3A8A', // Deep blue as per design
        borderRadius: 8,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        marginTop: 8,
    },
    buttonDisabled: {
        backgroundColor: '#6B7280',
        opacity: 0.7,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
