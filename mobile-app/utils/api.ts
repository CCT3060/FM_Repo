import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ────────────────────────────────────────────────────────────────────────────
// API Configuration - UPDATE THIS WITH YOUR SERVER URL
// ────────────────────────────────────────────────────────────────────────────
// 
// OPTION 1: Use your computer's local IP for physical device testing
// Find your IP: Run "ipconfig" (Windows) or "ifconfig" (Mac/Linux) in terminal
// Example: const API_BASE = 'http://192.168.1.100:4000';
//
// OPTION 2: Auto-detect platform (recommended for development)
const getApiBase = () => {
  if (!__DEV__) {
    return 'https://d3kz9zxtx6891m.cloudfront.net';
  }
  
  // Development URLs
  if (Platform.OS === 'android') {
    // For physical Android device, use your PC's IP
    return 'http://192.168.1.56:4000';
    // For Android emulator, use: return 'http://10.0.2.2:4000';
  } else if (Platform.OS === 'ios') {
    // For physical iOS device, use your PC's IP
    return 'http://192.168.1.56:4000';
    // For iOS simulator, use: return 'http://localhost:4000';
  } else {
    return 'http://localhost:4000'; // Web or other platforms
  }
};

export const API_BASE = getApiBase();

console.log('🔗 API_BASE configured as:', API_BASE);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const COMPANY_KEY = 'company_data';

interface CompanyVerifyResponse {
  companyId: number;
  companyName: string;
  companyCode: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: number;
    fullName: string;
    email: string;
    role: 'supervisor' | 'employee';
    companyId: number;
    companyName: string;
    supervisorId: number | null;
  };
}

interface VerifyResponse {
  user: {
    id: number;
    fullName: string;
    email: string;
    role: 'supervisor' | 'employee';
    companyId: number;
    companyName: string;
    supervisorId: number | null;
  };
}

/**
 * Verify company code
 */
export async function verifyCompanyCode(companyCode: string): Promise<CompanyVerifyResponse> {
  let response: Response | undefined;
  
  try {
    const url = `${API_BASE}/api/mobile-auth/verify-company`;
    console.log('Verifying company code:', url);
    
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ companyCode }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: 'Server error' };
      }
      console.error('Company verification failed:', errorData);
      throw new Error(errorData.message || `Verification failed with status ${response.status}`);
    }

    const data: CompanyVerifyResponse = await response.json();
    console.log('Company verified:', data);
    
    // Store company data
    try {
      await SecureStore.setItemAsync(COMPANY_KEY, JSON.stringify(data));
      console.log('Company data stored successfully');
    } catch (storageError) {
      console.error('Storage error:', storageError);
      throw new Error('Failed to save company data. Please try again.');
    }
    
    return data;
  } catch (error) {
    console.error('verifyCompanyCode error:', error);
    
    if (!response && error instanceof TypeError) {
      throw new Error(`Cannot connect to server at ${API_BASE}. Check your network connection.`);
    }
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error('Unexpected error during verification. Please try again.');
  }
}

/**
 * Get stored company data
 */
export async function getStoredCompany(): Promise<CompanyVerifyResponse | null> {
  try {
    const companyJson = await SecureStore.getItemAsync(COMPANY_KEY);
    return companyJson ? JSON.parse(companyJson) : null;
  } catch (error) {
    console.error('Error getting stored company:', error);
    return null;
  }
}

/**
 * Login with username and password
 */
export async function loginEmployee(username: string, password: string, companyId: number): Promise<LoginResponse> {
  let response: Response | undefined;
  
  try {
    const url = `${API_BASE}/api/mobile-auth/login`;
    console.log('Calling login API:', url);
    console.log('Request body:', { username, password: '***', companyId });
    
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, companyId }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: 'Server error' };
      }
      console.error('Login failed:', errorData);
      throw new Error(errorData.message || `Login failed with status ${response.status}`);
    }

    const data: LoginResponse = await response.json();
    console.log('Login response received:', { 
      token: data.token ? 'present' : 'missing', 
      user: data.user 
    });
    
    // Store token and user data
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
      console.log('Token and user data stored successfully');
    } catch (storageError) {
      console.error('Storage error:', storageError);
      throw new Error('Failed to save login data. Please try again.');
    }
    
    return data;
  } catch (error) {
    console.error('loginEmployee error:', error);
    
    // Check if it's a network error
    if (!response && error instanceof TypeError) {
      throw new Error(`Cannot connect to server at ${API_BASE}. Check your network connection.`);
    }
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error('Unexpected error during login. Please try again.');
  }
}

