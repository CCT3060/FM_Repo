const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(method, path, body, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
    const opts = { method, headers };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
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
export const getCompanyPortalChartStats = (token, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return request("GET", `/api/company-portal/dashboard/chart-stats${q ? "?" + q : ""}`, null, { authToken: token });
};
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
export const createAdminTemplateUserAssignment = (token, data) => request("POST", "/api/company-users/template-assignments", data, { authToken: token });
export const getAdminOjtTrainings = (token, companyId) => request("GET", `/api/company-users/ojt-trainings?companyId=${companyId}`, undefined, { authToken: token });
export const getAdminOjtProgress  = (token, companyId) => request("GET", `/api/company-users/ojt-progress?companyId=${companyId}`,  undefined, { authToken: token });

// ── Admin-level CRUD for Work Orders (client portal) ─────────────────────────
export const getAdminWorkOrders    = (token, companyId, status) => request("GET", `/api/company-users/work-orders?companyId=${companyId}${status ? `&status=${status}` : ""}`, undefined, { authToken: token });
export const createAdminWorkOrder  = (token, data) => request("POST", "/api/company-users/work-orders", data, { authToken: token });
export const updateAdminWOStatus   = (token, id, status) => request("PUT", `/api/company-users/work-orders/${id}/status`, { status }, { authToken: token });
export const assignAdminWO         = (token, id, data) => request("PUT", `/api/company-users/work-orders/${id}/assign`, data, { authToken: token });

// ── Admin-level CRUD for Shifts (client portal) ───────────────────────────────
export const getAdminShifts    = (token, companyId) => request("GET", `/api/company-users/shifts?companyId=${companyId}`, undefined, { authToken: token });
export const createAdminShift  = (token, data)      => request("POST", "/api/company-users/shifts", data, { authToken: token });
export const updateAdminShift  = (token, id, data)  => request("PUT", `/api/company-users/shifts/${id}`, data, { authToken: token });
export const deleteAdminShift  = (token, id)        => request("DELETE", `/api/company-users/shifts/${id}`, undefined, { authToken: token });

// ── Admin-level CRUD for Employees (client portal) ───────────────────────────
export const getAdminEmployees   = (token, companyId) => request("GET", `/api/company-users/employees?companyId=${companyId}`, undefined, { authToken: token });
export const createAdminEmployee = (token, data)      => request("POST", "/api/company-users/employees", data, { authToken: token });
export const updateAdminEmployee = (token, id, data)  => request("PUT", `/api/company-users/employees/${id}`, data, { authToken: token });
export const deleteAdminEmployee = (token, id)        => request("DELETE", `/api/company-users/employees/${id}`, undefined, { authToken: token });

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

// ── Company Portal Work Orders ────────────────────────────────────────────────
export const getCompanyPortalWorkOrders = (token, params = "") =>
  request("GET", `/api/company-portal/work-orders${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getCompanyPortalWOUsers = (token) =>
  request("GET", "/api/company-portal/work-orders/users", undefined, { authToken: token });
export const assignCompanyPortalWorkOrder = (token, id, data) =>
  request("PUT", `/api/company-portal/work-orders/${id}/assign`, data, { authToken: token });
export const updateWorkOrderCutoff = (token, id, expectedCompletionAt) =>
  request("PATCH", `/api/company-portal/work-orders/${id}/cutoff`, { expectedCompletionAt }, { authToken: token });

// ── Company Portal Admin Flags (dashboard) ────────────────────────────────────
export const getCompanyPortalAdminFlags = (token, params = "") =>
  request("GET", `/api/flags/admin/list${params ? `?${params}` : ""}`, undefined, { authToken: token });

// ── Company Portal Asset Dashboard ───────────────────────────────────────────
const cpAD = "/api/company-portal/asset-dashboard";
export const getCPAssetDashboardSummary      = (token, params = "") => request("GET", `${cpAD}/summary${params ? `?${params}` : ""}`,          undefined, { authToken: token });
export const getCPAssetDashboardDistribution = (token, params = "") => request("GET", `${cpAD}/distribution${params ? `?${params}` : ""}`,      undefined, { authToken: token });
export const getCPAssetDashboardPerformance  = (token, params = "") => request("GET", `${cpAD}/performance${params ? `?${params}` : ""}`,       undefined, { authToken: token });
export const getCPAssetDashboardWorkOrders   = (token, params = "") => request("GET", `${cpAD}/work-orders${params ? `?${params}` : ""}`,       undefined, { authToken: token });
export const getCPAssetDashboardMaintCost    = (token, params = "") => request("GET", `${cpAD}/maintenance-cost${params ? `?${params}` : ""}`,  undefined, { authToken: token });
export const getCPAssetDashboardDepreciation = (token, params = "") => request("GET", `${cpAD}/depreciation${params ? `?${params}` : ""}`,      undefined, { authToken: token });
export const getCPAssetDashboardAlerts       = (token, params = "") => request("GET", `${cpAD}/alerts${params ? `?${params}` : ""}`,            undefined, { authToken: token });
export const getCPAssetDashboardHistory      = (token, assetId)     => request("GET", `${cpAD}/${assetId}/history`,                             undefined, { authToken: token });
export const getCPAssetDashboardCompare      = (token, params = "") => request("GET", `${cpAD}/compare${params ? `?${params}` : ""}`,           undefined, { authToken: token });
export const getCPAssetDashboardPredictive   = (token, params = "") => request("GET", `${cpAD}/predictive${params ? `?${params}` : ""}`,        undefined, { authToken: token });

// ── Shift Management ──────────────────────────────────────────────────────────
export const getShifts             = (token)          => request("GET",    "/api/shifts",                          undefined, { authToken: token });
export const getActiveShifts       = (token)          => request("GET",    "/api/shifts/active",                   undefined, { authToken: token });
export const createShift           = (token, data)    => request("POST",   "/api/shifts",               data,      { authToken: token });
export const updateShift           = (token, id, data)=> request("PUT",    `/api/shifts/${id}`,          data,      { authToken: token });
export const deleteShift           = (token, id)      => request("DELETE", `/api/shifts/${id}`,          undefined, { authToken: token });
export const getShiftEmployees     = (token, id)      => request("GET",    `/api/shifts/${id}/employees`,undefined, { authToken: token });
export const assignShiftEmployees  = (token, id, userIds) => request("POST", `/api/shifts/${id}/employees`, { userIds }, { authToken: token });
export const removeShiftEmployee   = (token, id, userId)  => request("DELETE", `/api/shifts/${id}/employees/${userId}`, undefined, { authToken: token });

// ── OJT Management ────────────────────────────────────────────────────────────
const cp = "/api/company-portal";
export const getOjtTrainings       = (token)           => request("GET",   `${cp}/ojt/trainings`,                             undefined, { authToken: token });
export const getOjtTraining        = (token, id)        => request("GET",   `${cp}/ojt/trainings/${id}`,                       undefined, { authToken: token });
export const createOjtTraining     = (token, data)      => request("POST",  `${cp}/ojt/trainings`,                             data,      { authToken: token });
export const updateOjtTraining     = (token, id, data)  => request("PUT",   `${cp}/ojt/trainings/${id}`,                       data,      { authToken: token });
export const deleteOjtTraining     = (token, id)        => request("DELETE",`${cp}/ojt/trainings/${id}`,                       undefined, { authToken: token });
export const publishOjtTraining    = (token, id)        => request("PATCH", `${cp}/ojt/trainings/${id}/publish`,               undefined, { authToken: token });
export const createOjtModule       = (token, tid, data) => request("POST",  `${cp}/ojt/trainings/${tid}/modules`,              data,      { authToken: token });
export const updateOjtModule       = (token, mid, data) => request("PUT",   `${cp}/ojt/modules/${mid}`,                        data,      { authToken: token });
export const deleteOjtModule       = (token, mid)       => request("DELETE",`${cp}/ojt/modules/${mid}`,                        undefined, { authToken: token });
export const addOjtModuleContent   = (token, mid, data) => request("POST",  `${cp}/ojt/modules/${mid}/content`,                data,      { authToken: token });
export const deleteOjtContent      = (token, cid)       => request("DELETE",`${cp}/ojt/contents/${cid}`,                       undefined, { authToken: token });
export const createOjtTest         = (token, tid, data) => request("POST",  `${cp}/ojt/trainings/${tid}/test`,                 data,      { authToken: token });
export const addOjtQuestion        = (token, testId, d) => request("POST",  `${cp}/ojt/tests/${testId}/questions`,             d,         { authToken: token });
export const updateOjtQuestion     = (token, qid, data) => request("PUT",   `${cp}/ojt/questions/${qid}`,                      data,      { authToken: token });
export const deleteOjtQuestion     = (token, qid)       => request("DELETE",`${cp}/ojt/questions/${qid}`,                      undefined, { authToken: token });
export const getOjtTrainingUsers   = (token, id)        => request("GET",   `${cp}/ojt/trainings/${id}/users`,                 undefined, { authToken: token });
export const grantOjtCertificate   = (token, pid)       => request("POST",  `${cp}/ojt/progress/${pid}/certificate`,           undefined, { authToken: token });
export const assignOjtTraining     = (token, id, data)  => request("POST",  `${cp}/ojt/trainings/${id}/assign`,                data,      { authToken: token });
export const trainerOjtSignOff     = (token, pid, data) => request("POST",  `${cp}/ojt/progress/${pid}/trainer-signoff`,       data,      { authToken: token });
export const uploadOjtFile = async (token, file) => {
  const BASE_URL = import.meta.env.VITE_API_URL || "";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/api/company-portal/ojt/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
  return res.json();
};

// ── Fleet Management ──────────────────────────────────────────────────────────
export const getFleetAssets                = (token)           => request("GET",   `${cp}/fleet/assets`,                              undefined, { authToken: token });
export const getFleetAssetDetails          = (token, id)        => request("GET",   `${cp}/fleet/assets/${id}`,                        undefined, { authToken: token });
export const getFleetInspections           = (token, assetId)   => request("GET",   `${cp}/fleet/inspections${assetId ? `/${assetId}` : ""}`, undefined, { authToken: token });
export const createFleetInspection         = (token, data)      => request("POST",  `${cp}/fleet/inspections`,                         data,      { authToken: token });
export const updateFleetInspection         = (token, id, data)  => request("PUT",   `${cp}/fleet/inspections/${id}`,                   data,      { authToken: token });
export const deleteFleetInspection         = (token, id)        => request("DELETE",`${cp}/fleet/inspections/${id}`,                   undefined, { authToken: token });
export const getFleetFuelLogs              = (token, assetId)   => request("GET",   `${cp}/fleet/fuel${assetId ? `?assetId=${assetId}` : ""}`, undefined, { authToken: token });
export const createFleetFuelLog            = (token, data)      => request("POST",  `${cp}/fleet/fuel`,                                data,      { authToken: token });
export const updateFleetFuelLog            = (token, id, data)  => request("PUT",   `${cp}/fleet/fuel/${id}`,                          data,      { authToken: token });
export const deleteFleetFuelLog            = (token, id)        => request("DELETE",`${cp}/fleet/fuel/${id}`,                          undefined, { authToken: token });
export const getFleetMaintenance           = (token, params="") => request("GET",   `${cp}/fleet/maintenance${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createFleetMaintenance        = (token, data)      => request("POST",  `${cp}/fleet/maintenance`,                         data,      { authToken: token });
export const updateFleetMaintenance        = (token, id, data)  => request("PUT",   `${cp}/fleet/maintenance/${id}`,                   data,      { authToken: token });
export const updateFleetMaintenanceStatus  = (token, id, status)=> request("PATCH", `${cp}/fleet/maintenance/${id}/status`,            { status }, { authToken: token });
export const deleteFleetMaintenance        = (token, id)        => request("DELETE",`${cp}/fleet/maintenance/${id}`,                   undefined, { authToken: token });
export const getFleetSubmissions           = (token)            => request("GET",   `${cp}/fleet/submissions`,                         undefined, { authToken: token });
export const getFleetSubmissionDetail      = (token, type, id)  => request("GET",   `${cp}/fleet/submissions/detail/${type}/${id}`,    undefined, { authToken: token });
export const downloadFleetSubmissionsCSV   = (token)            => {
  const BASE_URL = import.meta.env.VITE_API_URL || "";
  return fetch(`${BASE_URL}/api/company-portal/fleet/submissions/export-csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

