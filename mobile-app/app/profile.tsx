import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { clearAuth, getStoredUser, getStoredCompany } from '../utils/api';

export default function ProfileScreen() {
    const [user, setUser] = useState<any>(null);
    const [company, setCompany] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        loadUserData();
    }, []);

    const loadUserData = async () => {
        try {
            const userData = await getStoredUser();
            const companyData = await getStoredCompany();
            setUser(userData);
            setCompany(companyData);
        } catch (error) {
            console.error('Error loading user data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoggingOut(true);
                        try {
                            await clearAuth();
                            console.log('User logged out successfully');
                            // Navigate back to company code entry screen
                            router.replace('/');
                        } catch (error) {
                            console.error('Logout error:', error);
                            Alert.alert('Error', 'Failed to logout. Please try again.');
                            setIsLoggingOut(false);
                        }
                    },
                },
            ]
        );
    };

    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Profile Avatar Section */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{getInitials(user?.fullName || 'User')}</Text>
                    </View>
                    <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>{user?.role || 'Employee'}</Text>
                    </View>
                </View>

                {/* Info Cards */}
                <View style={styles.infoSection}>
                    {/* Company Info */}
                    <View style={styles.infoCard}>
                        <View style={styles.infoHeader}>
                            <MaterialCommunityIcons name="office-building" size={20} color="#1E3A8A" />
                            <Text style={styles.infoTitle}>Company</Text>
                        </View>
                        <Text style={styles.infoValue}>{company?.companyName || 'N/A'}</Text>
                    </View>

                    {/* Email */}
                    {user?.email && (
                        <View style={styles.infoCard}>
                            <View style={styles.infoHeader}>
                                <MaterialCommunityIcons name="email-outline" size={20} color="#1E3A8A" />
                                <Text style={styles.infoTitle}>Email</Text>
                            </View>
                            <Text style={styles.infoValue}>{user.email}</Text>
                        </View>
                    )}

                    {/* Phone */}
                    {user?.phone && (
                        <View style={styles.infoCard}>
                            <View style={styles.infoHeader}>
                                <MaterialCommunityIcons name="phone-outline" size={20} color="#1E3A8A" />
                                <Text style={styles.infoTitle}>Phone</Text>
                            </View>
                            <Text style={styles.infoValue}>{user.phone}</Text>
                        </View>
                    )}

                    {/* Designation */}
                    {user?.designation && (
                        <View style={styles.infoCard}>
                            <View style={styles.infoHeader}>
                                <MaterialCommunityIcons name="briefcase-outline" size={20} color="#1E3A8A" />
                                <Text style={styles.infoTitle}>Designation</Text>
                            </View>
                            <Text style={styles.infoValue}>{user.designation}</Text>
                        </View>
                    )}
                </View>

                {/* Logout Button */}
                <View style={styles.logoutSection}>
                    <TouchableOpacity
                        style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
                        onPress={handleLogout}
                        disabled={isLoggingOut}
                    >
                        {isLoggingOut ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <>
                                <MaterialCommunityIcons name="logout" size={20} color="#FFFFFF" />
                                <Text style={styles.logoutButtonText}>Logout</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
    },
    headerSpacer: {
        width: 40,
    },
    scrollContent: {
        flex: 1,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 32,
        backgroundColor: '#FFFFFF',
        marginBottom: 16,
    },
    avatarCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#1E3A8A',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarText: {
        fontSize: 36,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    userName: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 8,
    },
    roleBadge: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    roleText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E3A8A',
        textTransform: 'capitalize',
    },
    infoSection: {
        paddingHorizontal: 16,
    },
    infoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#718096',
        marginLeft: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    infoValue: {
        fontSize: 16,
        color: '#1A202C',
        fontWeight: '500',
    },
    logoutSection: {
        paddingHorizontal: 16,
        paddingVertical: 24,
    },
    logoutButton: {
        backgroundColor: '#E53E3E',
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    logoutButtonDisabled: {
        backgroundColor: '#FC8181',
    },
    logoutButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