/**
 * Verify stored token and get fresh user data.
 * Falls back to cached user data when the server is unreachable (network error).
 * Only forces logout when the server explicitly rejects the token (401 / 403).
 */
export async function verifyToken(): Promise<VerifyResponse | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/mobile-auth/verify`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      // Server explicitly rejected the token — log out
      await clearAuth();
      return null;
    }

    if (!response.ok) {
      // Other server error — fall back to cached data rather than logging out
      const userJson = await SecureStore.getItemAsync(USER_KEY).catch(() => null);
      if (userJson) {
        try {
          const cachedUser = JSON.parse(userJson);
          console.log('Server error during verify, using cached credentials');
          return { user: cachedUser };
        } catch (parseErr) {
          console.log('Cached credentials corrupted, clearing', parseErr);
          await SecureStore.deleteItemAsync(USER_KEY).catch(() => null);
        }
      }
      return null;
    }

    const data: VerifyResponse = await response.json();
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    return data;

  } catch {
    // Network error (server unreachable, no connection, wrong IP)
    // Use cached credentials so the user isn't logged out unnecessarily
    const userJson = await SecureStore.getItemAsync(USER_KEY).catch(() => null);
    if (userJson) {
      try {
        const cachedUser = JSON.parse(userJson);
        console.log('Server unreachable, using cached credentials');
        return { user: cachedUser };
      } catch (parseErr) {
        console.log('Cached credentials corrupted, clearing', parseErr);
        await SecureStore.deleteItemAsync(USER_KEY).catch(() => null);
      }
    }
    console.log('No cached credentials available');
    return null;
  }
}

/**
 * Get stored auth token
 */
export async function getAuthToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/**
 * Get stored user data
 */
export async function getStoredUser(): Promise<LoginResponse['user'] | null> {
  try {
    const userJson = await SecureStore.getItemAsync(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error getting stored user:', error);
    return null;
  }
}

/**
 * Clear authentication data (logout)
 */
export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(COMPANY_KEY);
}

/**
 * Make authenticated API request
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Template Assignments & Submissions
   ──────────────────────────────────────────────────────────────────────────── */

export interface Assignment {
  assignmentId: number;
  templateType: 'checklist' | 'logsheet';
  templateId: number;
  templateName: string;
  description?: string;
  assetType?: string;
  assetId?: number | null;
  assetName?: string | null;
  frequency?: string | null;
  note?: string;
  assignedAt: string;
  assignedBy?: string;
  shiftId?: number | null;
  shiftName?: string | null;
}

export interface TabularColumnGroup {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string; subLabel?: string }>;
}

export interface TabularHeaderConfig {
  layoutType: 'tabular';
  rowLabelHeader?: string;
  rows: Array<{ id: string; label: string }>;
  columnGroups: TabularColumnGroup[];
  summaryRows?: any[];
  footerBlocks?: any[];
}

export interface TemplateDetails {
  id: number;
  templateName: string;
  description?: string;
  assetType?: string;
  assetId?: number;
  assetName?: string;
  shiftId?: number | null;
  shiftName?: string | null;
  layoutType?: string;
  headerConfig?: TabularHeaderConfig | Record<string, any>;
  questions: Array<{
    id: number;
    questionText: string;
    answerType: string;
    isRequired: boolean;
    options?: any;
    displayOrder: number;
  }>;
}

export interface SubmissionAnswer {
  questionId: number;
  answer: string | null;
}

/**
 * Get assignments for current user (supervisor or technician)
 */
export async function getMyAssignments(): Promise<Assignment[]> {
  const response = await authenticatedFetch('/api/template-assignments/my-assignments');
  
  if (!response.ok) {
    throw new Error('Failed to fetch assignments');
  }
  
  return await response.json();
}

/**
 * Get template details with questions
 */
export async function getTemplateDetails(type: 'checklist' | 'logsheet', id: number): Promise<TemplateDetails> {
  const response = await authenticatedFetch(`/api/template-assignments/template/${type}/${id}`);
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch template details');
  }
  
  return await response.json();
}

/**
 * Reassign template to team member (supervisor only)
 */
export async function reassignTemplate(assignmentId: number, assignedTo: number, note?: string): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/reassign', {
    method: 'POST',
    body: JSON.stringify({ assignmentId, assignedTo, note }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to reassign');
  }
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/**
 * Submit checklist response (with optional GPS location)
 */
export async function submitChecklist(templateId: number, assetId: number | null, answers: SubmissionAnswer[], location?: GeoLocation | null): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/submit-checklist', {
    method: 'POST',
    body: JSON.stringify({ templateId, assetId, answers, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    const err: any = new Error(error.message || 'Failed to submit checklist');
    if (error.shiftLocked) { err.shiftLocked = true; err.shiftName = error.shiftName; }
    throw err;
  }
}

/**
 * Submit tabular logsheet entry via company-portal endpoint
 */
export async function submitTabularLogsheet(
  templateId: number,
  assetId: number | null,
  month: number,
  year: number,
  shift: string | null,
  tabularData: Record<string, any>
): Promise<void> {
  const response = await authenticatedFetch(`/api/company-portal/logsheet-templates/${templateId}/entries`, {
    method: 'POST',
    body: JSON.stringify({ assetId, month, year, shift, tabularData }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to submit' }));
    const err: any = new Error((error as any).message || 'Failed to submit tabular logsheet');
    if ((error as any).shiftLocked) { err.shiftLocked = true; err.shiftName = (error as any).shiftName; }
    throw err;
  }
}

/**
 * Submit logsheet entry (with optional GPS location)
 */
export async function submitLogsheet(templateId: number, assetId: number | null, answers: SubmissionAnswer[], location?: GeoLocation | null): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/submit-logsheet', {
    method: 'POST',
    body: JSON.stringify({ templateId, assetId, answers, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    const err: any = new Error(error.message || 'Failed to submit logsheet');
    if (error.shiftLocked) { err.shiftLocked = true; err.shiftName = error.shiftName; }
    throw err;
  }
}

export interface LogsheetEntry {
  id: number;
  templateId: number;
  assetId: number | null;
  month: number;
  year: number;
  shift: string | null;
  submittedAt: string;
  submittedByName: string | null;
  data: { readings?: Record<string, Record<string, string>>; summary?: Record<string, any>; footer?: Record<string, any> };
}

/**
 * Get all submitted entries for a logsheet template (filterable by month/year)
 */
export async function getLogsheetEntries(templateId: number, month?: number, year?: number): Promise<LogsheetEntry[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const query = params.toString() ? `?${params}` : '';
  const response = await authenticatedFetch(`/api/company-portal/logsheet-templates/${templateId}/entries${query}`);
  if (!response.ok) throw new Error('Failed to fetch logsheet entries');
  return await response.json();
}

export interface ChecklistGridData {
  template: { id: number; templateName: string; assetId?: number | null; assetName?: string | null };
  questions: Array<{ id: number; questionText: string; answerType: string; displayOrder: number }>;
  submissions: Array<{
    id: number;
    day: number;
    date: string | null;
    submittedBy: string | null;
    answers: Record<string, string>;
  }>;
  month: number;
  year: number;
  daysInMonth: number;
}

/**
 * Get checklist monthly grid data (questions × days of month)
 */
export async function getChecklistGridData(templateId: number, month: number, year: number): Promise<ChecklistGridData> {
  const response = await authenticatedFetch(`/api/template-assignments/checklist-grid/${templateId}?month=${month}&year=${year}`);
  if (!response.ok) throw new Error('Failed to fetch checklist grid');
  return response.json();
}

/**
 * Get logsheet grid data (template + submitted entries) for a given month/year
 */
export async function getLogsheetGridData(templateId: number, month: number, year: number): Promise<{
  template: TemplateDetails & { headerConfig: TabularHeaderConfig | Record<string, any> };
  entries: LogsheetEntry[];
  entry: LogsheetEntry | null;
  daysInMonth: number;
}> {
  const response = await authenticatedFetch(`/api/company-portal/logsheet-templates/${templateId}/grid?month=${month}&year=${year}`);
  if (!response.ok) throw new Error('Failed to fetch logsheet grid');
  return await response.json();
}

/**
 * Get my team members (supervisor only)
 */
export async function getMyTeam(): Promise<Array<{id: number; fullName: string; role: string}>> {
  const response = await authenticatedFetch('/api/company-portal/my-team');
  
  if (!response.ok) {
    throw new Error('Failed to fetch team');
  }
  
  return await response.json();
}

/**
 * Get assets for the current user's company
 */
export async function getMyAssets(): Promise<Array<{
  id: number;
  assetName: string;
  assetUniqueId: string;
  assetType: string;
  status: string;
  departmentName?: string;
  building?: string;
  floor?: string;
  room?: string;
  location?: string;
}>> {
  const response = await authenticatedFetch('/api/company-portal/assets');
  
  if (!response.ok) {
    throw new Error('Failed to fetch assets');
  }
  
  return await response.json();
}

/**
 * Get dashboard stats for the current user's company
 */
export async function getDashboardStats(): Promise<{
  totalAssets: number;
  activeAssets: number;
  totalDepartments: number;
  activeEmployees: number;
  openIssues: number;
}> {
  const response = await authenticatedFetch('/api/company-portal/dashboard');
  
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  
  return await response.json();
}

/**
 * Get a single asset by ID with metadata, templates and assignments
 */
export async function getAssetById(id: number | string): Promise<any> {
  const response = await authenticatedFetch(`/api/company-portal/assets/${id}`);
  if (!response.ok) throw new Error('Failed to fetch asset details');
  return response.json();
}

/**
 * Get all templates not yet assigned to anyone in the company (supervisor only)
 */
export async function getUnassignedTemplates(type?: 'checklist' | 'logsheet'): Promise<any[]> {
  const query = type ? `?type=${type}` : '';
  const response = await authenticatedFetch(`/api/template-assignments/unassigned-templates${query}`);
  if (!response.ok) throw new Error('Failed to fetch unassigned templates');
  return response.json();
}

/**
 * Templates assigned TO the supervisor but NOT yet forwarded to any team member (supervisor only)
 */
export async function getMyUnassignedToTeam(): Promise<any[]> {
  const response = await authenticatedFetch('/api/template-assignments/my-unassigned-to-team');
  if (!response.ok) throw new Error('Failed to fetch supervisor pending assignments');
  return response.json();
}

/**
 * Supervisor assigns a template directly to a team member
 */
export async function supervisorAssignTemplate(
  templateType: 'checklist' | 'logsheet',
  templateId: number,
  assignedTo: number,
  note?: string
): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/supervisor-assign', {
    method: 'POST',
    body: JSON.stringify({ templateType, templateId, assignedTo, note }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to assign template');
  }
}

/**
 * Get work orders (company portal). Returns { total, data[] }
 */
export async function getWorkOrders(limit = 5, assignedToMe = false): Promise<any[]> {
  const url = `/api/company-portal/work-orders?limit=${limit}${assignedToMe ? '&assignedToMe=true' : ''}`;
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error('Failed to fetch work orders');
  const json = await response.json();
  return json.data || [];
}

/**
 * Get single work order with status history
 */
export async function getWorkOrderById(id: number | string): Promise<any> {
  const response = await authenticatedFetch(`/api/company-portal/work-orders/${id}`);
  if (!response.ok) throw new Error('Failed to fetch work order');
  return response.json();
}

/**
 * Update work order status (supervisor/admin only)
 */
export async function updateWorkOrderStatus(id: number | string, status: string, remark?: string): Promise<void> {
  const response = await authenticatedFetch(`/api/company-portal/work-orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, remark }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message || 'Failed to update status');
  }
}

