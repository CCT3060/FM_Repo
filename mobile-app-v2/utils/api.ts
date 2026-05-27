/**
 * API layer — all backend communication.
 *
 * Base URL: set EXPO_PUBLIC_API_URL in .env.local for local dev.
 * Falls back to production URL automatically.
 */

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { cacheData, getCachedData, addToOfflineQueue, getOfflineQueue, removeFromOfflineQueue } from './offlineStorage';
import { notifyNetworkStatus } from './networkStatus';
import type { RoleCapabilities } from './permissions';

// ─── Config ───────────────────────────────────────────────────────────────────
const getDevApiBase = (): string | null => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest?.hostUri ||
    // Older/newer Expo manifest shapes
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.debuggerHost ||
    '';

  if (!hostUri) return null;

  const normalized = hostUri.replace(/^(https?:\/\/|exp:\/\/)/, '');
  const host = normalized.split(':')[0];
  if (!host) return null;

  return `http://${host}:4000`;
};

export const API_BASE: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  (__DEV__ ? (getDevApiBase() ?? 'http://localhost:4000') : 'https://fm.catalystservices.eco');

// ─── Error class ──────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY   = 'auth_token_v2';
const USER_KEY    = 'user_data_v2';
const COMPANY_KEY = 'company_data_v2';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AppUser {
  id:          number;
  fullName:    string;
  email:       string;
  role:        string;
  companyId:   number;
  companyName: string;
  supervisorId:     number | null;
  permissions?:     Record<string, unknown>;
  moduleAccess?:    string[];
  companyEnabledModules?: string[] | null;
  roleCapabilities: RoleCapabilities;
}

export interface StoredCompany {
  companyId:   number;
  companyName: string;
  companyCode: string;
}

export interface SoftRequest {
  id:              number;
  assetId:         number;
  assetName:       string;
  assetUniqueId:   string;
  templateId:      number;
  templateType:    string;
  templateName?:   string;
  status:          'open' | 'resolved';
  raisedAt:        string;
  raisedByName?:   string;
  resolvedAt?:     string;
  resolvedByName?: string;
  beforeAnswers?:  unknown;
  beforeSubmittedAt?: string;
  raiseSubmissionId?: number;
}

// ─── Token helpers ────────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
async function setToken(t: string) { await SecureStore.setItemAsync(TOKEN_KEY, t); }
async function clearToken()        { await SecureStore.deleteItemAsync(TOKEN_KEY); }

export async function getStoredUser(): Promise<AppUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AppUser; } catch { return null; }
}
async function setStoredUser(u: AppUser) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
}

export async function getStoredCompany(): Promise<StoredCompany | null> {
  const raw = await SecureStore.getItemAsync(COMPANY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredCompany; } catch { return null; }
}
async function setStoredCompany(c: StoredCompany) {
  await SecureStore.setItemAsync(COMPANY_KEY, JSON.stringify(c));
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(COMPANY_KEY),
  ]);
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
export async function authenticatedFetch(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(opts.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && opts.body) headers.set('Content-Type', 'application/json');

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    // Only mark online on success — marking offline is handled by the
    // dedicated network monitor (expo-network), not by backend connectivity.
    notifyNetworkStatus(true);
    return res;
  } catch (err) {
    // Do NOT call notifyNetworkStatus(false) here — a backend error or dropped
    // tunnel does not mean the device has no internet.
    throw err;
  }
}

async function apiGet<T>(path: string, useCache = false): Promise<T> {
  if (useCache) {
    const cached = await getCachedData(path);
    if (cached != null) return cached as T;
  }
  const res = await authenticatedFetch(path);
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Request failed');
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }
  const data = await res.json() as T;
  if (useCache) await cacheData(path, data);
  return data;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Request failed');
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Request failed');
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await authenticatedFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Request failed');
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function verifyCompanyCode(code: string): Promise<StoredCompany> {
  const res = await fetch(`${API_BASE}/api/mobile-auth/verify-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyCode: code }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ message: 'Invalid company code' }));
    throw new Error((msg as any).message ?? 'Invalid company code');
  }
  const data = await res.json() as StoredCompany;
  await setStoredCompany(data);
  return data;
}

export async function loginEmployee(
  companyId: number,
  employeeId: string,
  password: string
): Promise<{ user: AppUser; token: string }> {
  const res = await fetch(`${API_BASE}/api/mobile-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, username: employeeId, password }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new Error((msg as any).message ?? 'Login failed');
  }
  const { token, user } = await res.json() as { token: string; user: AppUser };
  await setToken(token);
  await setStoredUser(user);
  return { token, user };
}

