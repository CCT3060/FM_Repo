/**
 * Offline data cache and submission queue using AsyncStorage.
 *
 * Cache: stores API GET responses keyed by endpoint URL. Entries expire after 24 h.
 * Queue: stores POST submissions that failed due to network unavailability.
 *        Call syncOfflineSubmissions() (from api.ts) to replay them when back online.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@fm_cache:';
const QUEUE_KEY = '@fm_offline_queue';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface QueuedSubmission {
  id: string;
  type: 'checklist' | 'logsheet' | 'tabular_logsheet';
  endpoint: string;
  payload: Record<string, unknown>;
  templateName: string;
  queuedAt: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

export async function cacheData(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // storage failure is non-fatal
  }
}

export async function getCachedData(key: string): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw) as { data: unknown; cachedAt: number };
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Offline Submission Queue ─────────────────────────────────────────────────

export async function getOfflineQueue(): Promise<QueuedSubmission[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSubmission[]) : [];
  } catch {
    return [];
  }
}

export async function addToOfflineQueue(
  sub: Omit<QueuedSubmission, 'id' | 'queuedAt'>
): Promise<string> {
  const queue = await getOfflineQueue();
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({ ...sub, id, queuedAt: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return id;
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  const queue = await getOfflineQueue();
  await AsyncStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(queue.filter((q) => q.id !== id))
  );
}
