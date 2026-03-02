const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(method, path, body, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (res.status === 204) return null;

    let data = null;
    try {
        data = await res.json();
    } catch (_) {
        // ignore body parse errors for non-JSON responses
    }

    if (!res.ok) {
        const err = new Error((data && data.message) || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }

    return data;
}

// ── Clients ──────────────────────────────────────────────────────────────────
export const getClients = () => request("GET", "/api/clients");
export const createClient = (data) => request("POST", "/api/clients", data);
export const updateClient = (id, data) => request("PUT", `/api/clients/${id}`, data);
export const deleteClient = (id) => request("DELETE", `/api/clients/${id}`);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = () => request("GET", "/api/users");
export const createUser = (data) => request("POST", "/api/users", data);
export const updateUser = (id, data) => request("PUT", `/api/users/${id}`, data);
export const deleteUser = (id) => request("DELETE", `/api/users/${id}`);

// ── Auth / Company Portal ─────────────────────────────────────────────────────
export const login = (data) => request("POST", "/api/auth/login", data);

export const getCompanies = (token) => request("GET", "/api/companies", undefined, { authToken: token });
export const createCompany = (token, data) => request("POST", "/api/companies", data, { authToken: token });
export const updateCompany = (token, id, data) => request("PUT", `/api/companies/${id}`, data, { authToken: token });
export const deleteCompany = (token, id) => request("DELETE", `/api/companies/${id}`, undefined, { authToken: token });
export const getCompanyOverview = (token, id) => request("GET", `/api/companies/${id}/overview`, undefined, { authToken: token });

// Assets (placeholder endpoints to be implemented server-side)
export const getAssets = (token, params = "") => request("GET", `/api/assets${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createAsset = (token, data) => request("POST", "/api/assets", data, { authToken: token });
export const updateAsset = (token, id, data) => request("PUT", `/api/assets/${id}`, data, { authToken: token });
export const deleteAsset = (token, id) => request("DELETE", `/api/assets/${id}`, undefined, { authToken: token });

// Departments
export const getDepartments = (token, params = "") => request("GET", `/api/departments${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createDepartment = (token, data) => request("POST", "/api/departments", data, { authToken: token });
export const deleteDepartment = (token, id) => request("DELETE", `/api/departments/${id}`, undefined, { authToken: token });

// Checklists (asset-wise)
export const getChecklists = (token, params = "") => request("GET", `/api/checklists${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createChecklist = (token, data) => request("POST", "/api/checklists", data, { authToken: token });
export const deleteChecklist = (token, id) => request("DELETE", `/api/checklists/${id}`, undefined, { authToken: token });

// Checklist Templates (company-level, created by company portal admins)
export const getChecklistTemplates = (token, params = "") => request("GET", `/api/checklist-templates${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createChecklistTemplate = (token, data) => request("POST", "/api/checklist-templates", data, { authToken: token });
export const getChecklistTemplate = (token, id) => request("GET", `/api/checklist-templates/${id}`, undefined, { authToken: token });
export const updateChecklistTemplate = (token, id, data) => request("PUT", `/api/checklist-templates/${id}`, data, { authToken: token });
export const deleteChecklistTemplate = (token, id) => request("DELETE", `/api/checklist-templates/${id}`, undefined, { authToken: token });

// Logsheets (asset-wise)
export const getLogs = (token, params = "") => request("GET", `/api/logs${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createLog = (token, data) => request("POST", "/api/logs", data, { authToken: token });
export const deleteLog = (token, id) => request("DELETE", `/api/logs/${id}`, undefined, { authToken: token });

// Checklist assignments
export const getChecklistAssignees = (token, id) => request("GET", `/api/checklists/${id}/assignees`, undefined, { authToken: token });
export const assignChecklistToUsers = (token, id, userIds) => request("POST", `/api/checklists/${id}/assignees`, { userIds }, { authToken: token });

// Asset types master
export const getAssetTypes = (token) => request("GET", "/api/asset-types", undefined, { authToken: token });
export const createAssetType = (token, data) => request("POST", "/api/asset-types", data, { authToken: token });

// Company Users (admins / staff per company)
export const getCompanyUsers = (token, companyId) => request("GET", `/api/company-users?companyId=${companyId}`, undefined, { authToken: token });
export const createCompanyUser = (token, data) => request("POST", "/api/company-users", data, { authToken: token });
export const updateCompanyUser = (token, id, data) => request("PUT", `/api/company-users/${id}`, data, { authToken: token });
export const deleteCompanyUser = (token, id) => request("DELETE", `/api/company-users/${id}`, undefined, { authToken: token });

// Logsheet Templates
export const getLogsheetTemplates = (token, params = "") => request("GET", `/api/logsheet-templates${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createLogsheetTemplate = (token, data) => request("POST", "/api/logsheet-templates", data, { authToken: token });
export const getLogsheetTemplate = (token, id) => request("GET", `/api/logsheet-templates/${id}`, undefined, { authToken: token });
export const updateLogsheetTemplate = (token, id, data) => request("PUT", `/api/logsheet-templates/${id}`, data, { authToken: token });
export const deleteLogsheetTemplate = (token, id) => request("DELETE", `/api/logsheet-templates/${id}`, undefined, { authToken: token });
export const assignLogsheetTemplate = (token, templateId, assetId) => request("POST", `/api/logsheet-templates/${templateId}/assign`, { assetId }, { authToken: token });
export const getLogsheetEntriesByTemplate = (token, templateId, params = "") => request("GET", `/api/logsheet-templates/${templateId}/entries${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const submitLogsheetEntry = (token, templateId, data) => request("POST", `/api/logsheet-templates/${templateId}/entries`, data, { authToken: token });
export const getRecentLogsheetEntries = (token) => request("GET", "/api/logsheet-templates/entries/recent", undefined, { authToken: token });
export const getLogsheetEntryDetail = (token, entryId) => request("GET", `/api/logsheet-templates/entries/${entryId}`, undefined, { authToken: token });
export const getRecentChecklistSubmissions = (token) => request("GET", "/api/checklist-templates/submissions/recent", undefined, { authToken: token });
export const getChecklistSubmissionDetail = (token, submissionId) => request("GET", `/api/checklist-templates/submissions/${submissionId}`, undefined, { authToken: token });
export const getTemplatesForAsset = (token, assetId) => request("GET", `/api/logsheet-templates/asset/${assetId}`, undefined, { authToken: token });

// ── Company Employee Portal ────────────────────────────────────────────────────
export const companyLogin = (data) => request("POST", "/api/company-auth/login", data);
export const getCompanyPortalMe = (token) => request("GET", "/api/company-portal/me", undefined, { authToken: token });
export const getCompanyPortalDashboard = (token) => request("GET", "/api/company-portal/dashboard", undefined, { authToken: token });
export const getCompanyPortalDepartments = (token) => request("GET", "/api/company-portal/departments", undefined, { authToken: token });
export const createCompanyPortalDepartment = (token, data) => request("POST", "/api/company-portal/departments", data, { authToken: token });
export const updateCompanyPortalDepartment = (token, id, data) => request("PUT", `/api/company-portal/departments/${id}`, data, { authToken: token });
export const deleteCompanyPortalDepartment = (token, id) => request("DELETE", `/api/company-portal/departments/${id}`, undefined, { authToken: token });
export const getCompanyPortalAssets = (token) => request("GET", "/api/company-portal/assets", undefined, { authToken: token });
export const createCompanyPortalAsset = (token, data) => request("POST", "/api/company-portal/assets", data, { authToken: token });
export const updateCompanyPortalAsset = (token, id, data) => request("PUT", `/api/company-portal/assets/${id}`, data, { authToken: token });
export const deleteCompanyPortalAsset = (token, id) => request("DELETE", `/api/company-portal/assets/${id}`, undefined, { authToken: token });
export const getCompanyPortalChecklists = (token) => request("GET", "/api/company-portal/checklists", undefined, { authToken: token });
export const createCompanyPortalChecklist = (token, data) => request("POST", "/api/company-portal/checklists", data, { authToken: token });
export const updateCompanyPortalChecklist = (token, id, data) => request("PUT", `/api/company-portal/checklists/${id}`, data, { authToken: token });
export const deleteCompanyPortalChecklist = (token, id) => request("DELETE", `/api/company-portal/checklists/${id}`, undefined, { authToken: token });
export const getCompanyPortalLogsheetTemplates = (token) => request("GET", "/api/company-portal/logsheet-templates", undefined, { authToken: token });
export const getCompanyPortalLogsheetTemplate = (token, id) => request("GET", `/api/company-portal/logsheet-templates/${id}`, undefined, { authToken: token });
export const updateCompanyPortalLogsheetTemplate = (token, id, data) => request("PUT", `/api/company-portal/logsheet-templates/${id}`, data, { authToken: token });
export const deleteCompanyPortalLogsheetTemplate = (token, id) => request("DELETE", `/api/company-portal/logsheet-templates/${id}`, undefined, { authToken: token });
export const submitCompanyPortalLogsheetEntry = (token, templateId, data) => request("POST", `/api/company-portal/logsheet-templates/${templateId}/entries`, data, { authToken: token });
export const getCompanyPortalLogsheetEntries = (token, templateId, params = "") => request("GET", `/api/company-portal/logsheet-templates/${templateId}/entries${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getCompanyPortalRecentLogsheetEntries = (token) => request("GET", "/api/company-portal/logsheet-templates/entries/recent", undefined, { authToken: token });
export const getCompanyPortalRecentChecklistSubmissions = (token) => request("GET", "/api/company-portal/checklist-submissions/recent", undefined, { authToken: token });
export const createCompanyPortalLogsheetTemplate = (token, data) => request("POST", "/api/company-portal/logsheet-templates", data, { authToken: token });
export const assignCompanyPortalLogsheetTemplate = (token, templateId, assetId) => request("POST", `/api/company-portal/logsheet-templates/${templateId}/assign`, { assetId }, { authToken: token });
export const getCompanyPortalEmployees = (token) => request("GET", "/api/company-portal/employees", undefined, { authToken: token });
export const createCompanyPortalEmployee = (token, data) => request("POST", "/api/company-portal/employees", data, { authToken: token });
export const updateCompanyPortalEmployee = (token, id, data) => request("PUT", `/api/company-portal/employees/${id}`, data, { authToken: token });
export const deleteCompanyPortalEmployee = (token, id) => request("DELETE", `/api/company-portal/employees/${id}`, undefined, { authToken: token });
export const bulkImportCompanyEmployees = (token, employees) => request("POST", "/api/company-portal/employees/bulk", { employees }, { authToken: token });
export const getCompanyPortalSupervisors = (token) => request("GET", "/api/company-portal/employees/supervisors", undefined, { authToken: token });
export const createTemplateUserAssignment = (token, data) => request("POST", "/api/company-portal/template-user-assignments", data, { authToken: token });
export const getTemplateUserAssignments = (token) => request("GET", "/api/company-portal/template-user-assignments", undefined, { authToken: token });
export const getMyTemplateAssignments = (token) => request("GET", "/api/company-portal/template-user-assignments/mine", undefined, { authToken: token });
export const deleteTemplateUserAssignment = (token, id) => request("DELETE", `/api/company-portal/template-user-assignments/${id}`, undefined, { authToken: token });

// ── Smart Checklist Submissions ───────────────────────────────────────────────
export const submitChecklistExecution = (token, checklistId, data) =>
  request("POST", `/api/checklists/${checklistId}/submit`, data, { authToken: token });
export const getChecklistSubmissions = (token, checklistId, params = "") =>
  request("GET", `/api/checklists/${checklistId}/submissions${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getChecklistIssuesReport = (token, params = "") =>
  request("GET", `/api/checklists/submissions/issues${params ? `?${params}` : ""}`, undefined, { authToken: token });

// ── Logsheet Grid View ────────────────────────────────────────────────────────
export const getLogsheetGrid = (token, templateId, params = "") =>
  request("GET", `/api/logsheet-templates/${templateId}/grid${params ? `?${params}` : ""}`, undefined, { authToken: token });

export const getCompanyPortalLogsheetGrid = (token, templateId, params = "") =>
  request("GET", `/api/company-portal/logsheet-templates/${templateId}/grid${params ? `?${params}` : ""}`, undefined, { authToken: token });

export const getLogsheetIssuesReport = (token, params = "") =>
  request("GET", `/api/logsheet-templates/entries/issues${params ? `?${params}` : ""}`, undefined, { authToken: token });

// ── Flags & Alert Engine ──────────────────────────────────────────────────────
export const getCompanyFlags = (token, params = "") =>
  request("GET", `/api/flags${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getFlagDashboard = (token) =>
  request("GET", "/api/flags/dashboard", undefined, { authToken: token });
export const getFlagSummary = (token) =>
  request("GET", "/api/flags/summary", undefined, { authToken: token });
export const updateFlag = (token, id, data) =>
  request("PUT", `/api/flags/${id}`, data, { authToken: token });
export const createManualFlag = (token, data) =>
  request("POST", "/api/flags", data, { authToken: token });

// ── In-app Notifications ──────────────────────────────────────────────────────
export const getNotifications = (token, params = "") =>
  request("GET", `/api/notifications${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getNotificationCount = (token) =>
  request("GET", "/api/notifications/count", undefined, { authToken: token });
export const markNotificationRead = (token, id) =>
  request("PUT", `/api/notifications/${id}/read`, undefined, { authToken: token });
export const markAllNotificationsRead = (token) =>
  request("PUT", "/api/notifications/read-all", undefined, { authToken: token });