/**
 * Get escalation history for a work order
 */
export async function getWorkOrderEscalationHistory(id: number | string): Promise<Array<{
  id: number;
  escalationLevel: number;
  escalatedAt: string;
  previousAssigneeName: string | null;
  newAssigneeName: string | null;
  reason: string | null;
}>> {
  const response = await authenticatedFetch(`/api/company-portal/work-orders/${id}/escalation-history`);
  if (!response.ok) throw new Error('Failed to fetch escalation history');
  return response.json();
}

/**
 * Check if the current user is allowed to access content locked to a specific shift.
 * Pass shiftId = null / undefined to get { allowed: true } (unrestricted).
 */
export async function checkShiftAccess(shiftId?: number | null): Promise<{
  allowed: boolean;
  shiftName?: string;
  message?: string;
}> {
  const url = shiftId
    ? `/api/shifts/check-access?shiftId=${shiftId}`
    : `/api/shifts/check-access`;
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    // On network error, fail open to avoid blocking the user
    return { allowed: true };
  }
  return response.json();
}

/**
 * Get assignment counts per team member (supervisor only)
 */
export async function getTeamStats(): Promise<Array<{
  id: number;
  fullName: string;
  role: string;
  checklistCount: number;
  logsheetCount: number;
  totalCount: number;
}>> {
  const response = await authenticatedFetch('/api/template-assignments/team-stats');
  if (!response.ok) throw new Error('Failed to fetch team stats');
  return response.json();
}

