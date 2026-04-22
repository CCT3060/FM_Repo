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
import { useTheme, type ThemePreference } from '../utils/theme';
import { SupervisorBottomNav } from './supervisor-dashboard';
import { TechBottomNav } from './tech-dashboard';

export default function ProfileScreen() {
    const { colors, isDark, preference, setPreference } = useTheme();
    const [user, setUser] = useState<any>(null);
    const [company, setCompany] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pushNotif, setPushNotif] = useState(true);

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

    const initials = user?.fullName
        ? user.fullName.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase()
        : '?';

    const themeModes: { label: string; value: ThemePreference; icon: string; desc: string }[] = [
        { label: 'Light Mode', value: 'light', icon: 'white-balance-sunny', desc: 'Always light' },
        { label: 'Dark Mode', value: 'dark', icon: 'moon-waning-crescent', desc: 'Always dark' },
    ];

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.accentBlue} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.headerBorder }]}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={colors.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.headerText }]}>Profile</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Avatar Section */}
                <View style={[styles.avatarSection, { backgroundColor: colors.surface, borderBottomColor: colors.headerBorder }]}>
                    <View style={styles.avatarWrap}>
                        <View style={[styles.avatarCircle, { backgroundColor: isDark ? '#1E2A4A' : '#E2E8F0' }]}>
                            <Text style={[styles.avatarInitials, { color: colors.accentBlue }]}>{initials}</Text>
                        </View>
                        <View style={styles.editBadge}>
                            <MaterialCommunityIcons name="pencil" size={12} color="#FFFFFF" />
                        </View>
                    </View>
                    <Text style={[styles.userName, { color: colors.textHeading }]}>{user?.fullName || 'Unknown User'}</Text>
                    <Text style={[styles.userRole, { color: colors.accentBlue }]}>{(user?.role || 'employee').toUpperCase()}</Text>
                    <Text style={[styles.employeeId, { color: colors.textTertiary }]}>{company?.companyName || ''}</Text>
                </View>

                {/* Account Info Section */}
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: colors.sectionHeader }]}>ACCOUNT INFORMATION</Text>
                    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor }]}>
                        <SettingRow icon="account-outline" label="Full Name" value={user?.fullName || '—'} colors={colors} />
                        <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                        <SettingRow icon="email-outline" label="Email" value={user?.email || '—'} colors={colors} />
                        <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                        <SettingRow icon="office-building-outline" label="Company" value={company?.companyName || '—'} colors={colors} />
                        <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                        <SettingRow icon="shield-account-outline" label="Role" value={(user?.role || 'employee').charAt(0).toUpperCase() + (user?.role || 'employee').slice(1)} colors={colors} />
                    </View>
                </View>

                {/* Dark Mode Section */}
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: colors.sectionHeader }]}>APPEARANCE</Text>
                    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor }]}>
                        {/* Quick switch */}
                        <View style={styles.settingRow}>
                            <View style={[styles.settingIconBox, { backgroundColor: isDark ? '#1A1D27' : '#EFF6FF' }]}>
                                <MaterialCommunityIcons
                                    name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
                                    size={18}
                                    color={isDark ? '#FBBF24' : '#F59E0B'}
                                />
                            </View>
                            <View style={styles.settingText}>
                                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Dark Mode</Text>
                                <Text style={[styles.settingSubtitle, { color: colors.textTertiary }]}>Adjust app appearance</Text>
                            </View>
                            <Switch
                                value={isDark}
                                onValueChange={(val) => setPreference(val ? 'dark' : 'light')}
                                trackColor={{ false: '#E2E8F0', true: colors.accentBlue }}
                                thumbColor={isDark ? '#60A5FA' : '#FFFFFF'}
                            />
                        </View>
                        <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                        {/* Theme mode picker */}
                        {themeModes.map((mode, index) => (
                            <React.Fragment key={mode.value}>
                                <TouchableOpacity
                                    style={[styles.settingRow, preference === mode.value && { backgroundColor: isDark ? '#1E2A4A' : '#EFF6FF' }]}
                                    onPress={() => setPreference(mode.value)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.settingIconBox, { backgroundColor: preference === mode.value ? (isDark ? '#2B4980' : '#DBEAFE') : (isDark ? '#252836' : '#F1F5F9') }]}>
                                        <MaterialCommunityIcons
                                            name={mode.icon as any}
                                            size={18}
                                            color={preference === mode.value ? colors.accentBlue : colors.textMuted}
                                        />
                                    </View>
                                    <View style={styles.settingText}>
                                        <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{mode.label}</Text>
                                        <Text style={[styles.settingSubtitle, { color: colors.textTertiary }]}>{mode.desc}</Text>
                                    </View>
                                    {preference === mode.value && (
                                        <MaterialCommunityIcons name="check-circle" size={22} color={colors.accentBlue} />
                                    )}
                                </TouchableOpacity>
                                {index < themeModes.length - 1 && (
                                    <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                                )}
                            </React.Fragment>
                        ))}
                    </View>
                </View>

                {/* App Preferences Section */}
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: colors.sectionHeader }]}>APP PREFERENCES</Text>
                    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor }]}>
                        <View style={styles.settingRow}>
                            <View style={[styles.settingIconBox, { backgroundColor: isDark ? '#1A1D27' : '#EFF6FF' }]}>
                                <MaterialCommunityIcons name="bell-outline" size={18} color={colors.accentBlue} />
                            </View>
                            <View style={styles.settingText}>
                                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Push Notifications</Text>
                                <Text style={[styles.settingSubtitle, { color: colors.textTertiary }]}>Task alerts and system updates</Text>
                            </View>
                            <Switch
                                value={pushNotif}
                                onValueChange={setPushNotif}
                                trackColor={{ false: isDark ? '#3A3F50' : '#E2E8F0', true: colors.accentBlue }}
                                thumbColor={pushNotif ? '#60A5FA' : '#FFFFFF'}
                            />
                        </View>
                    </View>
                </View>

                {/* Support Section */}
                <View style={styles.sectionGroup}>
                    <Text style={[styles.sectionLabel, { color: colors.sectionHeader }]}>SUPPORT</Text>
                    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor }]}>
                        <SettingRow icon="help-circle-outline" label="Help Center" subtitle="Guides and FAQ" isExternal colors={colors} />
                        <View style={[styles.divider, { backgroundColor: colors.cardBorder, marginLeft: 58 }]} />
                        <SettingRow icon="headset" label="Contact Us" subtitle="Get technical assistance" hasArrow colors={colors} />
                    </View>
                </View>

                {/* Logout */}
                <TouchableOpacity
                    style={[styles.logoutBtn, { borderColor: isDark ? '#3B1515' : '#FEE2E2', backgroundColor: isDark ? '#1E0D0D' : '#FFFFFF' }]}
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

                <Text style={[styles.version, { color: colors.textTertiary }]}>Version 1.0.0</Text>
                <View style={{ height: 20 }} />
            </ScrollView>

            {/* Role-aware Bottom Nav — uses the same shared components as all other screens */}
            {user?.role === 'supervisor' || user?.role === 'Supervisor' ? (
                <SupervisorBottomNav activeRoute="profile" />
            ) : (
                <TechBottomNav activeRoute="profile" />
            )}
        </SafeAreaView>
    );
}

