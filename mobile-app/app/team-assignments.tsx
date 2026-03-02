import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { getTeamAssignments } from '../utils/api';

type FilterType = 'all' | 'checklist' | 'logsheet';

export default function TeamAssignmentsScreen() {
    const [assignments, setAssignments] = useState<any[]>([]);
    const [filteredAssignments, setFilteredAssignments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [nameSearch, setNameSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        applyLocalFilters();
    }, [assignments, activeFilter, nameSearch]);

    const loadData = async () => {
        try {
            setError(null);
            const data = await getTeamAssignments({
                type: activeFilter === 'all' ? undefined : activeFilter,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            });
            setAssignments(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load team assignments');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const applyLocalFilters = () => {
        let filtered = [...assignments];
        if (activeFilter !== 'all') {
            filtered = filtered.filter((a) => a.templateType === activeFilter);
        }
        if (nameSearch.trim()) {
            const q = nameSearch.toLowerCase();
            filtered = filtered.filter(
                (a) =>
                    (a.templateName || '').toLowerCase().includes(q) ||
                    (a.assetType || '').toLowerCase().includes(q) ||
                    (a.assignedToName || '').toLowerCase().includes(q)
            );
        }
        setFilteredAssignments(filtered);
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const applyDateFilters = () => {
        setIsLoading(true);
        loadData();
        setShowFilters(false);
    };

    const clearDateFilters = () => {
        setDateFrom('');
        setDateTo('');
    };

    const checklistCount = assignments.filter((a) => a.templateType === 'checklist').length;
    const logsheetCount = assignments.filter((a) => a.templateType === 'logsheet').length;

    const renderItem = ({ item }: { item: any }) => {
        const isChecklist = item.templateType === 'checklist';
        const initials = item.assignedToName
            ? item.assignedToName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
            : '?';

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View
                        style={[
                            styles.typeIcon,
                            { backgroundColor: isChecklist ? '#EDE9FE' : '#DBEAFE' },
                        ]}
                    >
                        <MaterialCommunityIcons
                            name={isChecklist ? 'clipboard-check-outline' : 'notebook-outline'}
                            size={18}
                            color={isChecklist ? '#7C3AED' : '#2563EB'}
                        />
                    </View>
                    <View style={styles.cardContent}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.templateName || 'Untitled'}
                        </Text>
                        {item.assetType ? (
                            <Text style={styles.cardMeta}>{item.assetType}</Text>
                        ) : null}
                    </View>
                    <View
                        style={[
                            styles.typePill,
                            { backgroundColor: isChecklist ? '#EDE9FE' : '#DBEAFE' },
                        ]}
                    >
                        <Text
                            style={[
                                styles.typePillText,
                                { color: isChecklist ? '#7C3AED' : '#2563EB' },
                            ]}
                        >
                            {isChecklist ? 'Checklist' : 'Logsheet'}
                        </Text>
                    </View>
                </View>

                <View style={styles.assignedRow}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.assignedInfo}>
                        <Text style={styles.assignedName}>{item.assignedToName || 'Unknown'}</Text>
                        <Text style={styles.assignedRole}>{item.assignedToRole || ''}</Text>
                    </View>
                    <Text style={styles.assignedDate}>
                        {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : ''}
                    </Text>
                </View>

                {item.note ? (
                    <View style={styles.noteBox}>
                        <MaterialCommunityIcons name="note-text-outline" size={14} color="#718096" />
                        <Text style={styles.noteText} numberOfLines={1}>
                            {item.note}
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Team Assignments</Text>
                    <Text style={styles.headerSub}>{assignments.length} total</Text>
                </View>
                <TouchableOpacity
                    style={[styles.filterIconBtn, showFilters && styles.filterIconBtnActive]}
                    onPress={() => setShowFilters(!showFilters)}
                >
                    <MaterialCommunityIcons name="tune-variant" size={22} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            {/* Date Filter Panel */}
            {showFilters && (
                <View style={styles.filterPanel}>
                    <Text style={styles.filterPanelTitle}>Filter by Date</Text>
                    <View style={styles.filterRow}>
                        <View style={styles.filterInputWrap}>
                            <Text style={styles.filterLabel}>From</Text>
                            <TextInput
                                style={styles.filterInput}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor="#A0AEC0"
                                value={dateFrom}
                                onChangeText={setDateFrom}
                            />
                        </View>
                        <View style={styles.filterInputWrap}>
                            <Text style={styles.filterLabel}>To</Text>
                            <TextInput
                                style={styles.filterInput}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor="#A0AEC0"
                                value={dateTo}
                                onChangeText={setDateTo}
                            />
                        </View>
                    </View>
                    <View style={styles.filterActions}>
                        <TouchableOpacity style={styles.clearBtn} onPress={clearDateFilters}>
                            <Text style={styles.clearBtnText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.applyBtn} onPress={applyDateFilters}>
                            <Text style={styles.applyBtnText}>Apply</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Type Tabs */}
            <View style={styles.tabRow}>
                {(['all', 'checklist', 'logsheet'] as FilterType[]).map((t) => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.tabBtn, activeFilter === t && styles.tabBtnActive]}
                        onPress={() => setActiveFilter(t)}
                    >
                        <Text style={[styles.tabBtnText, activeFilter === t && styles.tabBtnTextActive]}>
                            {t === 'all'
                                ? `All (${assignments.length})`
                                : t === 'checklist'
                                ? `Checklists (${checklistCount})`
                                : `Logsheets (${logsheetCount})`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Search */}
            <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color="#718096" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, asset type or team member..."
                    placeholderTextColor="#A0AEC0"
                    value={nameSearch}
                    onChangeText={setNameSearch}
                />
                {nameSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setNameSearch('')}>
                        <MaterialCommunityIcons name="close-circle" size={18} color="#CBD5E0" />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                    <Text style={styles.loadingText}>Loading assignments...</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#E53E3E" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryBtnText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={filteredAssignments}
                    keyExtractor={(item, idx) => `${item.assignmentId ?? idx}`}
                    renderItem={renderItem}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={['#1E3A8A']}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <MaterialCommunityIcons
                                name="clipboard-off-outline"
                                size={48}
                                color="#CBD5E0"
                            />
                            <Text style={styles.emptyTitle}>No Assignments Found</Text>
                            <Text style={styles.emptyText}>
                                {nameSearch
                                    ? 'No results match your search'
                                    : 'No templates have been assigned to your team yet'}
                            </Text>
                        </View>
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7FAFC' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E3A8A',
        paddingTop: Platform.OS === 'android' ? 30 : 0,
        paddingBottom: 14,
        paddingHorizontal: 16,
        gap: 12,
    },
    backBtn: { padding: 4 },
    headerCenter: { flex: 1 },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    headerSub: { color: '#93C5FD', fontSize: 12, marginTop: 2 },
    filterIconBtn: { padding: 6, borderRadius: 8 },
    filterIconBtnActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
    filterPanel: {
        backgroundColor: '#EBF8FF',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#BEE3F8',
    },
    filterPanelTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E40AF',
        marginBottom: 10,
    },
    filterRow: { flexDirection: 'row', gap: 12 },
    filterInputWrap: { flex: 1 },
    filterLabel: { fontSize: 12, fontWeight: '600', color: '#2B6CB0', marginBottom: 4 },
    filterInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#BEE3F8',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        color: '#1A202C',
    },
    filterActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    clearBtn: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#BEE3F8',
        alignItems: 'center',
    },
    clearBtnText: { color: '#2B6CB0', fontWeight: '600', fontSize: 13 },
    applyBtn: {
        flex: 2,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: '#2563EB',
        alignItems: 'center',
    },
    applyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabBtnActive: { borderBottomColor: '#2563EB' },
    tabBtnText: { fontSize: 12, fontWeight: '600', color: '#718096' },
    tabBtnTextActive: { color: '#2563EB' },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginVertical: 10,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: '#1A202C' },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 10,
    },
    typeIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    cardContent: { flex: 1 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
    cardMeta: { fontSize: 12, color: '#718096', marginTop: 2 },
    typePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
    typePillText: { fontSize: 11, fontWeight: '700' },
    assignedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#EBF8FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: { fontSize: 12, fontWeight: '700', color: '#2B6CB0' },
    assignedInfo: { flex: 1 },
    assignedName: { fontSize: 13, fontWeight: '600', color: '#1A202C' },
    assignedRole: { fontSize: 11, color: '#718096', textTransform: 'capitalize' },
    assignedDate: { fontSize: 11, color: '#A0AEC0' },
    noteBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 6,
        padding: 6,
        marginTop: 8,
        gap: 6,
    },
    noteText: { flex: 1, fontSize: 12, color: '#718096' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { fontSize: 14, color: '#718096', marginTop: 12 },
    errorText: { fontSize: 14, color: '#E53E3E', marginTop: 12, textAlign: 'center' },
    retryBtn: {
        marginTop: 16,
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A202C',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: { fontSize: 14, color: '#718096', textAlign: 'center' },
});
