/**
 * Lightweight network-status event bus.
 * Consumers subscribe via subscribeNetworkStatus() to react to transitions.
 *
 * Uses expo-network to detect REAL device connectivity — not backend reachability.
 * This prevents the offline banner from falsely showing when the backend/tunnel
 * is down but the device actually has internet.
 */
import * as Network from 'expo-network';

type Listener = (online: boolean) => void;
const _listeners = new Set<Listener>();
let _isOnline = true;
let _monitorInterval: ReturnType<typeof setInterval> | null = null;

export function getIsOnline(): boolean { return _isOnline; }

export function notifyNetworkStatus(online: boolean): void {
  if (_isOnline === online) return;
  _isOnline = online;
  _listeners.forEach((l) => l(online));
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** Check real device network state using expo-network and update the bus. */
async function checkRealNetwork(): Promise<void> {
  try {
    const state = await Network.getNetworkStateAsync();
    // Use isConnected as the primary signal — isInternetReachable is unreliable
    // on Android cellular (returns false even with active data on many devices).
    // Only mark offline when isConnected is explicitly false.
    notifyNetworkStatus(state.isConnected !== false);
  } catch {
    // If we can't even run the check, assume online to avoid false positives
  }
}

/**
 * Start a background network monitor. Call once at app startup.
 * Returns a cleanup function to stop monitoring.
 */
export function startNetworkMonitor(): () => void {
  void checkRealNetwork(); // immediate check
  _monitorInterval = setInterval(() => void checkRealNetwork(), 10_000); // every 10s
  return () => {
    if (_monitorInterval) {
      clearInterval(_monitorInterval);
      _monitorInterval = null;
    }
  };
}
