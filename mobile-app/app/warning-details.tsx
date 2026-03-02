import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function WarningDetailsScreen() {
    const { title } = useLocalSearchParams<{ title: string }>();

    // Safely display title
    const displayTitle = title ? decodeURIComponent(title) : 'Fire Alarm System Fault';

    // State for checklists
    const [checklist, setChecklist] = useState([
        { id: '1', text: 'Verify Physical Location', subtext: 'Confirm no actual fire presence', checked: false },
        { id: '2', text: 'Notify Maintenance Team', subtext: 'Ticket #MT-4402 created', checked: true },
        { id: '3', text: 'Evacuate Zone (If Needed)', subtext: 'Only if smoke is visible', checked: false },
        { id: '4', text: 'Contact Fire Dept', subtext: 'Direct line: Ext 911', checked: false },
    ]);

    const toggleCheck = (id: string) => {
        setChecklist(prev =>
            prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerContainer}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Warning Details</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.contentPadding}>
                    <View style={styles.infoCard}>
                        <View style={styles.priorityStrip} />
                        <View style={styles.infoCardContent}>
                            <View style={styles.priorityHeaderRow}>
                                <View style={styles.priorityTitleContainer}>
                                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#E53E3E" style={styles.priorityIcon} />
                                    <Text style={styles.priorityText}>HIGH PRIORITY ALERT</Text>
                                </View>
                                <View style={styles.idPill}>
                                    <Text style={styles.idText}>ID: #WRN-2024-89</Text>
                                </View>
                            </View>

                            <Text style={styles.mainTitle}>{displayTitle}</Text>

                            <View style={styles.metaRow}>
                                <MaterialCommunityIcons name="map-marker-outline" size={14} color="#718096" style={styles.metaIcon} />
                                <Text style={styles.metaText}>Terminal 2 - Zone B</Text>
                            </View>

                            <View style={styles.metaRow}>
                                <MaterialCommunityIcons name="clock-outline" size={14} color="#718096" style={styles.metaIcon} />
                                <Text style={styles.metaText}>Today, 10:42 AM</Text>
                            </View>

                            <Text style={styles.sectionHeading}>DESCRIPTION</Text>
                            <Text style={styles.descriptionText}>
                                Sensor malfunction detected in the north wing hallway near Gate B4. Multiple false positives triggered in the last 15 minutes. Maintenance crew dispatched immediately. Smoke detection capabilities may be compromised in Sector 4.
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.mainSectionTitle}>Affected Assets</Text>

                    <View style={styles.assetCard}>
                        <View style={styles.assetIconContainer}>
                            <MaterialCommunityIcons name="smoke-detector-variant" size={20} color="#718096" />
                        </View>
                        <View style={styles.assetInfo}>
                            <Text style={styles.assetTitle}>Smoke Detector SD-09</Text>
                            <Text style={styles.assetLocation}>North Wing, Hallway B</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: '#FED7D7' }]}>
                            <Text style={[styles.statusText, { color: '#C53030' }]}>FAULT</Text>
                        </View>
                    </View>

                    <View style={styles.assetCard}>
                        <View style={styles.assetIconContainer}>
                            <MaterialCommunityIcons name="bell-ring-outline" size={20} color="#718096" />
                        </View>
                        <View style={styles.assetInfo}>
                            <Text style={styles.assetTitle}>Alarm Strobe B-12</Text>
                            <Text style={styles.assetLocation}>North Wing, Hallway B</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: '#FEFCBF' }]}>
                            <Text style={[styles.statusText, { color: '#975A16' }]}>WARNING</Text>
                        </View>
                    </View>

                    <Text style={styles.mainSectionTitle}>Required Actions</Text>

                    <View style={styles.actionsCard}>
                        {checklist.map((item, index) => (
                            <React.Fragment key={item.id}>
                                <TouchableOpacity
                                    style={styles.checklistItem}
                                    activeOpacity={0.7}
                                    onPress={() => toggleCheck(item.id)}
                                >
                                    <View style={styles.checkboxContainer}>
                                        {item.checked ? (
                                            <MaterialCommunityIcons name="check-circle" size={24} color="#1E3A8A" />
                                        ) : (
                                            <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={24} color="#CBD5E0" />
                                        )}
                                    </View>
                                    <View style={styles.checklistTextContainer}>
                                        <Text style={[styles.checklistTitle, item.checked ? styles.checklistTitleDone : undefined]}>
                                            {item.text}
                                        </Text>
                                        <Text style={[styles.checklistSubtext, item.checked ? styles.checklistTitleDone : undefined]}>
                                            {item.subtext}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                {index < checklist.length - 1 ? <View style={styles.divider} /> : null}
                            </React.Fragment>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <View style={styles.bottomContainer}>
                <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
                    <Text style={styles.primaryButtonText}>Acknowledge & Dispatch</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Report False Alarm</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6', // Light grayish background matching image
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
    },
    priorityStrip: {
        width: 4,
        height: '100%',
        backgroundColor: '#E53E3E', // Red for high priority
    },
    infoCardContent: {
        flex: 1,
        padding: 16,
    },
    priorityHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#FFF5F5', // Very light red background top bar
        padding: 8,
        borderRadius: 8,
        marginLeft: -16,
        marginTop: -16,
        marginRight: -16,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    priorityTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    priorityIcon: {
        marginRight: 6,
    },
    priorityText: {
        color: '#E53E3E',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    idPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    idText: {
        color: '#E53E3E',
        fontSize: 10,
        fontWeight: '600',
        opacity: 0.8,
    },
    mainTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 12,
        marginTop: 8,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    metaIcon: {
        marginRight: 8,
    },
    metaText: {
        fontSize: 14,
        color: '#4A5568',
    },
    sectionHeading: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1A202C',
        marginTop: 20,
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    descriptionText: {
        fontSize: 14,
        color: '#4A5568',
        lineHeight: 22,
    },
    mainSectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 12,
        marginTop: 8,
    },
    assetCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    assetIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    assetInfo: {
        flex: 1,
    },
    assetTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 2,
    },
    assetLocation: {
        fontSize: 12,
        color: '#718096',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
    },
    actionsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        marginBottom: 20,
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
    },
    checkboxContainer: {
        marginRight: 12,
        marginTop: 2, // fine tune alignment
    },
    checklistTextContainer: {
        flex: 1,
    },
    checklistTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#2D3748',
        marginBottom: 2,
    },
    checklistTitleDone: {
        color: '#A0AEC0',
        textDecorationLine: 'line-through',
    },
    checklistSubtext: {
        fontSize: 13,
        color: '#718096',
    },
    divider: {
        height: 1,
        backgroundColor: '#EDF2F7',
        marginLeft: 36, // align with text
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
        marginBottom: 16,
    },
    btnIcon: {
        marginRight: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButton: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    secondaryButtonText: {
        color: '#718096',
        fontSize: 14,
        fontWeight: '600',
    },
});