function SettingRow({
    icon, label, value, subtitle, hasArrow, isExternal, colors,
}: {
    icon: string; label: string; value?: string; subtitle?: string;
    hasArrow?: boolean; isExternal?: boolean; colors: any;
}) {
    return (
        <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: colors.buttonBlueBg || '#EFF6FF' }]}>
                <MaterialCommunityIcons name={icon as any} size={18} color={colors.accentBlue} />
            </View>
            <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
                {value ? <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text> : null}
                {subtitle && !value ? <Text style={[styles.settingSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text> : null}
            </View>
            {hasArrow && <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />}
            {isExternal && <MaterialCommunityIcons name="open-in-new" size={18} color={colors.textTertiary} />}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 36 : 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    headerBtn: { padding: 4, width: 36 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

    scroll: { paddingBottom: 24 },

    // Avatar
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 28,
        borderBottomWidth: 1,
    },
    avatarWrap: { position: 'relative', marginBottom: 14 },
    avatarCircle: {
        width: 96, height: 96, borderRadius: 48,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 3, borderColor: 'transparent',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    avatarInitials: { fontSize: 34, fontWeight: '700' },
    editBadge: {
        position: 'absolute', bottom: 2, right: 2,
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: '#2563EB',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#FFFFFF',
    },
    userName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    userRole: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
    employeeId: { fontSize: 13 },

    // Sections
    sectionGroup: { marginTop: 20, paddingHorizontal: 16 },
    sectionLabel: {
        fontSize: 11, fontWeight: '700',
        letterSpacing: 0.8, marginBottom: 8,
    },
    sectionCard: {
        borderRadius: 14,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        overflow: 'hidden',
    },
    divider: { height: 1 },

    // Row
    settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    settingIconBox: {
        width: 36, height: 36, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    settingText: { flex: 1 },
    settingLabel: { fontSize: 15, fontWeight: '600' },
    settingValue: { fontSize: 13, marginTop: 1 },
    settingSubtitle: { fontSize: 12, marginTop: 1 },

    // Logout
    logoutBtn: {
        marginHorizontal: 16, marginTop: 24,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
        paddingVertical: 15, borderRadius: 14,
        borderWidth: 1.5,
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

    version: { textAlign: 'center', fontSize: 12, marginTop: 16 },

    // Bottom nav
    navContainer: {
        flexDirection: 'row',
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
        paddingTop: 8,
    },
    navTab: { flex: 1, alignItems: 'center', gap: 3 },
    navLabel: { fontSize: 11, fontWeight: '500' },
});
