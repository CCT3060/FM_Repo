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
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    getMyAssignments,
    getUnassignedTemplates,
    getMyTeam,
    supervisorAssignTemplate,
    reassignTemplate,
    getStoredUser,
} from '../utils/api';
import { SupervisorBottomNav } from './supervisor-dashboard';

interface Template {
    id: number;
    assignmentId?: number;   // present if this came from my-assignments
    templateType: 'checklist' | 'logsheet';
    templateName: string;
    description?: string;
    assetType?: string;
    assetId?: number | null;
    assetName?: string | null;
    createdAt?: string;
    assignedAt?: string;
    assignedBy?: string;
    note?: string;
    source: 'assigned' | 'unassigned';
}

interface TeamMember {
    id: number;
    fullName?: string;
    fullname?: string;
    role: string;
}

type ActiveTab = 'assigned' | 'unassigned';
type TypeFilter = 'all' | 'checklist' | 'logsheet';

export default function ChecklistManagementScreen() {
    const [assignedTemplates, setAssignedTemplates] = useState<Template[]>([]);
    const [unassignedTemplates, setUnassignedTemplates] = useState<Template[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [isSupervisor, setIsSupervisor] = useState<boolean | null>(null); // null = unknown yet

    const [activeTab, setActiveTab] = useState<ActiveTab>('assigned');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [assignNote, setAssignNote] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    // Reload whenever this screen gains focus — covers initial mount AND returning from assignment-form
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setError(null);

            // Determine user role first (from local cache — no extra network call)
            const storedUser = await getStoredUser();
            const supervisor = storedUser?.role === 'supervisor';
            setIsSupervisor(supervisor);

            // Always load personal assignments
            const myAssignments = await getMyAssignments();

            setAssignedTemplates(
                (myAssignments as any[]).map((a: any) => ({
                    id: a.templateId,
                    assignmentId: a.assignmentId,
                    templateType: a.templateType,
                    templateName: a.templateName || 'Untitled',
                    description: a.description,
                    assetType: a.assetType,
                    assetId: a.assetId ?? null,
                    assetName: a.assetName ?? null,
                    assignedAt: a.assignedAt,
                    assignedBy: a.assignedBy,
                    note: a.note,
                    source: 'assigned' as const,
                }))
            );

            // Supervisor-only: load unassigned templates + team roster
            if (supervisor) {
                const [unassigned, team] = await Promise.all([
                    getUnassignedTemplates(),
                    getMyTeam(),
                ]);

                setUnassignedTemplates(
                    (unassigned as any[]).map((t: any) => ({
                        id: t.id,
                        templateType: t.templateType,
                        templateName: t.templateName || 'Untitled',
                        description: t.description,
                        assetType: t.assetType,
                        createdAt: t.createdAt,
                        source: 'unassigned' as const,
                    }))
                );

                setTeamMembers(team as TeamMember[]);
            } else {
                // Employees have no unassigned templates to browse
                setUnassignedTemplates([]);
                setTeamMembers([]);
                // Always show the "Assigned to Me" tab for employees
                setActiveTab('assigned');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load templates');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => { setRefreshing(true); loadData(); };

    const currentList = activeTab === 'assigned' ? assignedTemplates : unassignedTemplates;

    const filteredList = currentList.filter((t) => {
        if (typeFilter !== 'all' && t.templateType !== typeFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return (
                (t.templateName || '').toLowerCase().includes(q) ||
                (t.assetType || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const assignedChecklistCount = assignedTemplates.filter((t) => t.templateType === 'checklist').length;
    const assignedLogsheetCount  = assignedTemplates.filter((t) => t.templateType === 'logsheet').length;
    const unassignedChecklistCount = unassignedTemplates.filter((t) => t.templateType === 'checklist').length;
    const unassignedLogsheetCount  = unassignedTemplates.filter((t) => t.templateType === 'logsheet').length;

    const handleFillNow = (template: Template) => {
        router.push({
            pathname: '/assignment-form',
            params: {
                templateType: template.templateType,
                templateId: template.id.toString(),
                templateName: template.templateName,
                assignmentId: template.assignmentId?.toString() || '0',
                assetId: template.assetId ? String(template.assetId) : '',
                assetName: template.assetName || '',
            },
        });
    };

    const handleAssignToTeam = (template: Template) => {
        if (teamMembers.length === 0) {
            Alert.alert('No Team Members', 'You have no team members to assign to.');
            return;
        }
        setSelectedTemplate(template);
        setAssignNote(template.note || '');
        setShowAssignModal(true);
    };

    const performAssign = async (memberId: number) => {
        if (!selectedTemplate) return;
        setIsAssigning(true);
        try {
            if (selectedTemplate.source === 'assigned' && selectedTemplate.assignmentId) {
                // Reassign an existing assignment to a team member
                await reassignTemplate(selectedTemplate.assignmentId, memberId, assignNote || undefined);
            } else {
                // Create a fresh assignment to the team member
                await supervisorAssignTemplate(
                    selectedTemplate.templateType,
                    selectedTemplate.id,
                    memberId,
                    assignNote || undefined
                );
            }
            Alert.alert('Success', 'Template assigned to team member successfully');
            setShowAssignModal(false);
            setSelectedTemplate(null);
            loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to assign template');
        } finally {
            setIsAssigning(false);
        }
    };

    const renderCard = (item: Template) => {
        const isChecklist = item.templateType === 'checklist';
        const dateLabel = item.assignedAt
            ? `Assigned ${new Date(item.assignedAt).toLocaleDateString()}`
            : item.createdAt
            ? `Added ${new Date(item.createdAt).toLocaleDateString()}`
            : '';

        return (
            <View key={`${item.source}-${item.id}-${item.assignmentId}`} style={styles.cardContainer}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: isChecklist ? '#EDE9FE' : '#DBEAFE' }]}>
                        <MaterialCommunityIcons
                            name={isChecklist ? 'clipboard-check-outline' : 'notebook-outline'}
                            size={22}
                            color={isChecklist ? '#7C3AED' : '#2563EB'}
                        />
                    </View>
                    <View style={styles.cardTitleContainer}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.templateName}</Text>
                        {item.assetType ? <Text style={styles.cardSubtitle}>{item.assetType}</Text> : null}
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: isChecklist ? '#EDE9FE' : '#DBEAFE' }]}>
                        <Text style={[styles.typeBadgeText, { color: isChecklist ? '#7C3AED' : '#2563EB' }]}>
                            {isChecklist ? 'Checklist' : 'Logsheet'}
                        </Text>
                    </View>
                </View>

                {item.description ? (
                    <Text style={styles.descriptionText} numberOfLines={2}>{item.description}</Text>
                ) : null}

                {item.assignedBy ? (
                    <View style={styles.assignedByRow}>
                        <MaterialCommunityIcons name="account-arrow-left-outline" size={13} color="#718096" />
                        <Text style={styles.assignedByText}>Assigned by: {item.assignedBy}</Text>
                    </View>
                ) : null}

                {item.note ? (
                    <View style={styles.noteRow}>
                        <MaterialCommunityIcons name="note-text-outline" size={13} color="#718096" />
                        <Text style={styles.noteText} numberOfLines={1}>{item.note}</Text>
                    </View>
                ) : null}

                <View style={styles.metaRow}>
                    <Text style={styles.dateText}>{dateLabel}</Text>
                </View>

                <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, styles.fillBtn]} onPress={() => handleFillNow(item)}>
                        <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
                        <Text style={styles.fillBtnText}>Fill Now</Text>
                    </TouchableOpacity>
                    {isSupervisor && (
                        <TouchableOpacity style={[styles.actionBtn, styles.assignBtn]} onPress={() => handleAssignToTeam(item)}>
                            <MaterialCommunityIcons name="account-arrow-right-outline" size={16} color="#1E3A8A" />
                            <Text style={styles.assignBtnText}>Assign to Team</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.headerBg}>
                <View style={styles.headerTop}>
                    <Text style={styles.headerTitle}>Checklists & Logsheets</Text>
                </View>

                {/* Main tabs: Assigned to Me / Unassigned (Unassigned only visible to supervisors) */}
                <View style={styles.mainTabContainer}>
                    <TouchableOpacity
                        style={[styles.mainTab, activeTab === 'assigned' && styles.mainTabActive]}
                        onPress={() => setActiveTab('assigned')}
                    >
                        <Text style={[styles.mainTabText, activeTab === 'assigned' && styles.mainTabTextActive]}>
                            Assigned to Me ({assignedTemplates.length})
                        </Text>
                    </TouchableOpacity>
                    {isSupervisor && (
                        <TouchableOpacity
                            style={[styles.mainTab, activeTab === 'unassigned' && styles.mainTabActive]}
                            onPress={() => setActiveTab('unassigned')}
                        >
                            <Text style={[styles.mainTabText, activeTab === 'unassigned' && styles.mainTabTextActive]}>
                                Unassigned ({unassignedTemplates.length})
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Type filter chips */}
                <View style={styles.typeFilterRow}>
                    {(['all', 'checklist', 'logsheet'] as TypeFilter[]).map((f) => {
                        const counts = activeTab === 'assigned'
                            ? { all: assignedTemplates.length, checklist: assignedChecklistCount, logsheet: assignedLogsheetCount }
                            : { all: unassignedTemplates.length, checklist: unassignedChecklistCount, logsheet: unassignedLogsheetCount };
                        return (
                            <TouchableOpacity
                                key={f}
                                style={[styles.typeChip, typeFilter === f && styles.typeChipActive]}
                                onPress={() => setTypeFilter(f)}
                            >
                                <Text style={[styles.typeChipText, typeFilter === f && styles.typeChipTextActive]}>
                                    {f === 'all' ? `All (${counts.all})` : f === 'checklist' ? `Checklists (${counts.checklist})` : `Logsheets (${counts.logsheet})`}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {isLoading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            ) : error ? (
                <View style={styles.centerContent}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E53E3E" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} />}
                >
                    {/* Search */}
                    <View style={styles.searchContainer}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#718096" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by name or asset type..."
                            placeholderTextColor="#A0AEC0"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <MaterialCommunityIcons name="close-circle" size={18} color="#A0AEC0" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Info banner for assigned tab */}
                    {activeTab === 'assigned' && filteredList.length > 0 && (
                        <View style={styles.infoBanner}>
                            <MaterialCommunityIcons name="information-outline" size={14} color="#1E3A8A" />
                            <Text style={styles.infoBannerText}>
                                These were assigned to you by your admin. You can fill them yourself or delegate to your team.
                            </Text>
                        </View>
                    )}

                    {filteredList.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons
                                name={activeTab === 'assigned' ? 'clipboard-text-outline' : 'clipboard-check-outline'}
                                size={64}
                                color="#CBD5E0"
                            />
                            <Text style={styles.emptyTitle}>
                                {activeTab === 'assigned' ? 'No Assignments Yet' : 'All Assigned!'}
                            </Text>
                            <Text style={styles.emptyText}>
                                {searchQuery
                                    ? 'No templates match your search'
                                    : activeTab === 'assigned'
                                    ? 'Your admin has not assigned any templates to you yet'
                                    : 'All templates are already assigned to someone'}
                            </Text>
                        </View>
                    ) : (
                        filteredList.map((item) => renderCard(item))
                    )}
                    <View style={{ height: 90 }} />
                </ScrollView>
            )}

            {/* Assign to Team Modal */}
            <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Assign to Team Member</Text>
                            <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                                <MaterialCommunityIcons name="close" size={24} color="#4A5568" />
                            </TouchableOpacity>
                        </View>
                        {selectedTemplate && (
                            <Text style={styles.modalSubtitle} numberOfLines={2}>{selectedTemplate.templateName}</Text>
                        )}
                        <TextInput
                            style={styles.noteInput}
                            placeholder="Optional note for team member..."
                            placeholderTextColor="#A0AEC0"
                            value={assignNote}
                            onChangeText={setAssignNote}
                            multiline
                        />
                        <Text style={styles.memberLabel}>Select Team Member:</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {teamMembers.map((member) => {
                                const name = member.fullName || (member as any).fullname || 'Unknown';
                                const initials = name.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase();
                                return (
                                    <TouchableOpacity
                                        key={member.id}
                                        style={styles.memberRow}
                                        onPress={() => performAssign(member.id)}
                                        disabled={isAssigning}
                                    >
                                        <View style={styles.memberAvatar}>
                                            <Text style={styles.memberInitials}>{initials}</Text>
                                        </View>
                                        <View style={styles.memberInfo}>
                                            <Text style={styles.memberName}>{name}</Text>
                                            <Text style={styles.memberRole}>{member.role}</Text>
                                        </View>
                                        {isAssigning ? (
                                            <ActivityIndicator size="small" color="#1E3A8A" />
                                        ) : (
                                            <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E0" />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <SupervisorBottomNav activeRoute="checklists" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7FAFC' },
    headerBg: {
        backgroundColor: '#1E3A8A',
        paddingTop: Platform.OS === 'android' ? 30 : 0,
        paddingBottom: 12,
    },
    headerTop: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
    headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
    mainTabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        backgroundColor: '#2A4365',
        borderRadius: 8,
        padding: 4,
        marginBottom: 10,
    },
    mainTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 6 },
    mainTabActive: { backgroundColor: '#FFFFFF' },
    mainTabText: { color: '#93C5FD', fontWeight: '600', fontSize: 12 },
    mainTabTextActive: { color: '#1E3A8A' },
    typeFilterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        paddingBottom: 4,
    },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: '#2A4365',
    },
    typeChipActive: { backgroundColor: '#60A5FA' },
    typeChipText: { color: '#93C5FD', fontSize: 11, fontWeight: '600' },
    typeChipTextActive: { color: '#1E3A8A' },
    listContent: { padding: 16, paddingBottom: 90 },
    searchContainer: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0',
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 14, color: '#1A202C' },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#EFF6FF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
        gap: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#1E3A8A',
    },
    infoBannerText: { flex: 1, fontSize: 12, color: '#1E3A8A', lineHeight: 18 },
    cardContainer: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 14,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
    iconCircle: { width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    cardTitleContainer: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C', marginBottom: 3 },
    cardSubtitle: { fontSize: 12, color: '#718096' },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
    typeBadgeText: { fontSize: 11, fontWeight: '700' },
    descriptionText: { fontSize: 13, color: '#4A5568', lineHeight: 18, marginBottom: 8 },
    assignedByRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
    assignedByText: { fontSize: 12, color: '#718096', fontStyle: 'italic' },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
    noteText: { fontSize: 12, color: '#718096', flex: 1 },
    metaRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
    dateText: { fontSize: 11, color: '#A0AEC0' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
    fillBtn: { backgroundColor: '#1E3A8A' },
    fillBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    assignBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
    assignBtnText: { color: '#1E3A8A', fontWeight: '700', fontSize: 13 },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { fontSize: 14, color: '#718096', marginTop: 12 },
    errorText: { fontSize: 14, color: '#E53E3E', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#1E3A8A', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingHorizontal: 20, paddingVertical: 24,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
    modalSubtitle: { fontSize: 13, color: '#718096', marginBottom: 16 },
    noteInput: {
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A202C',
        minHeight: 60, textAlignVertical: 'top', marginBottom: 16,
    },
    memberLabel: { fontSize: 13, fontWeight: '700', color: '#4A5568', marginBottom: 8 },
    memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12 },
    memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EBF8FF', justifyContent: 'center', alignItems: 'center' },
    memberInitials: { fontSize: 14, fontWeight: '700', color: '#2B6CB0' },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 15, fontWeight: '600', color: '#1A202C' },
    memberRole: { fontSize: 12, color: '#718096', textTransform: 'capitalize' },
});