export async function verifyToken(): Promise<{ user: AppUser } | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const res = await authenticatedFetch('/api/mobile-auth/verify');
    if (!res.ok) { await clearSession(); return null; }
    const data = await res.json() as { user: AppUser };
    await setStoredUser(data.user);
    return data;
  } catch { return null; }
}

export async function logout() {
  await clearSession();
}

/**
 * logoutUser — clears only the auth token and user record, keeping the stored
 * company so the app can navigate directly back to the login screen for the
 * same company rather than the company-code entry screen.
 */
export async function logoutUser() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

/**
 * clearStoredCompany — removes the stored company without touching auth tokens.
 * Use when the user explicitly wants to change company.
 */
export async function clearStoredCompany() {
  await SecureStore.deleteItemAsync(COMPANY_KEY);
}

// ─── Push token ───────────────────────────────────────────────────────────────
export async function registerPushToken(token: string, platform: string): Promise<void> {
  try {
    await authenticatedFetch('/api/mobile-auth/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  } catch { /* non-critical */ }
}

// ─── Assets ───────────────────────────────────────────────────────────────────
export async function fetchAssets(params?: { search?: string; type?: string; assignedOnly?: boolean }) {
  const q = new URLSearchParams();
  if (params?.search)       q.set('search', params.search);
  if (params?.type)         q.set('type', params.type);
  if (params?.assignedOnly) q.set('assignedOnly', 'true');
  const qs = q.toString() ? `?${q}` : '';
  return apiGet<unknown[]>(`/api/company-portal/assets${qs}`, true);
}

export async function fetchAssetById(id: number) {
  return apiGet<unknown>(`/api/company-portal/assets/${id}`);
}

export async function fetchAssetByQR(assetId: number) {
  return apiGet<unknown>(`/api/asset-qr/${assetId}`);
}

// ─── Assignments / Templates ─────────────────────────────────────────────────
export async function fetchMyAssignments() {
  return apiGet<unknown[]>('/api/template-assignments/my-assignments');
}

export async function fetchMyTodayProgress() {
  return apiGet<unknown>('/api/template-assignments/my-today-progress');
}

export interface SiteScore {
  total:                   number;
  filled:                  number;
  totalFilled:             number;
  percentage:              number;
  openRequests:            number;
  totalChecklistTemplates: number;
  totalLogsheetTemplates:  number;
  totalSubmissionsToday:   number;
}

export async function fetchSiteScore(): Promise<SiteScore> {
  return apiGet<SiteScore>('/api/template-assignments/site-score');
}

export async function fetchMySubmissionHistory() {
  return apiGet<unknown[]>('/api/template-assignments/my-submission-history');
}

export async function fetchMySubmissionDetail(type: string, id: number) {
  return apiGet<unknown>(`/api/template-assignments/my-submission-detail/${type}/${id}`);
}

/**
 * Fetch full detail of any checklist submission in the same company.
 * Used by client supervisors to view submissions they didn't file themselves
 * (e.g. the "Last Inspection" card on the asset details screen).
 */
export async function fetchAssetSubmissionDetail(submissionId: number) {
  return apiGet<unknown>(`/api/template-assignments/my-submission-detail/checklist/${submissionId}`);
}

export async function fetchMyWarnings() {
  return apiGet<unknown[]>('/api/template-assignments/my-warnings');
}

export async function fetchTeamAssignments() {
  return apiGet<unknown[]>('/api/template-assignments/team-assignments');
}

export async function fetchTeamStats() {
  return apiGet<unknown>('/api/template-assignments/team-stats');
}

export async function fetchUnassignedTemplates() {
  return apiGet<unknown[]>('/api/template-assignments/unassigned-templates');
}

export async function assignTemplate(payload: {
  templateId: number;
  templateType: string;
  userId: number;
  frequency?: string;
}) {
  return apiPost<unknown>('/api/template-assignments', payload);
}

// ─── Checklists ───────────────────────────────────────────────────────────────
export async function fetchMyChecklists() {
  return apiGet<unknown[]>('/api/template-assignments/my-assignments');
}

/** Fetch ALL active templates for this company (checklists + logsheets). */
export async function fetchAllTemplates() {
  return apiGet<unknown[]>('/api/template-assignments/all-templates');
}

/** Fetch a single template (checklist or logsheet) with fully-normalised questions. */
export async function fetchTemplateWithQuestions(type: string, id: number) {
  return apiGet<any>(`/api/template-assignments/template/${type}/${id}`);
}

/** Submit a checklist response via the authenticated route (records company_user_id). */
export async function submitChecklistAuth(payload: {
  templateId: number;
  assetId?: number | null;
  answers: Array<{ questionId: number | string; answer: any }>;
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
}): Promise<unknown> {
  return apiPost<unknown>('/api/template-assignments/submit-checklist', payload);
}

/** Submit a logsheet entry via the authenticated route (records company_user_id). */
export async function submitLogsheetAuth(payload: {
  templateId: number;
  assetId?: number | null;
  answers: Array<{ questionId: number | string; answer: any }>;
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
}): Promise<unknown> {
  return apiPost<unknown>('/api/template-assignments/submit-logsheet', payload);
}

export async function submitChecklist(
  assetId: number,
  templateId: number,
  answers: unknown[],
  offline = false
): Promise<unknown> {
  const endpoint = `/api/asset-qr/${assetId}/checklist/${templateId}/submissions`;
  const payload  = { answers };

  if (offline) {
    await addToOfflineQueue({
      type: 'checklist',
      endpoint,
      payload: payload as Record<string, unknown>,
      templateName: `Checklist ${templateId}`,
    });
    return { queued: true };
  }

  try {
    return await apiPost<unknown>(endpoint, payload);
  } catch (err) {
    if (!navigator.onLine) {
      await addToOfflineQueue({
        type: 'checklist',
        endpoint,
        payload: payload as Record<string, unknown>,
        templateName: `Checklist ${templateId}`,
      });
      return { queued: true };
    }
    throw err;
  }
}

// ─── Logsheets ────────────────────────────────────────────────────────────────
export async function submitLogsheet(
  assetId: number,
  templateId: number,
  entries: unknown[]
): Promise<unknown> {
  return apiPost<unknown>(
    `/api/asset-qr/${assetId}/logsheet/${templateId}/entries`,
    { entries }
  );
}

// ─── Work Orders ──────────────────────────────────────────────────────────────
export async function fetchWorkOrders(params?: { status?: string }) {
  const q = params?.status ? `?status=${params.status}` : '';
  return apiGet<unknown[]>(`/api/company-portal/work-orders${q}`);
}

export async function fetchWorkOrderById(id: number) {
  return apiGet<unknown>(`/api/company-portal/work-orders/${id}`);
}

export async function createWorkOrder(payload: unknown) {
  return apiPost<unknown>('/api/company-portal/work-orders', payload);
}

export async function updateWorkOrderStatus(id: number, status: string, notes?: string) {
  return apiPut<unknown>(`/api/company-portal/work-orders/${id}/status`, { status, notes });
}

export async function assignWorkOrder(id: number, userId: number) {
  return apiPut<unknown>(`/api/company-portal/work-orders/${id}/assign`, { userId });
}

// ─── Soft Service ─────────────────────────────────────────────────────────────
export async function getSoftRequestsForAsset(assetId: number): Promise<SoftRequest[]> {
  return apiGet<SoftRequest[]>(`/api/soft-service/requests/asset/${assetId}`);
}

export async function fetchMySoftRequests(): Promise<SoftRequest[]> {
  return apiGet<SoftRequest[]>('/api/soft-service/requests/my');
}

export async function fetchAllSoftRequests(): Promise<SoftRequest[]> {
  return apiGet<SoftRequest[]>('/api/soft-service/requests/all');
}

export async function raiseSoftRequest(payload: {
  assetId: number;
  templateId: number;
  submissionId?: number;
  answers: unknown[];
}): Promise<unknown> {
  return apiPost<unknown>('/api/soft-service/requests', payload);
}

export async function getSoftRequestById(id: number): Promise<SoftRequest> {
  return apiGet<SoftRequest>(`/api/soft-service/requests/${id}`);
}

export async function resolveSoftRequest(id: number, resolveSubmissionId?: number): Promise<unknown> {
  return apiPut<unknown>(`/api/soft-service/requests/${id}/resolve`, { resolveSubmissionId });
}

// ─── Notifications ────────────────────────────────────────────────────────────
export async function fetchNotifications() {
  return apiGet<unknown[]>('/api/notifications');
}

export async function fetchNotificationCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>('/api/notifications/count');
}

export async function markAllNotificationsRead() {
  return authenticatedFetch('/api/notifications/read-all', { method: 'PUT' });
}

export async function markNotificationRead(id: number) {
  return authenticatedFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
}

// ─── OJT Training ────────────────────────────────────────────────────────────
export async function fetchMyTrainings() {
  return apiGet<unknown[]>('/api/company-portal/ojt/mobile/my-assignments');
}

export async function fetchTrainingById(id: number) {
  return apiGet<unknown>(`/api/company-portal/ojt/mobile/trainings/${id}`);
}

export async function startTraining(id: number) {
  return apiPost<unknown>(`/api/company-portal/ojt/mobile/trainings/${id}/start`, {});
}

export async function completeTrainingModule(id: number, payload: unknown) {
  return apiPost<unknown>(`/api/company-portal/ojt/mobile/trainings/${id}/complete-module`, payload);
}

export async function submitTrainingTest(id: number, answers: unknown[]) {
  return apiPost<unknown>(`/api/company-portal/ojt/mobile/trainings/${id}/submit-test`, { answers });
}

// ─── Employees (for supervisor) ───────────────────────────────────────────────
export async function fetchMyTeam() {
  return apiGet<unknown[]>('/api/company-portal/my-team');
}

export async function fetchChecklistHistory() {
  return apiGet<unknown[]>('/api/template-assignments/checklist-history');
}

export async function fetchEmployeesByRole(role?: string) {
  const q = role ? `?role=${role}` : '';
  return apiGet<unknown[]>(`/api/company-portal/employees/by-role${q}`);
}

// ─── Shifts ───────────────────────────────────────────────────────────────────
export async function fetchMyShifts() {
  return apiGet<unknown[]>('/api/shifts/my-shifts');
}

export async function fetchActiveShift() {
  return apiGet<unknown>('/api/shifts/active');
}

// ─── File upload ─────────────────────────────────────────────────────────────
/**
 * Upload a local image/file URI to the server.
 * Returns the public URL of the uploaded file.
 * Does NOT set Content-Type — the native fetch will set it with the multipart boundary.
 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB — nginx limit is 15m, kept at 4 MB for safety

/** Compress an image so it is under 4 MB. Returns the (possibly new) URI. */
async function compressToUnder5MB(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const size = (info as any).size as number | undefined;
    if (!size || size <= MAX_PHOTO_BYTES) return uri; // already fine

    // Try progressively lower quality until under 5 MB
    for (const quality of [0.7, 0.5, 0.35]) {
      const result = await ImageManipulator.manipulateAsync(
        uri, [], { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );
      const info2 = await FileSystem.getInfoAsync(result.uri, { size: true });
      if (!(info2 as any).size || (info2 as any).size <= MAX_PHOTO_BYTES) {
        return result.uri;
      }
    }
    // Last resort: scale to 1280px wide + compress
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri; // if compression fails, upload original
  }
}

export async function uploadFile(localUri: string): Promise<string> {
  // Compress image to under 5 MB before uploading
  const compressedUri = await compressToUnder5MB(localUri);

  const token    = await getToken();
  const filename = compressedUri.split('/').pop() ?? 'photo.jpg';
  const ext      = (filename.split('.').pop() ?? 'jpg').toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
  };
  const mimeType = mimeMap[ext] ?? 'image/jpeg';

  const formData = new FormData();
  formData.append('file', { uri: compressedUri, name: filename, type: mimeType } as any);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Do NOT set Content-Type — native fetch sets it automatically with multipart boundary

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => 'Upload failed');
    throw new Error(msg || `Upload failed (${res.status})`);
  }
  const data = await res.json() as { url: string };
  return data.url;
}

// ─── Offline sync ────────────────────────────────────────────────────────────
export async function syncOfflineSubmissions(): Promise<number> {
  const queue = await getOfflineQueue();
  let synced = 0;
  for (const item of queue) {
    try {
      const res = await authenticatedFetch(item.endpoint, {
        method: 'POST',
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        await removeFromOfflineQueue(item.id);
        synced++;
      }
    } catch { /* retry next time */ }
  }
  return synced;
}
