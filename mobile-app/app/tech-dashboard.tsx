import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getMyAssignments, clearAuth, type Assignment } from '../utils/api';

// Reusable Navigation Bar Component for Tech Flow
export const TechBottomNav = ({ activeRoute }: { activeRoute: string }) => {
    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-dashboard')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'home' ? 'home' : 'home-outline'}
                    size={24}
                    color={activeRoute === 'home' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'home' && navStyles.navTextActive]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/tech-tasks')}>
                <MaterialCommunityIcons
                    name={activeRoute === 'tasks' ? 'clipboard-text' : 'clipboard-text-outline'}
                    size={24}
                    color={activeRoute === 'tasks' ? '#1E3A8A' : '#A0AEC0'}
                />
                <Text style={[navStyles.navText, activeRoute === 'tasks' && navStyles.navTextActive]}>Tasks</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem}>
                <MaterialCommunityIcons name="calendar-month-outline" size={24} color="#A0AEC0" />
                <Text style={navStyles.navText}>Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity style={navStyles.navItem} onPress={() => router.push('/profile')}>
                <MaterialCommunityIcons name="account-outline" size={24} color="#A0AEC0" />
                <Text style={navStyles.navText}>Profile</Text>
            </TouchableOpacity>
        </View>
    );
};

const navStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 10,
        paddingBottom: Platform.OS === 'ios' ? 30 : 10,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    navText: {
        fontSize: 11,
        color: '#A0AEC0',
        marginTop: 4,
        fontWeight: '500',
    },
    navTextActive: {
        color: '#1E3A8A', // Deep Blue
        fontWeight: '700',
    },
});

export default function TechDashboardScreen() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadAssignments();
    }, []);

    const loadAssignments = async () => {
        try {
            const data = await getMyAssignments();
            setAssignments(data);
        } catch (error: any) {
            console.error('Failed to load assignments:', error);
            // If authentication error, clear tokens and go back to login
            if (error.message?.includes('authentication') || error.message?.includes('token')) {
                Alert.alert(
                    'Session Expired',
                    'Please log in again',
                    [
                        {
                            text: 'OK',
                            onPress: async () => {
                                await clearAuth();
                                router.replace('/');
                            },
                        },
                    ]
                );
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadAssignments();
    };

    const checklistCount = assignments.filter(a => a.templateType === 'checklist').length;
    const logsheetCount = assignments.filter(a => a.templateType === 'logsheet').length;

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading dashboard...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.logoCircle}>
                        <Text style={styles.logoText}>TATA</Text>
                    </View>
                    <View>
                        <Text style={styles.portalSub}>TECHNICIAN PORTAL</Text>
                        <Text style={styles.greetingText}>Hello, Arjun</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.bellIconBtn}>
                    <MaterialCommunityIcons name="bell-outline" size={24} color="#4A5568" />
                    <View style={styles.notificationDot} />
                </TouchableOpacity>
            </View>

            <ScrollView 
                style={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
                }
            >
                <View style={styles.contentPadding}>
                    {/* Quick Stats */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#F3E8FF' }]}>
                            <MaterialCommunityIcons name="clipboard-check" size={28} color="#7C3AED" />
                            <Text style={styles.statNumber}>{checklistCount}</Text>
                            <Text style={styles.statLabel}>Checklists</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                            <MaterialCommunityIcons name="notebook" size={28} color="#2563EB" />
                            <Text style={styles.statNumber}>{logsheetCount}</Text>
                            <Text style={styles.statLabel}>Logsheets</Text>
                        </View>
                    </View>

                    {/* My Assignments Card */}
                    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push('/assignments')}>
                        <View style={styles.cardTopRow}>
                            <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                                <MaterialCommunityIcons name="clipboard-text" size={24} color="#7C3AED" />
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E0" />
                        </View>

                        <Text style={styles.cardTitle}>My Assignments</Text>
                        <Text style={styles.cardSubtitle}>View checklists & logsheets assigned to you</Text>

                        <View style={styles.divider} />

                        <View style={styles.cardBottomRow}>
                            <Text style={styles.largeNumber}>{assignments.length}</Text>
                            <View style={[styles.pill, { backgroundColor: '#F3E8FF' }]}>
                                <Text style={[styles.pillText, { color: '#7C3AED' }]}>Assigned</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                </View>
            </ScrollView>

            {/* Bottom Nav */}
            <TechBottomNav activeRoute="home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA', // Light greyish background
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#718096',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    logoText: {
        color: '#2B6CB0',
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
    portalSub: {
        fontSize: 11,
        color: '#718096',
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    greetingText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E3A8A', // Deep Blue
    },
    bellIconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    notificationDot: {
        position: 'absolute',
        top: 10,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E53E3E',
    },
    scrollContent: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
        paddingBottom: 40,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    statNumber: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1E3A8A',
        marginTop: 8,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#718096',
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    cardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1E3A8A',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 14,
        color: '#718096',
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: '#EDF2F7',
        marginBottom: 16,
    },
    cardBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    largeNumber: {
        fontSize: 28,
        fontWeight: '700',
        color: '#1A202C',
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    pillText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
