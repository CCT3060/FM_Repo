/**
 * LocationScanScreen — shown after scanning a location QR code or tapping a
 * location in the locations list.  Displays location info and its checklists;
 * tapping a checklist opens it for filling.
 *
 * For client supervisors (canRaiseSoftIssue), shows last inspection card
 * and a "Raise an Issue" section instead.
 */

import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLocationTemplates, getStoredUser } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import StatusBadge from '../components/StatusBadge';

export default function LocationScanScreen() {
  const { locationId, fromQR } = useLocalSearchParams<{ locationId: string; fromQR?: string }>();
  const { theme } = useTheme();
  const [location,          setLocation]          = useState<any>(null);
  const [templates,         setTemplates]         = useState<any[]>([]);
  const [recentSubmission,  setRecentSubmission]  = useState<any>(null);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<string | null>(null);
  const [isSupervisor,      setIsSupervisor]      = useState(false);
  const [isCatalystSupervisor, setIsCatalystSupervisor] = useState(false);
  const [assignedSoftRequests, setAssignedSoftRequests] = useState<Array<{ id: number; status: string; templateName?: string; raisedAt: string }>>([]);
  const isFocused = useIsFocused();

  useEffect(() => {
    // Check if user is a client supervisor (can raise soft issues)
    getStoredUser().then((u: any) => {
      const caps = u?.roleCapabilities;
      if (caps?.canRaiseSoftIssue) {
        setIsSupervisor(true);
      }
      if (caps?.canResolveSoftIssue) {
        setIsCatalystSupervisor(true);
      }
    }).catch(() => {});
  }, []);

  const loadTemplates = useCallback(() => {
    if (!locationId) { setError('No location ID provided'); setLoading(false); return; }
    fetchLocationTemplates(Number(locationId))
      .then(({ location: loc, templates: tmpl, recentSubmission: recent, assignedSoftRequests: asr }) => {
        setLocation(loc);
        setTemplates(tmpl ?? []);
        setRecentSubmission(recent ?? null);
        setAssignedSoftRequests(asr ?? []);
      })
      .catch((err) => { setError(err?.message ?? 'Location not found'); })
      .finally(() => setLoading(false));
  }, [locationId]);

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      loadTemplates();
    }
  }, [isFocused, loadTemplates]);

  const openChecklist = (t: any) => {
    router.push({
      pathname: '/checklist-entry',
      params: {
        templateId:   String(t.id),
        templateType: 'checklist',
        templateName: t.templateName,
        locationId:   String(locationId),
      },
    } as any);
  };

  const openSoftRaise = (t: any) => {
    router.push({
      pathname: '/checklist-entry',
      params: {
        templateId:   String(t.id),
        templateType: 'checklist',
        templateName: t.templateName,
        locationId:   String(locationId),
        softRaise:    '1',
      },
    } as any);
  };

  const detailPill = (text: string) => (
    <View key={text} style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.pillText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          {fromQR === '1' ? 'Location QR Scanned' : 'Location'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={64} color={theme.textMuted} />
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Location Not Found</Text>
          <Text style={[styles.errorSub, { color: theme.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={styles.btnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Location card */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: '#0891B215' }]}>
              <MaterialCommunityIcons name="map-marker-outline" size={32} color="#0891B2" />
            </View>
            <Text style={[styles.locationName, { color: theme.textPrimary }]}>
              {location?.name ?? `Location #${locationId}`}
            </Text>
            {fromQR === '1' && (
              <View style={[styles.qrBadge, { backgroundColor: '#0891B215' }]}>
                <MaterialCommunityIcons name="qrcode-scan" size={12} color="#0891B2" />
                <Text style={[styles.qrBadgeText, { color: '#0891B2' }]}>Scanned via QR</Text>
              </View>
            )}
            {/* Detail pills */}
            {(location?.campus || location?.building || location?.floor != null || location?.room) && (
              <View style={styles.pills}>
                {location?.campus      ? detailPill(location.campus)              : null}
                {location?.building    ? detailPill(location.building)            : null}
                {location?.floor != null ? detailPill(`Floor ${location.floor}`)  : null}
                {location?.room        ? detailPill(`Room ${location.room}`)      : null}
              </View>
            )}
          </View>

          {isSupervisor ? (
            /* ── CLIENT SUPERVISOR VIEW ── */
            <>
              {/* Last Inspection Card */}
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>LAST INSPECTION</Text>
              {recentSubmission ? (
                <TouchableOpacity
                  style={[styles.inspectionCard, { backgroundColor: theme.surface, borderColor: '#86efac' }]}
                  onPress={() => router.push({ pathname: '/submission-detail', params: { type: 'checklist', id: String(recentSubmission.id) } } as any)}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateName, { color: theme.textPrimary }]}>
                        {recentSubmission.templateName}
                      </Text>
                      <Text style={[styles.templateSub, { color: theme.textSecondary }]}>
                        By {recentSubmission.submittedByName || 'Unknown'}
                      </Text>
                      <Text style={[styles.templateSub, { color: theme.textMuted }]}>
                        {fmtDate(recentSubmission.submittedAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <StatusBadge
                        label={recentSubmission.status === 'submitted' ? 'Submitted' : recentSubmission.status || 'Done'}
                        variant={recentSubmission.status === 'submitted' ? 'success' : 'info'}
                      />
                      <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: '600' }}>View →</Text>
                    </View>
                  </View>
                  {recentSubmission.totalAnswers > 0 && (
                    <View style={[styles.progressBar, { backgroundColor: '#e2e8f0', marginTop: 10 }]}>
                      <View style={[
                        styles.progressFill,
                        {
                          backgroundColor: '#22c55e',
                          width: `${Math.round((Number(recentSubmission.answeredCount) / Number(recentSubmission.totalAnswers)) * 100)}%` as any,
                        }
                      ]} />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <MaterialCommunityIcons name="clipboard-off-outline" size={36} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>No inspections recorded yet</Text>
                </View>
              )}

              {/* Raise Issue */}
              <Text style={[styles.sectionTitle, { color: '#dc2626', marginTop: 8 }]}>RAISE AN ISSUE</Text>
              <Text style={[styles.raiseSub, { color: theme.textSecondary }]}>
                Select a checklist to fill and submit an issue for this location.
              </Text>
              {templates.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <MaterialCommunityIcons name="clipboard-off-outline" size={36} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>No checklists linked to this location</Text>
                </View>
              ) : (
                templates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.raiseRow, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
                    onPress={() => openSoftRaise(t)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.templateIcon, { backgroundColor: '#dc262615' }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#dc2626" />
                    </View>
                    <View style={styles.templateBody}>
                      <Text style={[styles.templateName, { color: theme.textPrimary }]}>{t.templateName}</Text>
                      {t.frequency ? (
                        <Text style={[styles.templateSub, { color: theme.textMuted }]}>{t.frequency}</Text>
                      ) : null}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#dc2626" />
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            /* ── REGULAR EMPLOYEE / CATALYST SUPERVISOR VIEW ── */
            <>
              {/* Catalyst Supervisor — assigned soft requests */}
              {isCatalystSupervisor && (
                <>
                  <Text style={[styles.sectionTitle, { color: assignedSoftRequests.length > 0 ? '#dc2626' : theme.textMuted, marginTop: 4 }]}>
                    ASSIGNED REQUESTS
                  </Text>
                  {assignedSoftRequests.length === 0 ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <MaterialCommunityIcons name="check-circle-outline" size={36} color={theme.textMuted} />
                      <Text style={[styles.emptyText, { color: theme.textMuted }]}>No open requests assigned to you here</Text>
                    </View>
                  ) : (
                    assignedSoftRequests.map((req) => (
                      <TouchableOpacity
                        key={req.id}
                        style={[styles.raiseRow, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
                        onPress={() => router.push({ pathname: '/soft-resolve', params: { requestId: String(req.id) } } as any)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.templateIcon, { backgroundColor: '#dc262615' }]}>
                          <MaterialCommunityIcons name="wrench-clock" size={22} color="#dc2626" />
                        </View>
                        <View style={styles.templateBody}>
                          <Text style={[styles.templateName, { color: theme.textPrimary }]}>
                            {req.templateName ?? `Request #${req.id}`}
                          </Text>
                          <Text style={[styles.templateSub, { color: '#dc2626', fontWeight: '600' as const }]}>
                            {req.status === 'open' ? 'Open — tap to resolve' : req.status}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#dc2626" />
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>CHECKLISTS FOR THIS LOCATION</Text>
              {templates.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <MaterialCommunityIcons name="clipboard-off-outline" size={36} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>No checklists linked to this location</Text>
                </View>
              ) : (
                templates.map((t) => {
                  const blockedByRequest = isCatalystSupervisor && assignedSoftRequests.length > 0;
                  // Catalyst supervisors: if any user filled this checklist today, lock it
                  const filledByAnyone = isCatalystSupervisor && (t.completedTodayByAnyone || t.completedToday);
                  const canOpen = t.isAssigned && !blockedByRequest && !filledByAnyone;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.templateRow,
                        {
                          backgroundColor: blockedByRequest ? '#fafafa' : (filledByAnyone ? '#f0fdf4' : (t.completedToday ? '#f0fdf4' : theme.surface)),
                          borderColor:     blockedByRequest ? '#f1f5f9' : (filledByAnyone ? '#86efac' : (t.completedToday ? '#86efac' : theme.border)),
                          opacity:         blockedByRequest ? 0.7 : 1,
                        },
                      ]}
                      onPress={() => canOpen ? openChecklist(t) : null}
                      activeOpacity={canOpen ? 0.7 : 1}
                      disabled={!canOpen}
                    >
                      <View style={[styles.templateIcon, { backgroundColor: canOpen ? '#2563eb15' : (filledByAnyone ? '#22c55e15' : '#94a3b815') }]}>
                        <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={canOpen ? '#2563eb' : (filledByAnyone ? '#16a34a' : '#94a3b8')} />
                      </View>
                      <View style={styles.templateBody}>
                        <Text style={[styles.templateName, { color: canOpen ? theme.textPrimary : theme.textMuted }]}>{t.templateName}</Text>
                        {t.frequency ? (
                          <Text style={[styles.templateSub, { color: theme.textMuted }]}>{t.frequency}</Text>
                        ) : null}
                        {blockedByRequest ? (
                          <Text style={[styles.templateSub, { color: '#dc2626' }]}>Resolve open request first</Text>
                        ) : filledByAnyone ? (
                          <Text style={[styles.templateSub, { color: '#16a34a', fontWeight: '600' as const }]}>Today's checklist already filled</Text>
                        ) : !t.isAssigned ? (
                          <Text style={[styles.templateSub, { color: '#94a3b8' }]}>Not assigned to you</Text>
                        ) : null}
                      </View>
                      <StatusBadge
                        label={blockedByRequest ? 'Blocked' : (filledByAnyone ? 'Done' : (t.completedToday ? 'Done' : (t.isAssigned ? 'Pending' : 'Locked')))}
                        variant={blockedByRequest ? 'neutral' : (filledByAnyone ? 'success' : (t.completedToday ? 'success' : (t.isAssigned ? 'warning' : 'neutral')))}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  backBtn:      { padding: 4 },
  headerTitle:  { fontSize: 18, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  loadingText:  { fontSize: 14 },
  errorTitle:   { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorSub:     { fontSize: 13, textAlign: 'center' },
  scroll:       { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },

  card:         { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  iconWrap:     { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  locationName: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  qrBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  qrBadgeText:  { fontSize: 12, fontWeight: '600' },
  pills:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  pill:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillText:     { fontSize: 12 },

  sectionTitle:    { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  raiseSub:        { fontSize: 13, marginTop: -6, marginBottom: 2 },
  emptyCard:       { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  emptyText:       { fontSize: 13, textAlign: 'center' },
  inspectionCard:  { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md },
  progressBar:     { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: 6, borderRadius: 3 },

  templateRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  raiseRow:     { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  templateIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  templateBody: { flex: 1 },
  templateName: { fontSize: 14, fontWeight: '600' },
  templateSub:  { fontSize: 12, marginTop: 2 },

  btn:          { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md },
  btnText:      { color: '#fff', fontSize: 15, fontWeight: '700' },
});
