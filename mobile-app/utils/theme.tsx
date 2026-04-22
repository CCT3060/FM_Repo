import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// ─── Color Palettes ───────────────────────────────────────────────────────────

export const LightColors = {
    // Backgrounds
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFC',
    card: '#FFFFFF',
    cardBorder: '#E8EDF3',
    modalOverlay: 'rgba(0,0,0,0.5)',

    // Text
    textPrimary: '#1A202C',
    textSecondary: '#718096',
    textTertiary: '#94A3B8',
    textHeading: '#1E293B',
    textLabel: '#2D3748',
    textMuted: '#64748B',

    // Inputs
    inputBg: '#FFFFFF',
    inputBorder: '#E2E8F0',
    inputText: '#1A202C',
    inputPlaceholder: '#C7C7CC',
    inputIcon: '#8E8E93',

    // Buttons
    buttonPrimary: '#1E3A8A',
    buttonPrimaryText: '#FFFFFF',
    buttonDisabled: '#6B7280',
    buttonBlue: '#2563EB',
    buttonBlueText: '#FFFFFF',
    buttonBlueBg: '#EFF6FF',
    buttonBlueFg: '#2563EB',
    buttonPurpleBg: '#F5F3FF',
    buttonPurpleFg: '#7C3AED',
    buttonGreenBg: '#F0FDF4',
    buttonGreenFg: '#16A34A',

    // Header / Nav
    headerBg: '#FFFFFF',
    headerBorder: '#F1F5F9',
    headerText: '#1E293B',
    navBg: '#FFFFFF',
    navBorder: '#E2E8F0',
    navActive: '#2563EB',
    navInactive: '#94A3B8',

    // Status
    statusBar: 'dark' as const,
    accentBlue: '#2563EB',
    accentRed: '#EF4444',
    accentGreen: '#10B981',

    // Pills / Badges
    pillBg: '#FFFFFF',
    pillBorder: '#E2E8F0',
    pillText: '#64748B',
    pillActiveBg: '#2563EB',
    pillActiveBorder: '#2563EB',
    pillActiveText: '#FFFFFF',

    // Search
    searchBg: '#FFFFFF',
    searchBorder: '#E2E8F0',
    searchText: '#1E293B',
    searchPlaceholder: '#94A3B8',

    // Cards / Misc
    progressBg: '#E2E8F0',
    progressFill: '#2B6CB0',
    sectionHeader: '#94A3B8',
    bellBg: '#F1F5F9',
    assetPillBg: '#F1F5F9',
    assetPillText: '#718096',
    shadowColor: '#0F172A',

    // Badges
    typeBadgeBg: '#EFF6FF',
    typeBadgeBorder: '#BFDBFE',
    typeBadgeText: '#2563EB',

    // Modal
    modalBg: '#FFFFFF',
    modalTitle: '#1A202C',
    modalSubtitle: '#718096',
    noteBorder: '#E2E8F0',
    noteText: '#1A202C',
    notePlaceholder: '#A0AEC0',
    memberBorder: '#F1F5F9',
    memberAvatarBg: '#EFF6FF',
    memberInitials: '#2563EB',
    memberName: '#1A202C',
    memberRole: '#718096',

    // Loading
    loaderColor: '#1E3A8A',

    // Back button
    backIcon: '#1A202C',

    // Logo bar
    logoBarBorder: '#F1F5F9',

    // Checklists specific
    descCardBg: '#F8FAFC',
    descCardBorder: '#EFF6FF',
};

