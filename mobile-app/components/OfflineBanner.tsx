import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getIsOnline, subscribeNetworkStatus } from '../utils/networkStatus';
import { getOfflineQueue } from '../utils/offlineStorage';
import { syncOfflineSubmissions } from '../utils/api';
import { useResponsiveMetrics } from '../utils/responsive';

/**
 * Persistent banner that floats at the top of the screen when:
 *  - the device is offline  → red "Offline · N queued" bar
 *  - online but items queued → amber "N queued – tap Sync" bar
 * Disappears when online with an empty queue.
 */
export default function OfflineBanner() {
  const metrics = useResponsiveMetrics();
  const [isOnline, setIsOnline] = useState(getIsOnline());
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    const q = await getOfflineQueue();
    setQueueCount(q.length);
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncOfflineSubmissions();
      const msg =
        result.synced > 0
          ? `✓ Synced ${result.synced} item${result.synced !== 1 ? 's' : ''}`
          : 'Nothing to sync';
      setSyncDone(msg);
      setTimeout(() => setSyncDone(null), 3000);
      await refreshCount();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshCount]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 15_000);

    const unsub = subscribeNetworkStatus(async (online) => {
      setIsOnline(online);
      if (online) {
        await refreshCount();
        // auto-sync queued items when connection is restored
        await handleSync();
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [refreshCount, handleSync]);

  const visible = !isOnline || queueCount > 0;
  if (!visible && !syncDone) return null;

  return (
    <View style={styles.shell}>
    <View style={[styles.banner, { maxWidth: metrics.contentMaxWidth, top: PlatformOffset(metrics.isTablet) }, isOnline ? styles.syncBg : styles.offlineBg]}>
      <MaterialCommunityIcons
        name={isOnline ? 'cloud-sync-outline' : 'wifi-off'}
        size={16}
        color="#fff"
      />
      <Text style={styles.text} numberOfLines={1}>
        {syncDone ??
          (isOnline
            ? `${queueCount} queued – tap Sync to upload`
            : `Offline${queueCount > 0 ? ` · ${queueCount} saved locally` : ''}`)}
      </Text>
      {isOnline && queueCount > 0 && (
        <TouchableOpacity
          onPress={handleSync}
          disabled={syncing}
          style={styles.btn}
          activeOpacity={0.7}
        >
          <Text style={styles.btnText}>{syncing ? '…' : 'Sync'}</Text>
        </TouchableOpacity>
      )}
    </View>
    </View>
  );
}

function PlatformOffset(isTablet: boolean) {
  return isTablet ? 28 : 44;
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 9999,
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  offlineBg: { backgroundColor: '#dc2626' },
  syncBg: { backgroundColor: '#d97706' },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
