/**
 * Lightweight network-status event bus.
 * api.ts calls notifyNetworkStatus() whenever a fetch succeeds or fails with TypeError.
 * Components subscribe via subscribeNetworkStatus() to react to online/offline transitions.
 */

type Listener = (online: boolean) => void;

const _listeners = new Set<Listener>();
let _isOnline = true;

export function getIsOnline(): boolean {
  return _isOnline;
}

export function notifyNetworkStatus(online: boolean): void {
  if (_isOnline === online) return; // no change — skip
  _isOnline = online;
  _listeners.forEach((l) => l(online));
}

/** Returns an unsubscribe function. */
export function subscribeNetworkStatus(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
