import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    FlatList,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Define the grid items
const DASHBOARD_ITEMS = [
    { id: '1', title: 'Asset', icon: 'office-building', color: '#2B6CB0', iconType: 'MaterialCommunityIcons' },
    { id: '2', title: 'Warnings', icon: 'bell-outline', color: '#E53E3E', iconType: 'MaterialCommunityIcons' },
    { id: '3', title: 'CheckList', icon: 'check-all', color: '#667EEA', iconType: 'MaterialCommunityIcons' },
    { id: '4', title: 'Work Order', icon: 'card-account-details-outline', color: '#9F7AEA', iconType: 'MaterialCommunityIcons' },
    { id: '5', title: 'Logs Sheet', icon: 'calendar-blank-outline', color: '#319795', iconType: 'MaterialCommunityIcons' },
    { id: '6', title: 'Training', icon: 'school-outline', color: '#E53E3E', iconType: 'Ionicons' },
];

export default function DashboardScreen() {

    // Render function for each grid item
    const renderItem = ({ item }: { item: typeof DASHBOARD_ITEMS[0] }) => (
        <TouchableOpacity
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => {
                if (item.title === 'Asset') {
                    router.push('/assets-list');
                } else if (item.title === 'Warnings') {
                    router.push('/warnings');
                } else if (item.title === 'CheckList') {
                    router.push('/checklists');
                }
            }}
        >
            <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                {item.iconType === 'Ionicons' ? (
                    <Ionicons name={item.icon as any} size={28} color={item.color} />
                ) : (
                    <MaterialCommunityIcons name={item.icon as any} size={28} color={item.color} />
                )}
            </View>
            <Text style={styles.gridItemText}>{item.title}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Top Navigation Bar - Blue Background */}
            <View style={styles.headerContainer}>
                {/* Left: Zone Menu */}
                <TouchableOpacity style={styles.headerLeft}>
                    <Text style={styles.headerText}>Zone 1</Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#FFFFFF" />
                </TouchableOpacity>

                {/* Center: Role Info */}
                <TouchableOpacity style={styles.headerCenter}>
                    <Text style={styles.roleLabel}>Role</Text>
                    <View style={styles.roleSelector}>
                        <Text style={styles.roleText}>HK Supervisor</Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#FFFFFF" />
                    </View>
                </TouchableOpacity>

                {/* Right: Actions */}
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.actionButton}>
                        <MaterialCommunityIcons name="refresh" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/profile')}>
                        <MaterialCommunityIcons name="account-circle-outline" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Main Content Area */}
            <View style={styles.contentContainer}>

                {/* TATA Logo Placeholder */}
                <View style={styles.logoContainer}>
                    <View style={styles.tataLogoShape}>
                        <View style={styles.tataLogoTopSquare} />
                        <View style={styles.tataLogoBottomTriangle} />
                    </View>
                    <Text style={styles.tataLogoText}>TATA</Text>
                </View>

                {/* Grid of Options */}
                <FlatList
                    data={DASHBOARD_ITEMS}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    contentContainerStyle={styles.gridContainer}
                    columnWrapperStyle={styles.row}
                    showsVerticalScrollIndicator={false}
                />

                {/* Footer */}
                <View style={styles.footerContainer}>
                    <Text style={styles.footerText}>Logged in as User</Text>
                    {Platform.OS === 'ios' && <View style={styles.homeIndicatorPlaceholder} />}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A36A8', // Match the blue header background so safe area top is blue
    },
    headerContainer: {
        backgroundColor: '#1E3A8A', // Deep blue
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginTop: Platform.OS === 'android' ? 30 : 0, // avoid overlap with status bar on android
        height: 70,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginRight: 4,
    },
    headerCenter: {
        alignItems: 'center',
        flex: 2,
    },
    roleLabel: {
        color: '#A0AEC0', // Light greyish blue
        fontSize: 12,
    },
    roleSelector: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    roleText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        marginRight: 2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flex: 1,
    },
    actionButton: {
        marginLeft: 16,
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#F3F4F6', // Light grayish background for the whole body
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: 32,
        marginBottom: 24,
    },
    tataLogoShape: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    tataLogoTopSquare: {
        width: 40,
        height: 12,
        backgroundColor: '#2B6CB0',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
    },
    tataLogoBottomTriangle: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 20,
        borderRightWidth: 20,
        borderTopWidth: 15,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#2B6CB0',
    },
    tataLogoText: {
        fontSize: 24,
        fontWeight: '900',
        color: '#2B6CB0',
        letterSpacing: 2,
    },
    gridContainer: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    row: {
        flex: 1,
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    gridItem: {
        backgroundColor: '#FFFFFF',
        flex: 1,
        marginHorizontal: 8,
        borderRadius: 12,
        paddingVertical: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    gridItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A202C',
    },
    footerContainer: {
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: '#F3F4F6',
    },
    footerText: {
        color: '#A0AEC0',
        fontSize: 14,
    },
    homeIndicatorPlaceholder: {
        width: 134,
        height: 5,
        backgroundColor: '#CBD5E0',
        borderRadius: 100,
        marginTop: 20,
        marginBottom: 8,
    }
});
