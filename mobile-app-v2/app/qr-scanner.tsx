import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssetByQR, checkLocationFilled } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';

export default function QRScannerScreen() {
  const { theme } = useTheme();
  const { templateId, templateName, mode, requestId, expectedAssetId, expectedLocationId } = useLocalSearchParams<{ templateId?: string; templateName?: string; mode?: string; requestId?: string; expectedAssetId?: string; expectedLocationId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!permission) {
    return <View style={[styles.safe, { backgroundColor: '#000' }]} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.center}>
          <MaterialCommunityIcons name="camera-off" size={64} color={theme.textMuted} />
          <Text style={[styles.permText, { color: theme.textPrimary }]}>Camera Permission Required</Text>
          <Text style={[styles.permSub, { color: theme.textSecondary }]}>We need camera access to scan QR codes on your assets.</Text>
          <TouchableOpacity style={[styles.permBtn, { backgroundColor: theme.primary }]} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      // Check for location QR first: /location/123
      const locationMatch = data.match(/\/locations?\/(\d+)/i);
      if (locationMatch?.[1]) {
        const locationId = locationMatch[1];
        if (mode === 'location-verify' && expectedLocationId) {
          // Verify scanned location matches the expected one
          if (String(locationId) !== String(expectedLocationId)) {
            Alert.alert(
              'Wrong QR Code',
              'This QR code does not match the selected location. Please scan the correct QR code.',
              [{ text: 'Scan Again', onPress: () => setScanned(false) }]
            );
            return;
          }
          router.replace({ pathname: '/location-scan', params: { locationId, fromQR: '1' } } as any);
          return;
        }
        if (mode === 'checklist-location' && templateId) {
          // Check if this checklist was already filled today for this location
          const result = await checkLocationFilled(Number(templateId), Number(locationId));
          if (result.filled) {
            const byText = result.submittedByName ? ` by ${result.submittedByName}` : '';
            Alert.alert(
              'Already Filled Today',
              `This checklist has already been filled today${byText}.`,
              [
                {
                  text: 'Tap to View',
                  onPress: () => {
                    if (result.submissionId) {
                      router.replace({
                        pathname: '/submission-detail',
                        params: { type: 'checklist', id: String(result.submissionId) },
                      } as any);
                    } else {
                      setScanned(false);
                    }
                  },
                },
                { text: 'Scan Again', onPress: () => setScanned(false), style: 'cancel' },
              ]
            );
            return;
          }
          router.replace({
            pathname: '/checklist-entry',
            params: { templateId, templateType: 'checklist', templateName: templateName || '', locationId },
          } as any);
        } else {
          router.replace({ pathname: '/location-scan', params: { locationId, fromQR: '1' } } as any);
        }
        return;
      }

      // Try to extract asset ID from QR data
      // Handles: /asset-scan/123  |  /assets/123  |  plain 123
      const match =
        data.match(/\/asset-scan\/(\d+)/i) ??
        data.match(/\/assets?\/(\d+)/i) ??
        data.match(/[?&]assetId=(\d+)/i) ??
        data.match(/^(\d+)$/);
      const assetId = match?.[1];
      if (!assetId) {
        Alert.alert('Invalid QR', 'This QR code does not match a known asset or location.', [
          { text: 'Scan Again', onPress: () => setScanned(false) },
        ]);
        return;
      }

      const asset = await fetchAssetByQR(Number(assetId));

      if (mode === 'resolve-request' && requestId) {
        // Verify the scanned asset matches the expected asset for this request
        if (expectedAssetId && String((asset as any)?.id ?? assetId) !== String(expectedAssetId)) {
          Alert.alert(
            'Wrong QR Code',
            'This QR code does not match the asset for this request. Please scan the correct asset.',
            [{ text: 'Scan Again', onPress: () => setScanned(false) }]
          );
          return;
        }
        router.replace({ pathname: '/soft-resolve', params: { requestId } });
        return;
      }

      router.replace({ pathname: '/asset-details', params: { assetId, fromQR: '1' } });
    } catch {
      Alert.alert('Not Found', 'Could not find an asset for this QR code.', [
        { text: 'Scan Again', onPress: () => setScanned(false) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.scanWrap}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={scanned ? undefined : handleScan}>
        {/* Overlay */}
        <SafeAreaView style={styles.overlay} edges={['top']}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnScan}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Scan QR Code</Text>
        </SafeAreaView>

        {/* Viewfinder */}
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        <View style={styles.bottomOverlay}>
          <Text style={styles.scanHint}>
            {loading ? 'Looking up…' : 'Point the camera at a QR code on an asset or location'}
          </Text>
          {scanned && !loading ? (
            <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
              <Text style={styles.rescanText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </CameraView>
    </View>
  );
}

const CORNER = 24;
const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scanWrap:    { flex: 1, backgroundColor: '#000' },
  backBtn:     { margin: Spacing.lg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.lg },
  permText:    { ...Typography.h3, textAlign: 'center' },
  permSub:     { ...Typography.body, textAlign: 'center' },
  permBtn:     { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md },
  permBtnText: { ...Typography.h4, color: '#fff' },
  overlay:     { padding: Spacing.lg, gap: Spacing.md },
  backBtnScan: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  scanTitle:   { ...Typography.h3, color: '#fff', textAlign: 'center' },
  viewfinder:  { position: 'absolute', top: '30%', left: '15%', right: '15%', aspectRatio: 1 },
  corner:      { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 3 },
  cornerTL:    { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR:    { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL:    { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR:    { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  bottomOverlay:{ position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center', gap: Spacing.md },
  scanHint:    { ...Typography.body, color: '#fff', textAlign: 'center', paddingHorizontal: Spacing.xl },
  rescanBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  rescanText:  { ...Typography.label, color: '#fff' },
});