export const DarkColors: typeof LightColors = {
    // Backgrounds
    background: '#0F1117',
    surface: '#1A1D27',
    surfaceAlt: '#141620',
    card: '#1E2130',
    cardBorder: '#2A2E3D',
    modalOverlay: 'rgba(0,0,0,0.7)',

    // Text
    textPrimary: '#E8ECF4',
    textSecondary: '#9CA3B4',
    textTertiary: '#6B7280',
    textHeading: '#F1F5F9',
    textLabel: '#CBD5E1',
    textMuted: '#8B95A8',

    // Inputs
    inputBg: '#252836',
    inputBorder: '#3A3F50',
    inputText: '#E8ECF4',
    inputPlaceholder: '#5C6370',
    inputIcon: '#6B7280',

    // Buttons
    buttonPrimary: '#3B82F6',
    buttonPrimaryText: '#FFFFFF',
    buttonDisabled: '#4B5563',
    buttonBlue: '#3B82F6',
    buttonBlueText: '#FFFFFF',
    buttonBlueBg: '#1E2A4A',
    buttonBlueFg: '#60A5FA',
    buttonPurpleBg: '#2D1B54',
    buttonPurpleFg: '#A78BFA',
    buttonGreenBg: '#0D2818',
    buttonGreenFg: '#34D399',

    // Header / Nav
    headerBg: '#1A1D27',
    headerBorder: '#252836',
    headerText: '#F1F5F9',
    navBg: '#1A1D27',
    navBorder: '#252836',
    navActive: '#60A5FA',
    navInactive: '#6B7280',

    // Status
    statusBar: 'light' as const,
    accentBlue: '#60A5FA',
    accentRed: '#F87171',
    accentGreen: '#34D399',

    // Pills / Badges
    pillBg: '#252836',
    pillBorder: '#3A3F50',
    pillText: '#9CA3B4',
    pillActiveBg: '#3B82F6',
    pillActiveBorder: '#3B82F6',
    pillActiveText: '#FFFFFF',

    // Search
    searchBg: '#252836',
    searchBorder: '#3A3F50',
    searchText: '#E8ECF4',
    searchPlaceholder: '#6B7280',

    // Cards / Misc
    progressBg: '#3A3F50',
    progressFill: '#60A5FA',
    sectionHeader: '#6B7280',
    bellBg: '#252836',
    assetPillBg: '#252836',
    assetPillText: '#9CA3B4',
    shadowColor: '#000000',

    // Badges
    typeBadgeBg: '#1E2A4A',
    typeBadgeBorder: '#2B4980',
    typeBadgeText: '#60A5FA',

    // Modal
    modalBg: '#1E2130',
    modalTitle: '#E8ECF4',
    modalSubtitle: '#9CA3B4',
    noteBorder: '#3A3F50',
    noteText: '#E8ECF4',
    notePlaceholder: '#5C6370',
    memberBorder: '#2A2E3D',
    memberAvatarBg: '#1E2A4A',
    memberInitials: '#60A5FA',
    memberName: '#E8ECF4',
    memberRole: '#9CA3B4',

    // Loading
    loaderColor: '#60A5FA',

    // Back button
    backIcon: '#E8ECF4',

    // Logo bar
    logoBarBorder: '#252836',

    // Checklists specific
    descCardBg: '#252836',
    descCardBorder: '#2A2E3D',
};

// ─── Theme Preference Type ────────────────────────────────────────────────────

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'app_theme_preference';

// ─── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextType {
    isDark: boolean;
    colors: typeof LightColors;
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: false,
    colors: LightColors,
    preference: 'system',
    setPreference: () => { },
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>('light');
    const [loaded, setLoaded] = useState(false);

    // Load saved preference
    useEffect(() => {
        AsyncStorage.getItem(THEME_STORAGE_KEY)
            .then((val) => {
                if (val === 'light' || val === 'dark') {
                    setPreferenceState(val);
                }
            })
            .catch(() => { })
            .finally(() => setLoaded(true));
    }, []);

    const setPreference = (pref: ThemePreference) => {
        setPreferenceState(pref);
        AsyncStorage.setItem(THEME_STORAGE_KEY, pref).catch(() => { });
    };

    // isDark is purely manual: only 'dark' preference enables dark mode
    const isDark = preference === 'dark';

    const colors = isDark ? DarkColors : LightColors;

    // Don't render children until we've loaded the stored preference
    // (prevents flash of wrong theme)
    if (!loaded) return null;

    return (
        <ThemeContext.Provider value={{ isDark, colors, preference, setPreference }}>
            {children}
        </ThemeContext.Provider>
    );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useTheme() {
    return useContext(ThemeContext);
}
