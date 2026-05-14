import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssets } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { hasSoftAccess, hasTechAccess } from '../utils/permissions';

export default function AssetsScreen() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const [assets,     setAssets]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  // Determine which asset types this user should see based on role capabilities
  const softOnly = hasSoftAccess(capabilities) && !hasTechAccess(capabilities);
  const techOnly = hasTechAccess(capabilities) && !hasSoftAccess(capabilities);
  const assetTypeFilter = softOnly ? 'soft' : techOnly ? 'technical' : undefined;

  const load = useCallback(async (q?: string) => {
    try {
      const data = await fetchAssets({
        ...(q ? { search: q } : {}),
        ...(assetTypeFilter ? { type: assetTypeFilter } : {}),
      });
      setAssets(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [assetTypeFilter]);

  useEffect(() => { void load(); }, [load]);

  const onSearch = (t: string) => { setSearch(t); void load(t); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Assets" showBack />
      <View style={[styles.searchWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.inputText }]}
          value={search}
          onChangeText={onSearch}
          placeholder="Search assets…"
          placeholderTextColor={theme.inputPlaceholder}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => onSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.push('/qr-scanner')}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color={theme.primary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={assets.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(search); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {assets.length === 0 ? (
            <EmptyState icon="package-variant-closed" title="No assets found" message="Try a different search term." />
          ) : assets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
              onPress={() => router.push({ pathname: '/asset-details', params: { assetId: a.id } })}
              activeOpacity={0.8}
            >
              <View style={[styles.assetIcon, { backgroundColor: theme.primaryBg }]}>
                <MaterialCommunityIcons name="package-variant" size={24} color={theme.primary} />
              </View>
              <View style={styles.assetBody}>
                <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>{a.name ?? a.assetName}</Text>
                <Text style={[styles.assetId, { color: theme.textMuted }]}>{a.uniqueId ?? a.assetUniqueId}</Text>
                {a.location ? <Text style={[styles.assetLoc, { color: theme.textSecondary }]}>{a.location}</Text> : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', margin: Spacing.lg, paddingHorizontal: Spacing.md, height: 44, borderWidth: 1.5, borderRadius: Radius.md, gap: Spacing.sm },
  searchInput:{ flex: 1, ...Typography.body },
  list:       { padding: Spacing.lg, gap: Spacing.md },
  card:       { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  assetIcon:  { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  assetBody:  { flex: 1, gap: 2 },
  assetName:  { ...Typography.h4 },
  assetId:    { ...Typography.micro },
  assetLoc:   { ...Typography.bodyS },
});
