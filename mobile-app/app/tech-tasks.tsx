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
import { getMyAssignments, type Assignment } from '../utils/api';
import { TechBottomNav } from './tech-dashboard';

export default function TechTasksScreen() {
    const [activeTab, setActiveTab] = useState<'Checklists' | 'Log Sheets'>('Checklists');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAssignments();
    }, []);

    const loadAssignments = async () => {
        try {
            setError(null);
            const data = await getMyAssignments();
            setAssignments(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load assignments');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadAssignments();
    };

    const filteredAssignments = assignments.filter(a =>
        activeTab === 'Checklists'
            ? a.templateType === 'checklist'
            : a.templateType === 'logsheet'
    );

    const handleTaskPress = (item: Assignment) => {
        router.push({
            pathname: '/assignment-form',
            params: {
                templateType: item.templateType,
                templateId: String(item.templateId),
                templateName: item.templateName,
                assignmentId: String(item.assignmentId),
                assetId: item.assetId ? String(item.assetId) : '',
                assetName: item.assetName || '',
            },
        });
    };

    const renderTask = (item: Assignment) => {
        const isChecklist = item.templateType === 'checklist';
        const accentColor = isChecklist ? '#7C3AED' : '#2563EB';

        return (
            <TouchableOpacity
                key={item.assignmentId}
                style={styles.taskCard}
                activeOpacity={0.8}
                onPress={() => handleTaskPress(item)}
            >
                <View style={[styles.cardLeftBorder, { backgroundColor: accentColor }]} />

                <View style={styles.cardContent}>
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.pillGroup}>
                            <View style={[styles.statusPill, { backgroundColor: isChecklist ? '#EDE9FE' : '#DBEAFE' }]}>
                                <Text style={[styles.statusPillText, { color: accentColor }]}>
                                    {isChecklist ? 'CHECKLIST' : 'LOGSHEET'}
                                </Text>
                            </View>
                            {item.assetType ? (
                                <Text style={[styles.tagText, { color: '#718096' }]}>{item.assetType}</Text>
                            ) : null}
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#A0AEC0" />
                    </View>

                    <Text style={styles.taskTitle} numberOfLines={2}>{item.templateName}</Text>

                    {item.description ? (
                        <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}

                    <View style={styles.cardFooterRow}>
                        {item.assetName ? (
                            <View style={styles.locationGroup}>
                                <MaterialCommunityIcons name="office-building-outline" size={14} color="#2B6CB0" />
                                <Text style={styles.locationText}>{item.assetName}</Text>
                            </View>
                        ) : null}
                        {item.assignedBy ? (
                            <Text style={styles.timeText}>
                                By {item.assignedBy}
                            </Text>
                        ) : null}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const checklistCount = assignments.filter(a => a.templateType === 'checklist').length;
    const logsheetCount = assignments.filter(a => a.templateType === 'logsheet').length;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Assigned Tasks</Text>
                <View style={styles.profileCircle}>
                    <MaterialCommunityIcons name="account" size={18} color="#1E3A8A" />
                </View>
            </View>

            <ScrollView
                style={styles.scrollArea}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Top Tabs */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'Checklists' && styles.tabBtnActive]}
                        onPress={() => setActiveTab('Checklists')}
                    >
                        <Text style={[styles.tabText, activeTab === 'Checklists' && styles.tabTextActive]}>
                            Checklists ({checklistCount})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'Log Sheets' && styles.tabBtnActive]}
                        onPress={() => setActiveTab('Log Sheets')}
                    >
                        <Text style={[styles.tabText, activeTab === 'Log Sheets' && styles.tabTextActive]}>
                            Log Sheets ({logsheetCount})
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Date & Progress Area */}
                <View style={styles.progressHeader}>
                    <View>
                        <Text style={styles.todayLabel}>TODAY</Text>
                        <Text style={styles.dateText}>{today}</Text>
                    </View>
                    <View style={styles.progressRight}>
                        <View>
                            <Text style={styles.progressLabel}>Pending</Text>
                            <Text style={styles.progressFraction}>{filteredAssignments.length} task{filteredAssignments.length !== 1 ? 's' : ''}</Text>
                        </View>
                    </View>
                </View>

                {/* Content */}
                <View style={styles.listContainer}>
                    {isLoading ? (
                        <View style={styles.centeredMsg}>
                            <ActivityIndicator size="large" color="#1E3A8A" />
                            <Text style={styles.loadingText}>Loading tasks...</Text>
                        </View>
                    ) : error ? (
                        <View style={styles.centeredMsg}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={loadAssignments}>
                                <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : filteredAssignments.length === 0 ? (
                        <View style={styles.centeredMsg}>
                            <MaterialCommunityIcons
                                name={activeTab === 'Checklists' ? 'clipboard-check-outline' : 'notebook-outline'}
                                size={56}
                                color="#CBD5E0"
                            />
                            <Text style={styles.emptyText}>No {activeTab.toLowerCase()} assigned yet</Text>
                            <Text style={styles.emptySubText}>Your supervisor will assign tasks here</Text>
                        </View>
                    ) : (
                        filteredAssignments.map(renderTask)
                    )}
                </View>
            </ScrollView>

            {/* Bottom Nav */}
            <TechBottomNav activeRoute="tasks" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E3A8A',
    },
    profileCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#EBF8FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollArea: {
        flex: 1,
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        padding: 4,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 6,
    },
    tabBtnActive: {
        backgroundColor: '#1E3A8A',
    },
    tabText: {
        color: '#A0AEC0',
        fontWeight: '600',
        fontSize: 13,
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: 24,
        marginBottom: 16,
    },
    todayLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#718096',
        letterSpacing: 1,
        marginBottom: 4,
    },
    dateText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
    },
    progressRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: 10,
        color: '#718096',
        textAlign: 'right',
    },
    progressFraction: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1E3A8A',
        textAlign: 'right',
    },
    progressCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 3,
        borderColor: '#1E3A8A',
        marginLeft: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressCircleInner: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 3,
        borderColor: '#EDF2F7',
        position: 'absolute',
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        transform: [{ rotate: '45deg' }]
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 16,
        flexDirection: 'column',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        position: 'relative',
    },
    cardLeftBorder: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        zIndex: 1,
    },
    cardContent: {
        padding: 16,
        paddingLeft: 20,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    pillGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginRight: 8,
    },
    statusPillText: {
        fontSize: 10,
        fontWeight: '800',
    },
    tagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 6,
    },
    taskDesc: {
        fontSize: 13,
        color: '#718096',
        lineHeight: 18,
        marginBottom: 16,
    },
    textStrikeout: {
        textDecorationLine: 'line-through',
        color: '#A0AEC0',
    },
    cardFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    timeGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timeText: {
        fontSize: 12,
        color: '#718096',
        marginLeft: 6,
    },
    userAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#ED8936',
    },
    locationGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    locationText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2B6CB0',
        marginLeft: 4,
    },
    completedText: {
        fontSize: 11,
        color: '#48BB78',
        fontWeight: '500',
    },
    doneCheckCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#F0FFF4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    resumeBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFF0',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#FEFCBF',
    },
    resumeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#975A16',
    },
    centeredMsg: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    loadingText: {
        fontSize: 15,
        color: '#718096',
        marginTop: 8,
    },
    errorText: {
        fontSize: 15,
        color: '#EF4444',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    retryBtn: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 4,
    },
    retryText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#4A5568',
        marginTop: 8,
    },
    emptySubText: {
        fontSize: 13,
        color: '#A0AEC0',
        textAlign: 'center',
    },
});
