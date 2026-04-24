import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssetByQR } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.row, { borderBottomColor: theme.borderLight }]}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.textPrimary }]}>{String(value)}</Text>
    </View>
  );
}

function TemplateCard({
  template,
  type,
  assetId,
  assetName,
}: {
  template: any;
  type: 'checklist' | 'logsheet';
  assetId: string;
  assetName: string;
}) {
  const { theme } = useTheme();
  const isLogsheet = type === 'logsheet';
  return (
    <TouchableOpacity
      style={[styles.tplCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
      onPress={() =>
        router.push({
          pathname: '/checklist-entry',
          params: {
            assetId,
            templateId: String(template.id),
            templateType: type,
            templateName: template.templateName ?? template.name,
            assetName,
          },
        })
      }
      activeOpacity={0.8}
    >
      <View style={[styles.tplIcon, { backgroundColor: isLogsheet ? '#F0F9FF' : '#ECFDF5' }]}>
        <MaterialCommunityIcons
          name={isLogsheet ? 'table-large' : 'clipboard-check-outline'}
          size={22}
          color={isLogsheet ? '#0284C7' : '#059669'}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tplName, { color: theme.textPrimary }]} numberOfLines={2}>
          {template.templateName ?? template.name}
        </Text>
        <Text style={[styles.tplType, { color: theme.textSecondary }]}>
          {isLogsheet ? 'Log Sheet' : 'Checklist'}
          {template.frequency ? ` · ${template.frequency}` : ''}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

export default function AssetDetailsScreen() {
  const { theme } = useTheme();
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssetByQR(Number(assetId))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Asset Details" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  const asset = data?.asset;
  if (!asset) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Asset Details" showBack />
        <Text style={[styles.error, { color: theme.textSecondary }]}>Asset not found.</Text>
      </SafeAreaView>
    );
  }

  const checklists: any[]  = data?.checklistTemplates ?? [];
  const logsheets: any[]   = data?.logsheetTemplates  ?? [];
  const assetName: string  = asset.assetName ?? asset.name ?? 'Asset';
  const hasTemplates = checklists.length > 0 || logsheets.length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={assetName} showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <MaterialCommunityIcons name="package-variant" size={48} color="rgba(255,255,255,0.9)" />
          <Text style={styles.heroId}>{asset.assetUniqueId ?? asset.uniqueId}</Text>
        </View>

        {/* Info */}
        <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
          <InfoRow label="Name"       value={assetName} />
          <InfoRow label="Type"       value={asset.assetType ?? asset.typeName} />
          <InfoRow label="Building"   value={asset.building} />
          <InfoRow label="Floor"      value={asset.floor} />
          <InfoRow label="Room"       value={asset.room} />
          <InfoRow label="Department" value={asset.departmentName ?? asset.department} />
          <InfoRow label="Status"     value={asset.status} />
          <InfoRow label="Company"    value={asset.companyName} />
        </View>

        {/* Templates */}
        {hasTemplates ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ASSIGNED TASKS</Text>

            {checklists.map((tpl) => (
              <TemplateCard key={`cl-${tpl.id}`} template={tpl} type="checklist" assetId={assetId} assetName={assetName} />
            ))}
            {logsheets.map((tpl) => (
              <TemplateCard key={`ls-${tpl.id}`} template={tpl} type="logsheet" assetId={assetId} assetName={assetName} />
            ))}
          </>
        ) : (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface }]}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={36} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No checklists or logsheets assigned to this asset.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { paddingBottom: Spacing.xxl },
  hero:         { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  heroId:       { ...Typography.h4, color: 'rgba(255,255,255,0.9)' },
  card:         { margin: Spacing.lg, borderRadius: Radius.xl, overflow: 'hidden', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1 },
  rowLabel:     { ...Typography.bodyS },
  rowValue:     { ...Typography.body, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  sectionTitle: { ...Typography.label, letterSpacing: 1, marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs },
  tplCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  tplIcon:      { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tplName:      { ...Typography.h4, marginBottom: 2 },
  tplType:      { ...Typography.bodyS },
  emptyBox:     { margin: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyText:    { ...Typography.body, textAlign: 'center' },
  error:        { ...Typography.body, textAlign: 'center', marginTop: Spacing.xxl },
});
