import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import { TechBottomNav } from './tech-dashboard';

interface TrainingModule {
    id: string;
    title: string;
    category: string;
    duration: string;
    progress: number; // 0–100
    icon: string;
    iconColor: string;
    iconBg: string;
    tags: string[];
}

const TRAINING_MODULES: TrainingModule[] = [
    {
        id: '1',
        title: 'Electrical Safety Fundamentals',
        category: 'Safety',
        duration: '45 min',
        progress: 100,
        icon: 'flash-outline',
        iconColor: '#D97706',
        iconBg: '#FEF3C7',
        tags: ['Required', 'Safety'],
    },
    {
        id: '2',
        title: 'HVAC Preventive Maintenance',
        category: 'Equipment',
        duration: '60 min',
        progress: 60,
        icon: 'air-conditioner',
        iconColor: '#2563EB',
        iconBg: '#DBEAFE',
        tags: ['Equipment', 'Maintenance'],
    },
    {
        id: '3',
        title: 'Fire Suppression Systems',
        category: 'Safety',
        duration: '30 min',
        progress: 0,
        icon: 'fire-extinguisher',
        iconColor: '#DC2626',
        iconBg: '#FEE2E2',
        tags: ['Required', 'Safety', 'Fire'],
    },
    {
        id: '4',
        title: 'Work Order Management',
        category: 'Operations',
        duration: '20 min',
        progress: 100,
        icon: 'clipboard-text-outline',
        iconColor: '#7C3AED',
        iconBg: '#EDE9FE',
        tags: ['Operations'],
    },
    {
        id: '5',
        title: 'Plumbing Inspection Checklist',
        category: 'Equipment',
        duration: '40 min',
        progress: 30,
        icon: 'pipe',
        iconColor: '#0891B2',
        iconBg: '#CFFAFE',
        tags: ['Equipment', 'Inspection'],
    },
    {
        id: '6',
        title: 'Emergency Response Procedures',
        category: 'Safety',
        duration: '50 min',
        progress: 0,
        icon: 'alert-circle-outline',
        iconColor: '#EF4444',
        iconBg: '#FEE2E2',
        tags: ['Required', 'Safety'],
    },
];

const CATEGORIES = ['All', 'Safety', 'Equipment', 'Operations'];

export default function TechTrainingScreen() {
    const [activeCategory, setActiveCategory] = useState('All');

    const filtered = activeCategory === 'All'
        ? TRAINING_MODULES
        : TRAINING_MODULES.filter(m => m.category === activeCategory);

    const completed = TRAINING_MODULES.filter(m => m.progress === 100).length;
    const total = TRAINING_MODULES.length;
    const overallPct = Math.round((completed / total) * 100);

    const getProgressColor = (pct: number) => {
        if (pct === 100) return '#10B981';
        if (pct > 0) return '#2563EB';
        return '#E2E8F0';
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Training</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* Overall progress card */}
                <Animated.View entering={FadeInUp.duration(400)} style={styles.progressCard}>
                    <View style={styles.progressRow}>
                        <View>
                            <Text style={styles.progressLabel}>Your Progress</Text>
                            <Text style={styles.progressValue}>{completed}/{total} modules completed</Text>
                        </View>
                        <View style={styles.pctCircle}>
                            <Text style={styles.pctText}>{overallPct}%</Text>
                        </View>
                    </View>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${overallPct}%` as any }]} />
                    </View>
                </Animated.View>

                {/* Category filter */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.catScroll}
                    contentContainerStyle={styles.catContent}
                >
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat}
                            style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                            onPress={() => setActiveCategory(cat)}
                        >
                            <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Module list */}
                <Animated.View layout={Layout.springify()} style={styles.listContainer}>
                    {filtered.map((mod, idx) => (
                        <Animated.View key={mod.id} entering={FadeInUp.delay(50 * idx).duration(500).springify()}>
                            <TouchableOpacity style={styles.moduleCard} activeOpacity={0.7}>
                                {/* Icon */}
                                <View style={[styles.moduleIcon, { backgroundColor: mod.iconBg }]}>
                                    <MaterialCommunityIcons name={mod.icon as any} size={24} color={mod.iconColor} />
                                </View>

                                {/* Content */}
                                <View style={styles.moduleContent}>
                                    <View style={styles.moduleTitleRow}>
                                        <Text style={styles.moduleTitle} numberOfLines={2}>{mod.title}</Text>
                                        {mod.progress === 100 && (
                                            <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
                                        )}
                                    </View>

                                    {/* Tags */}
                                    <View style={styles.tagsRow}>
                                        {mod.tags.map(tag => (
                                            <View
                                                key={tag}
                                                style={[
                                                    styles.tag,
                                                    tag === 'Required' && styles.tagRequired,
                                                ]}
                                            >
                                                <Text style={[styles.tagText, tag === 'Required' && styles.tagTextRequired]}>
                                                    {tag}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>

                                    {/* Duration + progress */}
                                    <View style={styles.moduleFooter}>
                                        <View style={styles.durationRow}>
                                            <MaterialCommunityIcons name="clock-outline" size={13} color="#94A3B8" />
                                            <Text style={styles.durationText}>{mod.duration}</Text>
                                        </View>
                                        <View style={styles.moduleProgressBg}>
                                            <View
                                                style={[
                                                    styles.moduleProgressFill,
                                                    {
                                                        width: `${mod.progress}%` as any,
                                                        backgroundColor: getProgressColor(mod.progress),
                                                    },
                                                ]}
                                            />
                                        </View>
                                        <Text style={[styles.moduleProgressText, { color: getProgressColor(mod.progress === 0 ? 100 : mod.progress) }]}>
                                            {mod.progress === 0 ? 'Start' : mod.progress === 100 ? 'Done' : `${mod.progress}%`}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </Animated.View>

                <View style={{ height: 20 }} />
            </ScrollView>

            <TechBottomNav activeRoute="training" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAF9F6' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 48 : 20,
        paddingBottom: 16,
        backgroundColor: '#FAF9F6',
    },
    headerBtn: { padding: 4, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    scroll: { padding: 16 },

    progressCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    progressLabel: { fontSize: 12, color: '#64748B', fontWeight: '700', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
    progressValue: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
    pctCircle: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#F1F5F9', // subtle gray-blue
        justifyContent: 'center', alignItems: 'center',
    },
    pctText: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
    progressBarBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: 8, backgroundColor: '#2563EB', borderRadius: 4 },

    catScroll: { marginBottom: 16, marginHorizontal: -16 },
    catContent: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    catChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
    },
    catChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    catChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    catChipTextActive: { color: '#FFFFFF' },

    listContainer: { gap: 14 },
    moduleCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
        gap: 16,
    },
    moduleIcon: {
        width: 52, height: 52, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
        flexShrink: 0,
    },
    moduleContent: { flex: 1 },
    moduleTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
    moduleTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1, lineHeight: 20, letterSpacing: -0.2 },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    tag: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
        backgroundColor: '#F1F5F9',
    },
    tagRequired: { backgroundColor: '#FEF3C7' },
    tagText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
    tagTextRequired: { color: '#D97706' },
    moduleFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    durationText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
    moduleProgressBg: { flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
    moduleProgressFill: { height: 6, borderRadius: 3 },
    moduleProgressText: { fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' },
});