/**
 * Get recent checklist submissions for the company (datewise history)
 */
export async function getChecklistSubmissions(): Promise<Array<{
  id: number;
  submittedAt: string | null;
  templateName: string;
  templateId: number;
  assetName: string | null;
  assetId: number | null;
  status: string | null;
  completionPct: number | null;
  submittedBy: string | null;
}>> {
  const response = await authenticatedFetch('/api/company-portal/checklist-submissions/recent');
  if (!response.ok) throw new Error('Failed to fetch checklist submissions');
  return response.json();
}

/**
 * Get all assignments made to team members with optional filters (supervisor only)
 */
export async function getTeamAssignments(filters?: {
  type?: string;
  assetType?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.type) params.append('type', filters.type);
  if (filters?.assetType) params.append('assetType', filters.assetType);
  if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.append('dateTo', filters.dateTo);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await authenticatedFetch(`/api/template-assignments/team-assignments${query}`);
  if (!response.ok) throw new Error('Failed to fetch team assignments');
  return response.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Today's Progress & Submission History
// ────────────────────────────────────────────────────────────────────────────

export interface SubmissionHistoryItem {
  id: number;
  type: 'checklist' | 'logsheet';
  templateName: string;
  templateId: number;
  assetName: string | null;
  submittedAt: string;
  status: string;
}

export async function getTodayProgress(): Promise<{ checklistsDone: number; logsheetsDone: number; totalDone: number }> {
  const response = await authenticatedFetch('/api/template-assignments/my-today-progress');
  if (!response.ok) return { checklistsDone: 0, logsheetsDone: 0, totalDone: 0 };
  return response.json();
}

export async function getMySubmissionHistory(limit = 30): Promise<SubmissionHistoryItem[]> {
  const response = await authenticatedFetch(`/api/template-assignments/my-submission-history?limit=${limit}`);
  if (!response.ok) return [];
  return response.json();
}

export interface SubmissionDetailAnswer {
  question: string;
  type: string;
  answer: string | number | boolean | null;
}

export interface SubmissionDetail extends SubmissionHistoryItem {
  type: 'checklist' | 'logsheet';
  answers: SubmissionDetailAnswer[];
}

export async function getMySubmissionDetail(type: string, id: number): Promise<SubmissionDetail> {
  const response = await authenticatedFetch(`/api/template-assignments/my-submission-detail/${type}/${id}`);
  if (!response.ok) throw new Error('Failed to load submission detail');
  return response.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Warnings / Flags for current tech user
// ────────────────────────────────────────────────────────────────────────────

export interface WarningItem {
  id: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  description: string | null;
  source: string;
  createdAt: string;
  resolvedAt: string | null;
  escalated: boolean;
  assetName: string | null;
  assetCode: string | null;
}

export async function getMyWarnings(limit = 50): Promise<WarningItem[]> {
  const response = await authenticatedFetch(`/api/template-assignments/my-warnings?limit=${limit}`);
  if (!response.ok) return [];
  return response.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Shift Management
// ────────────────────────────────────────────────────────────────────────────

export interface Shift {
  id: number;
  name: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  description?: string;
  status: 'active' | 'inactive';
  employeeCount?: number;
}

/**
 * Get all shifts for the company
 */
export async function getShifts(): Promise<Shift[]> {
  const response = await authenticatedFetch('/api/shifts');
  if (!response.ok) throw new Error('Failed to fetch shifts');
  return response.json();
}

/**
 * Get only currently active shifts (by server time)
 */
export async function getActiveShifts(): Promise<Shift[]> {
  const response = await authenticatedFetch('/api/shifts/active');
  if (!response.ok) throw new Error('Failed to fetch active shifts');
  return response.json();
}

/**
 * Get shifts assigned to the logged-in user
 */
export async function getMyShifts(): Promise<Shift[]> {
  const response = await authenticatedFetch('/api/shifts/my-shifts');
  if (!response.ok) throw new Error('Failed to fetch my shifts');
  return response.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Asset QR (public – no auth required)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch asset details, OJT trainings, checklist templates and logsheet templates
 * for the given asset ID via the public QR endpoint.
 */
export async function getAssetQrData(assetId: string | number): Promise<any> {
  const response = await fetch(`${API_BASE}/api/asset-qr/${assetId}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message || 'Asset not found');
  }
  return response.json();
}

// ────────────────────────────────────────────────────────────────────────────
// OJT Training (mobile / technician)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get all published OJT trainings for the current user's company,
 * including the logged-in user's progress for each.
 */
export async function getMyOjtTrainings(): Promise<any[]> {
  const response = await authenticatedFetch('/api/company-portal/ojt/mobile/trainings');
  if (!response.ok) throw new Error('Failed to fetch trainings');
  return response.json();
}

/**
 * Get a single published OJT training with modules, contents, test questions
 * and the logged-in user's progress.
 */
export async function getOjtTrainingDetail(id: string | number): Promise<any> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Please log in to view training details');
  }
  const response = await authenticatedFetch(`/api/company-portal/ojt/mobile/trainings/${id}`);
  if (response.status === 401 || response.status === 403) {
    throw new Error('Session expired. Please log in again.');
  }
  if (response.status === 404) {
    throw new Error('Training not found or not yet published. Please contact your admin.');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message || 'Failed to load training');
  }
  return response.json();
}

/**
 * Start (enrol in) an OJT training – creates a progress record.
 */
export async function startOjtTraining(id: number): Promise<void> {
  const response = await authenticatedFetch(
    `/api/company-portal/ojt/mobile/trainings/${id}/start`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error('Failed to start training');
}

/**
 * Mark a specific module as completed for the given training.
 */
export async function completeOjtModule(trainingId: number, moduleId: number): Promise<void> {
  const response = await authenticatedFetch(
    `/api/company-portal/ojt/mobile/trainings/${trainingId}/complete-module`,
    { method: 'POST', body: JSON.stringify({ moduleId }) }
  );
  if (!response.ok) throw new Error('Failed to complete module');
}

/**
 * Submit test answers for an OJT training and receive the score result.
 */
export async function submitOjtTest(
  trainingId: number,
  answers: Record<number, string>
): Promise<{ score: number; passed: boolean; status: string; passingPct: number; attemptNumber: number; attemptsRemaining: number; maxAttempts: number }> {
  const response = await authenticatedFetch(
    `/api/company-portal/ojt/mobile/trainings/${trainingId}/submit-test`,
    { method: 'POST', body: JSON.stringify({ answers }) }
  );
  if (!response.ok) throw new Error('Failed to submit test');
  return response.json();
}

/**
 * Get all trainings assigned to the current user (including not_started ones).
 */
export async function getMyOjtAssignments(): Promise<any[]> {
  const response = await authenticatedFetch('/api/company-portal/ojt/mobile/my-assignments');
  if (!response.ok) throw new Error('Failed to fetch assignments');
  return response.json();
}

/**
 * Get the test attempt history for the current user for a specific training.
 */
export async function getOjtTestAttempts(trainingId: number): Promise<any[]> {
  const response = await authenticatedFetch(`/api/company-portal/ojt/mobile/test-attempts/${trainingId}`);
  if (!response.ok) throw new Error('Failed to fetch attempt history');
  return response.json();
}
