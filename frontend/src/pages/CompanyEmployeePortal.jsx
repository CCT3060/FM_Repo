import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import logo from "../images/image.png";
import LogsheetModule from "../components/LogsheetModule.jsx";
import ChecklistQuestionRow from "../components/ChecklistQuestionRow.jsx";
import ChecklistTemplateModule from "../components/ChecklistTemplateModule.jsx";
import SubmissionsPanel from "../components/SubmissionsPanel.jsx";
import WarningsPanel from "../components/WarningsPanel.jsx";
import WorkOrdersPanel from "../components/WorkOrdersPanel.jsx";
import AssetDashboard from "../components/AssetDashboard.jsx";
import OjtTrainingBuilder, { TrainingPreviewModal, TrainingQRModal } from "../components/OjtTrainingBuilder.jsx";
import { useAlertSound } from "../hooks/useAlertSound";
import {
  getCompanyPortalMe,
  getCompanyPortalDashboard,
  getCompanyPortalChartStats,
  getCompanyPortalLogsheetGrid,
  getCompanyPortalDepartments,
  createCompanyPortalDepartment,
  updateCompanyPortalDepartment,
  deleteCompanyPortalDepartment,
  getCompanyPortalAssets,
  createCompanyPortalAsset,
  updateCompanyPortalAsset,
  deleteCompanyPortalAsset,
  getCompanyPortalChecklists,
  createCompanyPortalChecklist,
  updateCompanyPortalChecklist,
  deleteCompanyPortalChecklist,
  getCompanyPortalEmployees,
  createCompanyPortalEmployee,
  updateCompanyPortalEmployee,
  deleteCompanyPortalEmployee,
  bulkImportCompanyEmployees,
  getCompanyPortalLogsheetTemplates,
  getCompanyPortalLogsheetTemplate,
  updateCompanyPortalLogsheetTemplate,
  deleteCompanyPortalLogsheetTemplate,
  getCompanyPortalLogsheetEntries,
  submitCompanyPortalLogsheetEntry,
  createCompanyPortalLogsheetTemplate,
  assignCompanyPortalLogsheetTemplate,
  getCompanyPortalRecentLogsheetEntries,
  getCompanyPortalRecentChecklistSubmissions,
  getCompanyPortalSupervisors,
  createTemplateUserAssignment,
  getTemplateUserAssignments,
  getMyTemplateAssignments,
  deleteTemplateUserAssignment,
  getCompanyPortalAdminFlags,
  getCompanyPortalWorkOrders,
  getCompanyPortalWOUsers,
  assignCompanyPortalWorkOrder,
  getShifts,
  getActiveShifts,
  createShift,
  updateShift,
  deleteShift,
  getShiftEmployees,
  assignShiftEmployees,
  removeShiftEmployee,
  // OJT
  getOjtTrainings, getOjtTraining, createOjtTraining, updateOjtTraining, deleteOjtTraining, publishOjtTraining,
  createOjtModule, updateOjtModule, deleteOjtModule, addOjtModuleContent, deleteOjtContent,
  createOjtTest, addOjtQuestion, updateOjtQuestion, deleteOjtQuestion, getOjtTrainingUsers, grantOjtCertificate, uploadOjtFile,
  // Fleet
  getFleetAssets, getFleetAssetDetails, getFleetInspections, createFleetInspection, updateFleetInspection, deleteFleetInspection,
  getFleetFuelLogs, createFleetFuelLog, updateFleetFuelLog, deleteFleetFuelLog,
  getFleetMaintenance, createFleetMaintenance, updateFleetMaintenance, updateFleetMaintenanceStatus, deleteFleetMaintenance,
  getFleetSubmissions, getFleetSubmissionDetail, downloadFleetSubmissionsCSV,
} from "../api.js";

/* ─── Role definitions ────────────────────────────────────────────── */
const ROLES = [
  { value: "admin",               label: "Admin",               color: "#7c3aed", bg: "#f3e8ff" },
  { value: "technical_lead",      label: "Technical Lead",      color: "#1d4ed8", bg: "#dbeafe" },
  { value: "assistant_manager",   label: "Asst. Manager",       color: "#5b21b6", bg: "#ede9fe" },
  { value: "technical_executive", label: "Technical Executive", color: "#0e7490", bg: "#cffafe" },
  { value: "supervisor",          label: "Supervisor",          color: "#0369a1", bg: "#e0f2fe" },
  { value: "technician",          label: "Technician",          color: "#059669", bg: "#d1fae5" },
  { value: "cleaner",             label: "Cleaner",             color: "#16a34a", bg: "#f0fdf4" },
  { value: "security",            label: "Security",            color: "#ca8a04", bg: "#fefce8" },
  { value: "driver",              label: "Driver",              color: "#ea580c", bg: "#fff7ed" },
  { value: "fleet_operator",      label: "Fleet Operator",      color: "#9333ea", bg: "#fdf4ff" },
  { value: "employee",            label: "Employee",            color: "#64748b", bg: "#f1f5f9" },
];
const roleInfo = (r) => ROLES.find((x) => x.value === r) || ROLES[ROLES.length - 1];

