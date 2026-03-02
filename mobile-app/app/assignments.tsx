import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getMyAssignments, getMyTeam, reassignTemplate, clearAuth, getStoredUser, type Assignment } from '../utils/api';
import { SupervisorBottomNav } from './supervisor-dashboard';

interface TeamMember {
    id: number;
    fullName: string;
    role: string;
}

export default function AssignmentsScreen() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [userRole, setUserRole] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [isReassigning, setIsReassigning] = useState(false);

    // Reload every time this screen comes into focus (e.g. after submitting a form)
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            const user = await getStoredUser();
            if (user?.role) setUserRole(user.role.toLowerCase());
        } catch { /* ignore */ }
        await Promise.all([loadAssignments(), loadTeamMembers()]);
    };

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
            } else {
                Alert.alert('Error', 'Failed to load assignments');
            }
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const loadTeamMembers = async () => {
        try {
            const data = await getMyTeam();
            setTeamMembers(data);
        } catch (error: any) {
            console.error('Failed to load team members:', error);
            // Don't show error alert for team members, just log it
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const handleFillAssignment = (assignment: Assignment) => {
        // Safety check for undefined values
        if (!assignment.templateId || !assignment.assignmentId) {
            Alert.alert('Error', 'Invalid assignment data. Please refresh and try again.');
            return;
        }

        router.push({
            pathname: '/assignment-form',
            params: {
                templateType: assignment.templateType || 'checklist',
                templateId: assignment.templateId.toString(),
                templateName: assignment.templateName || 'Untitled',
                assignmentId: assignment.assignmentId.toString(),
            },
        });
    };

    const handleReassign = (assignment: Assignment) => {
        if (teamMembers.length === 0) {
            Alert.alert('No Team Members', 'You don\'t have any team members to reassign to.');
            return;
        }
        setSelectedAssignment(assignment);
        setShowReassignModal(true);
    };

    const performReassignment = async (teamMemberId: number) => {
        if (!selectedAssignment) return;

        setIsReassigning(true);
        try {
            await reassignTemplate(selectedAssignment.assignmentId, teamMemberId);
            Alert.alert('Success', 'Assignment has been reassigned successfully');
            setShowReassignModal(false);
            setSelectedAssignment(null);
            // Reload assignments to reflect the change
            await loadAssignments();
        } catch (error: any) {
            console.error('Failed to reassign:', error);
            Alert.alert('Error', error.message || 'Failed to reassign assignment');
        } finally {
            setIsReassigning(false);
        }
    };

    const renderAssignmentCard = (assignment: Assignment) => {
        const isChecklist = assignment.templateType === 'checklist';
        const iconName = isChecklist ? 'clipboard-check-outline' : 'notebook-outline';
        const iconColor = isChecklist ? '#7C3AED' : '#2563EB';
        const bgColor = isChecklist ? '#F3E8FF' : '#EFF6FF';

        return (
            <View key={assignment.assignmentId} style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
                        <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                    </View>
                    <View style={styles.headerText}>
                        <Text style={styles.cardTitle}>{assignment.templateName || 'Untitled'}</Text>
                        <Text style={styles.cardType}>
                            {(assignment.templateType || 'unknown').toUpperCase()}
                            {assignment.assetType && ` • ${assignment.assetType}`}
                        </Text>
                    </View>
                </View>

                {assignment.description && (
                    <Text style={styles.cardDescription} numberOfLines={2}>
                        {assignment.description}
                    </Text>
                )}

                {assignment.note && (
                    <View style={styles.noteBox}>
                        <MaterialCommunityIcons name="note-text-outline" size={16} color="#718096" />
                        <Text style={styles.noteText}>{assignment.note}</Text>
                    </View>
                )}

                <View style={styles.cardMeta}>
                    <Text style={styles.metaText}>
                        Assigned by: {assignment.assignedBy || 'Admin'}
                    </Text>
                    <Text style={styles.metaText}>
                        {new Date(assignment.assignedAt).toLocaleDateString()}
                    </Text>
                </View>

                <View style={styles.cardActions}>
                    {userRole === 'supervisor' ? (
                        <View style={styles.viewOnlyBadge}>
                            <MaterialCommunityIcons name="eye-outline" size={16} color="#718096" />
                            <Text style={styles.viewOnlyText}>View Only — Supervisors cannot fill or reassign</Text>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.fillButton]}
                                onPress={() => handleFillAssignment(assignment)}
                            >
                                <MaterialCommunityIcons name="pencil" size={18} color="#FFFFFF" />
                                <Text style={styles.fillButtonText}>Fill Now</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, styles.reassignButton]}
                                onPress={() => handleReassign(assignment)}
                            >
                                <MaterialCommunityIcons name="account-arrow-right" size={18} color="#1E3A8A" />
                                <Text style={styles.reassignButtonText}>Reassign</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading assignments...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My Assignments</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />
                }
            >
                <View style={styles.contentPadding}>
                    {assignments.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="clipboard-off-outline" size={64} color="#CBD5E0" />
                            <Text style={styles.emptyTitle}>No Assignments</Text>
                            <Text style={styles.emptyText}>
                                You don't have any checklist or logsheet assignments yet.
                            </Text>
                        </View>
                    ) : (
                        <>
                            <View style={styles.statsRow}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{assignments.length}</Text>
                                    <Text style={styles.statLabel}>Total Assigned</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>
                                        {assignments.filter(a => a.templateType === 'checklist').length}
                                    </Text>
                                    <Text style={styles.statLabel}>Checklists</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>
                                        {assignments.filter(a => a.templateType === 'logsheet').length}
                                    </Text>
                                    <Text style={styles.statLabel}>Logsheets</Text>
                                </View>
                            </View>

                            {assignments.map(renderAssignmentCard)}
                        </>
                    )}
                </View>
            </ScrollView>

            {/* Team Member Selection Modal */}
            <Modal
                visible={showReassignModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowReassignModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Reassign to Team Member</Text>
                            <TouchableOpacity onPress={() => setShowReassignModal(false)}>
                                <MaterialCommunityIcons name="close" size={24} color="#4A5568" />
                            </TouchableOpacity>
                        </View>

                        {selectedAssignment && (
                            <View style={styles.assignmentInfo}>
                                <Text style={styles.assignmentInfoLabel}>Reassigning:</Text>
                                <Text style={styles.assignmentInfoText}>
                                    {selectedAssignment.templateName}
                                </Text>
                            </View>
                        )}

                        <ScrollView style={styles.teamMembersList}>
                            {teamMembers.length === 0 ? (
                                <View style={styles.emptyTeam}>
                                    <MaterialCommunityIcons name="account-off-outline" size={48} color="#CBD5E0" />
                                    <Text style={styles.emptyTeamText}>No team members available</Text>
                                </View>
                            ) : (
                                teamMembers.map((member) => (
                                    <TouchableOpacity
                                        key={member.id}
                                        style={styles.teamMemberCard}
                                        onPress={() => performReassignment(member.id)}
                                        disabled={isReassigning}
                                    >
                                        <View style={styles.memberAvatar}>
                                            <MaterialCommunityIcons name="account" size={24} color="#1E3A8A" />
                                        </View>
                                        <View style={styles.memberInfo}>
                                            <Text style={styles.memberName}>{member.fullName}</Text>
                                            <Text style={styles.memberRole}>{member.role}</Text>
                                        </View>
                                        {isReassigning ? (
                                            <ActivityIndicator size="small" color="#1E3A8A" />
                                        ) : (
                                            <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E0" />
                                        )}
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowReassignModal(false)}
                            disabled={isReassigning}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <SupervisorBottomNav activeRoute="checklists" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
    },
    headerSpacer: {
        width: 40,
    },
    scrollContent: {
        flex: 1,
    },
    contentPadding: {
        padding: 16,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    statNumber: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1E3A8A',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#718096',
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A202C',
        marginBottom: 4,
    },
    cardType: {
        fontSize: 12,
        color: '#718096',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardDescription: {
        fontSize: 14,
        color: '#4A5568',
        lineHeight: 20,
        marginBottom: 12,
    },
    noteBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F7FAFC',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
        gap: 8,
    },
    noteText: {
        flex: 1,
        fontSize: 13,
        color: '#4A5568',
    },
    cardMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    metaText: {
        fontSize: 12,
        color: '#718096',
    },
    cardActions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 6,
    },
    fillButton: {
        backgroundColor: '#1E3A8A',
    },
    fillButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    reassignButton: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    reassignButtonText: {
        color: '#1E3A8A',
        fontSize: 14,
        fontWeight: '700',
    },
    viewOnlyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F7FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 6,
        flex: 1,
    },
    viewOnlyText: {
        color: '#718096',
        fontSize: 12,
        fontStyle: 'italic',
        flex: 1,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A202C',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#718096',
        textAlign: 'center',
        maxWidth: 280,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 20,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
    },
    assignmentInfo: {
        backgroundColor: '#F7FAFC',
        padding: 16,
        marginHorizontal: 20,
        marginTop: 16,
        borderRadius: 8,
    },
    assignmentInfoLabel: {
        fontSize: 12,
        color: '#718096',
        marginBottom: 4,
        fontWeight: '600',
    },
    assignmentInfoText: {
        fontSize: 14,
        color: '#1A202C',
        fontWeight: '600',
    },
    teamMembersList: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    emptyTeam: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyTeamText: {
        fontSize: 14,
        color: '#718096',
        marginTop: 12,
    },
    teamMemberCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    memberAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A202C',
        marginBottom: 4,
    },
    memberRole: {
        fontSize: 13,
        color: '#718096',
        textTransform: 'capitalize',
    },
    cancelButton: {
        backgroundColor: '#F7FAFC',
        padding: 16,
        marginHorizontal: 20,
        marginVertical: 16,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#4A5568',
    },
});
