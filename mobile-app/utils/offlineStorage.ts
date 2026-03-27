/**
 * Offline data cache and submission queue using AsyncStorage.
 *
 * Cache: stores API GET responses keyed by endpoint URL. Entries expire after 7 days.
 * Queue: stores POST submissions that failed due to network unavailability.
 *        Deduplication: a new submission for the same template replaces the previous
 *        pending one (only the latest unsync'd entry per template is kept).
 *        Call syncOfflineSubmissions() (from api.ts) to replay them when back online.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@fm_cache:';
const QUEUE_KEY = '@fm_offline_queue';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface QueuedSubmission {
  id: string;
  type: 'checklist' | 'logsheet' | 'tabular_logsheet' | 'work_order_status';
  /** Dedup key — same key means "same template/record". The newest entry wins. */
  dedupKey: string;
  endpoint: string;
  method: 'POST' | 'PUT';
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

/**
 * Add or replace a queued submission.
 * If an existing entry with the same `dedupKey` exists, it is replaced by the
 * new one — ensuring only the latest unsync'd submission per template is kept.
 */
export async function addToOfflineQueue(
  sub: Omit<QueuedSubmission, 'id' | 'queuedAt'>
): Promise<string> {
  const queue = await getOfflineQueue();
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newEntry: QueuedSubmission = { ...sub, id, queuedAt: Date.now() };

  // Replace any existing entry with the same dedupKey (keep latest only)
  const existing = queue.findIndex((q) => q.dedupKey === sub.dedupKey);
  if (existing !== -1) {
    queue[existing] = newEntry;
  } else {
    queue.push(newEntry);
  }

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

