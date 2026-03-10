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

// Sample list of safety checks
const SAFETY_CHECKS = [
    { id: '1', title: 'Check emergency stop button', desc: 'Ensure immediate braking response.' },
    { id: '2', title: 'Inspect handrail for cracks', desc: 'Visual inspection along entire length.' },
    { id: '3', title: 'Verify step demarcation lights', desc: '' },
    { id: '4', title: 'Listen for unusual noise', desc: 'Vibration or grinding sounds.' },
    { id: '5', title: 'Clear debris from comb plates', desc: '' },
];

export default function TechExecutionScreen() {
    const { title } = useLocalSearchParams<{ title: string }>();
    const displayTitle = title ? decodeURIComponent(title).replace(' Inspection', '') : 'Escalator 04';

    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
        '1': true, // First one checked by default for the demo
    });
    const [logText, setLogText] = useState('');

    const toggleCheck = (id: string) => {
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const completedCount = Object.values(checkedItems).filter(Boolean).length;
    const progressPercent = Math.round((completedCount / SAFETY_CHECKS.length) * 100);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{displayTitle}</Text>
                    <View style={{ width: 32 }} /> {/* Placeholder for balance */}
                </View>

                <View style={styles.headerSubtitleRow}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={14} color="#718096" />
                    <Text style={styles.subtitleText}>Daily Maintenance</Text>
                    <Text style={styles.dotSeparator}>•</Text>
                    <Text style={styles.subtitleText}>Terminal 2</Text>
                </View>

                {/* Linear Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.progressText}>{progressPercent}% Complete</Text>
            </View>

            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.contentPadding}>

                    <Text style={styles.sectionHeading}>SAFETY CHECKS</Text>

                    <View style={styles.checksCard}>
                        {SAFETY_CHECKS.map((item, index) => {
                            const isChecked = checkedItems[item.id];
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.checkRow, index === SAFETY_CHECKS.length - 1 && styles.checkRowLast]}
                                    activeOpacity={0.7}
                                    onPress={() => toggleCheck(item.id)}
                                >
                                    <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
                                        {isChecked && <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />}
                                    </View>
                                    <View style={styles.checkTexts}>
                                        <Text style={styles.checkTitle}>{item.title}</Text>
                                        {item.desc ? <Text style={styles.checkDesc}>{item.desc}</Text> : null}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.sectionHeading}>OBSERVATIONS & EVIDENCE</Text>

                    <View style={styles.obsCard}>
                        <Text style={styles.obsLabel}>Log Observations</Text>

                        <View style={styles.textAreaContainer}>
                            <TextInput
                                style={styles.textArea}
                                multiline
                                numberOfLines={4}
                                placeholder="Describe any issues, wear patterns, or maintenance notes here..."
                                placeholderTextColor="#A0AEC0"
                                value={logText}
                                onChangeText={setLogText}
                                textAlignVertical="top"
                            />
                        </View>

                        <Text style={[styles.obsLabel, { marginTop: 20 }]}>Attachments</Text>
                        <View style={styles.attachmentsRow}>
                            <TouchableOpacity style={styles.addPhotoBtn}>
                                <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#2B6CB0" />
                                <Text style={styles.addPhotoText}>Add Photo</Text>
                            </TouchableOpacity>

                            {/* Fake uploaded photo thumbnail */}
                            <View style={styles.photoThumbnail}>
                                <View style={styles.escalatorStairsSim} />
                                <View style={styles.escalatorStairsSim} />
                                <View style={styles.escalatorStairsSim} />
                            </View>
                        </View>

                    </View>

                </View>
            </ScrollView>

            {/* Sticky Bottom Action */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.submitBtn} activeOpacity={0.8} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" style={styles.btnIcon} />
                    <Text style={styles.submitBtnText}>Submit Checklist & Log</Text>
                </TouchableOpacity>
            </View>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    header: {
        backgroundColor: '#FAFAFA',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
    },
    headerSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    subtitleText: {
        fontSize: 13,
        color: '#718096',
        marginLeft: 6,
    },
    dotSeparator: {
        color: '#CBD5E0',
        marginHorizontal: 8,
        fontSize: 14,
    },
    progressContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2B6CB0', // Deep blue
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2B6CB0',
    },
    scrollArea: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
        paddingBottom: 40,
    },
    sectionHeading: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1A202C',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 8,
    },
    checksCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7',
    },
    checkRowLast: {
        borderBottomWidth: 0,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#CBD5E0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        marginTop: 2,
    },
    checkboxActive: {
        backgroundColor: '#2B6CB0',
        borderColor: '#2B6CB0',
    },
    checkTexts: {
        flex: 1,
    },
    checkTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#1A202C',
        marginBottom: 4,
    },
    checkDesc: {
        fontSize: 13,
        color: '#718096',
        lineHeight: 18,
    },
    obsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
    },
    obsLabel: {
        fontSize: 14,
        color: '#4A5568',
        marginBottom: 12,
    },
    textAreaContainer: {
        borderWidth: 1,
        borderColor: '#CBD5E0',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#FFFFFF',
    },
    textArea: {
        minHeight: 80,
        fontSize: 15,
        color: '#1A202C',
    },
    attachmentsRow: {
        flexDirection: 'row',
    },
    addPhotoBtn: {
        borderWidth: 1,
        borderColor: '#90CDF4',
        borderStyle: 'dashed',
        borderRadius: 8,
        backgroundColor: '#EBF8FF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 12,
    },
    addPhotoText: {
        color: '#2B6CB0',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 8,
    },
    photoThumbnail: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: '#2D3748',
        overflow: 'hidden',
        justifyContent: 'space-evenly',
        padding: 2,
    },
    escalatorStairsSim: {
        height: 10,
        backgroundColor: '#4A5568',
        width: '100%',
        borderBottomWidth: 2,
        borderBottomColor: '#ECC94B',
    },
    bottomBar: {
        backgroundColor: '#F3F4F6', // Off-white matching the design bottom
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    submitBtn: {
        backgroundColor: '#2B6CB0', // Bright Blue
        borderRadius: 8,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        shadowColor: '#2B6CB0',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    btnIcon: {
        marginRight: 8,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
