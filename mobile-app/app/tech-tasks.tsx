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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { getMyAssignments, getMySubmissionHistoryWithFallback, type Assignment, type SubmissionHistoryItem } from '../utils/api';
import { TechBottomNav } from './tech-dashboard';

export default function TechTasksScreen() {
    const [activeTab, setActiveTab] = useState<'Checklists' | 'Log Sheets' | 'History'>('Checklists');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [historyItems, setHistoryItems] = useState<SubmissionHistoryItem[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    useEffect(() => {
        loadAssignments();
    }, []);

    useEffect(() => {
        if (activeTab === 'History' && historyItems.length === 0) {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        setIsHistoryLoading(true);
        setHistoryError(null);
        try {
            const data = await getMySubmissionHistoryWithFallback(50);
            setHistoryItems(data);
        } catch (err: any) {
            setHistoryError(err.message || 'Failed to load history');
        } finally {
            setIsHistoryLoading(false);
        }
    };

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

    const renderTask = (item: Assignment, index: number) => {
        const isChecklist = item.templateType === 'checklist';
        const accentColor = isChecklist ? '#6366F1' : '#2563EB'; // Lighter, more premium indigo/blue

        return (
            <Animated.View key={item.assignmentId} entering={FadeInUp.delay(50 * index).duration(400).springify()}>
                <TouchableOpacity
                    style={styles.taskCard}
                    activeOpacity={0.7}
                    onPress={() => handleTaskPress(item)}
                >
                    <View style={[styles.cardLeftBorder, { backgroundColor: accentColor }]} />

                    <View style={styles.cardContent}>
                        <View style={styles.cardHeaderRow}>
                            <View style={styles.pillGroup}>
                                <View style={[styles.statusPill, { backgroundColor: isChecklist ? '#EEF2FF' : '#EFF6FF' }]}>
                                    <Text style={[styles.statusPillText, { color: accentColor }]}>
                                        {isChecklist ? 'CHECKLIST' : 'LOGSHEET'}
                                    </Text>
                                </View>
                                {item.assetType ? (
                                    <Text style={[styles.tagText, { color: '#64748B' }]}>{item.assetType}</Text>
                                ) : null}
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                        </View>

                        <Text style={styles.taskTitle} numberOfLines={2}>{item.templateName}</Text>

                        {item.description ? (
                            <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
                        ) : null}

                        <View style={styles.cardFooterRow}>
                            {item.assetName ? (
                                <View style={styles.locationGroup}>
                                    <MaterialCommunityIcons name="office-building" size={14} color="#64748B" />
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
            </Animated.View>
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
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={['#2563EB']} />}
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
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'History' && styles.tabBtnActive]}
                        onPress={() => setActiveTab('History')}
                    >
                        <Text style={[styles.tabText, activeTab === 'History' && styles.tabTextActive]}>
                            History
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Date & Progress Area — hidden on History tab */}
                {activeTab !== 'History' && <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.progressHeader}>
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
                </Animated.View>}

                {/* Content */}
                <View style={styles.listContainer}>
                    {isLoading ? (
                        <View style={styles.centeredMsg}>
                            <ActivityIndicator size="large" color="#2563EB" />
                            <Text style={styles.loadingText}>Loading tasks...</Text>
                        </View>
                    ) : error ? (
                        <Animated.View entering={FadeInUp.duration(400)} style={styles.centeredMsg}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={loadAssignments}>
                                <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    ) : activeTab !== 'History' && filteredAssignments.length === 0 ? (
                        <Animated.View entering={FadeInUp.duration(400)} style={styles.centeredMsg}>
                            <View style={styles.emptyIconCircle}>
                                <MaterialCommunityIcons
                                    name={activeTab === 'Checklists' ? 'clipboard-check-outline' : 'notebook-outline'}
                                    size={40}
                                    color="#10B981"
                                />
                            </View>
                            <Text style={styles.emptyText}>No {activeTab.toLowerCase()} assigned yet</Text>
                            <Text style={styles.emptySubText}>Your supervisor will assign tasks here</Text>
                        </Animated.View>
                    ) : activeTab === 'History' ? null : (
                        filteredAssignments.map((a, i) => renderTask(a, i))
                    )}  
                    {activeTab === 'History' && (
                        isHistoryLoading ? (
                            <View style={styles.centeredMsg}>
                                <ActivityIndicator size="large" color="#2563EB" />
                                <Text style={styles.loadingText}>Loading history...</Text>
                            </View>
                        ) : historyError ? (
                            <Animated.View entering={FadeInUp.duration(400)} style={styles.centeredMsg}>
                                <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                                <Text style={styles.errorText}>{historyError}</Text>
                                <TouchableOpacity style={styles.retryBtn} onPress={loadHistory}>
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        ) : historyItems.length === 0 ? (
                            <Animated.View entering={FadeInUp.duration(400)} style={styles.centeredMsg}>
                                <View style={styles.emptyIconCircle}>
                                    <MaterialCommunityIcons name="history" size={40} color="#6366F1" />
                                </View>
                                <Text style={styles.emptyText}>No submissions yet</Text>
                                <Text style={styles.emptySubText}>Your completed checklists and logsheets will appear here</Text>
                            </Animated.View>
                        ) : (
                            historyItems.map((item, i) => (
                                <Animated.View key={`${item.type}-${item.id}`} entering={FadeInUp.delay(40 * i).duration(350)}>
                                    <TouchableOpacity
                                        style={styles.historyCard}
                                        activeOpacity={0.75}
                                        onPress={() => router.push({ pathname: '/tech-history-detail', params: { type: item.type, id: item.id, name: item.templateName } })}
                                    >
                                        <View style={[styles.historyTypeBadge, { backgroundColor: item.type === 'checklist' ? '#EEF2FF' : '#EFF6FF' }]}>
                                            <MaterialCommunityIcons
                                                name={item.type === 'checklist' ? 'clipboard-check' : 'notebook'}
                                                size={16}
                                                color={item.type === 'checklist' ? '#6366F1' : '#2563EB'}
                                            />
                                            <Text style={[styles.historyTypeTxt, { color: item.type === 'checklist' ? '#6366F1' : '#2563EB' }]}>
                                                {item.type === 'checklist' ? 'CHECKLIST' : 'LOGSHEET'}
                                            </Text>
                                        </View>
                                        <Text style={styles.historyTitle} numberOfLines={2}>{item.templateName}</Text>
                                        {item.assetName ? (
                                            <View style={styles.historyMeta}>
                                                <MaterialCommunityIcons name="office-building" size={13} color="#94A3B8" />
                                                <Text style={styles.historyMetaTxt}>{item.assetName}</Text>
                                            </View>
                                        ) : null}
                                        <View style={styles.historyFooter}>
                                            <View style={[styles.historyStatusPill, { backgroundColor: item.status === 'completed' ? '#ECFDF5' : '#FFF7ED' }]}>
                                                <Text style={[styles.historyStatusTxt, { color: item.status === 'completed' ? '#10B981' : '#F59E0B' }]}>
                                                    {item.status === 'completed' ? 'Completed' : 'Submitted'}
                                                </Text>
                                            </View>
                                            <Text style={styles.historyDate}>
                                                {new Date(item.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Text>
                                        </View>
                                        <View style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                                            <MaterialCommunityIcons name="chevron-right" size={16} color="#CBD5E1" />
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            ))
                        )
                    )}
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
        backgroundColor: '#FAF9F6', // Lighter bg
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        paddingBottom: 16,
        backgroundColor: '#FAF9F6',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    profileCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    scrollArea: {
        flex: 1,
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 4,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabBtnActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        color: '#64748B',
        fontWeight: '600',
        fontSize: 13,
    },
    tabTextActive: {
        color: '#0F172A',
        fontWeight: '700',
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
        fontSize: 11,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1.2,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    dateText: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    progressRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: 11,
        color: '#64748B',
        textAlign: 'right',
        fontWeight: '500',
    },
    progressFraction: {
        fontSize: 13,
        fontWeight: '800',
        color: '#2563EB',
        textAlign: 'right',
    },

    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    taskCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 14,
        flexDirection: 'column',
        overflow: 'hidden',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
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
        marginBottom: 10,
    },
    pillGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
    },
    statusPillText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    tagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 6,
        letterSpacing: -0.2,
    },
    taskDesc: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 18,
        marginBottom: 16,
    },
    cardFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F8FAFC',
        paddingTop: 12,
    },
    timeText: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
    locationGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    locationText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    centeredMsg: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        borderStyle: 'dashed',
    },
    emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    loadingText: {
        fontSize: 15,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 8,
    },
    errorText: {
        fontSize: 15,
        color: '#EF4444',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    retryBtn: {
        backgroundColor: '#2563EB',
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
        fontWeight: '700',
        color: '#0F172A',
        marginTop: 8,
    },
    emptySubText: {
        fontSize: 14,
        color: '#94A3B8',
        textAlign: 'center',
    },
    historyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    historyTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
        marginBottom: 10,
    },
    historyTypeTxt: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    historyTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 6,
        letterSpacing: -0.2,
    },
    historyMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 12,
    },
    historyMetaTxt: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
    historyFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F8FAFC',
        paddingTop: 10,
    },
    historyStatusPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    historyStatusTxt: {
        fontSize: 12,
        fontWeight: '600',
    },
    historyDate: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
});
