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
import { loginEmployee, getStoredCompany } from '../utils/api';

export default function EmployeeLoginScreen() {
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
                console.log('Routing to supervisor-dashboard');
                router.replace('/supervisor-dashboard');
            } else if (userRole === 'technician') {
                console.log('Routing to tech-dashboard (technician)');
                router.replace('/tech-dashboard');
            } else {
                console.log('Routing to dashboard (general employee)');
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
        <SafeAreaView style={styles.container}>
            {/* Back Button */}
            <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
            >
                <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
            </TouchableOpacity>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.formContainer}>
                    {/* Header section */}
                    <Text style={styles.header}>Welcome Back</Text>
                    <Text style={styles.subtitle}>{companyName || 'Please enter your employee details.'}</Text>

                    {/* Logo Placeholder */}
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>C A T A L Y S T</Text>
                        <Text style={styles.logoTextSub}>PARTNERING FOR SUSTAINABILITY</Text>
                    </View>

                    {/* Input section */}
                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Username</Text>
                        <View style={styles.inputContainer}>
                            <MaterialCommunityIcons
                                name="account-outline"
                                size={24}
                                color="#8E8E93"
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Enter username"
                                placeholderTextColor="#C7C7CC"
                                value={employeeId}
                                onChangeText={setEmployeeId}
                                autoCapitalize="none"
                                editable={!isLoading}
                            />
                        </View>
                    </View>

                    <View style={styles.inputSection}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputContainer}>
                            <MaterialCommunityIcons
                                name="lock-outline"
                                size={24}
                                color="#8E8E93"
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Enter Password"
                                placeholderTextColor="#C7C7CC"
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
                                    color="#8E8E93"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[styles.button, (isLoading || isLoadingCompany) && styles.buttonDisabled]}
                        activeOpacity={0.8}
                        onPress={handleLogin}
                        disabled={isLoading || isLoadingCompany}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : isLoadingCompany ? (
                            <Text style={styles.buttonText}>Loading...</Text>
                        ) : (
                            <Text style={styles.buttonText}>Sign in</Text>
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
    inputSection: {
        marginBottom: 20,
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
        marginTop: 16,
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
