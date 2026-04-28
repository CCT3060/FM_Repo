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
    getMyUnassignedToTeam,
    getMyTeam,
    supervisorAssignTemplate,
    reassignTemplate,
    getStoredUser,
} from '../utils/api';

interface Template {
    id: number;
    assignmentId?: number;
    templateType: 'checklist' | 'logsheet';
    templateName: string;
    description?: string;
    assetType?: string;
    assetId?: number | null;
    assetName?: string | null;
    frequency?: string;
    location?: string;
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

function getPriority(frequency?: string): { label: string; bg: string; color: string } {
    const f = (frequency || '').toLowerCase();
    if (f === 'daily' || f === 'shift') return { label: 'HIGH PRIORITY', bg: '#FEE2E2', color: '#DC2626' };
    if (f === 'weekly') return { label: 'NORMAL PRIORITY', bg: '#F1F5F9', color: '#475569' };
    if (f === 'monthly' || f === 'quarterly' || f === 'yearly') return { label: 'LOW PRIORITY', bg: '#F1F5F9', color: '#94A3B8' };
    return { label: 'NORMAL PRIORITY', bg: '#F1F5F9', color: '#475569' };
}

// Bottom nav for Tasks screens
function TasksBottomNav({ activeRoute }: { activeRoute: string }) {
    return (
        <View style={navStyles.container}>
            <TouchableOpacity style={navStyles.tab} onPress={() => router.push('/checklists' as any)}>
                <MaterialCommunityIcons
                    name={activeRoute === 'tasks' ? 'clipboard-check' : 'clipboard-check-outline'}
                    size={24}
                    color={activeRoute === 'tasks' ? '#2563EB' : '#94A3B8'}
                />
                <Text style={[navStyles.label, activeRoute === 'tasks' && navStyles.labelActive]}>Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={navStyles.tab} onPress={() => router.push('/assets-list' as any)}>
                <MaterialCommunityIcons name="archive-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.label}>Assets</Text>
            </TouchableOpacity>
            <TouchableOpacity style={navStyles.tab} onPress={() => router.push('/team-assignments' as any)}>
                <MaterialCommunityIcons name="account-group-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.label}>Team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={navStyles.tab} onPress={() => router.push('/profile' as any)}>
                <MaterialCommunityIcons name="account-circle-outline" size={24} color="#94A3B8" />
                <Text style={navStyles.label}>Profile</Text>
            </TouchableOpacity>
        </View>
    );
}

const navStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
        paddingTop: 8,
    },
    tab: { flex: 1, alignItems: 'center', gap: 3 },
    label: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
    labelActive: { color: '#2563EB' },
});