// 5-level maintenance hierarchy
const HIERARCHY_CHAIN = [
  { role: "technical_lead",      label: "Technical Lead",      parentRole: null,                  color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  { role: "assistant_manager",   label: "Asst. Manager",       parentRole: "technical_lead",      color: "#5b21b6", bg: "#ede9fe", border: "#c4b5fd" },
  { role: "technical_executive", label: "Technical Executive", parentRole: "assistant_manager",   color: "#0e7490", bg: "#cffafe", border: "#a5f3fc" },
  { role: "supervisor",          label: "Supervisor",          parentRole: "technical_executive", color: "#0369a1", bg: "#e0f2fe", border: "#bae6fd" },
  { role: "technician",          label: "Technician",          parentRole: "supervisor",          color: "#059669", bg: "#d1fae5", border: "#6ee7b7" },
];
const PARENT_ROLE = Object.fromEntries(HIERARCHY_CHAIN.map((h) => [h.role, h.parentRole]));
const HIERARCHY_ROLES = new Set(HIERARCHY_CHAIN.map((h) => h.role));
const SHIFTS = ["Morning", "Afternoon", "Evening", "Night"];

const NAV_ALL = [
  { key: "dashboard", label: "Dashboard", roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { key: "departments", label: "Departments", roles: ["admin"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { key: "assets", label: "Assets", roles: ["admin","supervisor"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg> },
  { key: "checklists", label: "Checklists", roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  { key: "logsheets", label: "Logsheets", roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { key: "employees", label: "My Team", roles: ["supervisor"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "employees", label: "Employees", roles: ["admin"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "warnings", label: "Warnings", roles: ["admin","supervisor"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { key: "workorders", label: "Work Orders", roles: ["admin","supervisor"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg> },
  { key: "shifts", label: "Shifts", roles: ["admin"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { key: "ojt", label: "OJT Management", roles: ["admin"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
  { key: "fleet", label: "Fleet Management", roles: ["admin"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
  { key: "mytasks", label: "My Tasks", roles: ["supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
];
// Returns nav items visible for a given role
const getNav = (role) => NAV_ALL.filter((n) => n.roles.includes(role) || n.roles.includes("*"));

/* ─── Shared atoms ────────────────────────────────────────────────── */
const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", ...style }}>{children}</div>
);
const CardHeader = ({ title, subtitle, action }) => (
  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
    <div>
      <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>{title}</p>
      {subtitle && <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{subtitle}</p>}
    </div>
    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
  </div>
);
const StatCard = ({ label, value, sub, subCol, iconBg, iconCol, icon }) => (
  <div style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
    <div>
      <p style={{ color: "#64748b", fontSize: "13.5px", marginBottom: "8px", fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{value}</p>
      {sub && <p style={{ color: subCol || "#64748b", fontSize: "12.5px", marginTop: "8px", fontWeight: 500 }}>{sub}</p>}
    </div>
    {icon && <div style={{ width: "48px", height: "48px", background: iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: iconCol, flexShrink: 0 }}>{icon}</div>}
  </div>
);
const Btn = ({ children, onClick, outline, color = "#2563eb", bg, disabled, style = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: outline ? `1.5px solid ${color}` : "none", background: bg || (outline ? "#fff" : color), color: outline ? color : "#fff", opacity: disabled ? 0.6 : 1, ...style }}>
    {children}
  </button>
);
const Badge = ({ val }) => { const r = roleInfo(val); return <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: r.bg, color: r.color }}>{r.label}</span>; };
const Alert = ({ children, type = "error" }) => {
  const s = type === "error" ? { bg: "#fef2f2", col: "#dc2626", border: "#fecaca" } : { bg: "#f0fdf4", col: "#16a34a", border: "#bbf7d0" };
  return <div style={{ background: s.bg, color: s.col, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${s.border}`, marginBottom: "14px" }}>{children}</div>;
};

const FInput = ({ label, required, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none" }} />
  </div>
);
const FSelect = ({ label, required, children, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <select {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff", outline: "none" }}>{children}</select>
  </div>
);

/* ─── CSV helper ─────────────────────────────────────────────────── */
const parseCSV = (text) => {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
  return lines.slice(1).map((row) => {
    const vals = row.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
    return obj;
  });
};

const downloadCSVTemplate = () => {
  const csv = "full_name,email,phone,designation,role,status,password\nJohn Doe,john@company.com,+91-99999-00000,Facilities Technician,technician,Active,changeme123\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "employee_import_template.csv";
  a.click();
};

/* ─── Employee Modal ─────────────────────────────────────────────── */
function EmployeeModal({ existing, token, employees = [], currentUserRole = "admin", onClose, onSaved }) {
  const isEdit = !!existing;
  const def = { fullName: "", email: "", phone: "", designation: "", role: "technician", shift: "", status: "Active", password: "", username: "", supervisorId: "" };
  const [form, setForm] = useState(isEdit ? {
    ...def, ...existing, password: "",
    username: existing.username || "",
    supervisorId: existing.supervisorId ? String(existing.supervisorId) : "",
    shift: existing.shift || "",
  } : def);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const change = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // When role changes, clear supervisorId if parent role changes
  const changeRole = (newRole) => {
    setForm((p) => ({ ...p, role: newRole, supervisorId: "", shift: "" }));
  };

  // Determine what parent role this role should report to
  const parentRole = PARENT_ROLE[form.role] ?? null;
  // Filter employees list to parent role options
  const parentOptions = parentRole
    ? employees.filter((e) => e.role === parentRole && (!isEdit || e.id !== existing?.id))
    : [];

  const parentRoleInfo = parentRole ? HIERARCHY_CHAIN.find((h) => h.role === parentRole) : null;
  const isHierarchyRole = HIERARCHY_ROLES.has(form.role);
  const showShift = form.role === "assistant_manager";
  // Admin-only parent picker; supervisors are auto-assigned to themselves
  const showParentField = currentUserRole === "admin" && parentRole !== null;
  // Legacy: supervisors (old role) picking a supervisor parent
  const showLegacySupervisor = currentUserRole === "admin" && !isHierarchyRole && form.role !== "admin";

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.email.trim()) return setError("Name and email are required");
    if (!isEdit && !form.password.trim()) return setError("Password is required for new employees");
    if (!isEdit && !form.username.trim()) return setError("Username is required for mobile app access");
    if (isHierarchyRole && parentRole && !form.supervisorId && currentUserRole === "admin") {
      // Warning but not blocking — allow saving without parent
    }
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        supervisorId: form.supervisorId ? Number(form.supervisorId) : null,
        shift: form.shift || null,
      };
      if (!payload.password) delete payload.password;
      if (!payload.username) delete payload.username;
      const saved = isEdit
        ? await updateCompanyPortalEmployee(token, existing.id, payload)
        : await createCompanyPortalEmployee(token, payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "580px", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "14px 14px 0 0" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>{isEdit ? "Edit Employee" : "Add New Employee"}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Fill in staff details and hierarchy placement</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#e2e8f0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {error && <div style={{ gridColumn: "span 2" }}><Alert>{error}</Alert></div>}

          {/* Basic info */}
          <div style={{ gridColumn: "span 2" }}>
            <FInput label="Full Name" required value={form.fullName} onChange={(e) => change("fullName", e.target.value)} placeholder="e.g. Ahmed Hassan" />
          </div>
          <FInput label="Email Address" required type="email" value={form.email} onChange={(e) => change("email", e.target.value)} placeholder="ahmed@company.com" />
          <FInput label="Phone" value={form.phone} onChange={(e) => change("phone", e.target.value)} placeholder="+971 50 000 0000" />
          <FInput label="Designation / Job Title" value={form.designation} onChange={(e) => change("designation", e.target.value)} placeholder="e.g. Senior Technician" />
          <FSelect label="Status" value={form.status} onChange={(e) => change("status", e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FSelect>

          {/* Role */}
          <div style={{ gridColumn: "span 2" }}>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
              Role <span style={{ color: "#ef4444" }}>*</span>
            </label>
            {/* Hierarchy roles visual selector */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px", marginBottom: "10px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Hierarchy Roles</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {HIERARCHY_CHAIN.map((h, i) => (
                  <button key={h.role} type="button" onClick={() => changeRole(h.role)}
                    style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.role === h.role ? h.color : h.border}`, background: form.role === h.role ? h.bg : "#fff", color: form.role === h.role ? h.color : "#64748b", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.12s" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>{i + 1}.</span>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Other roles */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {ROLES.filter((r) => !HIERARCHY_ROLES.has(r.value) && r.value !== "admin").map((r) => (
                <button key={r.value} type="button" onClick={() => changeRole(r.value)}
                  style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.role === r.value ? r.color : "#e2e8f0"}`, background: form.role === r.value ? r.bg : "#fff", color: form.role === r.value ? r.color : "#64748b" }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shift — only for Assistant Manager */}
          {showShift && (
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                Shift <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>(required for Asst. Managers)</span>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {SHIFTS.map((s) => (
                  <button key={s} type="button" onClick={() => change("shift", s)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: "8px", border: `1.5px solid ${form.shift === s ? "#5b21b6" : "#e2e8f0"}`, background: form.shift === s ? "#ede9fe" : "#fff", color: form.shift === s ? "#5b21b6" : "#64748b", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hierarchy parent picker */}
          {showParentField && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ background: `${parentRoleInfo?.bg || "#f8fafc"}22`, border: `1px solid ${parentRoleInfo?.border || "#e2e8f0"}`, borderRadius: "10px", padding: "14px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: parentRoleInfo?.color || "#475569", marginBottom: "8px" }}>
                  Reports To ({parentRoleInfo?.label || parentRole})
                </label>
                {parentOptions.length === 0 ? (
                  <div style={{ padding: "10px", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: "7px", fontSize: "12.5px", color: "#92400e" }}>
                    ⚠ No {parentRoleInfo?.label || parentRole} users found. Add a {parentRoleInfo?.label || parentRole} first.
                  </div>
                ) : (
                  <select value={form.supervisorId} onChange={(e) => change("supervisorId", e.target.value)}
                    style={{ width: "100%", padding: "9px 11px", border: `1px solid ${parentRoleInfo?.border || "#e2e8f0"}`, borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                    <option value="">— Select {parentRoleInfo?.label || parentRole} —</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.fullName}{p.shift ? ` · ${p.shift} Shift` : ""}{p.designation ? ` — ${p.designation}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Legacy non-hierarchy supervisor field */}
          {showLegacySupervisor && (
            <div style={{ gridColumn: "span 2" }}>
              <FSelect label="Supervisor (optional)" value={form.supervisorId} onChange={(e) => change("supervisorId", e.target.value)}>
                <option value="">— None —</option>
                {employees.filter((e) => e.role === "supervisor" || e.role === "technical_lead" || e.role === "assistant_manager").map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.fullName}{s.designation ? ` · ${s.designation}` : ""}</option>
                ))}
              </FSelect>
            </div>
          )}

          {/* Mobile App Access */}
          <div style={{ gridColumn: "span 2", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              <p style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a", margin: 0 }}>Mobile App Access</p>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>Username &amp; password for the employee mobile app login</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FInput label="Username" required={!isEdit} value={form.username} onChange={(e) => change("username", e.target.value)} placeholder="e.g. ahmed.hassan" />
              <FInput label={isEdit ? "New Password (leave blank to keep)" : "Password"} type="password" required={!isEdit} value={form.password} onChange={(e) => change("password", e.target.value)} placeholder={isEdit ? "••••••" : "Set a password"} />
            </div>
            {isEdit && form.username && (
              <p style={{ fontSize: "11.5px", color: "#16a34a", marginTop: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mobile access active — username: <strong>{form.username}</strong>
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Forward Template Modal (Supervisor → Team Member) ─────────── */
function ForwardTemplateModal({ assignment, token, teamMembers = [], existingForwards = [], onClose, onForwarded, onRemoved }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const alreadyForwardedTo = (userId) =>
    existingForwards.some((f) => String(f.assignedTo) === String(userId));

  const handleForward = async () => {
    if (!selectedUserId) return setError("Please select a team member");
    setSaving(true); setError(null);
    try {
      const res = await createTemplateUserAssignment(token, {
        templateType: assignment.templateType,
        templateId: assignment.templateId,
        assignedTo: Number(selectedUserId),
        note: note.trim() || null,
      });
      onForwarded(res);
      setSelectedUserId(""); setNote("");
    } catch (err) { setError(err.message || "Failed to assign"); }
    finally { setSaving(false); }
  };

  const handleRemove = async (forwardId) => {
    try {
      await deleteTemplateUserAssignment(token, forwardId);
      onRemoved(forwardId);
    } catch (err) { alert(err.message); }
  };

  const available = teamMembers.filter((m) => !alreadyForwardedTo(m.id));
  const forwarded = teamMembers.filter((m) => alreadyForwardedTo(m.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>Forward to Team Member</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: assignment.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: assignment.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>{assignment.templateType}</span>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>{assignment.templateName}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Assign form */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && <Alert>{error}</Alert>}
          {teamMembers.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>No team members under you yet.<br/>Add members from the My Team tab first.</p>
          ) : (
            <>
              <FSelect label="Assign to" required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">— Select team member —</option>
                {available.map((m) => (
                  <option key={m.id} value={String(m.id)}>{m.fullName}{m.designation ? ` · ${m.designation}` : ""}</option>
                ))}
              </FSelect>
              {available.length === 0 && (
                <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "-6px" }}>All team members already have this assignment.</p>
              )}
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add instructions for this team member…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }}/>
              </div>
              <Btn onClick={handleForward} disabled={saving || !selectedUserId}>{saving ? "Assigning…" : "Assign to Team Member"}</Btn>
            </>
          )}

          {/* Already forwarded */}
          {forwarded.length > 0 && (
            <div style={{ marginTop: "4px" }}>
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>Already assigned to:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {forwarded.map((m) => {
                  const fwd = existingForwards.find((f) => String(f.assignedTo) === String(m.id));
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#166534" }}>{m.fullName}</span>
                        <span style={{ fontSize: "12px", color: "#16a34a" }}>{m.designation || ""}</span>
                      </div>
                      <button onClick={() => fwd && handleRemove(fwd.id)}
                        style={{ fontSize: "11.5px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "5px", padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid #e2e8f0", textAlign: "right" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Done</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Assign Template Modal ──────────────────────────────────────── */
function AssignTemplateModal({ employee, token, checklists = [], logsheetTemplates = [], existingAssignments = [], onClose, onAssigned, onRemoved }) {
  const [tab, setTab] = useState("checklist");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isAssigned = (type, id) =>
    existingAssignments.some((a) => a.templateType === type && String(a.templateId) === String(id));

  const handleToggle = async (type, templateId) => {
    setSaving(true); setError(null);
    try {
      const existing = existingAssignments.find((a) => a.templateType === type && String(a.templateId) === String(templateId));
      if (existing) {
        await deleteTemplateUserAssignment(token, existing.id);
        onRemoved(existing.id);
      } else {
        const res = await createTemplateUserAssignment(token, { templateType: type, templateId, assignedTo: employee.id });
        onAssigned(res);
      }
    } catch (err) { setError(err.message || "Failed"); }
    finally { setSaving(false); }
  };

  const templates = tab === "checklist" ? checklists : logsheetTemplates;
  const empAssignedHere = existingAssignments.filter((a) => a.templateType === tab);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Assign Templates to {employee.fullName}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{empAssignedHere.length} templates currently assigned ({tab})</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: "12px 24px 0", display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0" }}>
          {[{ key: "checklist", label: "Checklists" }, { key: "logsheet", label: "Logsheet Templates" }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 20px", borderRadius: "8px 8px 0 0", border: "1px solid #e2e8f0", borderBottom: tab === t.key ? "2px solid #2563eb" : "1px solid #e2e8f0", background: tab === t.key ? "#eff6ff" : "#f8fafc", color: tab === t.key ? "#2563eb" : "#64748b", fontWeight: tab === t.key ? 700 : 500, fontSize: "13.5px", cursor: "pointer" }}>
              {t.label}
              <span style={{ marginLeft: "6px", padding: "1px 7px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#e0e7ff", color: "#4338ca" }}>
                {existingAssignments.filter((a) => a.templateType === t.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Template list */}
        <div style={{ padding: "16px 24px" }}>
          {error && <Alert style={{ marginBottom: "12px" }}>{error}</Alert>}
          {templates.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>No {tab} templates available</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {templates.map((t) => {
                const assigned = isAssigned(tab, t.id);
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", border: assigned ? "1.5px solid #bfdbfe" : "1px solid #e2e8f0", background: assigned ? "#eff6ff" : "#fafafa" }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>{t.template_name || t.templateName}</p>
                      {tab === "logsheet" && t.frequency && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{t.frequency}</span>
                      )}
                    </div>
                    <button onClick={() => handleToggle(tab, t.id)} disabled={saving}
                      style={{ padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: assigned ? "#fee2e2" : "#2563eb", color: assigned ? "#dc2626" : "#fff", transition: "opacity 0.15s", opacity: saving ? 0.6 : 1 }}>
                      {assigned ? "Remove" : "Assign"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", textAlign: "right" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Done</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Department Modal ───────────────────────────────────────────── */
function DeptModal({ existing, token, onClose, onSaved }) {
  const isEdit = !!existing;
  const [form, setForm] = useState({ name: existing?.departmentName || "", description: existing?.description || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.name.trim()) return setError("Department name is required");
    setSaving(true); setError(null);
    try {
      const saved = isEdit
        ? await updateCompanyPortalDepartment(token, existing.id, form)
        : await createCompanyPortalDepartment(token, form);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "420px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{isEdit ? "Edit Department" : "Add Department"}</p>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && <Alert>{error}</Alert>}
          <FInput label="Department Name" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Facilities" />
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Department"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Asset Modal ─────────────────────────────────────────────── */
function AssetModal({ existing, token, departments, employees = [], onClose, onSaved }) {
  const isEdit = !!existing;

  const buildForm = (src) => {
    const meta = src?.metadata || {};
    return {
      assetName:    src?.assetName    || "",
      assetUniqueId: src?.assetUniqueId || "",
      assetType:    src?.assetType    || "soft",
      departmentId: src?.departmentId != null ? String(src.departmentId) : "",
      building:     src?.building     || "",
      floor:        src?.floor        || "",
      room:         src?.room         || "",
      status:       src?.status       || "Active",
      description:  meta.description  || "",
      // Soft
      serviceArea:         meta.serviceArea         || "",
      frequency:           meta.frequency           || "Daily",
      shift:               meta.shift               || "Morning",
      supervisor:          meta.supervisor          || "",
      staffRequired:       meta.staffRequired       || "",
      specialInstructions: meta.specialInstructions || "",
      // Technical
      machineName:          meta.machineName          || "",
      brand:                meta.brand                || "",
      modelNumber:          meta.modelNumber          || "",
      serialNumber:         meta.serialNumber         || "",
      installationDate:     meta.installationDate     || "",
      warrantyExpiry:       meta.warrantyExpiry       || "",
      maintenanceFrequency: meta.maintenanceFrequency || "",
      lastServiceDate:      meta.lastServiceDate      || "",
      nextServiceDate:      meta.nextServiceDate      || "",
      technician:           meta.technician           || "",
      // Asset Valuation (all types)
      purchaseValue:    meta.purchaseValue    || "",
      usefulLifeYears:  meta.usefulLifeYears  || "",
      // Assign To
      assignedToId:    meta.assignedToId    != null ? String(meta.assignedToId) : "",
      // Fleet
      vehicleNumber:   meta.vehicleNumber   || "",
      vehicleType:     meta.vehicleType     || "",
      fuelType:        meta.fuelType        || "",
      driver:          meta.driver          || "",
      rcNumber:        meta.rcNumber        || "",
      insuranceExpiry: meta.insuranceExpiry || "",
      pucExpiry:       meta.pucExpiry       || "",
      serviceDueDate:  meta.serviceDueDate  || "",
      purchaseDate:    meta.purchaseDate    || "",
      vendor:          meta.vendor          || "",
      dailyKmTracking: !!meta.dailyKmTracking,
    };
  };

  const [form, setForm] = useState(() => buildForm(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const ch = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    ch(name, type === "checkbox" ? checked : value);
  };

  // When assetType changes, preserve existing values but clear type-specific fields
  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setForm(p => ({
      ...p, assetType: newType,
      serviceArea: "", frequency: "Daily", shift: "Morning", supervisor: "", staffRequired: "", specialInstructions: "",
      machineName: "", brand: "", modelNumber: "", serialNumber: "", installationDate: "", warrantyExpiry: "",
      maintenanceFrequency: "", lastServiceDate: "", nextServiceDate: "", technician: "",
      vehicleNumber: "", vehicleType: "", fuelType: "", driver: "", rcNumber: "",
      insuranceExpiry: "", pucExpiry: "", serviceDueDate: "", purchaseDate: "", vendor: "", dailyKmTracking: false,
      // keep assignedToId across type changes
    }));
  };

  const buildMetadata = () => {
    const t = form.assetType;
    const assignedEmployee = employees.find(e => String(e.id) === String(form.assignedToId));
    const base = { description: form.description, purchaseValue: form.purchaseValue ? parseFloat(form.purchaseValue) : null, usefulLifeYears: form.usefulLifeYears ? parseFloat(form.usefulLifeYears) : null, assignedToId: form.assignedToId || null, assignedToName: assignedEmployee?.fullName || null };
    if (t === "soft") return { ...base, serviceArea: form.serviceArea, frequency: form.frequency, shift: form.shift, supervisor: form.supervisor, staffRequired: form.staffRequired, specialInstructions: form.specialInstructions };
    if (t === "technical") return { ...base, machineName: form.machineName, brand: form.brand, modelNumber: form.modelNumber, serialNumber: form.serialNumber, installationDate: form.installationDate, warrantyExpiry: form.warrantyExpiry, maintenanceFrequency: form.maintenanceFrequency, lastServiceDate: form.lastServiceDate, nextServiceDate: form.nextServiceDate, technician: form.technician };
    if (t === "fleet") return { ...base, vehicleNumber: form.vehicleNumber, vehicleType: form.vehicleType, fuelType: form.fuelType, driver: form.driver, rcNumber: form.rcNumber, insuranceExpiry: form.insuranceExpiry, pucExpiry: form.pucExpiry, serviceDueDate: form.serviceDueDate, purchaseDate: form.purchaseDate, vendor: form.vendor, dailyKmTracking: form.dailyKmTracking };
    return base;
  };

  const handleSave = async () => {
    if (!form.assetName.trim()) return setError("Asset name is required");
    setSaving(true); setError(null);
    try {
      const payload = {
        assetName:     form.assetName.trim(),
        assetUniqueId: form.assetUniqueId || null,
        assetType:     form.assetType,
        departmentId:  form.departmentId || null,
        building:      form.building || null,
        floor:         form.floor    || null,
        room:          form.room     || null,
        status:        form.status,
        metadata:      buildMetadata(),
      };
      const saved = isEdit
        ? await updateCompanyPortalAsset(token, existing.id, payload)
        : await createCompanyPortalAsset(token, payload);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save asset"); }
    finally { setSaving(false); }
  };

  /* ─── tiny helpers ─── */
  const FSec = ({ title }) => (
    <div style={{ gridColumn: "span 2", paddingTop: "8px", marginTop: "4px", borderTop: "1px solid #f1f5f9" }}>
      <p style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{title}</p>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "720px" }} onClick={e => e.stopPropagation()}>
        {/* header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>{isEdit ? "Edit Asset" : "Add Asset"}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Fill in details based on the selected asset type.</p>
          </div>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {error && <div style={{ gridColumn: "span 2" }}><Alert>{error}</Alert></div>}

          {/* ── Core ── */}
          <div style={{ gridColumn: "span 2" }}>
            <FInput label="Asset Name" required name="assetName" value={form.assetName} onChange={handleChange} placeholder="e.g. HVAC Unit 1" />
          </div>
          <FInput label="Asset Unique ID" name="assetUniqueId" value={form.assetUniqueId} onChange={handleChange} placeholder="Auto or manual" />
          <FSelect label="Asset Type" required name="assetType" value={form.assetType} onChange={handleTypeChange}>
            <option value="soft">Soft Services</option>
            <option value="technical">Technical</option>
            <option value="fleet">Fleet</option>
          </FSelect>
          <FSelect label="Department" name="departmentId" value={form.departmentId} onChange={handleChange}>
            <option value="">— None —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
          </FSelect>
          <FSelect label="Status" name="status" value={form.status} onChange={handleChange}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FSelect>
          <FSelect label="Assign To (Employee)" name="assignedToId" value={form.assignedToId} onChange={handleChange}>
            <option value="">— None —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ""}</option>)}
          </FSelect>

          {/* ── Asset Valuation (feeds dashboard depreciation) ── */}
          <FSec title="Asset Valuation" />
          <FInput label="Purchase Value (₹)" name="purchaseValue" type="number" value={form.purchaseValue} onChange={handleChange} placeholder="e.g. 250000" />
          <FInput label="Useful Life (Years)" name="usefulLifeYears" type="number" value={form.usefulLifeYears} onChange={handleChange} placeholder="e.g. 10" />

          {/* ── Location ── */}
          {form.assetType !== "fleet" && <>
          <FSec title="Location" />
          <FInput label="Building" name="building" value={form.building} onChange={handleChange} placeholder="e.g. Block A" />
          <FInput label="Floor" name="floor" value={form.floor} onChange={handleChange} placeholder="e.g. 3rd Floor" />
          <div style={{ gridColumn: "span 2" }}>
            <FInput label="Room / Area" name="room" value={form.room} onChange={handleChange} placeholder="e.g. Server Room" />
          </div>
          </>}

          {/* ── Description ── */}
          <div style={{ gridColumn: "span 2" }}>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="Notes, instructions, etc."
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
          </div>

          {/* ── Soft Services ── */}
          {form.assetType === "soft" && <>
            <FSec title="Soft Services" />
            <FInput label="Service Area / Location" name="serviceArea" value={form.serviceArea} onChange={handleChange} placeholder="Lobby, Pantry, etc." />
            <FSelect label="Frequency" name="frequency" value={form.frequency} onChange={handleChange}>
              <option>Daily</option><option>Weekly</option><option>Monthly</option>
            </FSelect>
            <FSelect label="Shift" name="shift" value={form.shift} onChange={handleChange}>
              <option>Morning</option><option>Evening</option><option>Night</option>
            </FSelect>
            <FInput label="Supervisor Assigned" name="supervisor" value={form.supervisor} onChange={handleChange} />
            <FInput label="No. of Staff Required" name="staffRequired" value={form.staffRequired} onChange={handleChange} placeholder="e.g. 3" />
            <div style={{ gridColumn: "span 2" }}>
              <FInput label="Special Instructions" name="specialInstructions" value={form.specialInstructions} onChange={handleChange} />
            </div>
          </>}

          {/* ── Technical ── */}
          {form.assetType === "technical" && <>
            <FSec title="Technical Asset" />
            <FInput label="Machine Name" name="machineName" value={form.machineName} onChange={handleChange} />
            <FInput label="Brand / Manufacturer" name="brand" value={form.brand} onChange={handleChange} />
            <FInput label="Model Number" name="modelNumber" value={form.modelNumber} onChange={handleChange} />
            <FInput label="Serial Number" name="serialNumber" value={form.serialNumber} onChange={handleChange} />
            <FInput label="Installation Date" name="installationDate" type="date" value={form.installationDate} onChange={handleChange} />
            <FInput label="Warranty Expiry" name="warrantyExpiry" type="date" value={form.warrantyExpiry} onChange={handleChange} />
            <FInput label="Maintenance Frequency" name="maintenanceFrequency" value={form.maintenanceFrequency} onChange={handleChange} placeholder="e.g. Monthly" />
            <FInput label="Last Service Date" name="lastServiceDate" type="date" value={form.lastServiceDate} onChange={handleChange} />
            <FInput label="Next Service Date" name="nextServiceDate" type="date" value={form.nextServiceDate} onChange={handleChange} />
            <FInput label="Technician Assigned" name="technician" value={form.technician} onChange={handleChange} />
          </>}

          {/* ── Fleet ── */}
          {form.assetType === "fleet" && <>
            <FSec title="Fleet Asset" />
            <FInput label="Vehicle Number" required name="vehicleNumber" value={form.vehicleNumber} onChange={handleChange} />
            <FInput label="Vehicle Type" name="vehicleType" value={form.vehicleType} onChange={handleChange} />
            <FInput label="Fuel Type" name="fuelType" value={form.fuelType} onChange={handleChange} />
            <FInput label="Driver Assigned" name="driver" value={form.driver} onChange={handleChange} />
            <FInput label="RC Number" name="rcNumber" value={form.rcNumber} onChange={handleChange} />
            <FInput label="Insurance Expiry" name="insuranceExpiry" type="date" value={form.insuranceExpiry} onChange={handleChange} />
            <FInput label="PUC Expiry" name="pucExpiry" type="date" value={form.pucExpiry} onChange={handleChange} />
            <FInput label="Service Due Date" name="serviceDueDate" type="date" value={form.serviceDueDate} onChange={handleChange} />
            <FInput label="Purchase Date" name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleChange} />
            <FInput label="Vendor" name="vendor" value={form.vendor} onChange={handleChange} />
            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "9px", marginTop: "2px" }}>
              <input type="checkbox" name="dailyKmTracking" checked={form.dailyKmTracking} onChange={handleChange} id="dkmtrack" style={{ width: "15px", height: "15px", cursor: "pointer" }} />
              <label htmlFor="dkmtrack" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>Daily KM Tracking</label>
            </div>
          </>}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Asset"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Checklist Modal ──────────────────────────────────────────── */
const clCategories = [
  { value: "soft",      label: "Soft Services"    },
  { value: "technical", label: "Technical Assets"  },
  { value: "fleet",     label: "Fleet Assets"      },
];
const mkQ = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: "", answerType: "yes_no", isMandatory: false, config: null });

function ChecklistModal({ existing, assets = [], shifts = [], token, onClose, onSaved }) {
  const isEdit = !!existing;

  // Normalise questions stored on existing record (items saved as {title,answerType,isRequired,...})
  const parseExistingQ = (qs) => {
    if (!Array.isArray(qs) || !qs.length) return [mkQ()];
    return qs.map((q) => ({
      id: q.id || mkQ().id,
      text: q.title || q.text || "",
      answerType: q.answerType || "yes_no",
      isMandatory: q.isRequired ?? q.isMandatory ?? false,
      config: q.config || null,
    }));
  };

  const [category,       setCategory]       = useState(existing?.assetType || "soft");
  const [assetId,        setAssetId]         = useState(existing?.assetId ? String(existing.assetId) : "");
  const [checklistName,  setChecklistName]   = useState(existing?.templateName || "");
  const [description,    setDescription]     = useState(existing?.description || "");
  const [shiftId,        setShiftId]         = useState(existing?.shiftId ? String(existing.shiftId) : "");
  const [questions,      setQuestions]       = useState(() => parseExistingQ(existing?.questions));
  const [saving,         setSaving]          = useState(false);
  const [error,          setError]           = useState(null);
  const [draggingId,     setDraggingId]      = useState(null);

  const filteredAssets = useMemo(() => assets.filter((a) => a.assetType === category), [assets, category]);

  const handleAddQuestion    = ()           => setQuestions((p) => [...p, mkQ()]);
  const handleUpdateQuestion = (id, patch)  => setQuestions((p) => p.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const handleRemoveQuestion = (id)         => setQuestions((p) => p.length === 1 ? p : p.filter((q) => q.id !== id));

  const reorder = (dragId, targetId) => {
    if (!dragId || dragId === targetId) return;
    setQuestions((prev) => {
      const next = [...prev];
      const from = next.findIndex((q) => q.id === dragId);
      const to   = next.findIndex((q) => q.id === targetId);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    const name = checklistName.trim();
    if (!name) return setError("Checklist name is required");
    const validQuestions = questions.filter((q) => q.text.trim());
    if (!validQuestions.length) return setError("Add at least one question with text");
    setSaving(true); setError(null);
    try {
      const payload = {
        templateName: name,
        assetType:    category,
        category,
        description:  description.trim() || undefined,
        assetId:      assetId ? Number(assetId) : undefined,
        shiftId:      shiftId ? Number(shiftId) : undefined,
        questions:    validQuestions.map((q, idx) => ({
          id:         q.id,
          title:      q.text.trim(),
          answerType: q.answerType,
          isRequired: !!q.isMandatory,
          order:      idx,
          config:     q.config,
        })),
      };
      const saved = isEdit
        ? await updateCompanyPortalChecklist(token, existing.id, payload)
        : await createCompanyPortalChecklist(token, payload);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "900px", marginTop: "20px", marginBottom: "20px" }}>
        {/* header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{isEdit ? "Edit Checklist" : "Add Checklist"}</p>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && <Alert>{error}</Alert>}

          {/* ── Asset / Name row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Asset Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select" style={{ width: "100%" }}>
                {clCategories.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Asset (optional)</label>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="form-select" style={{ width: "100%" }}>
                <option value="">{filteredAssets.length ? "— Any asset —" : "No assets for this category"}</option>
                {filteredAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Checklist Name *</label>
              <input value={checklistName} onChange={(e) => setChecklistName(e.target.value)} className="form-input" placeholder="e.g. Daily HVAC Checklist" style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" placeholder="Purpose or scope" style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Shift (optional)</label>
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="form-select" style={{ width: "100%" }}>
                <option value="">— Any shift —</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Questions ── */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>Questions</span>
              <button type="button" onClick={handleAddQuestion}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "7px", padding: "6px 13px", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>
                + Add Question
              </button>
            </div>
            <div>
              {questions.map((q) => (
                <ChecklistQuestionRow
                  key={q.id}
                  question={q}
                  onChange={handleUpdateQuestion}
                  onRemove={handleRemoveQuestion}
                  onDragStart={(dragId) => setDraggingId(dragId)}
                  onDragOver={() => {}}
                  onDrop={() => { reorder(draggingId, q.id); setDraggingId(null); }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Checklist"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Import Modal ───────────────────────────────────────────────── */
function ImportModal({ token, onClose, onDone }) {
  const [allRows, setAllRows] = useState([]);   // full parsed data — used for actual import
  const [preview, setPreview] = useState([]);   // first 5 rows — used for display only
  const [fileName, setFileName] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result || "");
      setAllRows(rows);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!allRows.length) return setError("Upload a CSV file first");
    setImporting(true);
    setError(null);
    try {
      const employees = allRows.map((r) => ({
        fullName: r.full_name || r.fullname || r.name,
        email: r.email,
        phone: r.phone,
        designation: r.designation,
        role: r.role || "employee",
        status: r.status || "Active",
        password: r.password || "changeme123",
      }));
      const res = await bulkImportCompanyEmployees(token, employees);
      setResult(res);
      onDone();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "640px" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Import Employees from CSV</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Upload a .csv file with employee data</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <Alert>{error}</Alert>}
          {result && <Alert type="success">✓ Imported {result.created} employee(s). {result.skipped > 0 && `${result.skipped} skipped (duplicates).`}</Alert>}

          <div style={{ marginBottom: "16px", background: "#f8fafc", borderRadius: "10px", padding: "14px 16px", border: "1px solid #e2e8f0" }}>
            <p style={{ fontWeight: 600, fontSize: "13px", color: "#374151", marginBottom: "8px" }}>Required CSV Columns:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {["full_name", "email", "phone", "designation", "role", "status", "password"].map((c) => (
                <span key={c} style={{ padding: "3px 9px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "5px", fontSize: "12px", fontFamily: "monospace", color: "#374151" }}>{c}</span>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>Role values: admin, supervisor, technician, cleaner, security, driver, fleet_operator, employee</p>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <Btn onClick={downloadCSVTemplate} outline color="#64748b" bg="#fff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Template
            </Btn>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", background: "#2563eb", color: "#fff", border: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              {fileName ? "Change File" : "Upload CSV"}
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
          </div>

          {fileName && <p style={{ fontSize: "12.5px", color: "#16a34a", marginBottom: "10px" }}>📎 {fileName}</p>}

          {preview.length > 0 && (
            <div>
              <p style={{ fontWeight: 600, fontSize: "13px", color: "#374151", marginBottom: "8px" }}>
                Preview (first {preview.length} of <span style={{ color: "#2563eb" }}>{allRows.length}</span> rows)
              </p>
              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Name", "Email", "Phone", "Designation", "Role", "Status"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 10px" }}>{r.full_name || r.fullname || r.name}</td>
                        <td style={{ padding: "7px 10px" }}>{r.email}</td>
                        <td style={{ padding: "7px 10px" }}>{r.phone}</td>
                        <td style={{ padding: "7px 10px" }}>{r.designation}</td>
                        <td style={{ padding: "7px 10px" }}><Badge val={r.role || "employee"} /></td>
                        <td style={{ padding: "7px 10px" }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Close</Btn>
          {allRows.length > 0 && !result && (
            <Btn onClick={handleImport} disabled={importing}>{importing ? `Importing ${allRows.length} employees…` : `Import ${allRows.length} Employee${allRows.length !== 1 ? "s" : ""}`}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── OJT Training Detail View ────────────────────────────────────── */
function OjtTrainingDetailView({ training, token, onBack, onUpdated }) {
  const [activeTab, setActiveTab] = useState("details"); // details, modules, test, tracking
  const [data, setData] = useState(training);
  const [loading, setLoading] = useState(false);

  // Re-fetch helper
  const refresh = async () => {
    try {
      setLoading(true);
      const updated = await getOjtTraining(token, data.id);
      setData(updated);
      onUpdated(updated);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  if (!data) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;

  return (
    <Card style={{ borderTop: "4px solid #2563eb" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={onBack} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{data.title}</h2>
              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: data.status === "published" ? "#dcfce7" : "#f1f5f9", color: data.status === "published" ? "#166534" : "#475569" }}>
                {data.status === "published" ? "Published" : "Draft"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13.5px" }}>{data.description || "No description provided."}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn outline color="#2563eb" bg="#fff" onClick={refresh}>Refresh</Btn>
          {data.status !== "published" && (
            <Btn onClick={async () => {
              if (!window.confirm("Publish this training? It will become visible to technicians.")) return;
              try { await publishOjtTraining(token, data.id); refresh(); } catch (e) { alert("Failed to publish"); }
            }} style={{ background: "#16a34a" }}>
              Publish Course
            </Btn>
          )}
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px" }}>
        {[
          { id: "details", label: "Overview" },
          { id: "modules", label: `Modules (${data.modules?.length || 0})` },
          { id: "test", label: "Test Builder" },
          { id: "tracking", label: "User Progress" }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "16px 20px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "3px solid #2563eb" : "3px solid transparent", color: activeTab === tab.id ? "#2563eb" : "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "400px" }}>
        {activeTab === "details" && (
          <div style={{ maxWidth: "600px", background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "20px" }}>Course Settings</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Passing Percentage</label>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a" }}>{data.passingPercentage}% Required</div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Associated Asset</label>
                <div style={{ fontSize: "15px", color: data.assetName ? "#0f172a" : "#94a3b8" }}>{data.assetName || "None - General Training"}</div>
              </div>
              <div style={{ marginTop: "10px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "13px", color: "#64748b" }}>
                Created on {new Date(data.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {activeTab === "modules" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Course Modules</h3>
              <Btn onClick={async () => {
                const title = window.prompt("Enter Module Title:");
                if (!title) return;
                try { await createOjtModule(token, data.id, { title, orderNumber: data.modules?.length || 0 }); refresh(); }
                catch (e) { alert("Failed to add module"); }
              }}>+ Add Module</Btn>
            </div>

            {loading ? <p style={{ color: "#64748b" }}>Loading...</p> : data.modules?.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#fff", borderRadius: "12px", border: "1px dashed #cbd5e1", color: "#94a3b8" }}>
                No modules added yet. Click "+ Add Module" to start building curriculum.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {data.modules.map((m, idx) => (
                  <div key={m.id} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#334155" }}>{idx + 1}. {m.title}</h4>
                      <button onClick={async () => {
                        if (!window.confirm("Delete this module and all its content?")) return;
                        try { await deleteOjtModule(token, m.id); refresh(); } catch (e) { alert("Failed to delete"); }
                      }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Remove</button>
                    </div>
                    <div style={{ padding: "16px 20px" }}>
                      {m.contents?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                          {m.contents.map(c => (
                            <div key={c.id} style={{ padding: "12px", background: "#f1f5f9", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <span style={{ display: "inline-block", padding: "2px 8px", background: "#e2e8f0", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#475569", marginRight: "10px" }}>{c.type}</span>
                                <span style={{ fontSize: "14px", color: "#334155" }}>{c.description || c.url || "Content block"}</span>
                              </div>
                              <button onClick={async () => {
                                try { await deleteOjtContent(token, c.id); refresh(); } catch (e) { }
                              }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "13px" }}>No content in this module.</p>
                      )}

                      <div style={{ display: "flex", gap: "10px" }}>
                        <Btn outline color="#2563eb" bg="#fff" onClick={async () => {
                          const url = window.prompt("Enter Video/Document URL:");
                          if (!url) return;
                          const desc = window.prompt("Enter short description:");
                          try { await addOjtModuleContent(token, m.id, { type: "url", url, description: desc }); refresh(); } catch (e) { }
                        }}>+ Add Link / Video</Btn>
                        <Btn outline color="#2563eb" bg="#fff" onClick={async () => {
                          const desc = window.prompt("Enter Text Content:");
                          if (!desc) return;
                          try { await addOjtModuleContent(token, m.id, { type: "text", description: desc }); refresh(); } catch (e) { }
                        }}>+ Add Text</Btn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "test" && (
          <div>
            {!data.test ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#fff", borderRadius: "12px", border: "1px dashed #cbd5e1", color: "#64748b" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "16px", display: "inline-block" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                <h3 style={{ fontSize: "16px", color: "#334155", marginBottom: "8px" }}>No Test Configured</h3>
                <p style={{ fontSize: "14px", maxWidth: "400px", margin: "0 auto", marginBottom: "20px" }}>Initialize an assessment to add verification questions for this training.</p>
                <Btn onClick={async () => {
                  try { await createOjtTest(token, data.id, { totalMarks: 100 }); refresh(); } catch (e) { alert("Failed"); }
                }}>Initialize Test Assessment</Btn>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Test Questions</h3>
                    <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0" }}>Total Marks: {data.test.totalMarks} — Add questions to assess knowledge.</p>
                  </div>
                  <Btn onClick={() => {
                    const qType = window.prompt("Type of question? (mcq / descriptive / multiselect)", "mcq");
                    if (!qType || !["mcq", "descriptive", "multiselect"].includes(qType.toLowerCase())) return;
                    const text = window.prompt("Enter the question:");
                    if (!text) return;
                    let opts = null, ans = "";
                    if (qType.toLowerCase() === "mcq") {
                      opts = ["Option A", "Option B", "Option C", "Option D"];
                      ans = "Option A";
                    }
                    if (qType.toLowerCase() === "multiselect") {
                      opts = ["Option 1", "Option 2", "Option 3"];
                      ans = "Option 1,Option 2";
                    }
                    try {
                      addOjtQuestion(token, data.test.id, { question: text, options: opts, correctAnswer: ans, marks: 10 }).then(refresh);
                    } catch (e) { alert("Failed"); }
                  }}>+ Add Question</Btn>
                </div>

                {data.test.questions?.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {data.test.questions.map((q, i) => (
                      <div key={q.id} style={{ background: "#fff", borderRadius: "10px", padding: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                          <h4 style={{ margin: 0, fontSize: "15px", color: "#0f172a", fontWeight: 600 }}>{i + 1}. {q.question}</h4>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "3px 8px", borderRadius: "12px" }}>{q.marks} Marks</span>
                        </div>

                        {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} style={{ padding: "8px 12px", borderRadius: "6px", background: q.correctAnswer?.includes(opt) ? "#dcfce7" : "#f8fafc", border: q.correctAnswer?.includes(opt) ? "1px solid #86efac" : "1px solid #e2e8f0", fontSize: "13.5px", color: q.correctAnswer?.includes(opt) ? "#166534" : "#475569" }}>
                                {opt} {q.correctAnswer?.includes(opt) && <strong style={{ marginLeft: "8px" }}>(Correct)</strong>}
                              </div>
                            ))}
                          </div>
                        )}
                        {!q.options && (
                          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b", fontStyle: "italic" }}>Descriptive answer expected.</p>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button onClick={async () => {
                            if (!window.confirm("Delete this question?")) return;
                            try { await deleteOjtQuestion(token, q.id); refresh(); } catch (e) { }
                          }} style={{ background: "none", border: "none", color: "#ef4444", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Delete Question</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "30px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8" }}>
                    No questions added yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "tracking" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Enrollment & Progress</h3>
            </div>

            {loading ? <p style={{ color: "#64748b" }}>Loading...</p> : !data.users || data.users.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8" }}>
                No technicians are currently enrolled in this training.
              </div>
            ) : (
              <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Technician", "Status", "Score", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map(u => (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{u.userName}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef9c3" : "#f1f5f9", color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#854d0e" : "#475569" }}>
                            {u.status.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: u.score >= data.passingPercentage ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {u.score != null ? `${u.score}%` : "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {u.status === "completed" && u.score >= data.passingPercentage && !u.certificateUrl && (
                            <Btn outline color="#16a34a" bg="#fff" onClick={async () => {
                              try { await grantOjtCertificate(token, u.id); refresh(); } catch (e) { alert("Failed to grant"); }
                            }}>Grant Certificate</Btn>
                          )}
                          {u.certificateUrl && (
                            <a href={u.certificateUrl} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>View Certificate</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── OJT Progress Tracking Section ──────────────────────────────── */
function TrackingSection({ token, ojtTrainings = [] }) {
  const [selectedId, setSelectedId] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [passingPct, setPassingPct] = useState(0);
  const [totalModules, setTotalModules] = useState(0);

  const loadUsers = async (id) => {
    if (!id) { setUsers([]); return; }
    setLoading(true);
    try {
      const data = await getOjtTrainingUsers(token, id);
      if (Array.isArray(data)) {
        setUsers(data);
        setPassingPct(0);
        setTotalModules(0);
      } else {
        setUsers(data.users || []);
        setPassingPct(data.passingPercentage ?? 0);
        setTotalModules(data.totalModules ?? 0);
      }
    } catch (e) { setUsers([]); }
    setLoading(false);
  };

  const handleSelect = (id) => { setSelectedId(id); loadUsers(id); };

  const handleGrant = async (progressId) => {
    try {
      await grantOjtCertificate(token, progressId);
      setUsers(p => p.map(u => u.id === progressId ? { ...u, certificateUrl: "granted" } : u));
    } catch (e) { alert("Failed to grant certificate"); }
  };

  return (
    <Card style={{ padding: "0" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>Employee Training Progress</h3>
        <select value={selectedId} onChange={e => handleSelect(e.target.value)}
          style={{ width: "320px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", outline: "none" }}>
          <option value="">— Select a training to view progress —</option>
          {ojtTrainings.map(t => (
            <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
          ))}
        </select>
      </div>
      {!selectedId ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "12px", display: "inline-block" }}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <p style={{ margin: 0, fontSize: "14px" }}>Select a training above to see employee progress and issue certificates.</p>
        </div>
      ) : loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading progress…</div>
      ) : users.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No employees enrolled in this training yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Employee", "Status", "Progress", "Score", "Certificate", "Actions"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const completedCount = (() => {
                  try { return Array.isArray(u.completedModules) ? u.completedModules.length : JSON.parse(u.completedModules || "[]").length; }
                  catch { return 0; }
                })();
                const effectiveTotal = totalModules > 0 ? totalModules : completedCount;
                const modulePct = effectiveTotal > 0 ? Math.round((completedCount / effectiveTotal) * 100) : 0;
                const testPassed = u.score != null && u.score >= passingPct;
                const canGrantCert = u.status === "completed" && !u.certificateUrl;
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.userName || u.fullName || "Employee"}</div>
                      {u.email && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{u.email}</div>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600,
                        background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef9c3" : u.status === "failed" ? "#fee2e2" : "#f1f5f9",
                        color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#854d0e" : u.status === "failed" ? "#991b1b" : "#475569" }}>
                        {(u.status || "not_started").replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", minWidth: "140px" }}>
                      <div style={{ fontSize: "12px", color: "#475569", marginBottom: "5px", fontWeight: 600 }}>
                        {completedCount}/{effectiveTotal} modules
                      </div>
                      <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${modulePct}%`, background: modulePct === 100 ? "#16a34a" : "#2563eb", borderRadius: "3px", transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>{modulePct}%</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: testPassed ? "#16a34a" : "#dc2626" }}>
                      {u.score != null ? `${u.score}%` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {u.certificateUrl ? (
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>🏅 Issued</span>
                      ) : <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {canGrantCert ? (
                        <button onClick={() => handleGrant(u.id)} style={{ padding: "5px 12px", borderRadius: "6px", background: "#dcfce7", color: "#166534", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          Grant Certificate
                        </button>
                      ) : u.status !== "completed" && !u.certificateUrl ? (
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Awaiting test completion</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ─── Fleet Asset Detail View ─────────────────────────────────────── */
function FleetAssetDetailView({ assetId, token, onBack }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await getFleetAssetDetails(token, assetId);
      setData(res);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [assetId]);

  if (loading && !data) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading Asset Details...</div>;
  if (!data) return <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>Failed to load asset.</div>;

  return (
    <Card style={{ borderTop: "4px solid #10b981", padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={onBack} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{data.assetName}</h2>
              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: data.status === "Active" ? "#dcfce7" : "#f1f5f9", color: data.status === "Active" ? "#166534" : "#475569" }}>
                {data.status || "Unknown"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13.5px" }}>ID: {data.assetUniqueId} | Dept: {data.departmentName || "N/A"}</p>
          </div>
        </div>
        <div>
          <Btn outline color="#10b981" bg="#fff" onClick={refresh}>Refresh Data</Btn>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto" }}>
        {[
          { id: "overview", label: "Overview" },
          { id: "inspections", label: `Inspections (${data.inspections?.length || 0})` },
          { id: "fuel", label: `Fuel Logs (${data.fuelLogs?.length || 0})` },
          { id: "maintenance", label: `Maintenance (${data.maintenance?.length || 0})` },
          { id: "assignments", label: `Checklists & Logs (${data.assignments?.length || 0})` }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "16px 20px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "3px solid #10b981" : "3px solid transparent", color: activeTab === tab.id ? "#10b981" : "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "400px" }}>
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 20px 0" }}>Asset Details</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>Make/Model:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.make || "—"} / {data.metadata?.model || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>License Plate:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.license_plate || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>VIN Number:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px", fontFamily: "monospace" }}>{data.metadata?.vin || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>Year:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.year || "—"}</span>
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 20px 0" }}>Cost Overview</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#166534", textTransform: "uppercase", marginBottom: "4px" }}>Total Fuel Cost</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#14532d" }}>${data.stats?.totalFuelCost?.toFixed(2) || "0.00"}</div>
                </div>
                <div style={{ background: "#fef2f2", padding: "16px", borderRadius: "10px", border: "1px solid #fecaca" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b", textTransform: "uppercase", marginBottom: "4px" }}>Total Maintenance</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#7f1d1d" }}>${data.stats?.totalMaintenanceCost?.toFixed(2) || "0.00"}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", gridColumn: "span 2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>Open Maintenance Issues</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{data.stats?.openIssues || 0}</div>
                  </div>
                  {data.stats?.openIssues > 0 && (
                    <button onClick={() => setActiveTab("maintenance")} style={{ background: "#0f172a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>View Issues</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "inspections" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Inspection History</h3>
            {!data.inspections?.length ? <p style={{ color: "#64748b" }}>No inspections recorded.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Date", "Status", "Inspector", "Notes"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.inspections.map(i => (
                      <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{new Date(i.inspectionDate || i.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: i.status === "passed" ? "#dcfce7" : i.status === "failed" ? "#fee2e2" : "#f1f5f9", color: i.status === "passed" ? "#16a34a" : i.status === "failed" ? "#dc2626" : "#475569" }}>{i.status}</span></td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{i.inspectedByName || "Unknown"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "fuel" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Fuel Logs</h3>
            {!data.fuelLogs?.length ? <p style={{ color: "#64748b" }}>No fuel logs recorded.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Date", "Amount", "Cost", "Odometer", "Logged By"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.fuelLogs.map(l => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{new Date(l.logDate || l.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{l.fuelAmount} {l.fuelType && `(${l.fuelType})`}</td>
                        <td style={{ padding: "12px 16px", color: "#16a34a", fontWeight: 600 }}>${l.cost}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{l.odometer || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.addedByName || "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "maintenance" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Maintenance Work Orders</h3>
            {!data.maintenance?.length ? <p style={{ color: "#64748b" }}>No maintenance records found.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.maintenance.map(m => (
                  <div key={m.id} style={{ background: "#fff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>{m.issueTitle}</span>
                        <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: m.status === "completed" || m.status === "closed" ? "#dcfce7" : m.status === "in_progress" ? "#fef9c3" : "#f1f5f9", color: m.status === "completed" || m.status === "closed" ? "#166534" : m.status === "in_progress" ? "#854d0e" : "#475569" }}>{m.status.replace("_", " ")}</span>
                        <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", border: "1px solid #e2e8f0", color: "#64748b" }}>Pri: {m.priority}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>
                        Scheduled: {m.scheduledDate ? new Date(m.scheduledDate).toLocaleDateString() : "Not set"} | Assigned To: {m.assignedToName || "Unassigned"} | Cost: ${m.cost || "0.00"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "assignments" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Associated Checklists & Logsheets</h3>
            <p style={{ fontSize: "13.5px", color: "#64748b", marginBottom: "20px" }}>Templates explicitly bound to this asset that have been assigned to technicians.</p>
            {!data.assignments?.length ? <p style={{ color: "#64748b" }}>No templates currently assigned.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Type", "Template Name", "Assigned To", "Assigned On"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.assignments.map(a => (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: a.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: a.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>{a.templateType}</span></td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{a.templateName || "Unknown"}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{a.assignedToName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Fleet Inspection Modal ──────────────────────────────────────── */
function FleetInspectionModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", inspection_date: new Date().toISOString().slice(0, 10), status: "pass", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id) return setError("Vehicle is required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetInspection(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Record Inspection</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <FInput label="Inspection Date" type="date" value={form.inspection_date} onChange={(e) => setForm({ ...form, inspection_date: e.target.value })} />
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="needs_attention">Needs Attention</option>
            </select>
          </div>
          <FInput label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Fleet Fuel Modal ────────────────────────────────────────────── */
function FleetFuelModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", log_date: new Date().toISOString().slice(0, 10), litres: "", total_cost: "", odometer_reading: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id || !form.litres) return setError("Vehicle and Litres are required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetFuelLog(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Add Fuel Log</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FInput label="Date" type="date" value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} />
            <FInput label="Odometer" type="number" value={form.odometer_reading} onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })} />
            <FInput label="Litres *" type="number" step="0.01" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} />
            <FInput label="Total Cost ($)" type="number" step="0.01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} />
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Fleet Maintenance Modal ─────────────────────────────────────── */
function FleetMaintModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", scheduled_date: new Date().toISOString().slice(0, 10), service_type: "Routine Check", description: "", cost: "", status: "in_progress" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id || !form.service_type) return setError("Vehicle and Service Type are required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetMaintenance(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Schedule Maintenance</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FInput label="Scheduled Date" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
            <FInput label="Service Type *" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
            <FInput label="Est. Cost ($)" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="form-select" style={{ width: "100%" }}>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <FInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Portal ────────────────────────────────────────────────── */
export default function CompanyEmployeePortal() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("cp_token");
  const currentUser = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("cp_user") || "null"); } catch { return null; }
  }, []);

  const [nav, setNav] = useState(() => sessionStorage.getItem("cp_nav") || "dashboard");
  const [dashboard, setDashboard] = useState(null);

  // ── Alert sound / toast / bell notification state ───────────────
  const [warnOpenCount, setWarnOpenCount] = useState(0);
  const [bellOpen,      setBellOpen]      = useState(false);
  const [bellRinging,   setBellRinging]   = useState(false);
  const [recentAlerts,  setRecentAlerts]  = useState([]);
  const [toasts,        setToasts]        = useState([]);
  const prevWarnCount   = useRef(0);
  const toastId         = useRef(0);
  const prevWOCount     = useRef(null);   // null = not yet initialised (suppress first-load sound)
  const prevAssignCount = useRef(null);   // null = not yet initialised

  // Modular alert sound hook — single shared AudioContext, throttled, localStorage preference
  const {
    play: playAlertSound,
    preview: previewAlertSound,
    enabled: soundEnabled,
    toggle: toggleSound,
    volume: alarmVolume,
    updateVolume: updateAlarmVolume,
    severityConfig: alarmSevConfig,
    updateSeverityConfig: updateAlarmSevConfig,
  } = useAlertSound();

  const [alarmSettingsOpen, setAlarmSettingsOpen] = useState(false);

  /** Trigger bell ring animation (auto-clears after 650 ms). */
  const ringBell = useCallback(() => {
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 650);
  }, []);

  const pushToast = useCallback((text, severity = "high") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, severity }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // Persist active tab so page refresh returns to the same section
  useEffect(() => { sessionStorage.setItem("cp_nav", nav); }, [nav]);
  const [chartStats, setChartStats] = useState(null);
  const [chartFilter, setChartFilter] = useState("month"); // day|week|month|year
  const [chartCustomStart, setChartCustomStart] = useState("");
  const [chartCustomEnd, setChartCustomEnd] = useState("");
  const [chartError, setChartError] = useState(null);
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentEntriesLoading, setRecentEntriesLoading] = useState(false);
  const [recentChecklists, setRecentChecklists] = useState([]);
  const [recentChecklistsLoading, setRecentChecklistsLoading] = useState(false);
  const [dashboardRecentTab, setDashboardRecentTab] = useState("logsheets");
  const [logsheetShowAll, setLogsheetShowAll] = useState(false);
  const [checklistShowAll, setChecklistShowAll] = useState(false);
  // Dashboard quick-view: latest alerts + work orders (admin only)
  const [dashboardAlerts, setDashboardAlerts]           = useState([]);
  const [dashboardAlertsLoading, setDashboardAlertsLoading] = useState(false);
  const [dashboardWorkOrders, setDashboardWorkOrders]   = useState([]);
  const [dashboardWOLoading, setDashboardWOLoading]     = useState(false);
  const [dashboardWOUsers, setDashboardWOUsers]         = useState([]);
  const [dashWOAssign, setDashWOAssign]                 = useState(null);
  const [dashWOAssignUser, setDashWOAssignUser]         = useState("");
  const [dashWOAssignNote, setDashWOAssignNote]         = useState("");
  const [dashWOAssignSaving, setDashWOAssignSaving]     = useState(false);
  const [dashWOAssignErr, setDashWOAssignErr]           = useState(null);
  const [departments, setDepartments] = useState([]);
  const [assets, setAssets] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [activeShifts, setActiveShifts] = useState([]);
  const [shiftSearch, setShiftSearch] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [expandedShiftId, setExpandedShiftId] = useState(null);
  const [shiftEmployees, setShiftEmployees] = useState({});
  const [shiftEmpError, setShiftEmpError] = useState({});
  const [addEmpInput, setAddEmpInput] = useState({});
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name: "", startTime: "", endTime: "", description: "", status: "active" });
  const [shiftFormError, setShiftFormError] = useState(null);
  const [directFillLogsheet, setDirectFillLogsheet] = useState(null);
  const [logsheetTemplatesList, setLogsheetTemplatesList] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardTarget, setForwardTarget] = useState(null); // an assignment object to forward
  const [empView, setEmpView] = useState("hierarchy"); // "hierarchy" | "list"
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [empSearch, setEmpSearch] = useState("");
  const [empRoleFilter, setEmpRoleFilter] = useState("");
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [deptSearch, setDeptSearch] = useState("");
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [editChecklist, setEditChecklist] = useState(null);
  const [checklistSubNav, setChecklistSubNav] = useState("templates");
  const [logsheetSubNav, setLogsheetSubNav] = useState("templates");
  const [assetSubNav, setAssetSubNav] = useState("dashboard");
  // OJT State
  const [ojtTrainings, setOjtTrainings] = useState([]);
  const [ojtSubNav, setOjtSubNav] = useState("trainings");
  const [showOjtModal, setShowOjtModal] = useState(false);
  const [editOjt, setEditOjt] = useState(null);
  const [viewingOjtTraining, setViewingOjtTraining] = useState(null);
  const [showOjtBuilder, setShowOjtBuilder] = useState(false);
  const [buildingOjtTrainingId, setBuildingOjtTrainingId] = useState(null);
  const [ojtPreviewTraining, setOjtPreviewTraining] = useState(null);
  const [ojtQrTraining, setOjtQrTraining] = useState(null);
  const [ojtQrDataUrl, setOjtQrDataUrl] = useState("");
  const [assetQrModal, setAssetQrModal] = useState(null);
  const [assetQrDataUrl, setAssetQrDataUrl] = useState("");
  // Fleet State
  const [fleetAssets, setFleetAssets] = useState([]);
  const [fleetInspections, setFleetInspections] = useState([]);
  const [fleetFuelLogs, setFleetFuelLogs] = useState([]);
  const [fleetMaintenance, setFleetMaintenance] = useState([]);
  const [fleetSubNav, setFleetSubNav] = useState("assets");
  const [fleetDetailTab, setFleetDetailTab] = useState("fuel");
  const [fleetHistory, setFleetHistory] = useState([]);
  const [fleetSubmissionDetail, setFleetSubmissionDetail] = useState(null);
  const [fleetSubmissionDetailLoading, setFleetSubmissionDetailLoading] = useState(false);
  const [assignFleetLogsheet, setAssignFleetLogsheet] = useState(null);
  const [assignFleetChecklist, setAssignFleetChecklist] = useState(null);
  const [showFleetAssetModal, setShowFleetAssetModal] = useState(false);
  const [editFleetAsset, setEditFleetAsset] = useState(null);
  const [viewingFleetAsset, setViewingFleetAsset] = useState(null);
  const [showFleetInspectionModal, setShowFleetInspectionModal] = useState(false);
  const [editFleetInspection, setEditFleetInspection] = useState(null);
  const [showFleetFuelModal, setShowFleetFuelModal] = useState(false);
  const [editFleetFuel, setEditFleetFuel] = useState(null);
  const [showFleetMaintModal, setShowFleetMaintModal] = useState(false);
  const [editFleetMaint, setEditFleetMaint] = useState(null);

  useEffect(() => {
    if (!token || !currentUser) {
      navigate("/company");
    }
  }, [token, currentUser, navigate]);

  const load = useCallback(async (key, fn) => {
    setLoading((p) => ({ ...p, [key]: true }));
    setErrors((p) => ({ ...p, [key]: null }));
    try {
      const data = await fn();
      return data;
    } catch (err) {
      setErrors((p) => ({ ...p, [key]: err.message }));
      return null;
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load("dashboard", () => getCompanyPortalDashboard(token)).then((d) => d && setDashboard(d));
    setRecentEntriesLoading(true);
    getCompanyPortalRecentLogsheetEntries(token)
      .then((d) => d && setRecentEntries(d))
      .catch(() => {})
      .finally(() => setRecentEntriesLoading(false));
    setRecentChecklistsLoading(true);
    getCompanyPortalRecentChecklistSubmissions(token)
      .then((d) => d && setRecentChecklists(d))
      .catch(() => {})
      .finally(() => setRecentChecklistsLoading(false));
    // Preload role-specific data on login so dashboard is immediately useful
    if (currentUser?.role === "admin") {
      // Admin: preload departments and assets so they persist across refreshes
      getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
      getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
      getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
      getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      getShifts(token).then((d) => d && setShifts(d)).catch(() => {});
      getActiveShifts(token).then((d) => d && setActiveShifts(d)).catch(() => {});
      // Dashboard quick-view: latest open alerts + open work orders
      setDashboardAlertsLoading(true);
      getCompanyPortalAdminFlags(token, "status=open&limit=5")
        .then((d) => d && setDashboardAlerts(d.data ?? []))
        .catch(() => {})
        .finally(() => setDashboardAlertsLoading(false));
      setDashboardWOLoading(true);
      Promise.all([
        getCompanyPortalWorkOrders(token, "status=open&limit=5"),
        getCompanyPortalWOUsers(token),
      ])
        .then(([woRes, usersRes]) => {
          setDashboardWorkOrders(woRes?.data ?? []);
          setDashboardWOUsers(usersRes ?? []);
        })
        .catch(() => {})
        .finally(() => setDashboardWOLoading(false));
    } else if (currentUser?.role === "supervisor") {
      getMyTemplateAssignments(token).then((d) => d && setMyAssignments(d)).catch(() => {});
      getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
      getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
      getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    } else {
      // Employee: preload assigned tasks for dashboard stat card
      getMyTemplateAssignments(token).then((d) => d && setMyAssignments(d)).catch(() => {});
    }
  }, [token, load]);

  useEffect(() => {
    if (!token || currentUser?.role !== "admin") return;
    setChartStats(null);
    setChartError(null);
    const params = chartCustomStart && chartCustomEnd
      ? { period: "custom", startDate: chartCustomStart, endDate: chartCustomEnd }
      : { period: chartFilter };
    getCompanyPortalChartStats(token, params)
      .then((d) => { if (d) { setChartStats(d); setChartError(null); } })
      .catch((e) => { setChartError(e?.message || "Failed to load chart data"); setChartStats(null); });
  }, [token, chartFilter, chartCustomStart, chartCustomEnd]);

  // Re-fetch dashboard data whenever the user navigates back to the dashboard tab
  // (ensures newly submitted logsheets/checklists appear without a full page reload)
  useEffect(() => {
    if (!token || nav !== "dashboard") return;
    load("dashboard", () => getCompanyPortalDashboard(token)).then((d) => d && setDashboard(d));
    setRecentEntriesLoading(true);
    getCompanyPortalRecentLogsheetEntries(token)
      .then((d) => d && setRecentEntries(d))
      .catch(() => {})
      .finally(() => setRecentEntriesLoading(false));
    setRecentChecklistsLoading(true);
    getCompanyPortalRecentChecklistSubmissions(token)
      .then((d) => d && setRecentChecklists(d))
      .catch(() => {})
      .finally(() => setRecentChecklistsLoading(false));
    // Refresh dashboard quick-view (admin only)
    if (currentUser?.role === "admin") {
      setDashboardAlertsLoading(true);
      getCompanyPortalAdminFlags(token, "status=open&limit=5")
        .then((d) => d && setDashboardAlerts(d.data ?? []))
        .catch(() => {})
        .finally(() => setDashboardAlertsLoading(false));
      setDashboardWOLoading(true);
      Promise.all([
        getCompanyPortalWorkOrders(token, "status=open&limit=5"),
        getCompanyPortalWOUsers(token),
      ])
        .then(([woRes, usersRes]) => {
          setDashboardWorkOrders(woRes?.data ?? []);
          setDashboardWOUsers(usersRes ?? []);
        })
        .catch(() => {})
        .finally(() => setDashboardWOLoading(false));
    }
  }, [nav, token]);

  // ── Poll for new flags / work orders / assignments every 15 s ───────────
  useEffect(() => {
    if (!token || (currentUser?.role !== "admin" && currentUser?.role !== "supervisor")) return;
    const isAdmin = currentUser?.role === "admin";

    const poll = async () => {
      // 1. Flags (admin + supervisor)
      try {
        const res = await getCompanyPortalAdminFlags(token, "status=open&limit=5");
        if (!res) return;
        const newCount = res.total ?? 0;
        const prev     = prevWarnCount.current;
        prevWarnCount.current = newCount;
        setWarnOpenCount(newCount);
        if (res.data?.length) setRecentAlerts(res.data.slice(0, 5));
        setDashboardAlerts(res.data ?? []);
        if (newCount > prev) {
          const diff   = newCount - prev;
          const newest = res.data?.[0];
          const sev    = newest?.severity || "high";
          const msg    = newest
            ? `${diff} new alert${diff > 1 ? "s" : ""}: ${sev.toUpperCase()} – ${newest.assetName || "unknown asset"}`
            : `${diff} new alert${diff > 1 ? "s" : ""} raised`;
          pushToast(msg, sev);
          playAlertSound(sev);
          ringBell();
        }
      } catch (_) { /* silent */ }

      // 2. Work orders (admin only)
      if (isAdmin) {
        try {
          const woRes = await getCompanyPortalWorkOrders(token, "status=open&limit=5");
          const newWOCount = woRes?.total ?? woRes?.data?.length ?? 0;
          if (prevWOCount.current !== null && newWOCount > prevWOCount.current) {
            const diff = newWOCount - prevWOCount.current;
            pushToast(`${diff} new work order${diff > 1 ? "s" : ""} opened`, "medium");
            playAlertSound("medium");
          }
          prevWOCount.current = newWOCount;
          setDashboardWorkOrders(woRes?.data ?? []);
        } catch (_) { /* silent */ }
      }
    };

    // Initial sync — seed counts without playing sound
    Promise.all([
      getCompanyPortalAdminFlags(token, "status=open&limit=5"),
      isAdmin ? getCompanyPortalWorkOrders(token, "status=open&limit=5") : Promise.resolve(null),
    ]).then(([flagRes, woRes]) => {
      if (flagRes) {
        prevWarnCount.current = flagRes.total ?? 0;
        setWarnOpenCount(flagRes.total ?? 0);
        if (flagRes.data?.length) setRecentAlerts(flagRes.data.slice(0, 5));
        setDashboardAlerts(flagRes.data ?? []);
      }
      if (woRes) {
        prevWOCount.current = woRes?.total ?? woRes?.data?.length ?? 0;
        setDashboardWorkOrders(woRes?.data ?? []);
      }
    }).catch(() => {});

    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [token, currentUser?.role, pushToast, playAlertSound, ringBell]);

  // ── Poll for new checklist/logsheet assignments every 15 s (all roles) ──
  useEffect(() => {
    if (!token) return;
    const pollAssignments = async () => {
      try {
        const data = await getMyTemplateAssignments(token);
        const newCount = Array.isArray(data) ? data.length : 0;
        if (prevAssignCount.current !== null && newCount > prevAssignCount.current) {
          const diff = newCount - prevAssignCount.current;
          pushToast(`${diff} new assignment${diff > 1 ? "s" : ""} received`, "low");
          playAlertSound("low");
        }
        prevAssignCount.current = newCount;
        setMyAssignments(data ?? []);
      } catch (_) { /* silent */ }
    };

    // Seed count on mount
    getMyTemplateAssignments(token).then((data) => {
      prevAssignCount.current = Array.isArray(data) ? data.length : 0;
      setMyAssignments(data ?? []);
    }).catch(() => {});

    const id = setInterval(pollAssignments, 15000);
    return () => clearInterval(id);
  }, [token, pushToast, playAlertSound]);

  useEffect(() => {
    if (!token || nav === "dashboard") return;
    if (nav === "departments") load("departments", () => getCompanyPortalDepartments(token)).then((d) => d && setDepartments(d));
    if (nav === "assets") {
      load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
      if (!departments.length) getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
    }
    if (nav === "checklists") {
      load("checklists", () => getCompanyPortalChecklists(token)).then((d) => d && setChecklists(d));
      if (!assets.length) getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    }
    if (nav === "employees") {
      load("employees", () => getCompanyPortalEmployees(token)).then((d) => d && setEmployees(d));
      if (currentUser?.role === "admin" || currentUser?.role === "supervisor") {
        getCompanyPortalSupervisors(token).then((d) => d && setSupervisors(d)).catch(() => {});
        getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
        getCompanyPortalChecklists(token).then((d) => d && setChecklists(d)).catch(() => {});
        getCompanyPortalLogsheetTemplates(token).then((d) => d && setLogsheetTemplatesList(d)).catch(() => {});
      }
    }
    if (nav === "mytasks") {
      load("mytasks", () => getMyTemplateAssignments(token)).then((d) => d && setMyAssignments(d));
      // Supervisors also see what they've assigned to their team
      if (currentUser?.role === "supervisor") {
        getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      }
    }
    if (nav === "logsheets" && !assets.length) load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
    if (nav === "ojt") {
      load("ojt", () => getOjtTrainings(token)).then((d) => d && setOjtTrainings(d));
      if (!assets.length) getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    }
    if (nav === "fleet") {
      if (!assets.length) load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
      load("fleet_history", () => getFleetSubmissions(token)).then((d) => d && setFleetHistory(d));
      if (!checklists.length) getCompanyPortalChecklists(token).then((d) => d && setChecklists(d)).catch(() => {});
      if (!logsheetTemplatesList.length) getCompanyPortalLogsheetTemplates(token).then((d) => d && setLogsheetTemplatesList(d)).catch(() => {});
      if (!employees.length) getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
    }
  }, [nav, token, load, assets.length]);

  const handleLogout = () => {
    sessionStorage.removeItem("cp_token");
    sessionStorage.removeItem("cp_user");
    navigate("/company");
  };

  // Employee filtered
  const filteredEmployees = useMemo(() =>
    employees.filter((e) => {
      const term = empSearch.toLowerCase();
      const matchSearch = !term || (e.fullName || "").toLowerCase().includes(term) || (e.email || "").toLowerCase().includes(term) || (e.designation || "").toLowerCase().includes(term);
      const matchRole = !empRoleFilter || e.role === empRoleFilter;
      return matchSearch && matchRole;
    }),
    [employees, empSearch, empRoleFilter]
  );

  // Asset filtered
  const filteredAssets = useMemo(() =>
    assets.filter((a) => {
      const term = assetSearch.toLowerCase();
      const matchSearch = !term || (a.assetName || "").toLowerCase().includes(term);
      const matchType = !assetTypeFilter || a.assetType === assetTypeFilter;
      return matchSearch && matchType;
    }),
    [assets, assetSearch, assetTypeFilter]
  );

  // Dept filtered
  const filteredDepts = useMemo(() =>
    departments.filter((d) => !deptSearch || (d.departmentName || "").toLowerCase().includes(deptSearch.toLowerCase())),
    [departments, deptSearch]
  );

  const handleDeptSaved = (saved, isEdit) => {
    const norm = { ...saved, departmentName: saved.departmentName || saved.name };
    if (isEdit) setDepartments(p => p.map(d => d.id === norm.id ? norm : d));
    else setDepartments(p => [norm, ...p]);
    setShowDeptModal(false); setEditDept(null);
  };
  const handleDeleteDept = async (id) => {
    if (!window.confirm("Delete this department?")) return;
    try { await deleteCompanyPortalDepartment(token, id); setDepartments(p => p.filter(d => d.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };
  const handleAssetSaved = (saved, isEdit) => {
    const dept = departments.find(d => String(d.id) === String(saved.departmentId));
    const norm = { ...saved, departmentName: dept?.departmentName || saved.departmentName || "—" };
    if (isEdit) setAssets(p => p.map(a => a.id === norm.id ? norm : a));
    else setAssets(p => [norm, ...p]);
    setShowAssetModal(false); setEditAsset(null);
  };
  const handleDeleteAsset = async (id) => {
    if (!window.confirm("Delete this asset?")) return;
    try { await deleteCompanyPortalAsset(token, id); setAssets(p => p.filter(a => a.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };

  const handleDownloadAssetQR = async (assetId, assetName) => {
    try {
      const url = `${window.location.origin}/asset-scan/${assetId}`;
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, url, { width: 400, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
      const link = document.createElement("a");
      link.download = `QR-${assetName.replace(/[^a-zA-Z0-9]/g, "_")}-${assetId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("QR generation failed: " + err.message);
    }
  };

  const getQrBaseUrl = () => {
    try {
      const u = new URL(import.meta.env.VITE_API_URL || "");
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        return `${u.protocol}//${u.hostname}:5173`;
      }
    } catch {}
    return window.location.origin;
  };

  const handleShowAssetQR = async (assetId, assetName) => {
    try {
      const url = `${getQrBaseUrl()}/asset-scan/${assetId}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setAssetQrDataUrl(dataUrl);
      setAssetQrModal({ assetId, assetName, url });
    } catch (err) {
      alert("QR generation failed: " + err.message);
    }
  };

  const handleChecklistSaved = (saved, isEdit) => {
    if (isEdit) setChecklists(p => p.map(c => c.id === saved.id ? saved : c));
    else setChecklists(p => [saved, ...p]);
    setShowChecklistModal(false); setEditChecklist(null);
  };
  const handleDeleteChecklist = async (id) => {
    if (!window.confirm("Delete this checklist template?")) return;
    try { await deleteCompanyPortalChecklist(token, id); setChecklists(p => p.filter(c => c.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };

  const handleEmpSaved = (saved, isEdit) => {
    if (isEdit) {
      setEmployees((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      // Update supervisors list if role changed
      setSupervisors((prev) => {
        if (saved.role === "supervisor") {
          const exists = prev.find(s => s.id === saved.id);
          if (exists) return prev.map(s => s.id === saved.id ? { ...s, ...saved } : s);
          return [...prev, saved];
        }
        return prev.filter(s => s.id !== saved.id);
      });
    } else {
      setEmployees((prev) => [saved, ...prev]);
      if (saved.role === "supervisor") setSupervisors((prev) => [saved, ...prev]);
    }
    setShowEmpModal(false);
    setEditEmp(null);
  };

  const handleAssigned = (newAssignment) => {
    setAssignments((prev) => [...prev.filter((a) => a.id !== newAssignment.id), newAssignment]);
  };

  const handleAssignmentRemoved = (id) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDeleteEmp = async (id) => {
    if (!window.confirm("Delete this employee?")) return;
    try {
      await deleteCompanyPortalEmployee(token, id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(err.message || "Delete failed");
    }
  };

  const initials = (name = "") => name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";

  if (!token || !currentUser) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      {/* Sidebar */}
      <aside style={{ width: "240px", background: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 10 }}>
        {/* Brand */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={logo} alt="Logo" style={{ maxWidth: "150px", height: "40px", objectFit: "contain" }} />
        </div>

        {/* Company name */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
            {currentUser.role === "supervisor" ? "Supervisor Portal" : "Company Portal"}
          </p>
          <p style={{ fontSize: "13.5px", fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{currentUser.companyName || "Company"}</p>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto" }}>
          {getNav(currentUser.role).map((item) => (
            <button key={item.key} onClick={() => setNav(item.key)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: "none", cursor: "pointer", background: nav === item.key ? "#eff6ff" : "transparent", color: nav === item.key ? "#2563eb" : "#475569", fontWeight: nav === item.key ? 700 : 500, fontSize: "14px", textAlign: "left", marginBottom: "2px", transition: "background 0.15s" }}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
              {initials(currentUser.fullName)}
            </div>
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.fullName}</p>
              <Badge val={currentUser.role} />
            </div>
          </div>
          {/* Bell button — admin & supervisor only */}
          {(currentUser?.role === "admin" || currentUser?.role === "supervisor") && (
            <div style={{ position: "relative", marginBottom: "8px" }}>
              <button
                onClick={() => setBellOpen((v) => !v)}
                style={{ width: "100%", padding: "8px", borderRadius: "7px", background: bellOpen ? "#eff6ff" : "#f8fafc", color: warnOpenCount > 0 ? "#ea580c" : "#475569", border: "1px solid #e2e8f0", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", position: "relative" }}
              >
                <span className={bellRinging ? "fm-bell-ringing" : ""} style={{ display: "inline-flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </span>
                Alerts
                {warnOpenCount > 0 && (
                  <span style={{ background: "#dc2626", color: "#fff", borderRadius: "50%", fontSize: "9px", fontWeight: 800, width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: "2px" }}>
                    {warnOpenCount > 99 ? "99+" : warnOpenCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 -10px 30px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden", minWidth: "220px" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a" }}>⚠️ Active Warnings</span>
                    <button onClick={() => { setBellOpen(false); setNav("warnings"); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>View all →</button>
                  </div>
                  {recentAlerts.length === 0 && (
                    <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>No open warnings</div>
                  )}
                  {recentAlerts.map((a) => {
                    const sevColor = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a" }[a.severity] || "#475569";
                    const sevBg    = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4"  }[a.severity] || "#f8fafc";
                    return (
                      <div key={a.id} style={{ padding: "9px 14px", borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                        onClick={() => { setBellOpen(false); setNav("warnings"); }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ background: sevBg, color: sevColor, fontSize: "9px", fontWeight: 800, padding: "2px 6px", borderRadius: "8px", textTransform: "uppercase" }}>{a.severity}</span>
                          <span style={{ fontWeight: 600, fontSize: "11px", color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName || "Unknown asset"}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "No description"}</div>
                      </div>
                    );
                  })}
                  {/* Sound toggle + settings footer */}
                  <div style={{ borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>Alert sounds</span>
                      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                        <button
                          className={`fm-alarm-gear${alarmSettingsOpen ? " fm-open" : ""}`}
                          onClick={() => setAlarmSettingsOpen((v) => !v)}
                          title="Alarm settings"
                        >⚙</button>
                        <button className={`fm-sound-toggle ${soundEnabled ? "fm-enabled" : "fm-muted"}`} onClick={toggleSound}>
                          {soundEnabled ? "🔊 On" : "🔇 Off"}
                        </button>
                      </div>
                    </div>
                    {alarmSettingsOpen && (
                      <div className="fm-alarm-settings">
                        <h4>Alarm Settings</h4>
                        {/* Volume */}
                        <div className="fm-alarm-vol-row">
                          <span>Volume</span>
                          <strong>{Math.round(alarmVolume * 100)}%</strong>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.05"
                          value={alarmVolume}
                          onChange={(e) => updateAlarmVolume(parseFloat(e.target.value))}
                          className="fm-vol-slider"
                        />
                        {/* Per-severity toggles */}
                        <div className="fm-sev-section-label">Sound per severity</div>
                        {[
                          { key: "critical", label: "Critical", color: "#dc2626", bg: "#fee2e2" },
                          { key: "high",     label: "High",     color: "#ea580c", bg: "#fff7ed" },
                          { key: "medium",   label: "Medium",   color: "#d97706", bg: "#fefce8" },
                          { key: "low",      label: "Low",      color: "#16a34a", bg: "#f0fdf4" },
                          { key: "info",     label: "Info",     color: "#2563eb", bg: "#eff6ff" },
                        ].map(({ key, label, color, bg }) => {
                          const isOn = alarmSevConfig[key] !== false;
                          return (
                            <div key={key} className="fm-sev-row">
                              <span className="fm-sev-badge" style={{ background: bg, color }}>{label}</span>
                              <div className="fm-sev-actions">
                                <button className="fm-preview-btn" title={`Preview ${label} sound`} onClick={() => previewAlertSound(key)}>▶ Test</button>
                                <button className={`fm-sev-toggle ${isOn ? "on" : "off"}`} onClick={() => updateAlarmSevConfig(key, !isOn)}>
                                  {isOn ? "ON" : "OFF"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={handleLogout}
            style={{ width: "100%", padding: "8px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: "240px", flex: 1, padding: "28px 32px", minHeight: "100vh" }}>

        {/* ── Dashboard ──────────────────────────────────────────── */}
        {nav === "dashboard" && (() => {
          const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", yearly: "Yearly" };
          const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
          const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const visibleLogsheets = logsheetShowAll ? recentEntries : recentEntries.slice(0, 5);
          const visibleChecklists = checklistShowAll ? recentChecklists : recentChecklists.slice(0, 5);
          const recentTable = (
            <div style={{ marginTop: "28px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Recent Submissions</h2>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {[{ key: "logsheets", label: "Logsheets" }, { key: "checklists", label: "Checklists" }].map((tab) => (
                    <button key={tab.key} onClick={() => setDashboardRecentTab(tab.key)}
                      style={{ padding: "5px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none",
                        background: dashboardRecentTab === tab.key ? "#7c3aed" : "#f1f5f9",
                        color: dashboardRecentTab === tab.key ? "#fff" : "#64748b" }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                {dashboardRecentTab === "logsheets" ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["#","Template","Asset","Period","Frequency","Filled By","Submitted"].map((h) => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentEntriesLoading ? (
                        <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                      ) : recentEntries.length === 0 ? (
                        <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                          No logsheets filled yet.{" "}
                          <button onClick={() => setNav("logsheets")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Fill one now →</button>
                        </td></tr>
                      ) : visibleLogsheets.map((e, i) => {
                        const freq = e.frequency || "daily";
                        const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                        return (
                          <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{e.templateName}</td>
                            <td style={{ padding: "12px 16px", color: "#475569" }}>{e.assetName || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>{MONTH_NAMES[(e.month || 1) - 1]} {e.year}{e.shift ? ` · Shift ${e.shift}` : ""}</td>
                            <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{FREQ_LABELS[freq] || freq}</span></td>
                            <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{e.submittedBy || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{e.submittedAt ? new Date(e.submittedAt).toLocaleString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["#","Template","Asset","Status","Filled By","Submitted"].map((h) => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentChecklistsLoading ? (
                        <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                      ) : recentChecklists.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                          No checklists filled yet.{" "}
                          <button onClick={() => setNav("checklists")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>View Checklists →</button>
                        </td></tr>
                      ) : visibleChecklists.map((c, i) => {
                        const statusColors = { completed: ["#f0fdf4","#16a34a"], partial: ["#fffbeb","#ca8a04"], pending: ["#f1f5f9","#64748b"] };
                        const [sbg, stx] = statusColors[c.status] || ["#f1f5f9","#64748b"];
                        return (
                          <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{c.templateName}</td>
                            <td style={{ padding: "12px 16px", color: "#475569" }}>{c.assetName || "—"}</td>
                            <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: sbg, color: stx, textTransform: "capitalize" }}>{c.status || "submitted"}</span></td>
                            <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{c.submittedBy || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Load More */}
              {dashboardRecentTab === "logsheets" && !logsheetShowAll && recentEntries.length > 5 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                  <button onClick={() => setLogsheetShowAll(true)}
                    style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    Load More ({recentEntries.length - 5} more)
                  </button>
                </div>
              )}
              {dashboardRecentTab === "checklists" && !checklistShowAll && recentChecklists.length > 5 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                  <button onClick={() => setChecklistShowAll(true)}
                    style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    Load More ({recentChecklists.length - 5} more)
                  </button>
                </div>
              )}
            </div>
          );

          /* ── SUPERVISOR DASHBOARD ── */
          if (currentUser.role === "supervisor") {
            const myTeam = employees.filter((e) => String(e.supervisorId) === String(currentUser.id));
            const forwardedByMe = assignments.filter((a) => String(a.assignedBy) === String(currentUser.id));
            return (
              <div>
                <div style={{ marginBottom: "24px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                    Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                  </h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>{currentUser.companyName} — Supervisor Portal &nbsp;·&nbsp; {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
                  <StatCard label="Assigned to Me" value={myAssignments.length} sub="From admin" subCol="#2563eb" iconBg="#eff6ff" iconCol="#2563eb"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="My Team Size" value={myTeam.length} sub="Helpers under you" subCol="#7c3aed" iconBg="#f3e8ff" iconCol="#7c3aed"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
                  <StatCard label="Forwarded" value={forwardedByMe.length} sub="Tasks given to team" subCol="#16a34a" iconBg="#f0fdf4" iconCol="#16a34a"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>} />
                  <StatCard label="Recent Activity" value={recentEntries.length} sub="Filled logsheets" subCol="#ca8a04" iconBg="#fef9c3" iconCol="#ca8a04"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                </div>

                {/* Assigned to Me by Admin */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assigned to Me by Admin</h2>
                    <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>{myAssignments.length} task{myAssignments.length !== 1 ? "s" : ""}</span>
                  </div>
                  {myAssignments.length === 0 ? (
                    <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No templates assigned to you yet.</p>
                  ) : (
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.map((a) => {
                        const alreadyForwarded = assignments.filter(
                          (fw) => String(fw.assignedBy) === String(currentUser.id) &&
                            fw.templateType === a.templateType &&
                            String(fw.templateId) === String(a.templateId)
                        );
                        return (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: a.templateType === "checklist" ? "#dbeafe" : "#ede9fe", color: a.templateType === "checklist" ? "#1d4ed8" : "#7c3aed", flexShrink: 0 }}>
                              {a.templateType === "checklist" ? "Checklist" : "Logsheet"}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "2px" }}>{a.templateName || `Template #${a.templateId}`}</p>
                              {a.note && <p style={{ fontSize: "12px", color: "#64748b" }}>Note: {a.note}</p>}
                            </div>
                            {alreadyForwarded.length > 0 && (
                              <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600, flexShrink: 0 }}>
                                ✓ {alreadyForwarded.length} forwarded
                              </span>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* My Team quick view */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>My Team</h2>
                    </div>
                    <button onClick={() => setNav("employees")} style={{ fontSize: "13px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Manage Team →</button>
                  </div>
                  {myTeam.length === 0 ? (
                    <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No team members yet. Add employees and assign yourself as their supervisor.</p>
                  ) : (
                    <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {myTeam.map((m) => {
                        const taskCount = assignments.filter((a) => String(a.assignedTo) === String(m.id)).length;
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", minWidth: "200px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#7c3aed", fontSize: "14px", flexShrink: 0 }}>
                              {(m.fullName || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", marginBottom: "1px" }}>{m.fullName}</p>
                              <p style={{ fontSize: "11px", color: "#94a3b8" }}>{taskCount} task{taskCount !== 1 ? "s" : ""} assigned</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent Logsheets */}
                {recentTable}
              </div>
            );
          }

          /* ── EMPLOYEE DASHBOARD ── */
          if (currentUser.role !== "admin") {
            const myTaskCount = myAssignments.length;
            return (
              <div>
                <div style={{ marginBottom: "24px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                    Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                  </h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>{currentUser.companyName} — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
                  <StatCard label="My Tasks" value={myTaskCount} sub="Assigned to you" subCol="#2563eb" iconBg="#eff6ff" iconCol="#2563eb"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="Filled Logsheets" value={recentEntries.length} sub="Recent submissions" subCol="#16a34a" iconBg="#f0fdf4" iconCol="#16a34a"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                  <StatCard label="Checklists" value={checklists.length} sub="Available templates" subCol="#7c3aed" iconBg="#f3e8ff" iconCol="#7c3aed"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>} />
                </div>

                {/* Quick nav */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                  {getNav(currentUser.role).filter((n) => n.key !== "dashboard").map((item) => (
                    <button key={item.key + item.label} onClick={() => setNav(item.key)}
                      style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", cursor: "pointer", textAlign: "left", transition: "box-shadow 0.15s", display: "flex", alignItems: "center", gap: "14px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
                      <div style={{ width: "44px", height: "44px", background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", flexShrink: 0 }}>{item.icon}</div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "2px" }}>{item.label}</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8" }}>View &amp; manage →</p>
                      </div>
                    </button>
                  ))}
                </div>

                {recentTable}
              </div>
            );
          }

          /* ── ADMIN DASHBOARD ── */
          return (() => {
            // SVG Donut Chart helper
            const DonutChart = ({ data, size = 200, thickness = 38 }) => {
              const vals = data.map((d) => Math.max(0, d.value || 0));
              const total = vals.reduce((s, v) => s + v, 0);
              const r = (size - thickness) / 2;
              const cx = size / 2, cy = size / 2;
              const circ = 2 * Math.PI * r;
              if (total === 0) {
                return (
                  <svg width={size} height={size}>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fill="#94a3b8">No data</text>
                  </svg>
                );
              }
              let cumDash = 0;
              const slices = data.map((d, i) => {
                const v = Math.max(0, d.value || 0);
                const dash = (v / total) * circ;
                const offset = circ - cumDash;
                cumDash += dash;
                return { ...d, dash, offset, v };
              });
              return (
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
                  {slices.map((s, i) => s.v > 0 && (
                    <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                      stroke={s.color} strokeWidth={thickness}
                      strokeDasharray={`${s.dash} ${circ - s.dash}`}
                      strokeDashoffset={s.offset}
                    />
                  ))}
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                    style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px`, fontSize: "22px", fontWeight: 800 }}
                    fill="#0f172a">{total}</text>
                </svg>
              );
            };

            const PERIOD_LABELS = { day: "Today", week: "This Week", month: "This Month", year: "This Year" };
            const cs = chartStats;
            const chartData = cs ? [
              { label: "Filled Logsheets",   value: cs.filledLogsheets,   color: "#2563eb" },
              { label: "Pending Logsheets",  value: cs.pendingLogsheets,  color: "#93c5fd" },
              { label: "Filled Checklists",  value: cs.filledChecklists,  color: "#16a34a" },
              { label: "Pending Checklists", value: cs.pendingChecklists, color: "#86efac" },
            ] : [];
            const chartSubtitle = chartError
              ? `⚠ ${chartError}`
              : cs ? `${cs.dateFrom} — ${cs.dateTo}`
              : "Loading…";

            return (
              <div>
                {/* Header */}
                <div style={{ marginBottom: "24px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                    Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                  </h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>{currentUser.companyName} — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                {loading.dashboard && <p style={{ color: "#94a3b8" }}>Loading dashboard…</p>}

                {/* 3 Key stat cards */}
                {dashboard && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
                    <StatCard label="Active Assets" value={dashboard.activeAssets} sub={`${dashboard.totalAssets} total`} subCol="#22c55e"
                      iconBg="#eff6ff" iconCol="#2563eb"
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>} />
                    <StatCard label="Open Work Orders" value={dashboard.openIssues}
                      sub={dashboard.openIssues > 0 ? "Needs attention" : "All clear"}
                      subCol={dashboard.openIssues > 0 ? "#dc2626" : "#22c55e"}
                      iconBg={dashboard.openIssues > 0 ? "#fef2f2" : "#f0fdf4"}
                      iconCol={dashboard.openIssues > 0 ? "#dc2626" : "#22c55e"}
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>} />
                    <StatCard label="Total Warnings" value={dashboard.flags?.open || 0}
                      sub={`${dashboard.flags?.critical || 0} critical`}
                      subCol={(dashboard.flags?.critical || 0) > 0 ? "#dc2626" : "#64748b"}
                      iconBg={(dashboard.flags?.open || 0) > 0 ? "#fff7ed" : "#f0fdf4"}
                      iconCol={(dashboard.flags?.open || 0) > 0 ? "#ea580c" : "#22c55e"}
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
                  </div>
                )}

                {/* Submission Overview */}
                {/* ── Shift summary banner ── */}
                {shifts.length > 0 && (() => {
                  const now = new Date();
                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const activeShiftList = shifts.filter((s) => {
                    if (s.status !== "active") return false;
                    const [sh, sm] = s.startTime.split(":").map(Number);
                    const [eh, em] = s.endTime.split(":").map(Number);
                    const startMins = sh * 60 + sm;
                    const endMins = eh * 60 + em;
                    if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
                    return nowMins >= startMins || nowMins <= endMins;
                  });
                  const fmt12 = (t) => { if (!t) return ""; const [h, m] = t.split(":"); const hr = parseInt(h, 10); return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`; };
                  return (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
                      {activeShiftList.length === 0 ? (
                        <div style={{ padding: "12px 18px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "13.5px", color: "#64748b" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          No shifts are currently active — <button onClick={() => setNav("shifts")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, fontSize: "13.5px", padding: 0 }}>manage shifts</button>
                        </div>
                      ) : activeShiftList.map((s) => (
                        <div key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
                          <div>
                            <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#15803d" }}>{s.name}</span>
                            <span style={{ fontSize: "12.5px", color: "#4ade80", marginLeft: "8px" }}>{fmt12(s.startTime)} – {fmt12(s.endTime)}</span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "20px", fontWeight: 600 }}>
                            {s.employeeCount ?? 0} emp
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* ── Main 2-col grid: Submission Overview (left) | Alerts + WO (right) ── */}
                <style>{`@keyframes blink-dot{0%,100%{opacity:1}50%{opacity:0.12}} @keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.55);opacity:0.65}}`}</style>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px", alignItems: "start" }}>

                  {/* ── Left: Submission Overview ── */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    {/* Title + Period Filter */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Submission Overview</p>
                        <p style={{ fontSize: "12px", color: chartError ? "#dc2626" : "#94a3b8", margin: 0, marginTop: "2px" }}>
                          {chartSubtitle}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {["day","week","month","year"].map((p) => (
                          <button key={p} onClick={() => { setChartFilter(p); setChartCustomStart(""); setChartCustomEnd(""); }}
                            style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1px solid ${chartFilter === p && !chartCustomStart ? "#2563eb" : "#e2e8f0"}`, background: chartFilter === p && !chartCustomStart ? "#eff6ff" : "#f8fafc", color: chartFilter === p && !chartCustomStart ? "#2563eb" : "#64748b" }}>
                            {PERIOD_LABELS[p]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom date range */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px", background: "#f8fafc", borderRadius: "8px", padding: "8px 12px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <input type="date" value={chartCustomStart} onChange={(e) => setChartCustomStart(e.target.value)}
                        style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12.5px", outline: "none", minWidth: 0 }} />
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
                      <input type="date" value={chartCustomEnd} onChange={(e) => setChartCustomEnd(e.target.value)}
                        style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12.5px", outline: "none", minWidth: 0 }} />
                      {(chartCustomStart || chartCustomEnd) && (
                        <button onClick={() => { setChartCustomStart(""); setChartCustomEnd(""); }}
                          style={{ padding: "3px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", fontSize: "11.5px", fontWeight: 600, flexShrink: 0 }}>Clear</button>
                      )}
                    </div>

                    {/* Donut + Legend */}
                    <div style={{ display: "flex", alignItems: "center", gap: "24px", justifyContent: "center" }}>
                      <div style={{ flexShrink: 0 }}>
                        <DonutChart data={chartData} size={190} thickness={38} />
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
                        {chartData.map((d) => (
                          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: d.color, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: "12.5px", color: "#475569", margin: 0 }}>{d.label}</p>
                            </div>
                            <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Right column: Latest Alerts + Work Orders stacked ── */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* Latest Alerts */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Latest Alerts</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, marginTop: "2px" }}>Open warnings &amp; flags</p>
                      </div>
                      <button onClick={() => setNav("warnings")}
                        style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b" }}>
                        View All →
                      </button>
                    </div>
                    {dashboardAlertsLoading ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", padding: "8px 0" }}>Loading…</p>
                    ) : dashboardAlerts.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
                        ✅ No open alerts
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dashboardAlerts.map((f) => {
                          const sevCols = { critical: { bg: "#fee2e2", color: "#991b1b" }, high: { bg: "#ffedd5", color: "#9a3412" }, medium: { bg: "#fef9c3", color: "#854d0e" }, low: { bg: "#dcfce7", color: "#166534" } };
                          const sc = sevCols[f.severity] || { bg: "#f1f5f9", color: "#475569" };
                          const dotCfg = ({ open: { color: "#dc2626", animation: "blink-dot 1s ease-in-out infinite" }, in_progress: { color: "#f97316", animation: "pulse-dot 1.5s ease-in-out infinite" }, resolved: { color: "#16a34a", animation: "none" }, closed: { color: "#94a3b8", animation: "none" } })[f.status || "open"] || { color: "#94a3b8", animation: "none" };
                          return (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${f.status === "open" ? "#fecaca" : "#f1f5f9"}`, background: f.status === "open" ? "#fff8f8" : "#fafafa" }}>
                              <span title={f.status || "open"} style={{ flexShrink: 0, width: "9px", height: "9px", borderRadius: "50%", display: "inline-block", background: dotCfg.color, animation: dotCfg.animation }} />
                              <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700, background: sc.bg, color: sc.color, textTransform: "capitalize" }}>
                                {f.severity || "—"}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {f.assetName || "Unknown asset"}
                                </p>
                                <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {f.description || "No description"}
                                </p>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: "10.5px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                                {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Work Orders */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Work Orders</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, marginTop: "2px" }}>Open • Assign to team members</p>
                      </div>
                      <button onClick={() => setNav("workorders")}
                        style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b" }}>
                        View All →
                      </button>
                    </div>
                    {dashboardWOLoading ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", padding: "8px 0" }}>Loading…</p>
                    ) : dashboardWorkOrders.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
                        ✅ No open work orders
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dashboardWorkOrders.map((wo) => {
                          const priCols = { critical: { bg: "#fee2e2", color: "#991b1b" }, high: { bg: "#ffedd5", color: "#9a3412" }, medium: { bg: "#fef9c3", color: "#854d0e" }, low: { bg: "#dcfce7", color: "#166534" } };
                          const pc = priCols[wo.priority] || { bg: "#f1f5f9", color: "#475569" };
                          const assignedUser = dashboardWOUsers.find((u) => Number(u.id) === Number(wo.assignedTo));
                          return (
                            <div key={wo.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #f1f5f9", background: "#fafafa" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                                  <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700, background: pc.bg, color: pc.color, textTransform: "capitalize" }}>
                                    {wo.priority || "—"}
                                  </span>
                                  <p style={{ margin: 0, fontWeight: 700, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {wo.workOrderNumber || `WO-${wo.id}`}
                                  </p>
                                </div>
                                <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {wo.assetName || "No asset"}{wo.description ? ` — ${wo.description}` : ""}
                                </p>
                                {assignedUser ? (
                                  <p style={{ margin: "3px 0 0", fontSize: "10.5px", color: "#2563eb", fontWeight: 600 }}>
                                    Assigned: {assignedUser.fullName}
                                  </p>
                                ) : (
                                  <p style={{ margin: "3px 0 0", fontSize: "10.5px", color: "#f97316", fontWeight: 600 }}>Unassigned</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setDashWOAssign(wo);
                                  setDashWOAssignUser(wo.assignedTo ? String(wo.assignedTo) : "");
                                  setDashWOAssignNote("");
                                  setDashWOAssignErr(null);
                                }}
                                style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "6px", border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {wo.assignedTo ? "Re-assign" : "Assign"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  </div>{/* end right column */}
                </div>{/* end 2-col grid */}

                {/* Assign Work Order Modal */}
                {dashWOAssign && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "480px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
                      <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>Assign Work Order</h3>
                      <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>
                        {dashWOAssign.workOrderNumber || `WO-${dashWOAssign.id}`} — {dashWOAssign.assetName || "No asset"}
                      </p>
                      {dashWOAssignErr && (
                        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>
                          {dashWOAssignErr}
                        </div>
                      )}
                      <div style={{ marginBottom: "14px" }}>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
                          Assign To <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <select value={dashWOAssignUser} onChange={(e) => setDashWOAssignUser(e.target.value)}
                          style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                          <option value="">— Select employee —</option>
                          {dashboardWOUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} ({u.role}{u.designation ? ` · ${u.designation}` : ""})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Note (optional)</label>
                        <textarea value={dashWOAssignNote} onChange={(e) => setDashWOAssignNote(e.target.value)}
                          placeholder="Instructions for assignee…" rows={3}
                          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical" }} />
                      </div>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                        <button onClick={() => setDashWOAssign(null)}
                          style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                          Cancel
                        </button>
                        <button
                          disabled={dashWOAssignSaving}
                          onClick={async () => {
                            if (!dashWOAssignUser) { setDashWOAssignErr("Please select a user."); return; }
                            setDashWOAssignSaving(true);
                            setDashWOAssignErr(null);
                            try {
                              await assignCompanyPortalWorkOrder(token, dashWOAssign.id, {
                                assignedTo: Number(dashWOAssignUser),
                                assignedNote: dashWOAssignNote || undefined,
                              });
                              setDashboardWorkOrders((prev) =>
                                prev.map((w) => w.id === dashWOAssign.id ? { ...w, assignedTo: Number(dashWOAssignUser) } : w)
                              );
                              setDashWOAssign(null);
                            } catch (e) {
                              setDashWOAssignErr(e.message || "Assignment failed");
                            } finally {
                              setDashWOAssignSaving(false);
                            }
                          }}
                          style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: dashWOAssignSaving ? "not-allowed" : "pointer", opacity: dashWOAssignSaving ? 0.7 : 1 }}>
                          {dashWOAssignSaving ? "Saving…" : "Assign"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {recentTable}
              </div>
            );
          })()
        })()}

        {/* ── Departments ────────────────────────────────────────── */}
        {nav === "departments" && (() => {
          const isAdmin = currentUser.role === "admin";
          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Departments</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Operational departments within {currentUser.companyName}</p>
              </div>
              {isAdmin && (
                <Btn onClick={() => { setEditDept(null); setShowDeptModal(true); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Department
                </Btn>
              )}
            </div>
            {errors.departments && <Alert>{errors.departments}</Alert>}
            <Card>
              <CardHeader title="All Departments" subtitle={`${filteredDepts.length} departments`} action={
                <input value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} placeholder="Search…"
                  style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />
              } />
              {loading.departments
                ? <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading…</p>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        {["#", "Department Name", "Description", "Created", ...(isAdmin ? ["Actions"] : [])].map((h) => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDepts.length === 0
                        ? <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No departments found</td></tr>
                        : filteredDepts.map((d, i) => (
                          <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{d.departmentName}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.description || "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#94a3b8", fontSize: "12px" }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}</td>
                            {isAdmin && (
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button title="Edit" onClick={() => { setEditDept(d); setShowDeptModal(true); }}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button title="Delete" onClick={() => handleDeleteDept(d.id)}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
            </Card>
          </div>
          );
        })()}

        {/* ── Assets ────────────────────────────────────────────── */}
        {nav === "assets" && (() => {
          const isAdmin = currentUser.role === "admin";
          return (
          <div>
            {/* Sub-tab navigation */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[
                { k: "dashboard", label: "📊 Analytics Dashboard" },
                { k: "manage",    label: "🗂 Manage Assets" },
              ].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setAssetSubNav(k)}
                  style={{ padding: "10px 22px", background: "none", border: "none",
                    borderBottom: assetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 700,
                    color: assetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Analytics Dashboard */}
            {assetSubNav === "dashboard" && (
              <AssetDashboard
                endpointPrefix="/api/company-portal/asset-dashboard"
                token={token}
                companyId={currentUser.companyId}
                assetList={assets}
              />
            )}

            {/* Manage Assets */}
            {assetSubNav === "manage" && (<div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Assets</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>All assets registered under {currentUser.companyName}</p>
              </div>
              {isAdmin && (
                <Btn onClick={() => { setEditAsset(null); setShowAssetModal(true); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Asset
                </Btn>
              )}
            </div>
            {errors.assets && <Alert>{errors.assets}</Alert>}
            <Card>
              <CardHeader title="Asset List" subtitle={`${filteredAssets.length} assets`} action={
                <div style={{ display: "flex", gap: "8px" }}>
                  <select value={assetTypeFilter} onChange={(e) => setAssetTypeFilter(e.target.value)}
                    style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", background: "#fff", outline: "none" }}>
                    <option value="">All Types</option>
                    <option value="soft">Soft</option>
                    <option value="technical">Technical</option>
                    <option value="fleet">Fleet</option>
                  </select>
                  <input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Search…"
                    style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "160px" }} />
                </div>
              } />
              {loading.assets
                ? <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading…</p>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        {["#", "Asset Name", "ID", "Type", "Department", "Location", "Status", ...(isAdmin ? ["Actions"] : [])].map((h) => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.length === 0
                        ? <tr><td colSpan={isAdmin ? 8 : 7} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets found</td></tr>
                        : filteredAssets.map((a, i) => (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", color: "#64748b" }}>{i + 1}</td>
                            <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{a.assetName}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontFamily: "monospace", fontSize: "12px" }}>{a.assetUniqueId || "—"}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: a.assetType === "technical" ? "#eff6ff" : a.assetType === "fleet" ? "#f3e8ff" : "#f0fdf4", color: a.assetType === "technical" ? "#2563eb" : a.assetType === "fleet" ? "#7c3aed" : "#16a34a" }}>
                                {a.assetType}
                              </span>
                            </td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{a.departmentName || "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "12.5px" }}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: a.status === "Active" ? "#f0fdf4" : "#f8fafc", color: a.status === "Active" ? "#16a34a" : "#94a3b8" }}>
                                {a.status}
                              </span>
                            </td>
                            {isAdmin && (
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button title="Show QR Code" onClick={() => handleShowAssetQR(a.id, a.assetName)}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                                  </button>
                                  <button title="Edit" onClick={() => { setEditAsset(a); setShowAssetModal(true); }}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button title="Delete" onClick={() => handleDeleteAsset(a.id)}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
            </Card>
            </div>)}
          </div>
          );
        })()}

        {/* ── Checklists ────────────────────────────────────────── */}
        {nav === "checklists" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setChecklistSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: checklistSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 600,
                    color: checklistSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {checklistSubNav === "templates" && (
              <ChecklistTemplateModule
                token={token}
                companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
                shifts={shifts}
                fetchTemplates={(tok) => getCompanyPortalChecklists(tok)}
                createTemplate={createCompanyPortalChecklist}
                fetchTemplate={null}
                updateTemplate={updateCompanyPortalChecklist}
                deleteTemplate={deleteCompanyPortalChecklist}
                canBuild={currentUser.role === "admin" || currentUser.role === "supervisor"}
                companyId={currentUser.companyId}
                companyPortalMode={true}
              />
            )}
            {checklistSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="checklists" />
            )}
          </div>
        )}

        {/* ── Logsheets ─────────────────────────────────────────── */}
        {nav === "logsheets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setLogsheetSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: logsheetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 600,
                    color: logsheetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {logsheetSubNav === "templates" && (
              <LogsheetModule
                token={token}
                assets={assets.length ? assets : []}
                shifts={shifts}
                companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
                fetchTemplates={getCompanyPortalLogsheetTemplates}
                fetchTemplate={getCompanyPortalLogsheetTemplate}
                fetchEntries={getCompanyPortalLogsheetEntries}
                submitEntry={submitCompanyPortalLogsheetEntry}
                createTemplate={createCompanyPortalLogsheetTemplate}
                updateTemplate={updateCompanyPortalLogsheetTemplate}
                deleteTemplate={deleteCompanyPortalLogsheetTemplate}
                assignTemplate={assignCompanyPortalLogsheetTemplate}
                fetchGrid={getCompanyPortalLogsheetGrid}
                canBuild={currentUser.role === "admin" || currentUser.role === "supervisor"}
                companyPortalMode={true}
                directFill={directFillLogsheet}
                onDirectFillConsumed={() => setDirectFillLogsheet(null)}
              />
            )}
            {logsheetSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="logsheets" />
            )}
          </div>
        )}

        {/* ── Warnings ──────────────────────────────────────── */}
        {nav === "warnings" && (
          <WarningsPanel
            token={token}
            companyId={currentUser.companyId}
            companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
          />
        )}

        {/* ── Work Orders ───────────────────────────────────────── */}
        {nav === "workorders" && (
          <WorkOrdersPanel
            token={token}
            companyId={currentUser.companyId}
          />
        )}

        {/* ── Employees ─────────────────────────────────────────── */}
        {nav === "employees" && (() => {
          const canManage = currentUser.role === "admin" || currentUser.role === "supervisor";
          const isAdmin = currentUser.role === "admin";
          const isSupervisor = currentUser.role === "supervisor";

          const EmpRow = ({ e, showAssign }) => (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "8px", background: "#fafafa", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                {initials(e.fullName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.fullName}</p>
                <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0 }}>{e.designation || e.email}</p>
              </div>
              <Badge val={e.role} />
              <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: e.status === "Active" ? "#f0fdf4" : "#fef2f2", color: e.status === "Active" ? "#16a34a" : "#dc2626" }}>{e.status}</span>
              {canManage && (
                <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                  {showAssign && (
                    <button title="Assign Templates" onClick={() => { setAssignTarget(e); setShowAssignModal(true); }}
                      style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Assign
                    </button>
                  )}
                  <button title="Edit" onClick={() => { setEditEmp(e); setShowEmpModal(true); }}
                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {isAdmin && e.id !== currentUser.id && (
                    <button title="Delete" onClick={() => handleDeleteEmp(e.id)}
                      style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );

          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Team Management</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage staff hierarchy of {currentUser.companyName}</p>
                </div>
                {canManage && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Btn onClick={() => setShowImport(true)} outline color="#64748b" bg="#fff">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                      Import CSV
                    </Btn>
                    <Btn onClick={() => { setEditEmp(null); setShowEmpModal(true); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Employee
                    </Btn>
                  </div>
                )}
              </div>

              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "22px" }}>
                <StatCard label="Total Staff" value={employees.length} sub="All employees" iconBg="#eff6ff" iconCol="#2563eb" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
                <StatCard label="Tech Leads" value={employees.filter((e) => e.role === "technical_lead").length} iconBg="#dbeafe" iconCol="#1d4ed8" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} />
                <StatCard label="Active" value={employees.filter((e) => e.status === "Active").length} subCol="#22c55e" sub="✓ Active" iconBg="#f0fdf4" iconCol="#22c55e" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} />
                <StatCard label="Assignments" value={assignments.length} sub="Template tasks" iconBg="#fff7ed" iconCol="#ea580c" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
              </div>

              {errors.employees && <Alert>{errors.employees}</Alert>}

              {/* View switcher */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
                {[{ k: "hierarchy", label: "Team Hierarchy" }, { k: "list", label: "All Employees" }].map((v) => (
                  <button key={v.k} onClick={() => setEmpView(v.k)}
                    style={{ padding: "7px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: empView === v.k ? "#2563eb" : "#fff", color: empView === v.k ? "#fff" : "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    {v.label}
                  </button>
                ))}
              </div>

              {loading.employees
                ? <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>Loading…</p>
                : empView === "hierarchy"
                  ? (() => {
                    /* ─── 5-Level Hierarchy View ─────────────────────── */
                    const childrenOf = (parentId) =>
                      employees.filter((e) => e.supervisorId && String(e.supervisorId) === String(parentId));

                    const renderNode = (emp, depth) => {
                      const info = roleInfo(emp.role);
                      const chainInfo = HIERARCHY_CHAIN.find((h) => h.role === emp.role);
                      const children = childrenOf(emp.id);
                      const empAssignments = assignments.filter((a) => String(a.assignedTo) === String(emp.id));
                      const indent = depth * 28;
                      return (
                        <div key={emp.id} style={{ marginLeft: `${indent}px`, marginBottom: "8px" }}>
                          <div style={{
                            background: "#fff", borderRadius: "10px",
                            border: `1px solid ${chainInfo?.border || "#e2e8f0"}`,
                            borderLeft: depth > 0 ? `3px solid ${chainInfo?.color || "#94a3b8"}` : `1px solid ${chainInfo?.border || "#e2e8f0"}`,
                            overflow: "hidden",
                          }}>
                            <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", background: depth === 0 ? (chainInfo?.bg || "#f8fafc") : "#fff" }}>
                              {/* Avatar */}
                              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: chainInfo?.color || info.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
                                {initials(emp.fullName)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <p style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a", margin: 0 }}>{emp.fullName}</p>
                                  <Badge val={emp.role} />
                                  {emp.shift && (
                                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: "#ede9fe", color: "#5b21b6" }}>{emp.shift} Shift</span>
                                  )}
                                  {empAssignments.length > 0 && (
                                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: "#eff6ff", color: "#2563eb" }}>{empAssignments.length} template{empAssignments.length !== 1 ? "s" : ""}</span>
                                  )}
                                </div>
                                <p style={{ fontSize: "12px", color: "#64748b", margin: 0, marginTop: "1px" }}>
                                  {emp.designation || emp.email}
                                  {children.length > 0 && <span style={{ marginLeft: "6px", color: "#94a3b8" }}>· {children.length} direct report{children.length !== 1 ? "s" : ""}</span>}
                                </p>
                              </div>
                              {/* Actions */}
                              <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                                {isAdmin && (
                                  <button title="Assign Templates" onClick={() => { setAssignTarget(emp); setShowAssignModal(true); }}
                                    style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "11.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>
                                    Assign
                                  </button>
                                )}
                                {canManage && (
                                  <button title="Edit" onClick={() => { setEditEmp(emp); setShowEmpModal(true); }}
                                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Recurse into children */}
                          {children.length > 0 && (
                            <div style={{ marginTop: "6px" }}>
                              {children.map((child) => renderNode(child, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    // Roots: Technical Leads with no supervisor, or any hierarchy role at depth 0
                    const roots = employees.filter((e) => e.role === "technical_lead");
                    const adminRoots = employees.filter((e) => e.role === "admin");
                    const nonHierarchyStaff = employees.filter((e) => !HIERARCHY_ROLES.has(e.role) && e.role !== "admin");
                    const unassignedHierarchy = employees.filter((e) =>
                      HIERARCHY_ROLES.has(e.role) && e.role !== "technical_lead" &&
                      (!e.supervisorId || !employees.find((p) => String(p.id) === String(e.supervisorId)))
                    );

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {employees.length === 0 && (
                          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>
                            <p style={{ fontSize: "16px", marginBottom: "8px" }}>No employees yet.</p>
                            {canManage && <Btn onClick={() => setShowEmpModal(true)}>Add First Employee</Btn>}
                          </div>
                        )}

                        {/* Hierarchy legend */}
                        {employees.length > 0 && (
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", marginRight: "6px" }}>HIERARCHY:</span>
                            {HIERARCHY_CHAIN.map((h, i) => (
                              <span key={h.role} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {i > 0 && <span style={{ color: "#94a3b8", fontSize: "13px" }}>›</span>}
                                <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 600, background: h.bg, color: h.color, border: `1px solid ${h.border}` }}>{h.label}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Admin cards */}
                        {adminRoots.length > 0 && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: "8px" }}>Administrators</p>
                            {adminRoots.map((e) => renderNode(e, 0))}
                          </div>
                        )}

                        {/* Technical Lead trees */}
                        {roots.length > 0 && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: "8px" }}>Technical Lead Hierarchy</p>
                            {roots.map((root) => renderNode(root, 0))}
                          </div>
                        )}

                        {/* Unassigned hierarchy members */}
                        {unassignedHierarchy.length > 0 && (
                          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #fde68a", overflow: "hidden" }}>
                            <div style={{ padding: "10px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#92400e", margin: 0 }}>Unassigned Hierarchy Staff ({unassignedHierarchy.length})</p>
                              <p style={{ fontSize: "12px", color: "#a16207", margin: 0 }}>— Missing parent assignment</p>
                            </div>
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              {unassignedHierarchy.map((e) => renderNode(e, 0))}
                            </div>
                          </div>
                        )}

                        {/* Non-hierarchy staff */}
                        {nonHierarchyStaff.length > 0 && (
                          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#475569", margin: 0 }}>Other Staff ({nonHierarchyStaff.length})</p>
                              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>— Cleaners, drivers, security, etc.</p>
                            </div>
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                              {nonHierarchyStaff.map((e) => <EmpRow key={e.id} e={e} showAssign={false} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                  : (
                    /* ─── List View ──────────────────────────────────── */
                    <Card>
                      <CardHeader
                        title="All Employees"
                        subtitle={`${filteredEmployees.length} of ${employees.length} employees`}
                        action={
                          <div style={{ display: "flex", gap: "8px" }}>
                            <select value={empRoleFilter} onChange={(e) => setEmpRoleFilter(e.target.value)}
                              style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", background: "#fff", outline: "none" }}>
                              <option value="">All Roles</option>
                              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search name / email…"
                              style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />
                          </div>
                        }
                      />
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr>
                            {["Employee", "Supervisor", "Email", "Designation", "Role", "Status", ...(canManage ? ["Actions"] : [])].map((h) => (
                              <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEmployees.length === 0
                            ? <tr><td colSpan={canManage ? 7 : 6} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No employees found{empSearch ? ` for "${empSearch}"` : ""}</td></tr>
                            : filteredEmployees.map((e) => (
                              <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "11px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{initials(e.fullName)}</div>
                                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{e.fullName}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "13px" }}>{e.supervisorName || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                                <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "13px" }}>{e.email}</td>
                                <td style={{ padding: "11px 14px", color: "#475569", fontSize: "13px" }}>{e.designation || "—"}</td>
                                <td style={{ padding: "11px 14px" }}><Badge val={e.role} /></td>
                                <td style={{ padding: "11px 14px" }}>
                                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: e.status === "Active" ? "#f0fdf4" : "#fef2f2", color: e.status === "Active" ? "#16a34a" : "#dc2626" }}>{e.status}</span>
                                </td>
                                {canManage && (
                                  <td style={{ padding: "11px 14px" }}>
                                    <div style={{ display: "flex", gap: "5px" }}>
                                      {(isAdmin || (isSupervisor && String(e.supervisorId) === String(currentUser.id))) && (
                                        <button title="Assign Templates" onClick={() => { setAssignTarget(e); setShowAssignModal(true); }}
                                          style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                                          Assign
                                        </button>
                                      )}
                                      <button title="Edit" onClick={() => { setEditEmp(e); setShowEmpModal(true); }}
                                        style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      {isAdmin && e.id !== currentUser.id && (
                                        <button title="Delete" onClick={() => handleDeleteEmp(e.id)}
                                          style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </Card>
                  )
              }

              {/* Assignments summary moved to admin dashboard */}
            </div>
          );
        })()}

        {/* ── Shifts ────────────────────────────────────────────── */}
        {nav === "shifts" && (() => {
          const fmt12 = (t) => {
            if (!t) return "";
            const [h, m] = t.split(":");
            const hr = parseInt(h, 10);
            return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`;
          };

          const isActiveNow = (s) => {
            if (s.status !== "active") return false;
            const now = new Date();
            const [nh, nm] = [now.getHours(), now.getMinutes()];
            const nowMins = nh * 60 + nm;
            const [sh, sm] = s.startTime.split(":").map(Number);
            const [eh, em] = s.endTime.split(":").map(Number);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
            return nowMins >= startMins || nowMins <= endMins;
          };

          const loadShiftEmployees = async (sid) => {
            try {
              const data = await getShiftEmployees(token, sid);
              setShiftEmployees((p) => ({ ...p, [sid]: Array.isArray(data) ? data : [] }));
            } catch { setShiftEmpError((p) => ({ ...p, [sid]: "Failed to load employees" })); }
          };

          const handleExpandShift = (sid) => {
            if (expandedShiftId === sid) { setExpandedShiftId(null); return; }
            setExpandedShiftId(sid);
            if (!shiftEmployees[sid]) loadShiftEmployees(sid);
          };

          const handleOpenCreate = () => {
            setEditShift(null);
            setShiftForm({ name: "", startTime: "", endTime: "", description: "", status: "active" });
            setShiftFormError(null);
            setShowShiftModal(true);
          };

          const handleOpenEdit = (s) => {
            setEditShift(s);
            setShiftForm({ name: s.name, startTime: s.startTime, endTime: s.endTime, description: s.description || "", status: s.status });
            setShiftFormError(null);
            setShowShiftModal(true);
          };

          const handleSaveShift = async () => {
            const { name, startTime, endTime, status } = shiftForm;
            if (!name.trim()) return setShiftFormError("Shift name is required");
            if (!startTime) return setShiftFormError("Start time is required");
            if (!endTime) return setShiftFormError("End time is required");
            setShiftSaving(true); setShiftFormError(null);
            try {
              const payload = { name: name.trim(), startTime, endTime, description: shiftForm.description.trim() || undefined, status };
              if (editShift) {
                const updated = await updateShift(token, editShift.id, payload);
                setShifts((p) => p.map((s) => s.id === editShift.id ? updated : s));
              } else {
                const created = await createShift(token, payload);
                setShifts((p) => [created, ...p]);
              }
              setShowShiftModal(false);
            } catch (err) { setShiftFormError(err.message || "Could not save shift"); }
            finally { setShiftSaving(false); }
          };

          const handleDeleteShift = async (id) => {
            if (!window.confirm("Delete this shift? This will unlink it from all templates.")) return;
            try {
              await deleteShift(token, id);
              setShifts((p) => p.filter((s) => s.id !== id));
            } catch (err) { alert(err.message || "Delete failed"); }
          };

          const handleAssignEmployees = async (sid) => {
            const input = (addEmpInput[sid] || "").trim();
            if (!input) return;
            const ids = input.split(",").map((v) => parseInt(v.trim(), 10)).filter(Boolean);
            if (!ids.length) return;
            try {
              await assignShiftEmployees(token, sid, ids);
              setAddEmpInput((p) => ({ ...p, [sid]: "" }));
              loadShiftEmployees(sid);
            } catch (err) { alert(err.message || "Failed to assign employees"); }
          };

          const handleRemoveEmp = async (sid, uid) => {
            try {
              await removeShiftEmployee(token, sid, uid);
              setShiftEmployees((p) => ({ ...p, [sid]: (p[sid] || []).filter((e) => e.id !== uid) }));
            } catch (err) { alert(err.message || "Failed to remove"); }
          };

          const filtered = shifts.filter((s) => s.name.toLowerCase().includes(shiftSearch.toLowerCase()));

          return (
            <div>
              {/* Page header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Shift Management</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create work shifts and assign employees, checklists, and logsheets to them</p>
                </div>
                {currentUser.role === "admin" && (
                  <button onClick={handleOpenCreate}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Create Shift
                  </button>
                )}
              </div>

              {/* Search */}
              <input value={shiftSearch} onChange={(e) => setShiftSearch(e.target.value)} placeholder="Search shifts…"
                style={{ width: "280px", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", marginBottom: "20px", outline: "none" }} />

              {/* Empty state */}
              {!filtered.length && (
                <div style={{ padding: "48px", textAlign: "center", background: "#f8fafc", borderRadius: "14px", border: "2px dashed #e2e8f0" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ margin: "0 auto 12px" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <p style={{ color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>No shifts defined</p>
                  <p style={{ color: "#94a3b8", fontSize: "13px" }}>Create your first work shift to start organizing employees and templates</p>
                </div>
              )}

              {/* Shift cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {filtered.map((s) => {
                  const active = isActiveNow(s);
                  const expanded = expandedShiftId === s.id;
                  const empList = shiftEmployees[s.id] || [];
                  return (
                    <div key={s.id} style={{ background: "#fff", borderRadius: "12px", border: `1.5px solid ${active ? "#bbf7d0" : "#e2e8f0"}`, overflow: "hidden" }}>
                      {/* Card header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: active ? "#dcfce7" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#16a34a" : "#64748b"} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{s.name}</span>
                            {active && <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "20px" }}>ACTIVE NOW</span>}
                            {s.status === "inactive" && <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "20px" }}>INACTIVE</span>}
                          </div>
                          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                            {fmt12(s.startTime)} – {fmt12(s.endTime)}
                            {s.description && <span style={{ marginLeft: "10px", color: "#94a3b8" }}>· {s.description}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: "#64748b", background: "#f8fafc", padding: "4px 10px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                            {s.employeeCount ?? 0} employee{s.employeeCount !== 1 ? "s" : ""}
                          </span>
                          <button onClick={() => handleExpandShift(s.id)}
                            style={{ padding: "6px 12px", background: expanded ? "#eff6ff" : "#f8fafc", color: expanded ? "#2563eb" : "#64748b", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
                            {expanded ? "Hide" : "Employees"}
                          </button>
                          {currentUser.role === "admin" && (
                            <>
                              <button onClick={() => handleOpenEdit(s)}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => handleDeleteShift(s.id)}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded employee panel */}
                      {expanded && (
                        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 18px", background: "#f8fafc" }}>
                          {shiftEmpError[s.id] && <p style={{ color: "#dc2626", fontSize: "12.5px", marginBottom: "8px" }}>{shiftEmpError[s.id]}</p>}
                          {!empList.length && !shiftEmpError[s.id] && (
                            <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "10px" }}>No employees assigned to this shift yet.</p>
                          )}
                          {empList.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                              {empList.map((e) => (
                                <span key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "20px", padding: "4px 10px", fontSize: "12.5px", color: "#374151" }}>
                                  {e.fullName || e.username || e.email}
                                  {currentUser.role === "admin" && (
                                    <button onClick={() => handleRemoveEmp(s.id, e.id)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, display: "flex" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          {currentUser.role === "admin" && (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <select
                                multiple={false}
                                value={addEmpInput[s.id] || ""}
                                onChange={(e) => setAddEmpInput((p) => ({ ...p, [s.id]: e.target.value }))}
                                style={{ flex: 1, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px" }}>
                                <option value="">— Select employee to add —</option>
                                {employees.filter((e) => !(shiftEmployees[s.id] || []).some((ae) => ae.id === e.id)).map((e) => (
                                  <option key={e.id} value={e.id}>{e.fullName || e.username || e.email}</option>
                                ))}
                              </select>
                              <button onClick={() => handleAssignEmployees(s.id)}
                                style={{ padding: "7px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create / Edit modal */}
              {showShiftModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                  <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{editShift ? "Edit Shift" : "Create Shift"}</p>
                      <button onClick={() => setShowShiftModal(false)} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {shiftFormError && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>{shiftFormError}</div>}
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Shift Name *</label>
                        <input value={shiftForm.name} onChange={(e) => setShiftForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Morning Shift"
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Start Time *</label>
                          <input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm((p) => ({ ...p, startTime: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>End Time *</label>
                          <input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm((p) => ({ ...p, endTime: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
                        <input value={shiftForm.description} onChange={(e) => setShiftForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional notes"
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
                        <select value={shiftForm.status} onChange={(e) => setShiftForm((p) => ({ ...p, status: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px" }}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button onClick={() => setShowShiftModal(false)}
                        style={{ padding: "8px 16px", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}>Cancel</button>
                      <button onClick={handleSaveShift} disabled={shiftSaving}
                        style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer", opacity: shiftSaving ? 0.7 : 1 }}>
                        {shiftSaving ? "Saving…" : editShift ? "Save Changes" : "Create Shift"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── OJT Management ──────────────────────────────── */}
        {nav === "ojt" && (
          <div>
            {showOjtBuilder ? (
              <OjtTrainingBuilder
                token={token}
                assets={assets}
                trainingId={buildingOjtTrainingId}
                onBack={() => {
                  setShowOjtBuilder(false);
                  setBuildingOjtTrainingId(null);
                  load("ojt", () => getOjtTrainings(token).then(setOjtTrainings));
                }}
              />
            ) : (
              <>
                <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>OJT Management</h1>
                    <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create and manage On-the-Job Trainings and assess employee progress</p>
                  </div>
                  <Btn onClick={() => { setShowOjtBuilder(true); setBuildingOjtTrainingId(null); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Create Training
                  </Btn>
                </div>

                {/* Sub-navigation */}
                <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
                  {[
                    { key: "trainings", label: "Trainings" },
                    { key: "tracking", label: "Progress Tracking" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setOjtSubNav(tab.key)}
                      style={{
                        padding: "10px 4px", fontSize: "14px", fontWeight: 600, background: "none", border: "none", cursor: "pointer",
                        color: ojtSubNav === tab.key ? "#2563eb" : "#64748b",
                        borderBottom: ojtSubNav === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                        transition: "all 0.2s"
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {ojtSubNav === "trainings" && (
                  <>
                    {!viewingOjtTraining ? (
                      <Card>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                            <thead>
                              <tr>
                                {["Training Title", "Description", "Status", "Actions"].map((h) => (
                                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {loading.ojt ? (
                                <tr><td colSpan="4" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading OJT…</td></tr>
                              ) : ojtTrainings.length === 0 ? (
                                <tr><td colSpan="4" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No training programs available.</td></tr>
                              ) : ojtTrainings.map((t) => (
                                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={async () => {
                                  try {
                                    const details = await getOjtTraining(token, t.id);
                                    setViewingOjtTraining(details);
                                  } catch (e) { alert("Failed to load training details"); }
                                }}>
                                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2563eb" }}>{t.title}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{t.description || "—"}</td>
                                  <td style={{ padding: "12px 16px" }}>
                                    <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: t.status === "published" ? "#dcfce7" : "#f1f5f9", color: t.status === "published" ? "#166534" : "#475569" }}>
                                      {t.status === "published" ? "Published" : "Draft"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "12px 16px", display: "flex", gap: "6px", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                                    <button title="Preview Training" onClick={async () => {
                                      try {
                                        const details = await getOjtTraining(token, t.id);
                                        setOjtPreviewTraining(details);
                                      } catch(e) { alert("Failed to load training"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                    <button title="Show QR Code" onClick={async () => {
                                      try {
                                        const url = t.assetId ? `${getQrBaseUrl()}/asset-scan/${t.assetId}` : `${getQrBaseUrl()}/ojt-training/${t.id}`;
                                        const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
                                        setOjtQrDataUrl(dataUrl);
                                        setOjtQrTraining(t);
                                      } catch(e) { alert("Failed to generate QR"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 20h3M20 17v3"/></svg>
                                    </button>
                                    <button title="Edit Training" onClick={() => { setShowOjtBuilder(true); setBuildingOjtTrainingId(t.id); }}
                                      style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    </button>
                                    {t.status === "published" && (
                                      <button title="Unpublish Training" onClick={async () => {
                                        if (!window.confirm(`Unpublish '${t.title}'? It will become a draft.`)) return;
                                        try {
                                          await publishOjtTraining(token, t.id);
                                          setOjtTrainings(p => p.map(x => x.id === t.id ? { ...x, status: "draft" } : x));
                                        } catch (e) { alert("Failed to unpublish"); }
                                      }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef9c3", color: "#ca8a04", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                      </button>
                                    )}
                                    <button title="Delete Training" onClick={async () => {
                                      if (!window.confirm(`Delete training '${t.title}'? This cannot be undone.`)) return;
                                      try { await deleteOjtTraining(token, t.id); setOjtTrainings(p => p.filter(x => x.id !== t.id)); }
                                      catch (e) { alert("Failed to delete training"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    ) : (
                      <OjtTrainingDetailView
                        training={viewingOjtTraining}
                        token={token}
                        onBack={() => {
                          setViewingOjtTraining(null);
                          load("ojt", () => getOjtTrainings(token).then(setOjtTrainings));
                        }}
                        onUpdated={(updated) => setViewingOjtTraining(updated)}
                      />
                    )}
                  </>
                )}
                {ojtSubNav === "tracking" && (
                  <TrackingSection token={token} ojtTrainings={ojtTrainings} />
                )}
              </>
            )}
          </div>
        )}

        {/* OJT Preview Modal */}
        {ojtPreviewTraining && (
          <TrainingPreviewModal
            training={ojtPreviewTraining}
            onClose={() => setOjtPreviewTraining(null)}
          />
        )}
        {/* OJT QR Modal */}
        {ojtQrTraining && (
          <TrainingQRModal
            training={ojtQrTraining}
            qrDataUrl={ojtQrDataUrl}
            onClose={() => { setOjtQrTraining(null); setOjtQrDataUrl(""); }}
          />
        )}

        {/* Asset QR Modal */}
        {assetQrModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "360px", padding: "32px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Asset QR Code</h3>
              <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>{assetQrModal.assetName}</p>
              {assetQrDataUrl ? (
                <img src={assetQrDataUrl} alt="QR Code" style={{ width: "220px", height: "220px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
              ) : (
                <p style={{ color: "#94a3b8" }}>Generating QR...</p>
              )}
              <p style={{ marginTop: "16px", fontSize: "11px", color: "#94a3b8" }}>Scan to view asset details and training on mobile</p>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "center", flexWrap: "wrap" }}>
                {assetQrDataUrl && (
                  <a href={assetQrDataUrl} download={`QR-${assetQrModal.assetName.replace(/[^a-zA-Z0-9]/g, "_")}-${assetQrModal.assetId}.png`} style={{ padding: "8px 18px", borderRadius: "8px", background: "#2563eb", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download QR
                  </a>
                )}
                {assetQrDataUrl && (
                  <button onClick={() => {
                    const w = window.open("", "_blank");
                    w.document.write(`<html><head><title>QR - ${assetQrModal.assetName}</title><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#fff} h3{margin-bottom:8px;font-size:18px;color:#0f172a} p{margin:0 0 16px;color:#64748b;font-size:13px}</style></head><body><h3>${assetQrModal.assetName}</h3><p>Scan to open on mobile</p><img src="${assetQrDataUrl}" style="width:260px;height:260px"/></body></html>`);
                    w.document.close();
                    w.focus();
                    setTimeout(() => { w.print(); }, 400);
                  }} style={{ padding: "8px 18px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print QR
                  </button>
                )}
                <button onClick={() => { setAssetQrModal(null); setAssetQrDataUrl(""); }} style={{ padding: "8px 18px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Fleet Management ─────────────────────────────── */}
        {nav === "fleet" && (
          <div>
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Fleet Management</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage vehicles, track fuel usage, and schedule maintenance</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px", overflowX: "auto" }}>
              {[
                { key: "assets", label: "Fleet Assets" },
                { key: "checklists", label: "Checklists" },
                { key: "logsheets", label: "Logsheets" },
                { key: "history", label: "Submission History" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFleetSubNav(tab.key)}
                  style={{
                    padding: "10px 4px", fontSize: "14px", fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                    color: fleetSubNav === tab.key ? "#2563eb" : "#64748b",
                    borderBottom: fleetSubNav === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                    transition: "all 0.2s"
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {fleetSubNav === "assets" && (
              <>
                {/* ── Fleet Expiry Warnings ── */}
                {(() => {
                  const daysUntil = (dateStr) => {
                    if (!dateStr) return null;
                    const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
                    return Math.ceil(diff / (1000 * 60 * 60 * 24));
                  };
                  const fleetWarnings = [];
                  assets.filter(a => a.assetType === "fleet").forEach(a => {
                    const meta = a.metadata || {};
                    const name = meta.vehicleNumber || a.assetName;
                    [
                      { field: "insuranceExpiry", label: "Insurance" },
                      { field: "pucExpiry",       label: "PUC" },
                      { field: "serviceDueDate",  label: "Service Due" },
                    ].forEach(({ field, label }) => {
                      const days = daysUntil(meta[field]);
                      if (days === null || days > 5) return;
                      const severity = days <= 0 ? "critical" : days <= 2 ? "high" : "medium";
                      fleetWarnings.push({ id: `${a.id}-${field}`, name, label, days, severity, dateStr: meta[field] });
                    });
                  });
                  if (!fleetWarnings.length) return null;
                  // play sound when warnings appear
                  const sevOrder = { critical: 0, high: 1, medium: 2 };
                  fleetWarnings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
                  const topSev = fleetWarnings[0].severity;
                  const sevCfg = {
                    critical: { bg: "#fef2f2", border: "#fca5a5", title: "#991b1b", badge: { bg: "#fee2e2", color: "#dc2626" }, icon: "🚨" },
                    high:     { bg: "#fff7ed", border: "#fdba74", title: "#9a3412", badge: { bg: "#ffedd5", color: "#ea580c" }, icon: "⚠️" },
                    medium:   { bg: "#fffbeb", border: "#fde68a", title: "#92400e", badge: { bg: "#fef3c7", color: "#d97706" }, icon: "🔔" },
                  };
                  const playWarningSound = () => {
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const beeps = topSev === "critical" ? 3 : topSev === "high" ? 2 : 1;
                      for (let i = 0; i < beeps; i++) {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.frequency.value = topSev === "critical" ? 880 : topSev === "high" ? 660 : 440;
                        osc.type = "sine";
                        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.35);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.25);
                        osc.start(ctx.currentTime + i * 0.35);
                        osc.stop(ctx.currentTime + i * 0.35 + 0.25);
                      }
                    } catch(_) {}
                  };
                  return (
                    <div style={{ marginBottom: "20px", background: sevCfg[topSev].bg, border: `1.5px solid ${sevCfg[topSev].border}`, borderRadius: "12px", overflow: "hidden" }}>
                      <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${sevCfg[topSev].border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "20px" }}>{sevCfg[topSev].icon}</span>
                          <span style={{ fontWeight: 800, fontSize: "14px", color: sevCfg[topSev].title }}>Fleet Expiry Warnings ({fleetWarnings.length})</span>
                        </div>
                        <button onClick={playWarningSound} style={{ padding: "5px 12px", borderRadius: "7px", background: "#fff", border: `1px solid ${sevCfg[topSev].border}`, color: sevCfg[topSev].title, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          🔊 Play Alert
                        </button>
                      </div>
                      <div style={{ padding: "10px 18px 14px", display: "flex", flexDirection: "column", gap: "7px" }}>
                        {fleetWarnings.map(w => {
                          const cfg = sevCfg[w.severity];
                          return (
                            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "#fff", borderRadius: "8px", border: `1px solid ${cfg.border}` }}>
                              <span style={{ background: cfg.badge.bg, color: cfg.badge.color, fontWeight: 800, fontSize: "10px", padding: "2px 8px", borderRadius: "12px", textTransform: "uppercase", flexShrink: 0 }}>{w.severity}</span>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{w.name}</span>
                                <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>— {w.label}</span>
                              </div>
                              <span style={{ fontSize: "12.5px", fontWeight: 700, color: cfg.badge.color, flexShrink: 0 }}>
                                {w.days <= 0 ? "Expired" : `${w.days} day${w.days !== 1 ? "s" : ""} left`}
                              </span>
                              <span style={{ fontSize: "11.5px", color: "#94a3b8", flexShrink: 0 }}>
                                {new Date(w.dateStr).toLocaleDateString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {!viewingFleetAsset ? (
                  <Card>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", margin: 0 }}>Registered Vehicles</h3>
                      <button onClick={() => { setNav("assets"); setAssetTypeFilter("fleet"); }}
                        style={{ padding: "6px 14px", borderRadius: "6px", background: "#2563eb", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                        + Register New Vehicle
                      </button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr>
                            {["Vehicle Number", "Type", "Driver", "Fuel Type", "Insurance", "Status", "Actions"].map((h) => (
                              <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const fleetAssetsFiltered = assets.filter(a => a.assetType === "fleet");
                            return fleetAssetsFiltered.length === 0 ? (
                              <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                                No vehicles registered. <button onClick={() => { setNav("assets"); setAssetTypeFilter("fleet"); }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Register one →</button>
                              </td></tr>
                            ) : fleetAssetsFiltered.map((a) => {
                              const meta = a.metadata || {};
                              const insStatus = meta.insuranceExpiry ? new Date(meta.insuranceExpiry) > new Date() ? "Active" : "Expired" : "—";
                              const insColor = insStatus === "Active" ? "#16a34a" : insStatus === "Expired" ? "#dc2626" : "#94a3b8";
                              return (
                                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2563eb", cursor: "pointer" }} onClick={() => setViewingFleetAsset(a.id)}>{meta.vehicleNumber || a.assetName}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.vehicleType || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.driver || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.fuelType || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: insColor, fontWeight: 600 }}>{insStatus}</td>
                                  <td style={{ padding: "12px 16px" }}>
                                    <span style={{ padding: "3px 9px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: a.status?.toLowerCase() === "active" ? "#dcfce7" : "#fee2e2", color: a.status?.toLowerCase() === "active" ? "#166534" : "#991b1b" }}>
                                      {a.status?.toLowerCase() === "active" ? "✔ Active" : "Inactive"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "12px 16px", display: "flex", gap: "6px" }}>
                                    <button onClick={() => setViewingFleetAsset(a.id)} style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Details</button>
                                    <button onClick={() => { setEditAsset(a); setShowAssetModal(true); }} style={{ padding: "4px 10px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                                    <button onClick={() => handleDeleteAsset(a.id)} style={{ padding: "4px 10px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (() => {
                  const viewingAsset = assets.find(a => a.id === viewingFleetAsset);
                  const meta = viewingAsset?.metadata || {};
                  return (
                    <Card style={{ maxWidth: "100%" }}>
                      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", margin: 0 }}>{meta.vehicleNumber || viewingAsset?.assetName}</h3>
                        <button onClick={() => setViewingFleetAsset(null)} style={{ padding: "6px 14px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                      </div>
                      <div style={{ padding: "20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Vehicle Type</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.vehicleType || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Fuel Type</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.fuelType || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Driver Assigned</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.driver || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Status</label>
                            <p style={{ margin: 0, fontWeight: 600, color: viewingAsset?.status?.toLowerCase() === "active" ? "#16a34a" : "#dc2626" }}>
                              {viewingAsset?.status?.toLowerCase() === "active" ? "✔ Active" : "Inactive"}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Insurance Expiry</label>
                            <p style={{ margin: 0, fontWeight: 600, color: new Date(meta.insuranceExpiry) > new Date() ? "#16a34a" : "#dc2626" }}>
                              {meta.insuranceExpiry ? new Date(meta.insuranceExpiry).toLocaleDateString() : "—"}
                            </p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>PUC Expiry</label>
                            <p style={{ margin: 0, fontWeight: 600, color: meta.pucExpiry && new Date(meta.pucExpiry) < new Date() ? "#dc2626" : "#475569" }}>
                              {meta.pucExpiry ? new Date(meta.pucExpiry).toLocaleDateString() : "—"}
                            </p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Service Due</label>
                            <p style={{ margin: 0, fontWeight: 600, color: meta.serviceDueDate && new Date(meta.serviceDueDate) < new Date() ? "#dc2626" : "#475569" }}>
                              {meta.serviceDueDate ? new Date(meta.serviceDueDate).toLocaleDateString() : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })()}
              </>
            )}

            {fleetSubNav === "checklists" && (() => {
              const fleetAssetIds = new Set(assets.filter(a => a.assetType === "fleet").map(a => a.id));
              const fleetChecklists = checklists.filter(c => (c.assetId && fleetAssetIds.has(c.assetId)) || c.assetType === "fleet" || c.category === "fleet");
              return (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Fleet Checklists ({fleetChecklists.length})</span>
                  <Btn onClick={() => { setEditChecklist(null); setShowChecklistModal(true); }} style={{ fontSize: "12px", padding: "6px 12px" }}>+ Create Checklist</Btn>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Checklist Name", "Asset / Vehicle", "Frequency", "Status", "Questions", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.checklists ? (
                      <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetChecklists.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                        No checklists found for fleet assets. Use "+ Create Checklist" above.
                      </td></tr>
                    ) : fleetChecklists.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{c.checklistName || c.templateName}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.assetName || assets.find(a => a.id === c.assetId)?.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.frequency || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: c.isActive || c.status === "active" ? "#dcfce7" : "#f1f5f9", color: c.isActive || c.status === "active" ? "#16a34a" : "#64748b" }}>
                            {c.isActive || c.status === "active" ? "Active" : (c.status || "Inactive")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.questions?.length ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button title="Edit" onClick={() => { setEditChecklist(c); setShowChecklistModal(true); }}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button title="Assign to employee" onClick={() => setAssignFleetChecklist(c)}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                            <button title="Delete" onClick={async () => {
                              if (!window.confirm(`Delete checklist '${c.checklistName || c.templateName}'?`)) return;
                              try { await deleteCompanyPortalChecklist(token, c.id); setChecklists(p => p.filter(x => x.id !== c.id)); }
                              catch (e) { alert("Delete failed"); }
                            }} style={{ padding: "4px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              );
            })()}

            {fleetSubNav === "logsheets" && (() => {
              const fleetAssetIds = new Set(assets.filter(a => a.assetType === "fleet").map(a => a.id));
              const fleetLogsheets = logsheetTemplatesList.filter(l =>
                (l.assetId && fleetAssetIds.has(l.assetId)) ||
                (l.assetType && l.assetType.toLowerCase().includes("fleet"))
              );
              return (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Fleet Logsheets ({fleetLogsheets.length})</span>
                  <Btn onClick={() => { setNav("logsheets"); }} style={{ fontSize: "12px", padding: "6px 12px" }}>+ Create Logsheet</Btn>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Logsheet Name", "Asset / Vehicle", "Frequency", "Status", "Fields", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.logsheet_templates ? (
                      <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetLogsheets.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                        No logsheets found for fleet assets. Use "+ Create Logsheet" above.
                      </td></tr>
                    ) : fleetLogsheets.map((l) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{l.name || l.templateName}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{assets.find(a => a.id === l.assetId)?.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.frequency || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: l.status === "active" ? "#dcfce7" : "#f1f5f9", color: l.status === "active" ? "#16a34a" : "#64748b" }}>
                            {l.status || "Active"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.fields?.length ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button title="Edit in Logsheets" onClick={() => setNav("logsheets")}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button title="Assign to employee" onClick={() => setAssignFleetLogsheet(l)}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                            <button title="Delete" onClick={async () => {
                              if (!window.confirm(`Delete logsheet '${l.name || l.templateName}'?`)) return;
                              try { await deleteCompanyPortalLogsheetTemplate(token, l.id); setLogsheetTemplatesList(p => p.filter(x => x.id !== l.id)); }
                              catch (e) { alert("Delete failed"); }
                            }} style={{ padding: "4px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              );
            })()}

            {/* Fleet Logsheet Assignment Modal */}
            {assignFleetLogsheet && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assign "{assignFleetLogsheet.name || assignFleetLogsheet.templateName}"</h3>
                    <button onClick={() => setAssignFleetLogsheet(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b" }}>✕</button>
                  </div>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Select an employee to assign this logsheet to:</p>
                  <select id="fleet-assign-emp" style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "16px" }} defaultValue="">
                    <option value="">— Select Employee —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.role})</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button onClick={() => setAssignFleetLogsheet(null)} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button onClick={async () => {
                      const empId = document.getElementById("fleet-assign-emp")?.value;
                      if (!empId) { alert("Please select an employee"); return; }
                      try {
                        await createTemplateUserAssignment(token, { templateType: "logsheet", templateId: assignFleetLogsheet.id, assignedTo: Number(empId) });
                        alert("Logsheet assigned successfully!");
                        setAssignFleetLogsheet(null);
                      } catch (e) { alert(e.message || "Assignment failed"); }
                    }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                  </div>
                </div>
              </div>
            )}

            {/* Fleet Checklist Assignment Modal */}
            {assignFleetChecklist && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assign "{assignFleetChecklist.checklistName || assignFleetChecklist.templateName}"</h3>
                    <button onClick={() => setAssignFleetChecklist(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b" }}>✕</button>
                  </div>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Select an employee to assign this checklist to:</p>
                  <select id="fleet-assign-chk-emp" style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "16px" }} defaultValue="">
                    <option value="">— Select Employee —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.role})</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button onClick={() => setAssignFleetChecklist(null)} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button onClick={async () => {
                      const empId = document.getElementById("fleet-assign-chk-emp")?.value;
                      if (!empId) { alert("Please select an employee"); return; }
                      try {
                        await createTemplateUserAssignment(token, { templateType: "checklist", templateId: assignFleetChecklist.id, assignedTo: Number(empId) });
                        alert("Checklist assigned successfully!");
                        setAssignFleetChecklist(null);
                      } catch (e) { alert(e.message || "Assignment failed"); }
                    }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                  </div>
                </div>
              </div>
            )}

            {/* Fleet Submission History */}
            {fleetSubNav === "history" && (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Submission History ({fleetHistory.length})</span>
                  <button onClick={async () => { try { await downloadFleetSubmissionsCSV(token); } catch (e) { alert("CSV export failed"); } }}
                    style={{ padding: "6px 14px", borderRadius: "8px", background: "#16a34a", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    ⬇ Export CSV
                  </button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Type", "Template", "Asset / Vehicle", "Submitted By", "Date & Time", "Location", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.fleet_history ? (
                      <tr><td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetHistory.length === 0 ? (
                      <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No submissions found for fleet assets yet.</td></tr>
                    ) : fleetHistory.map((h, i) => (
                      <tr key={`${h.type}-${h.id}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                            background: h.type === "checklist" ? "#ede9fe" : "#dbeafe",
                            color: h.type === "checklist" ? "#7c3aed" : "#2563eb" }}>
                            {h.type === "checklist" ? "✓ Checklist" : "📋 Logsheet"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{h.name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.submittedBy || "Anonymous"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.submittedAt ? new Date(h.submittedAt).toLocaleString() : "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "12px" }}>
                          {h.lat && h.lng ? (
                            <a href={`https://maps.google.com/?q=${h.lat},${h.lng}`} target="_blank" rel="noopener noreferrer"
                              style={{ color: "#2563eb", textDecoration: "none" }}>
                              📍 {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                            </a>
                          ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <button onClick={async () => {
                            setFleetSubmissionDetailLoading(true);
                            try {
                              const detail = await getFleetSubmissionDetail(token, h.type, h.id);
                              setFleetSubmissionDetail(detail);
                            } catch (e) { alert("Failed to load details"); }
                            finally { setFleetSubmissionDetailLoading(false); }
                          }} style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                            {fleetSubmissionDetailLoading ? "…" : "Details"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* Fleet Submission Detail Modal */}
            {fleetSubmissionDetail && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{fleetSubmissionDetail.name}</h3>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#64748b" }}>
                        {fleetSubmissionDetail.assetName} · {fleetSubmissionDetail.submittedBy} · {fleetSubmissionDetail.submittedAt ? new Date(fleetSubmissionDetail.submittedAt).toLocaleString() : "—"}
                        {fleetSubmissionDetail.shift ? ` · Shift: ${fleetSubmissionDetail.shift}` : ""}
                        {fleetSubmissionDetail.lat && fleetSubmissionDetail.lng ? ` · 📍 ${Number(fleetSubmissionDetail.lat).toFixed(4)}, ${Number(fleetSubmissionDetail.lng).toFixed(4)}` : ""}
                      </p>
                    </div>
                    <button onClick={() => setFleetSubmissionDetail(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b", fontSize: "16px" }}>✕</button>
                  </div>
                  <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
                    {(!fleetSubmissionDetail.answers || fleetSubmissionDetail.answers.length === 0) ? (
                      <p style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>No answer data available.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Question</th>
                            <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Answer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fleetSubmissionDetail.answers.map((a, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 500 }}>{a.question}</td>
                              <td style={{ padding: "8px 12px", color: "#475569" }}>{a.answer || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── My Tasks ──────────────────────────────────────── */}
        {nav === "mytasks" && (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>My Tasks</h1>
              <p style={{ color: "#64748b", fontSize: "13.5px" }}>Templates assigned to you by your supervisor or admin</p>
            </div>

            {loading.mytasks ? (
              <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>Loading…</p>
            ) : myAssignments.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "60px 20px", textAlign: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "12px" }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <p style={{ color: "#94a3b8", fontSize: "15px", marginBottom: "4px" }}>No tasks assigned yet</p>
                <p style={{ color: "#cbd5e1", fontSize: "13px" }}>Your supervisor or admin will assign checklists and logsheets to you here</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
                  <StatCard label="Total Assigned" value={myAssignments.length} sub="Templates to complete" iconBg="#eff6ff" iconCol="#2563eb" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>} />
                  <StatCard label="Checklists" value={myAssignments.filter((a) => a.templateType === "checklist").length} iconBg="#f0fdf4" iconCol="#16a34a" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="Logsheets" value={myAssignments.filter((a) => a.templateType === "logsheet").length} iconBg="#f3e8ff" iconCol="#7c3aed" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                </div>

                {/* Checklists section */}
                {myAssignments.filter((a) => a.templateType === "checklist").length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#166534", margin: 0 }}>Assigned Checklists</h2>
                    </div>
                    <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.filter((a) => a.templateType === "checklist").map((a) => (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#fafafa" }}>
                          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", margin: 0 }}>{a.templateName}</p>
                            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>Assigned by {a.assignedByName} · {new Date(a.createdAt).toLocaleDateString()}</p>
                            {a.note && <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>Note: {a.note}</p>}
                          </div>
                          {currentUser.role === "supervisor" ? (
                            <span style={{ padding: "5px 12px", borderRadius: "7px", background: "#f1f5f9", color: "#94a3b8", fontSize: "12px", fontWeight: 600, border: "1px solid #e2e8f0" }}>View Only</span>
                          ) : (
                            <button onClick={() => setNav("checklists")}
                              style={{ padding: "6px 16px", borderRadius: "7px", background: "#16a34a", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                              Open
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Logsheets section */}
                {myAssignments.filter((a) => a.templateType === "logsheet").length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", background: "#f5f3ff", borderBottom: "1px solid #ede9fe", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#4c1d95", margin: 0 }}>Assigned Logsheet Templates</h2>
                    </div>
                    <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.filter((a) => a.templateType === "logsheet").map((a) => {
                        const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", yearly: "Yearly" };
                        const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
                        const freq = a.frequency || "daily";
                        const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                        return (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#fafafa" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", margin: 0 }}>{a.templateName}</p>
                              <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{a.assetName ? `Asset: ${a.assetName} · ` : ""} Assigned by {a.assignedByName} · {new Date(a.createdAt).toLocaleDateString()}</p>
                            </div>
                            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{FREQ_LABELS[freq] || freq}</span>
                            <button onClick={() => { setDirectFillLogsheet({ templateId: a.templateId, assetId: a.assetId, template: a }); setNav("logsheets"); }}
                              style={{ padding: "6px 16px", borderRadius: "7px", background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                              {currentUser.role === "supervisor" ? "Open & Fill" : "Fill"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Supervisor: show what they've assigned to their team */}
                {currentUser.role === "supervisor" && assignments.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginTop: "8px" }}>
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Assignments I've Made to My Team</h2>
                      <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>{assignments.length} total</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["Team Member", "Type", "Template", "Assigned On"].map((h) => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                            ))}
                            <th style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((a) => (
                            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{a.assignedToName}</td>
                              <td style={{ padding: "10px 14px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: a.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: a.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>
                                  {a.templateType}
                                </span>
                              </td>
                              <td style={{ padding: "10px 14px", color: "#475569" }}>{a.templateName}</td>
                              <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                              <td style={{ padding: "10px 14px" }}>
                                <button onClick={async () => { try { await deleteTemplateUserAssignment(token, a.id); handleAssignmentRemoved(a.id); } catch (e) { alert(e.message); } }}
                                  style={{ width: "26px", height: "26px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showDeptModal && (
        <DeptModal
          token={token}
          existing={editDept}
          onClose={() => { setShowDeptModal(false); setEditDept(null); }}
          onSaved={handleDeptSaved}
        />
      )}
      {showAssetModal && (
        <AssetModal
          token={token}
          existing={editAsset}
          departments={departments}
          employees={employees}
          onClose={() => { setShowAssetModal(false); setEditAsset(null); }}
          onSaved={handleAssetSaved}
        />
      )}
      {showEmpModal && (
        <EmployeeModal
          token={token}
          existing={editEmp}
          employees={employees}
          currentUserRole={currentUser.role}
          onClose={() => { setShowEmpModal(false); setEditEmp(null); }}
          onSaved={handleEmpSaved}
        />
      )}
      {showAssignModal && assignTarget && (
        <AssignTemplateModal
          employee={assignTarget}
          token={token}
          checklists={checklists}
          logsheetTemplates={logsheetTemplatesList}
          existingAssignments={assignments.filter((a) => String(a.assignedTo) === String(assignTarget.id))}
          onClose={() => { setShowAssignModal(false); setAssignTarget(null); }}
          onAssigned={handleAssigned}
          onRemoved={handleAssignmentRemoved}
        />
      )}
      {showForwardModal && forwardTarget && (
        <ForwardTemplateModal
          assignment={forwardTarget}
          token={token}
          teamMembers={employees.filter((e) => String(e.supervisorId) === String(currentUser.id))}
          existingForwards={assignments.filter((a) =>
            String(a.assignedBy) === String(currentUser.id) &&
            a.templateType === forwardTarget.templateType &&
            String(a.templateId) === String(forwardTarget.templateId)
          )}
          onClose={() => { setShowForwardModal(false); setForwardTarget(null); }}
          onForwarded={handleAssigned}
          onRemoved={handleAssignmentRemoved}
        />
      )}
      {showImport && (
        <ImportModal
          token={token}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            load("employees", () => getCompanyPortalEmployees(token)).then((d) => d && setEmployees(d));
          }}
        />
      )}

      {/* ── Fleet Modals ── */}
      {showFleetInspectionModal && (
        <FleetInspectionModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetInspection}
          onClose={() => { setShowFleetInspectionModal(false); setEditFleetInspection(null); }}
          onSaved={(saved) => {
            setShowFleetInspectionModal(false);
            setEditFleetInspection(null);
            setFleetInspections(p => editFleetInspection ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}
      {showFleetFuelModal && (
        <FleetFuelModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetFuel}
          onClose={() => { setShowFleetFuelModal(false); setEditFleetFuel(null); }}
          onSaved={(saved) => {
            setShowFleetFuelModal(false);
            setEditFleetFuel(null);
            setFleetFuelLogs(p => editFleetFuel ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}
      {showFleetMaintModal && (
        <FleetMaintModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetMaint}
          onClose={() => { setShowFleetMaintModal(false); setEditFleetMaint(null); }}
          onSaved={(saved) => {
            setShowFleetMaintModal(false);
            setEditFleetMaint(null);
            setFleetMaintenance(p => editFleetMaint ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}

      {/* ── Toast notifications (fixed overlay) ── */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>
        {toasts.map((t) => {
          const bg  = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4", info: "#eff6ff" }[t.severity] || "#fff";
          const col = { critical: "#991b1b", high: "#9a3412",  medium: "#854d0e", low: "#166534", info: "#1d4ed8" }[t.severity] || "#0f172a";
          const bdr = { critical: "#fca5a5", high: "#fdba74",  medium: "#fde68a", low: "#86efac", info: "#bfdbfe" }[t.severity] || "#e2e8f0";
          const icon = { critical: "🚨", high: "⚠️", medium: "⚡", low: "🔔", info: "ℹ️" }[t.severity] || "⚠️";
          const label = { critical: "Critical Alert", high: "New Warning", medium: "New Alert", low: "Notification", info: "Info" }[t.severity] || "New Alert";
          return (
            <div key={t.id} className="fm-toast-enter" style={{ background: bg, border: `1px solid ${bdr}`, color: col, borderRadius: "10px", padding: "12px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: "13px", fontWeight: 600, maxWidth: "340px", pointerEvents: "auto", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 800, marginBottom: "2px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                <div>{t.text}</div>
                <button onClick={() => { setNav("warnings"); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}
                  style={{ marginTop: "6px", background: "none", border: "none", color: col, fontWeight: 700, fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View warnings →</button>
              </div>
              <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
                style={{ marginLeft: "auto", background: "none", border: "none", color: col, cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: 0, opacity: 0.6 }}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
