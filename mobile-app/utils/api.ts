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
    return 'https://your-production-api.com'; // Production URL
  }
  
  // Development URLs
  if (Platform.OS === 'android') {
    // For physical Android device, use your PC's IP
    return 'http://192.168.1.28:4000';
    // For Android emulator, use: return 'http://10.0.2.2:4000';
  } else if (Platform.OS === 'ios') {
    // For physical iOS device, use your PC's IP
    return 'http://192.168.1.28:4000';
    // For iOS simulator, use: return 'http://localhost:4000';
  } else {
    return 'http://localhost:4000'; // Web or other platforms
  }
};

const API_BASE = getApiBase();

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
 * Verify stored token and get fresh user data
 */
export async function verifyToken(): Promise<VerifyResponse | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    
    if (!token) {
      return null;
    }

    const response = await fetch(`${API_BASE}/api/mobile-auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Token is invalid or expired, clear storage
      await clearAuth();
      return null;
    }

    const data: VerifyResponse = await response.json();
    
    // Update stored user data
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    
    return data;
  } catch (error) {
    console.error('Token verification error:', error);
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
  note?: string;
  assignedAt: string;
  assignedBy?: string;
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
    throw new Error('Failed to fetch template details');
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

/**
 * Submit checklist response
 */
export async function submitChecklist(templateId: number, assetId: number | null, answers: SubmissionAnswer[]): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/submit-checklist', {
    method: 'POST',
    body: JSON.stringify({ templateId, assetId, answers }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit checklist');
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
    throw new Error((error as any).message || 'Failed to submit tabular logsheet');
  }
}

/**
 * Submit logsheet entry
 */
export async function submitLogsheet(templateId: number, assetId: number | null, answers: SubmissionAnswer[]): Promise<void> {
  const response = await authenticatedFetch('/api/template-assignments/submit-logsheet', {
    method: 'POST',
    body: JSON.stringify({ templateId, assetId, answers }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit logsheet');
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
