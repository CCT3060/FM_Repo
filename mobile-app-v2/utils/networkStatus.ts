/**
 * Lightweight network-status event bus.
 * Consumers subscribe via subscribeNetworkStatus() to react to transitions.
 */

type Listener = (online: boolean) => void;
const _listeners = new Set<Listener>();
let _isOnline = true;

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
