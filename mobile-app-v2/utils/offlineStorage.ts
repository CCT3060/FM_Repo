import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@fmv2_cache:';
const QUEUE_KEY = '@fmv2_offline_queue';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface QueuedSubmission {
  id: string;
  type: 'checklist' | 'logsheet' | 'tabular_logsheet';
  endpoint: string;
  payload: Record<string, unknown>;
  templateName: string;
  queuedAt: number;
}

export async function cacheData(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch { /* non-fatal */ }
}

export async function getCachedData(key: string): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw) as { data: unknown; cachedAt: number };
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

export async function getOfflineQueue(): Promise<QueuedSubmission[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSubmission[]) : [];
  } catch { return []; }
}

export async function addToOfflineQueue(item: Omit<QueuedSubmission, 'id' | 'queuedAt'>): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    queue.push({ ...item, id: `${Date.now()}_${Math.random()}`, queuedAt: Date.now() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* non-fatal */ }
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter((i) => i.id !== id)));
  } catch { /* non-fatal */ }
}
