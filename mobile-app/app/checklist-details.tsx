import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function ChecklistDetailsScreen() {
    const { title } = useLocalSearchParams<{ title: string }>();
    const displayTitle = title ? decodeURIComponent(title) : 'Escalator 04';
    const [noteText, setNoteText] = useState('');

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerContainer}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Checklist Details</Text>
                <MaterialCommunityIcons name="dots-vertical" size={24} color="#FFFFFF" style={styles.menuIcon} />
            </View>

            <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.contentPadding}>

                    <View style={styles.infoCard}>
                        <View style={styles.categoryStrip} />

                        <View style={styles.infoCardContent}>
                            <View style={styles.titleRow}>
                                <Text style={styles.mainTitle}>{displayTitle}</Text>
                                <View style={styles.overduePill}>
                                    <View style={styles.redDot} />
                                    <Text style={styles.overduePillText}>OVERDUE</Text>
                                </View>
                            </View>

                            <View style={styles.locationRow}>
                                <MaterialCommunityIcons name="map-marker-outline" size={14} color="#1A202C" />
                                <Text style={styles.locationText}>Terminal 2 - Zone B</Text>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.metaGrid}>
                                <View style={styles.metaCol}>
                                    <Text style={styles.metaLabel}>CATEGORY</Text>
                                    <Text style={styles.metaValue}>Machine</Text>
                                </View>
                                <View style={styles.metaCol}>
                                    <Text style={styles.metaLabel}>DUE TIME</Text>
                                    <Text style={[styles.metaValue, { color: '#E53E3E' }]}>10:00 AM Today</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <Text style={styles.sectionHeading}>ASSIGN TO FIELD WORKER</Text>

                    <View style={styles.assignCard}>
                        <Text style={styles.inputLabel}>Select Worker</Text>

                        <TouchableOpacity style={styles.dropdownButton} activeOpacity={0.7}>
                            <View style={styles.dropdownLeft}>
                                <View style={styles.avatarCircle} />
                                <Text style={styles.dropdownText}>Rajesh Kumar (Electrician)</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={20} color="#A0AEC0" />
                        </TouchableOpacity>

                        <View style={styles.availabilityRow}>
                            <Text style={styles.availLabel}>Availability:</Text>
                            <View style={styles.availStatus}>
                                <View style={styles.greenDot} />
                                <Text style={styles.availText}>Available Now</Text>
                            </View>
                        </View>

                        <Text style={[styles.inputLabel, { marginTop: 20 }]}>Add Note (Optional)</Text>
                        <View style={styles.textAreaContainer}>
                            <TextInput
                                style={styles.textArea}
                                multiline
                                numberOfLines={4}
                                placeholder="Any specific instructions for Rajesh..."
                                placeholderTextColor="#A0AEC0"
                                value={noteText}
                                onChangeText={setNoteText}
                                textAlignVertical="top"
                            />
                        </View>
                    </View>

                </View>
            </ScrollView>

            <View style={styles.bottomContainer}>
                <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="clipboard-account-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
                    <Text style={styles.primaryButtonText}>Assign Checklist</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#1E3A8A', // Deep blue
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    menuIcon: {
        padding: 4,
    },
    contentScroll: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
        paddingBottom: 40,
    },
    infoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 24,
        flexDirection: 'row',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        marginTop: 8,
    },
    categoryStrip: {
        width: 4,
        height: '100%',
        backgroundColor: '#ECC94B', // Yellow for "Machine" category
    },
    infoCardContent: {
        flex: 1,
        padding: 20,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    mainTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A202C',
        flex: 1,
        paddingRight: 10,
    },
    overduePill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF5F5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    redDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#E53E3E',
        marginRight: 4,
    },
    overduePillText: {
        color: '#E53E3E',
        fontSize: 10,
        fontWeight: '800',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    locationText: {
        fontSize: 14,
        color: '#718096',
        marginLeft: 6,
    },
    divider: {
        height: 1,
        backgroundColor: '#EDF2F7',
        marginBottom: 16,
    },
    metaGrid: {
        flexDirection: 'row',
    },
    metaCol: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#718096',
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    metaValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A202C',
    },
    sectionHeading: {
        fontSize: 13,
        fontWeight: '700',
        color: '#718096',
        marginBottom: 12,
        letterSpacing: 0.5,
    },
    assignCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4A5568',
        marginBottom: 8,
    },
    dropdownButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        marginBottom: 12,
    },
    dropdownLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#ED8936', // Placeholder orange avatar color
        marginRight: 10,
    },
    dropdownText: {
        fontSize: 15,
        color: '#1A202C',
    },
    availabilityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    availLabel: {
        fontSize: 13,
        color: '#A0AEC0',
    },
    availStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    greenDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#38A169',
        marginRight: 6,
    },
    availText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#38A169',
    },
    textAreaContainer: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        padding: 12,
    },
    textArea: {
        minHeight: 100,
        fontSize: 15,
        color: '#1A202C',
    },
    bottomContainer: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20, // Safe area for iOS
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    primaryButton: {
        backgroundColor: '#1E3A8A', // Deep blue
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    btnIcon: {
        marginRight: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
