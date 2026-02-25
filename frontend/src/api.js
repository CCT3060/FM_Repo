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
export const deleteCompany = (token, id) => request("DELETE", `/api/companies/${id}`, undefined, { authToken: token });

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
