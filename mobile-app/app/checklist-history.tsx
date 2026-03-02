import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const HISTORY_DATA = [
    {
        id: '1',
        title: 'Terminal 2 - Zone B',
        subtitle: 'Daily Sanitization Check',
        status: 'PASSED',
        user: 'Rajesh Kumar',
        time: 'Oct 24, 10:30 AM',
        icon: 'spray-bottle',
    },
    {
        id: '2',
        title: 'Cargo Bay 4',
        subtitle: 'Equipment Safety Audit',
        status: 'FAILED',
        user: 'Amit Singh',
        time: 'Oct 23, 04:15 PM',
        icon: 'alert-triangle',
    },
    {
        id: '3',
        title: 'Gate 14 Washroom',
        subtitle: 'Hygiene Inspection',
        status: 'PASSED',
        user: 'Priya Mehta',
        time: 'Oct 23, 02:00 PM',
        icon: 'shield-check-outline',
    },
];

export default function ChecklistHistoryScreen() {

    const renderHistoryCard = (item: typeof HISTORY_DATA[0]) => {
        const isPassed = item.status === 'PASSED';
        const borderColor = isPassed ? '#38A169' : '#E53E3E'; // Green vs Red
        const iconColor = isPassed ? '#553C9A' : '#C53030'; // Purple vs Dark Red
        const iconBg = isPassed ? '#E9D8FD' : '#FED7D7';

        return (
            <View style={styles.cardContainer} key={item.id}>
                <View style={[styles.cardAccent, { backgroundColor: borderColor }]} />

                <View style={styles.cardContent}>
                    <View style={styles.cardTopRow}>
                        <View style={styles.cardHeaderLeft}>
                            <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                                {item.icon === 'alert-triangle' ? (
                                    <MaterialCommunityIcons name="alert" size={20} color={iconColor} />
                                ) : (
                                    <MaterialCommunityIcons name={item.icon as any} size={20} color={iconColor} />
                                )}
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>{item.title}</Text>
                                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                            </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: isPassed ? '#C6F6D5' : '#FED7D7' }]}>
                            <Text style={[styles.statusText, { color: isPassed ? '#276749' : '#C53030' }]}>
                                {item.status}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metaRow}>
                        <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Completed by</Text>
                            <View style={styles.userRow}>
                                <MaterialCommunityIcons name="account" size={14} color="#718096" />
                                <Text style={styles.metaValue}>{item.user}</Text>
                            </View>
                        </View>
                        <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
                            <Text style={styles.metaLabel}>Date & Time</Text>
                            <View style={styles.userRow}>
                                <MaterialCommunityIcons name="clock-outline" size={14} color="#718096" />
                                <Text style={styles.metaValue}>{item.time}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerContainer}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.headerTextGroup}>
                    <Text style={styles.headerTitle}>Checklist History</Text>
                    <Text style={styles.headerSubtitle}>Chhatrapati Shivaji Int. Airport</Text>
                </View>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.contentPadding}>

                    <View style={styles.filterGroupHeader}>
                        <MaterialCommunityIcons name="filter-variant" size={18} color="#718096" />
                        <Text style={styles.filterTitle}>FILTERS</Text>
                    </View>

                    <TouchableOpacity style={styles.dropdownButton} activeOpacity={0.7}>
                        <View style={styles.dropdownLeft}>
                            <MaterialCommunityIcons name="domain" size={20} color="#553C9A" style={styles.dropdownIcon} />
                            <Text style={styles.dropdownText}>All Assets</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={20} color="#A0AEC0" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.dropdownButton} activeOpacity={0.7}>
                        <View style={styles.dropdownLeft}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#553C9A" style={styles.dropdownIcon} />
                            <Text style={styles.dropdownText}>Last 7 Days</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={20} color="#A0AEC0" />
                    </TouchableOpacity>

                    <View style={styles.resultsRow}>
                        <Text style={styles.resultsText}>Showing 14 results</Text>
                        <TouchableOpacity>
                            <Text style={styles.clearFiltersText}>Clear Filters</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    {HISTORY_DATA.map(renderHistoryCard)}

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#1E3A8A', // Deep blue
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 4,
        marginRight: 10,
    },
    headerTextGroup: {
        flex: 1,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 2,
    },
    headerSubtitle: {
        color: '#A0AEC0',
        fontSize: 12,
    },
    contentScroll: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
        paddingBottom: 40,
    },
    filterGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    filterTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#718096',
        marginLeft: 8,
        letterSpacing: 0.5,
    },
    dropdownButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
    },
    dropdownLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dropdownIcon: {
        marginRight: 12,
    },
    dropdownText: {
        fontSize: 15,
        color: '#1A202C',
        fontWeight: '500',
    },
    resultsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 16,
    },
    resultsText: {
        fontSize: 13,
        color: '#718096',
    },
    clearFiltersText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#553C9A', // Purple
    },
    divider: {
        height: 1,
        backgroundColor: '#EDF2F7',
        marginBottom: 16,
    },
    cardContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 16,
        flexDirection: 'row',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    cardAccent: {
        width: 6,
        height: '100%',
    },
    cardContent: {
        flex: 1,
        padding: 16,
    },
    cardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        paddingRight: 8,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#718096',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    metaCol: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 12,
        color: '#718096',
        marginBottom: 4,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1A202C',
        marginLeft: 6,
    },
});
