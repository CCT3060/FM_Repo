import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssetByQR, getStoredUser, getSoftRequestsForAsset } from '../utils/api';
import type { SoftRequest } from '../utils/api';
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
  const { assetId, fromQR } = useLocalSearchParams<{ assetId: string; fromQR?: string }>();
  const scannedViaQR = fromQR === '1';
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [openRequests, setOpenRequests] = useState<SoftRequest[]>([]);
  const [userCaps,     setUserCaps]     = useState<{ canRaiseSoftIssue: boolean; canResolveSoftIssue: boolean } | null>(null);
  const [recentSubmission, setRecentSubmission] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const [assetData, user] = await Promise.all([
        fetchAssetByQR(Number(assetId)).catch(() => null),
        getStoredUser(),
      ]);
      setData(assetData);
      setRecentSubmission(assetData?.recentSubmission ?? null);

      const caps = user?.roleCapabilities ?? null;
      setUserCaps(caps ? { canRaiseSoftIssue: !!caps.canRaiseSoftIssue, canResolveSoftIssue: !!caps.canResolveSoftIssue } : null);

      // Only fetch open soft requests for users who can resolve them
      if (caps?.canResolveSoftIssue) {
        const reqs = await getSoftRequestsForAsset(Number(assetId)).catch(() => [] as SoftRequest[]);
        setOpenRequests((reqs as SoftRequest[]).filter((r) => r.status === 'open'));
      }
      setLoading(false);
    };
    load();
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

  const checklists: any[] = data?.checklistTemplates ?? [];
  const logsheets: any[]  = data?.logsheetTemplates  ?? [];
  const assetName: string = asset.assetName ?? asset.name ?? 'Asset';
  const hasTemplates      = checklists.length > 0 || logsheets.length > 0;

  // ── Role-aware view: catalyst supervisor with open requests ──────────────
  if (userCaps?.canResolveSoftIssue && openRequests.length > 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title={assetName} showBack />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Open issue banner */}
          <View style={[styles.alertBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
            <MaterialCommunityIcons name="alert-circle" size={20} color="#92400E" />
            <Text style={[styles.alertText, { color: '#92400E' }]}>
              {openRequests.length} open issue{openRequests.length > 1 ? 's' : ''} awaiting resolution
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OPEN ISSUES</Text>
          {openRequests.map((req) => (
            <TouchableOpacity
              key={req.id}
              style={[styles.reqCard, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}
              onPress={() =>
                router.push({
                  pathname: '/soft-resolve',
                  params: {
                    requestId: String(req.id),
                    assetId: String(asset.id ?? asset.assetId ?? assetId),
                    assetName,
                    raisedByName: req.raisedByName ?? '',
                    raisedAt: req.raisedAt,
                  },
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.reqIconWrap}>
                <MaterialCommunityIcons name="wrench-clock" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reqTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {req.templateName ?? `Request #${req.id}`}
                </Text>
                <Text style={[styles.reqSub, { color: theme.textSecondary }]}>
                  Raised by {req.raisedByName ?? 'Unknown'} · {new Date(req.raisedAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={[styles.reqBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.reqBadgeText, { color: '#92400E' }]}>Resolve →</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Checklists — only after QR scan */}
          {scannedViaQR ? (
            hasTemplates ? (
              <>
                {checklists.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: Spacing.md }]}>CHECKLISTS</Text>
                    {checklists.map((tpl) => (
                      <TemplateCard key={`cl-${tpl.id}`} template={tpl} type="checklist" assetId={String(assetId)} assetName={assetName} />
                    ))}
                  </>
                )}
                {logsheets.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOG SHEETS</Text>
                    {logsheets.map((tpl) => (
                      <TemplateCard key={`ls-${tpl.id}`} template={tpl} type="logsheet" assetId={String(assetId)} assetName={assetName} />
                    ))}
                  </>
                )}
              </>
            ) : null
          ) : (
            <View style={[styles.qrPromptBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <MaterialCommunityIcons name="qrcode-scan" size={48} color={theme.primary} />
              <Text style={[styles.qrPromptTitle, { color: theme.textPrimary }]}>Scan to Fill Checklist</Text>
              <Text style={[styles.qrPromptSub, { color: theme.textSecondary }]}>
                Scan the QR code on this asset to access and fill its checklists.
              </Text>
              <TouchableOpacity
                style={[styles.qrPromptBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/qr-scanner')}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={18} color="#fff" />
                <Text style={styles.qrPromptBtnText}>Open Scanner</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Role-aware view: client supervisor (raise issue) ─────────────────────
  if (userCaps?.canRaiseSoftIssue) {
    const recent = recentSubmission;
    const recentDate = recent?.submittedAt
      ? new Date(recent.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title={assetName} showBack />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Slim asset identity bar */}
          <View style={[styles.identityBar, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            <View style={[styles.identityIcon, { backgroundColor: theme.primaryBg }]}>
              <MaterialCommunityIcons name="package-variant-closed" size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.identityName, { color: theme.textPrimary }]} numberOfLines={1}>{assetName}</Text>
              <Text style={[styles.identityId, { color: theme.textMuted }]}>{asset.assetUniqueId ?? asset.uniqueId}</Text>
            </View>
            <View style={[styles.identityMeta, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
              <Text style={[styles.identityMetaText, { color: '#166534' }]}>{asset.assetType ?? 'Asset'}</Text>
            </View>
          </View>

          {/* Location chip row */}
          {[asset.building, asset.floor, asset.room, asset.departmentName ?? asset.department].filter(Boolean).length > 0 && (
            <View style={styles.chipRow}>
              {[asset.building, asset.floor, asset.room, asset.departmentName ?? asset.department].filter(Boolean).map((val, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <Text style={[styles.chipText, { color: theme.textSecondary }]}>{val}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Recent submission card — tappable so the supervisor can read responses */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>LAST INSPECTION</Text>
          </View>
          {recent ? (
            <TouchableOpacity
              style={[styles.recentCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
              onPress={() =>
                router.push({
                  pathname: '/submission-detail',
                  params: { type: 'checklist', id: String(recent.id) },
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.recentCardTop}>
                <View style={[styles.recentStatusDot, { backgroundColor: recent.status === 'submitted' || recent.status === 'approved' ? '#10B981' : '#F59E0B' }]} />
                <Text style={[styles.recentTemplateName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {recent.templateName}
                </Text>
              </View>
              <View style={styles.recentCardMeta}>
                <Text style={[styles.recentMetaText, { color: theme.textMuted }]}>
                  <MaterialCommunityIcons name="calendar-outline" size={12} /> {recentDate}
                </Text>
                {recent.submittedByName ? (
                  <Text style={[styles.recentMetaText, { color: theme.textMuted }]}>
                    <MaterialCommunityIcons name="account-outline" size={12} /> {recent.submittedByName}
                  </Text>
                ) : null}
                <View style={[styles.recentPctBadge, { backgroundColor: recent.completionPct >= 80 ? '#D1FAE5' : '#FEF3C7' }]}>
                  <Text style={[styles.recentPctText, { color: recent.completionPct >= 80 ? '#065F46' : '#92400E' }]}>
                    {recent.completionPct}%
                  </Text>
                </View>
              </View>
              <Text style={[{ fontSize: 11, color: theme.textMuted, marginTop: 4 }]}>Tap to view responses →</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.recentEmpty, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={theme.textMuted} />
              <Text style={[styles.recentEmptyText, { color: theme.textMuted }]}>No inspection recorded yet</Text>
            </View>
          )}

          {/* Raise Issue section — only after QR scan */}
          {scannedViaQR ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>RAISE AN ISSUE</Text>
              </View>
              {checklists.length > 0 ? (
                checklists.map((tpl) => (
                  <TouchableOpacity
                    key={`cl-${tpl.id}`}
                    style={[styles.issueCard, { backgroundColor: theme.surface, borderColor: '#FED7AA' }]}
                    onPress={() =>
                      router.push({
                        pathname: '/checklist-entry',
                        params: {
                          assetId,
                          templateId: String(tpl.id),
                          templateType: 'checklist',
                          templateName: tpl.templateName ?? tpl.name,
                          assetName,
                          softRaise: '1',
                        },
                      })
                    }
                    activeOpacity={0.85}
                  >
                    <View style={[styles.issueIcon, { backgroundColor: '#FFF7ED' }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#EA580C" />
                    </View>
                    <Text style={[styles.issueTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                      {tpl.templateName ?? tpl.name}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.recentEmpty, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <MaterialCommunityIcons name="clipboard-remove-outline" size={20} color={theme.textMuted} />
                  <Text style={[styles.recentEmptyText, { color: theme.textMuted }]}>No issue templates available</Text>
                </View>
              )}
            </>
          ) : (
            /* Not scanned via QR — prompt to scan */
            <View style={[styles.qrPromptBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <MaterialCommunityIcons name="qrcode-scan" size={48} color={theme.primary} />
              <Text style={[styles.qrPromptTitle, { color: theme.textPrimary }]}>Scan to Raise an Issue</Text>
              <Text style={[styles.qrPromptSub, { color: theme.textSecondary }]}>
                Scan the QR code on this asset to report a problem or service request.
              </Text>
              <TouchableOpacity
                style={[styles.qrPromptBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/qr-scanner')}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={18} color="#fff" />
                <Text style={styles.qrPromptBtnText}>Open Scanner</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Role-aware view: catalyst supervisor with no open issues ─────────────
  if (userCaps?.canResolveSoftIssue && openRequests.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title={assetName} showBack />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* All clear badge */}
          <View style={[styles.alertBanner, { backgroundColor: '#D1FAE5', borderColor: '#059669' }]}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#065F46" />
            <Text style={[styles.alertText, { color: '#065F46' }]}>All clear — no open issues for this asset</Text>
          </View>

          {/* Asset info */}
          <View style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow }]}>
            <InfoRow label="Name"       value={assetName} />
            <InfoRow label="Type"       value={asset.assetType ?? asset.typeName} />
            <InfoRow label="Building"   value={asset.building} />
            <InfoRow label="Floor"      value={asset.floor} />
            <InfoRow label="Room"       value={asset.room} />
            <InfoRow label="Department" value={asset.departmentName ?? asset.department} />
            <InfoRow label="Status"     value={asset.status} />
          </View>

          {/* Checklists — only after QR scan */}
          {scannedViaQR ? (
            hasTemplates ? (
              <>
                {checklists.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CHECKLISTS</Text>
                    {checklists.map((tpl) => (
                      <TemplateCard key={`cl-${tpl.id}`} template={tpl} type="checklist" assetId={String(assetId)} assetName={assetName} />
                    ))}
                  </>
                )}
                {logsheets.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOG SHEETS</Text>
                    {logsheets.map((tpl) => (
                      <TemplateCard key={`ls-${tpl.id}`} template={tpl} type="logsheet" assetId={String(assetId)} assetName={assetName} />
                    ))}
                  </>
                )}
              </>
            ) : null
          ) : (
            <View style={[styles.qrPromptBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <MaterialCommunityIcons name="qrcode-scan" size={48} color={theme.primary} />
              <Text style={[styles.qrPromptTitle, { color: theme.textPrimary }]}>Scan to Fill Checklist</Text>
              <Text style={[styles.qrPromptSub, { color: theme.textSecondary }]}>
                Scan the QR code on this asset to access and fill its checklists.
              </Text>
              <TouchableOpacity
                style={[styles.qrPromptBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/qr-scanner')}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={18} color="#fff" />
                <Text style={styles.qrPromptBtnText}>Open Scanner</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Default: technical users — normal checklist / logsheet view ──────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={assetName} showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

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

        {/* Checklists / logsheets — only unlocked after QR scan */}
        {scannedViaQR ? (
          hasTemplates ? (
            <>
              {checklists.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CHECKLISTS</Text>
                  {checklists.map((tpl) => (
                    <TemplateCard
                      key={`cl-${tpl.id}`}
                      template={tpl}
                      type="checklist"
                      assetId={String(assetId)}
                      assetName={assetName}
                    />
                  ))}
                </>
              )}
              {logsheets.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOG SHEETS</Text>
                  {logsheets.map((tpl) => (
                    <TemplateCard
                      key={`ls-${tpl.id}`}
                      template={tpl}
                      type="logsheet"
                      assetId={String(assetId)}
                      assetName={assetName}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: theme.surface }]}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={36} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No checklists assigned to this asset.</Text>
            </View>
          )
        ) : (
          /* Not scanned via QR — prompt employee to scan */
          <View style={[styles.qrPromptBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <MaterialCommunityIcons name="qrcode-scan" size={48} color={theme.primary} />
            <Text style={[styles.qrPromptTitle, { color: theme.textPrimary }]}>Scan to Fill Checklist</Text>
            <Text style={[styles.qrPromptSub, { color: theme.textSecondary }]}>
              Scan the QR code on this asset to access and fill its checklists.
            </Text>
            <TouchableOpacity
              style={[styles.qrPromptBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/qr-scanner')}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={18} color="#fff" />
              <Text style={styles.qrPromptBtnText}>Open Scanner</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { paddingBottom: Spacing.xxl },
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
  alertBanner:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, margin: Spacing.lg, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  alertText:    { ...Typography.bodyS, fontWeight: '700', flex: 1 },
  reqCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 3 },
  reqIconWrap:  { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  reqTitle:     { ...Typography.h4, marginBottom: 2 },
  reqSub:       { ...Typography.bodyS },
  reqBadge:     { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  reqBadgeText: { ...Typography.label, fontWeight: '700' },

  // Client supervisor (canRaiseSoftIssue) slim styles
  identityBar:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  identityIcon:     { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  identityName:     { ...Typography.h4, marginBottom: 1 },
  identityId:       { ...Typography.bodyS, fontWeight: '500' },
  identityMeta:     { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: 1 },
  identityMetaText: { ...Typography.label, fontWeight: '600', fontSize: 10 },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  chip:             { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: 1 },
  chipText:         { ...Typography.bodyS, fontSize: 11 },
  sectionHeader:    { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
  sectionLabel:     { ...Typography.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  recentCard:       { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs },
  recentCardTop:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recentStatusDot:  { width: 8, height: 8, borderRadius: 4 },
  recentTemplateName: { ...Typography.h4, flex: 1 },
  recentCardMeta:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  recentMetaText:   { ...Typography.bodyS, fontSize: 11 },
  recentPctBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  recentPctText:    { ...Typography.label, fontSize: 11, fontWeight: '700' },
  recentEmpty:      { marginHorizontal: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recentEmptyText:  { ...Typography.bodyS },
  // QR scan prompt (shown when employee browses asset without scanning)
  qrPromptBox:      { margin: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  qrPromptTitle:    { ...Typography.h3, textAlign: 'center' },
  qrPromptSub:      { ...Typography.body, textAlign: 'center', lineHeight: 20 },
  qrPromptBtn:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  qrPromptBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  issueCard:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  issueIcon:        { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  issueTitle:       { ...Typography.body, flex: 1, fontWeight: '500' },
});