export default function ChecklistManagementScreen() {
    const [assignedTemplates, setAssignedTemplates] = useState<Template[]>([]);
    const [unassignedTemplates, setUnassignedTemplates] = useState<Template[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [isSupervisor, setIsSupervisor] = useState<boolean | null>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [currentUserName, setCurrentUserName] = useState<string>('Me');

    const [activeTab, setActiveTab] = useState<ActiveTab>('unassigned');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [assignNote, setAssignNote] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setError(null);
            const storedUser = await getStoredUser();
            const supervisor = storedUser?.role === 'supervisor';
            setIsSupervisor(supervisor);
            if (storedUser?.id) setCurrentUserId(storedUser.id);
            if (storedUser?.fullName || storedUser?.full_name) {
                setCurrentUserName(storedUser.fullName || storedUser.full_name || 'Me');
            }

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
                    frequency: a.frequency,
                    location: a.location || a.assetName || a.assetType || '',
                    assignedAt: a.assignedAt,
                    assignedBy: a.assignedBy,
                    note: a.note,
                    source: 'assigned' as const,
                }))
            );

            if (supervisor) {
                const [unassigned, team] = await Promise.all([
                    getMyUnassignedToTeam(),
                    getMyTeam(),
                ]);
                setUnassignedTemplates(
                    (unassigned as any[]).map((t: any) => ({
                        id: t.templateId,
                        assignmentId: t.assignmentId,
                        templateType: t.templateType,
                        templateName: t.templateName || 'Untitled',
                        description: t.description,
                        assetType: t.assetType,
                        assetId: t.assetId ?? null,
                        frequency: t.frequency,
                        location: t.location || t.assetType || '',
                        assignedAt: t.assignedAt,
                        note: t.note,
                        source: 'assigned' as const,
                    }))
                );
                setTeamMembers(team as TeamMember[]);
            } else {
                setUnassignedTemplates([]);
                setTeamMembers([]);
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

    const handleViewChecklistHistory = (template: Template) => {
        const now = new Date();
        router.push({
            pathname: '/checklist-entry-view',
            params: {
                templateId: template.id.toString(),
                templateName: template.templateName,
                month: String(now.getMonth() + 1),
                year: String(now.getFullYear()),
            },
        } as any);
    };

    const handleAssignToTeam = (template: Template) => {
        setSelectedTemplate(template);
        setAssignNote(template.note || '');
        setShowAssignModal(true);
    };

    const performAssign = async (memberId: number) => {
        if (!selectedTemplate) return;
        setIsAssigning(true);
        try {
            if (selectedTemplate.source === 'assigned' && selectedTemplate.assignmentId) {
                await reassignTemplate(selectedTemplate.assignmentId, memberId, assignNote || undefined);
            } else {
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
        const priority = getPriority(item.frequency);
        const isChecklist = item.templateType === 'checklist';
        const locationText = item.assetName || item.location || item.assetType || '';

        return (
            <View key={`${item.source}-${item.id}-${item.assignmentId}`} style={styles.card}>
                {/* Badges row */}
                <View style={styles.badgeRow}>
                    <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                        <Text style={[styles.priorityBadgeText, { color: priority.color }]}>{priority.label}</Text>
                    </View>
                    <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{isChecklist ? 'CHECKLIST' : 'LOGSHEET'}</Text>
                    </View>
                </View>

                {/* Title */}
                <Text style={styles.cardTitle} numberOfLines={2}>{item.templateName}</Text>

                {/* Location row */}
                {locationText ? (
                    <View style={styles.locationRow}>
                        <MaterialCommunityIcons name="office-building-outline" size={14} color="#64748B" />
                        <Text style={styles.locationText} numberOfLines={1}>{locationText}</Text>
                    </View>
                ) : null}

                {/* Action buttons */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.fillBtn} onPress={() => handleFillNow(item)}>
                        <MaterialCommunityIcons name="format-list-bulleted" size={15} color="#2563EB" />
                        <Text style={styles.fillBtnText}>Fill Now</Text>
                    </TouchableOpacity>
                    {isChecklist && (
                        <TouchableOpacity style={styles.historyBtn} onPress={() => handleViewChecklistHistory(item)}>
                            <MaterialCommunityIcons name="table-eye" size={15} color="#7C3AED" />
                            <Text style={styles.historyBtnText}>History</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.assignBtn} onPress={() => handleAssignToTeam(item)}>
                        <MaterialCommunityIcons name="account-plus-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.assignBtnText}>Assign</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/supervisor-dashboard' as any)}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {activeTab === 'unassigned' ? 'Unassigned Tasks' : 'My Tasks'}
                </Text>
                <TouchableOpacity style={styles.bellBtn}>
                    <MaterialCommunityIcons name="bell-outline" size={20} color="#1E293B" />
                </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={styles.searchWrap}>
                <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search assets, tasks..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll} contentContainerStyle={styles.pillsContent}>
                {/* Main tab pills */}
                {isSupervisor && (
                    <TouchableOpacity
                        style={[styles.pill, activeTab === 'unassigned' && styles.pillActive]}
                        onPress={() => setActiveTab('unassigned')}
                    >
                        <Text style={[styles.pillText, activeTab === 'unassigned' && styles.pillTextActive]}>
                            Unassigned
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.pill, activeTab === 'assigned' && styles.pillActive]}
                    onPress={() => setActiveTab('assigned')}
                >
                    <Text style={[styles.pillText, activeTab === 'assigned' && styles.pillTextActive]}>
                        Assigned to Me
                    </Text>
                </TouchableOpacity>
                {/* Type filter pills */}
                {(['all', 'checklist', 'logsheet'] as TypeFilter[]).map((f) => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.pill, typeFilter === f && styles.pillActive]}
                        onPress={() => setTypeFilter(f)}
                    >
                        <Text style={[styles.pillText, typeFilter === f && styles.pillTextActive]}>
                            {f === 'all' ? 'All Tasks' : f === 'checklist' ? 'Checklists' : 'Logsheets'}
                            {' ▼'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
                >
                    {/* Section header */}
                    {filteredList.length > 0 && (
                        <Text style={styles.sectionHeader}>
                            {activeTab === 'unassigned'
                                ? `PENDING ASSIGNMENT (${filteredList.length})`
                                : `MY TASKS (${filteredList.length})`}
                        </Text>
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
                    <View style={{ height: 20 }} />
                </ScrollView>
            )}

            {/* Assign Modal */}
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
                            {/* Assign to Myself — always shown first */}
                            {currentUserId && (
                                <TouchableOpacity
                                    key="myself"
                                    style={[styles.memberRow, { backgroundColor: '#F0FDF4', borderRadius: 8, marginBottom: 4 }]}
                                    onPress={() => performAssign(currentUserId)}
                                    disabled={isAssigning}
                                >
                                    <View style={[styles.memberAvatar, { backgroundColor: '#DCFCE7' }]}>
                                        <MaterialCommunityIcons name="account-check" size={20} color="#16A34A" />
                                    </View>
                                    <View style={styles.memberInfo}>
                                        <Text style={[styles.memberName, { color: '#15803D' }]}>Assign to Myself</Text>
                                        <Text style={styles.memberRole}>{currentUserName}</Text>
                                    </View>
                                    {isAssigning ? (
                                        <ActivityIndicator size="small" color="#16A34A" />
                                    ) : (
                                        <MaterialCommunityIcons name="chevron-right" size={20} color="#86EFAC" />
                                    )}
                                </TouchableOpacity>
                            )}
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
                                            <ActivityIndicator size="small" color="#2563EB" />
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

            <TasksBottomNav activeRoute="tasks" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 36 : 12,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerBtn: { padding: 4 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1E293B' },
    bellBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
    },

    // Search
    searchWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
        borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: '#1E293B' },

    // Filter pills
    pillsScroll: { maxHeight: 48, marginBottom: 4 },
    pillsContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    pill: {
        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    },
    pillActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    pillText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    pillTextActive: { color: '#FFFFFF', fontWeight: '600' },

    // List
    listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

    // Section header
    sectionHeader: {
        fontSize: 11, fontWeight: '700', color: '#94A3B8',
        letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
    },

    // Cards
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
        marginBottom: 12, borderWidth: 1, borderColor: '#E8EDF3',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    },
    badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
    priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    priorityBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    typeBadge: {
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
        borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF',
    },
    typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#2563EB', letterSpacing: 0.3 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 8, lineHeight: 21 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    locationText: { fontSize: 13, color: '#64748B', flex: 1 },

    // Action buttons
    actionRow: { flexDirection: 'row', gap: 10 },
    fillBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 10, gap: 6,
    },
    fillBtnText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
    assignBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 10, gap: 6,
    },
    assignBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
    historyBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F5F3FF', borderRadius: 8, paddingVertical: 10, gap: 6,
    },
    historyBtnText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

    // States
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { fontSize: 14, color: '#94A3B8', marginTop: 12 },
    errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

    // Modal
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
    memberRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12,
    },
    memberAvatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center',
    },
    memberInitials: { fontSize: 14, fontWeight: '700', color: '#2563EB' },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 15, fontWeight: '600', color: '#1A202C' },
    memberRole: { fontSize: 12, color: '#718096', textTransform: 'capitalize' },
});
