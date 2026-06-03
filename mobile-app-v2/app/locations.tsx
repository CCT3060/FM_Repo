/**
 * LocationsScreen — lists all company locations for employees with
 * the 'locations' module access.  Tap a location to view its details.
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLocations } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { canResolveSoft } from '../utils/permissions';
import { useTheme, Spacing, Radius } from '../utils/theme';
import EmptyState from '../components/EmptyState';

type Location = {
  id: number;
  name: string;
  campus?: string | null;
  building?: string | null;
  floor?: string | number | null;
  room?: string | null;
};

function LocationRow({ item, onPress }: { item: Location; onPress: () => void }) {
  const { theme } = useTheme();
  const sub = [item.campus, item.building, item.floor != null ? `Floor ${item.floor}` : null, item.room]
    .filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: '#0891B215' }]}>
        <MaterialCommunityIcons name="map-marker-outline" size={22} color="#0891B2" />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
        {sub ? <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

export default function LocationsScreen() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const isCatalystSupervisor = canResolveSoft(capabilities);
  const [locations,  setLocations]  = useState<Location[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchLocations();
      setLocations(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); void load(); };

  const filtered = search.trim()
    ? locations.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    : locations;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Locations</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { borderBottomColor: theme.border }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search locations…"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }}>
            <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon="map-marker-off-outline"
              title={search ? 'No matches' : 'No locations yet'}
              message={search ? 'Try a different search' : 'Locations will appear here once added by your admin.'}
            />
          ) : (
            filtered.map((loc) => (
              <LocationRow
                key={loc.id}
                item={loc}
                onPress={() => {
                  if (isCatalystSupervisor) {
                    // Must scan the location QR first before viewing/filling checklists
                    router.push({ pathname: '/qr-scanner', params: { mode: 'location-verify', expectedLocationId: String(loc.id) } } as any);
                  } else {
                    router.push({ pathname: '/location-scan', params: { locationId: String(loc.id) } } as any);
                  }
                }}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, gap: Spacing.sm, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  errorText:   { fontSize: 14, textAlign: 'center' },
  retryText:   { fontSize: 14, fontWeight: '600', marginTop: 8 },

  scroll:      { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40 },
  row:         { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  rowIcon:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody:     { flex: 1 },
  rowTitle:    { fontSize: 15, fontWeight: '600' },
  rowSub:      { fontSize: 12, marginTop: 2 },
});
