import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// ─── Palette ─────────────────────────────────────────────────────────────────
export const Colors = {
  // Brand
  primary:        '#1E3A8A',
  primaryLight:   '#2563EB',
  primaryBg:      '#EFF6FF',
  secondary:      '#7C3AED',
  secondaryBg:    '#F5F3FF',

  // Semantic
  success:        '#059669',
  successBg:      '#ECFDF5',
  warning:        '#D97706',
  warningBg:      '#FFFBEB',
  danger:         '#DC2626',
  dangerBg:       '#FEF2F2',
  info:           '#0284C7',
  infoBg:         '#F0F9FF',

  // Neutral
  gray50:         '#F8FAFC',
  gray100:        '#F1F5F9',
  gray200:        '#E2E8F0',
  gray300:        '#CBD5E1',
  gray400:        '#94A3B8',
  gray500:        '#64748B',
  gray600:        '#475569',
  gray700:        '#334155',
  gray800:        '#1E293B',
  gray900:        '#0F172A',

  white:          '#FFFFFF',
  black:          '#000000',
};

export const LightTheme = {
  background:       Colors.gray50,
  surface:          Colors.white,
  surfaceAlt:       Colors.gray100,
  border:           Colors.gray200,
  borderLight:      Colors.gray100,

  textPrimary:      Colors.gray900,
  textSecondary:    Colors.gray600,
  textMuted:        Colors.gray400,
  textInverse:      Colors.white,

  primary:          Colors.primary,
  primaryLight:     Colors.primaryLight,
  primaryBg:        Colors.primaryBg,

  success:          Colors.success,
  successBg:        Colors.successBg,
  warning:          Colors.warning,
  warningBg:        Colors.warningBg,
  danger:           Colors.danger,
  dangerBg:         Colors.dangerBg,
  info:             Colors.info,
  infoBg:           Colors.infoBg,

  tabBarBg:         Colors.white,
  tabBarBorder:     Colors.gray100,
  tabBarActive:     Colors.primary,
  tabBarInactive:   Colors.gray400,

  headerBg:         Colors.white,
  headerBorder:     Colors.gray100,
  headerText:       Colors.gray900,

  inputBg:          Colors.white,
  inputBorder:      Colors.gray200,
  inputText:        Colors.gray900,
  inputPlaceholder: Colors.gray400,

  cardShadow:       'rgba(0,0,0,0.06)',
  overlay:          'rgba(0,0,0,0.5)',
  statusBar:        'dark' as const,
};

export const DarkTheme: typeof LightTheme = {
  background:       '#0F172A',
  surface:          '#1E293B',
  surfaceAlt:       '#0F172A',
  border:           '#334155',
  borderLight:      '#1E293B',

  textPrimary:      '#F1F5F9',
  textSecondary:    '#94A3B8',
  textMuted:        '#475569',
  textInverse:      '#0F172A',

  primary:          '#3B82F6',
  primaryLight:     '#60A5FA',
  primaryBg:        '#1E3A5F',

  success:          '#10B981',
  successBg:        '#064E3B',
  warning:          '#F59E0B',
  warningBg:        '#451A03',
  danger:           '#EF4444',
  dangerBg:         '#450A0A',
  info:             '#0EA5E9',
  infoBg:           '#0C2A3B',

  tabBarBg:         '#1E293B',
  tabBarBorder:     '#334155',
  tabBarActive:     '#3B82F6',
  tabBarInactive:   '#475569',

  headerBg:         '#1E293B',
  headerBorder:     '#334155',
  headerText:       '#F1F5F9',

  inputBg:          '#1E293B',
  inputBorder:      '#334155',
  inputText:        '#F1F5F9',
  inputPlaceholder: '#475569',

  cardShadow:       'rgba(0,0,0,0.3)',
  overlay:          'rgba(0,0,0,0.7)',
  statusBar:        'light' as const,
};

export type AppTheme = typeof LightTheme;

// ─── Typography ───────────────────────────────────────────────────────────────
export const Typography = {
  h1:    { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  h2:    { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
  h3:    { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },
  h4:    { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  body:  { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyS: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
};

// ─── Spacing & Radius ────────────────────────────────────────────────────────
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const Radius  = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };

// ─── Context ─────────────────────────────────────────────────────────────────
type Preference = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: AppTheme;
  isDark: boolean;
  preference: Preference;
  setPreference: (p: Preference) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: LightTheme,
  isDark: false,
  preference: 'light',
  setPreference: () => {},
});

const PREF_KEY = '@fmv2_theme_pref';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Default to 'light' so the very first render is always the light theme.
  // AsyncStorage may override this if the user has explicitly saved a preference.
  const [preference, setPreference] = useState<Preference>('light');

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreference(v);
    });
  }, []);

  const save = (p: Preference) => {
    setPreference(p);
    AsyncStorage.setItem(PREF_KEY, p);
  };

  const isDark = preference === 'system' ? system === 'dark' : preference === 'dark';
  const theme  = isDark ? DarkTheme : LightTheme;

  return (
    <Ctx.Provider value={{ theme, isDark, preference, setPreference: save }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() { return useContext(Ctx); }
