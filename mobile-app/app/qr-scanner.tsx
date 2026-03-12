import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function QRScannerScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);

        // Match /asset-scan/:assetId path pattern (works with any host/IP)
        const urlMatch = data.match(/\/asset-scan\/(\d+)/);
        if (urlMatch) {
            router.replace({ pathname: '/asset-scan', params: { assetId: urlMatch[1] } } as any);
            return;
        }

        // Match /ojt-training/:id path pattern (OJT training QR codes)
        const ojtMatch = data.match(/\/ojt-training\/(\d+)/);
        if (ojtMatch) {
            router.replace({ pathname: '/ojt-training-detail', params: { id: ojtMatch[1] } } as any);
            return;
        }

        // Fallback: plain numeric ID (QR code contains only a number)
        const numericMatch = data.trim().match(/^\d+$/);
        if (numericMatch) {
            router.replace({ pathname: '/asset-scan', params: { assetId: data.trim() } } as any);
            return;
        }

        // Unknown QR content
        Alert.alert(
            'QR Scanned',
            `Unrecognized content:\n${data}`,
            [
                { text: 'Scan Again', onPress: () => setScanned(false) },
                { text: 'Go Back', onPress: () => router.back() },
            ]
        );
    };

    if (!permission) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.message}>Loading camera…</Text>
            </SafeAreaView>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <MaterialCommunityIcons name="camera-off" size={60} color="#94A3B8" style={{ marginBottom: 16 }} />
                <Text style={styles.message}>Camera permission is required to scan QR codes.</Text>
                <TouchableOpacity style={styles.btn} onPress={requestPermission}>
                    <Text style={styles.btnText}>Grant Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => router.back()}>
                    <Text style={[styles.btnText, { color: '#475569' }]}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />

            {/* Dimmed overlay with clear scan window */}
            <View style={styles.overlay}>
                <View style={styles.overlayTop} />
                <View style={styles.overlayMiddle}>
                    <View style={styles.overlaySide} />
                    <View style={styles.scanFrame}>
                        {/* Corner decorations */}
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                    </View>
                    <View style={styles.overlaySide} />
                </View>
                <View style={styles.overlayBottom} />
            </View>

            {/* Header */}
            <SafeAreaView style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Scan Asset QR Code</Text>
            </SafeAreaView>

            {/* Hint text */}
            <View style={styles.hintContainer}>
                <Text style={styles.hintText}>Point camera at the asset QR code</Text>
            </View>

            {scanned && (
                <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
                    <MaterialCommunityIcons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnText}>Tap to Scan Again</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const FRAME = 240;
const CORNER = 24;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
    overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    overlayMiddle: { height: FRAME, flexDirection: 'row' },
    overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    scanFrame: { width: FRAME, height: FRAME, backgroundColor: 'transparent' },
    corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#2563EB', borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
    header: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
    },
    backBtn: { marginRight: 12, padding: 4 },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    hintContainer: {
        position: 'absolute', bottom: 160, left: 0, right: 0, alignItems: 'center',
    },
    hintText: { color: '#fff', fontSize: 14, opacity: 0.9 },
    message: { color: '#334155', textAlign: 'center', marginBottom: 20, fontSize: 16, padding: 20 },
    btn: {
        backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12,
        borderRadius: 8, marginHorizontal: 40, marginBottom: 12, alignItems: 'center',
    },
    btnOutline: { backgroundColor: '#F1F5F9' },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
    rescanBtn: {
        position: 'absolute', bottom: 80, left: 40, right: 40,
        backgroundColor: '#2563EB', padding: 14, borderRadius: 10,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    },
});
