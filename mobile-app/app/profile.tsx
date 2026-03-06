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
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { clearAuth, getStoredUser, getStoredCompany } from '../utils/api';
import { SupervisorBottomNav } from './supervisor-dashboard';
import { TechBottomNav } from './tech-dashboard';

export default function ProfileScreen() {
    const [user, setUser] = useState<any>(null);
    const [company, setCompany] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pushNotif, setPushNotif] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

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
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    setIsLoggingOut(true);
                    try {
                        await clearAuth();
                        router.replace('/');
                    } catch (error) {
                        Alert.alert('Error', 'Failed to logout. Please try again.');
                        setIsLoggingOut(false);
                    }
                },
            },
        ]);
    };

    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const formatRole = (role: string) => {
        if (!role) return 'EMPLOYEE';
        return role.replace(/_/g, ' ').toUpperCase();
    };

    const employeeId = user ? `FM-${String(user.id || '0000').padStart(4, '0')}` : 'FM-0000';

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity style={styles.headerBtn}>
                    <MaterialCommunityIcons name="cog-outline" size={24} color="#1E293B" />
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarWrap}>
                        <View style={styles.avatarCircle}>
                            <Text style={styles.avatarInitials}>{getInitials(user?.fullName || user?.fullname || 'User')}</Text>
                        </View>
                        <TouchableOpacity style={styles.editBadge}>
                            <MaterialCommunityIcons name="pencil" size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.userName}>{user?.fullName || user?.fullname || 'User'}</Text>
                    <Text style={styles.userRole}>{formatRole(user?.role)} {company?.companyName ? `• ${company.companyName.toUpperCase()}` : ''}</Text>
                    <Text style={styles.employeeId}>Employee ID: {employeeId}</Text>
                </View>

                {/* Account Settings */}
                <View style={styles.sectionGroup}>
                    <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>
                    <View style={styles.sectionCard}>
                        <SettingRow icon="email-outline" label="Email" value={user?.email} hasArrow />
                        <View style={styles.divider} />
                        <SettingRow icon="phone-outline" label="Phone" value={user?.phone} hasArrow />
                        <View style={styles.divider} />
                        <SettingRow icon="lock-outline" label="Change Password" subtitle="Update your security credentials" hasArrow />
                    </View>
                </View>

                {/* App Preferences */}
                <View style={styles.sectionGroup}>
                    <Text style={styles.sectionLabel}>APP PREFERENCES</Text>
                    <View style={styles.sectionCard}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingIconBox}>
                                <MaterialCommunityIcons name="bell-outline" size={18} color="#2563EB" />
                            </View>
                            <View style={styles.settingText}>
                                <Text style={styles.settingLabel}>Push Notifications</Text>
                                <Text style={styles.settingSubtitle}>Task alerts and system updates</Text>
                            </View>
                            <Switch
                                value={pushNotif}
                                onValueChange={setPushNotif}
                                trackColor={{ false: '#E2E8F0', true: '#2563EB' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.settingRow}>
                            <View style={styles.settingIconBox}>
                                <MaterialCommunityIcons name="weather-night" size={18} color="#2563EB" />
                            </View>
                            <View style={styles.settingText}>
                                <Text style={styles.settingLabel}>Dark Mode</Text>
                                <Text style={styles.settingSubtitle}>Adjust app appearance</Text>
                            </View>
                            <Switch
                                value={darkMode}
                                onValueChange={setDarkMode}
                                trackColor={{ false: '#E2E8F0', true: '#2563EB' }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                    </View>
                </View>

                {/* Support */}
                <View style={styles.sectionGroup}>
                    <Text style={styles.sectionLabel}>SUPPORT</Text>
                    <View style={styles.sectionCard}>
                        <SettingRow icon="help-circle-outline" label="Help Center" subtitle="Guides and FAQ" isExternal />
                        <View style={styles.divider} />
                        <SettingRow icon="headset" label="Contact Us" subtitle="Get technical assistance" hasArrow />
                    </View>
                </View>

                {/* Logout */}
                <TouchableOpacity
                    style={styles.logoutBtn}
                    onPress={handleLogout}
                    disabled={isLoggingOut}
                    activeOpacity={0.8}
                >
                    {isLoggingOut ? (
                        <ActivityIndicator color="#EF4444" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="logout" size={18} color="#EF4444" />
                            <Text style={styles.logoutText}>Logout</Text>
                        </>
                    )}
                </TouchableOpacity>

                <Text style={styles.version}>Version 2.4.0 (Build 882)</Text>
                <View style={{ height: 20 }} />
            </ScrollView>

            {user?.role === 'technician' || user?.role === 'tech' ? (
                <TechBottomNav activeRoute="profile" />
            ) : (
                <SupervisorBottomNav activeRoute="profile" />
            )}
        </SafeAreaView>
    );
}

function SettingRow({
    icon, label, value, subtitle, hasArrow, isExternal,
}: {
    icon: string; label: string; value?: string; subtitle?: string; hasArrow?: boolean; isExternal?: boolean;
}) {
    return (
        <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingIconBox}>
                <MaterialCommunityIcons name={icon as any} size={18} color="#2563EB" />
            </View>
            <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{label}</Text>
                {value ? <Text style={styles.settingValue}>{value}</Text> : null}
                {subtitle && !value ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
            </View>
            {hasArrow && <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E0" />}
            {isExternal && <MaterialCommunityIcons name="open-in-new" size={18} color="#CBD5E0" />}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 36 : 12,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerBtn: { padding: 4, width: 36 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1E293B' },

    scroll: { paddingBottom: 24 },

    // Avatar
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 28,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    avatarWrap: { position: 'relative', marginBottom: 14 },
    avatarCircle: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 3, borderColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    avatarInitials: { fontSize: 34, fontWeight: '700', color: '#64748B' },
    editBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: '#2563EB',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#FFFFFF',
    },
    userName: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
    userRole: { fontSize: 12, fontWeight: '700', color: '#2563EB', letterSpacing: 0.5, marginBottom: 4 },
    employeeId: { fontSize: 13, color: '#94A3B8' },

    // Sections
    sectionGroup: { marginTop: 20, paddingHorizontal: 16 },
    sectionLabel: {
        fontSize: 11, fontWeight: '700', color: '#94A3B8',
        letterSpacing: 0.8, marginBottom: 8,
    },
    sectionCard: {
        backgroundColor: '#FFFFFF', borderRadius: 14,
        borderWidth: 1, borderColor: '#F1F5F9',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        overflow: 'hidden',
    },
    divider: { height: 1, backgroundColor: '#F8FAFC', marginLeft: 58 },

    // Row
    settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    settingIconBox: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
    },
    settingText: { flex: 1 },
    settingLabel: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    settingValue: { fontSize: 13, color: '#64748B', marginTop: 1 },
    settingSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },

    // Logout
    logoutBtn: {
        marginHorizontal: 16, marginTop: 24,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
        paddingVertical: 15, borderRadius: 14,
        borderWidth: 1.5, borderColor: '#FEE2E2', backgroundColor: '#FFFFFF',
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

    version: { textAlign: 'center', fontSize: 12, color: '#CBD5E0', marginTop: 16 },
});
