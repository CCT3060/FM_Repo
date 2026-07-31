import { useState, useEffect, useCallback } from "react";
import SearchableSelect from "./SearchableSelect.jsx";
import {
  getAdditionalRequestsAll,
  assignAdditionalRequest,
  setCutoffAdditionalRequest,
  updateAdditionalRequestStatus,
  getAdditionalRequestUsers,
  getOneAdditionalRequest,
  getAdditionalRequestServices,
  createAdditionalRequestService,
  deleteAdditionalRequestService,
} from "../api.js";
import { getApiBaseUrl } from "../utils/runtimeConfig.js";

const API_BASE = getApiBaseUrl();

const STATUS_STYLES = {
  open:         { bg: "#fee2e2", color: "#991b1b",  label: "Open" },
  acknowledged: { bg: "#fef3c7", color: "#92400e",  label: "Acknowledged" },
  in_progress:  { bg: "#dbeafe", color: "#1d4ed8",  label: "In Progress" },
  closed:       { bg: "#dcfce7", color: "#166534",  label: "Closed" },
};

const PRIORITY_STYLES = {
  Critical: { bg: "#fee2e2", color: "#991b1b" },
  High:     { bg: "#fff7ed", color: "#c2410c" },
  Moderate: { bg: "#fef3c7", color: "#92400e" },
  Low:      { bg: "#f0fdf4", color: "#166534" },
};

const STATUS_TABS = [
  { key: "all",          label: "All" },
  { key: "open",         label: "Open",         color: "#dc2626" },
  { key: "acknowledged", label: "Acknowledged",  color: "#b45309" },
  { key: "in_progress",  label: "In Progress",  color: "#1d4ed8" },
  { key: "closed",       label: "Closed",       color: "#16a34a" },
];

/* ── Assign Modal ─────────────────────────────────────────────────────────── */
function AssignModal({ req, users, token, onClose, onDone }) {
  const [selected, setSelected] = useState(req.assignedToId ? String(req.assignedToId) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setSaving(true); setErr(null);
    try { await assignAdditionalRequest(token, req.id, selected ? Number(selected) : null); onDone(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "460px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Assign Request</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>{req.serviceName} · <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{req.requestNumber}</span></p>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Assign To</label>
        <SearchableSelect value={selected} onChange={setSelected}
          options={[{ value: "", label: "— Unassigned —" }, ...users.map((u) => ({ value: String(u.id), label: `${u.fullName} · ${u.roleLabel || u.role || ""}` }))]}
          placeholder="Search user…" style={{ marginBottom: "20px" }} />
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Cutoff Modal ─────────────────────────────────────────────────────────── */
// Convert UTC ISO to local YYYY-MM-DDTHH:MM for datetime-local input
const toLocalInput = (utcStr) => {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function CutoffModal({ req, users, token, onClose, onDone }) {
  const [date, setDate] = useState(toLocalInput(req.cutoffAt));
  const [escalateUser, setEscalateUser] = useState(req.cutoffEscalateToId ? String(req.cutoffEscalateToId) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setSaving(true); setErr(null);
    try { await setCutoffAdditionalRequest(token, req.id, date ? new Date(date).toISOString() : null, escalateUser ? Number(escalateUser) : null); onDone(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "440px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Set Cutoff Date</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>{req.serviceName} · <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{req.requestNumber}</span></p>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Cutoff Date & Time</label>
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px", fontSize: "14px" }} />
        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Escalate To (if overdue)</label>
        <SearchableSelect value={escalateUser} onChange={setEscalateUser}
          options={[{ value: "", label: "— No escalation —" }, ...users.map((u) => ({ value: String(u.id), label: `${u.fullName} · ${u.roleLabel || u.role || ""}` }))]}
          placeholder="Search user…" style={{ marginBottom: "20px" }} />
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── View Modal ───────────────────────────────────────────────────────────── */
function ViewModal({ id, token, onClose }) {
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getOneAdditionalRequest(token, id).then(setReq).catch(() => {}).finally(() => setLoading(false));
  }, [id, token]);
  const statusStyle = STATUS_STYLES[req?.status] || STATUS_STYLES.open;
  const priorityStyle = PRIORITY_STYLES[req?.priority] || PRIORITY_STYLES.Moderate;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "560px", maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Additional Request Detail</h3>
            {req && <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#94a3b8" }}>{req.requestNumber}</span>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "20px" }}>✕</button>
        </div>
        {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div> : !req ? <div style={{ color: "#dc2626" }}>Not found</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Row 1: Raised By */}
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Raised By</p>
              <p style={{ fontWeight: 700, color: "#0f172a", marginBottom: "2px" }}>{req.raisedByName || "—"}</p>
              <p style={{ fontSize: "12px", color: "#64748b" }}>{req.raisedAt ? new Date(req.raisedAt).toLocaleString() : "—"}</p>
            </div>
            {/* Row 2: Service + Priority side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Service</p>
                <p style={{ fontWeight: 700, color: "#0f172a" }}>{req.serviceName}</p>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Priority</p>
                <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700, background: priorityStyle.bg, color: priorityStyle.color }}>{req.priority}</span>
              </div>
            </div>
            {/* Row 3: Status + Assigned To side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Status</p>
                <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700, background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Assigned To</p>
                <p style={{ fontWeight: 600, color: "#0f172a" }}>{req.assignedToName || "Unassigned"}</p>
              </div>
            </div>
            {/* Row 4: Remark (full width) */}
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase" }}>Remark</p>
              <p style={{ color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{req.remark || "—"}</p>
            </div>
            {/* Cutoff (if set) */}
            {req.cutoffAt && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "12px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase" }}>Cutoff Date</p>
                <p style={{ fontWeight: 600, color: "#dc2626" }}>{new Date(req.cutoffAt).toLocaleString()}</p>
              </div>
            )}
            {/* Escalation */}
            {req.escalationLevel > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "12px" }}>
                <p style={{ fontWeight: 700, color: "#c2410c", fontSize: "13px" }}>⚠ Escalated Level {req.escalationLevel}</p>
                {req.escalatedAt && <p style={{ fontSize: "12px", color: "#ea580c", marginTop: "4px" }}>{new Date(req.escalatedAt).toLocaleString()}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Services Config Modal ────────────────────────────────────────────────── */
function ServicesModal({ token, companyId, onClose }) {
  const [services, setServices] = useState([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getAdditionalRequestServices(token, companyId).then(setServices).catch(() => {});
  }, [token, companyId]);

  const add = async () => {
    if (!newName.trim()) return;
    setSaving(true); setErr(null);
    try {
      const created = await createAdditionalRequestService(token, { name: newName.trim() });
      setServices((p) => [...p, created]);
      setNewName("");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this service?")) return;
    try {
      await deleteAdditionalRequestService(token, id);
      setServices((p) => p.filter((s) => s.id !== id));
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "420px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "18px" }}>
          <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Configure Services</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "20px" }}>✕</button>
        </div>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Plumbing" style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px" }} />
          <button onClick={add} disabled={saving} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>Add</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "300px", overflowY: "auto" }}>
          {services.length === 0 && <p style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "20px" }}>No services yet. Add one above.</p>}
          {services.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
              <span style={{ fontWeight: 500, color: "#334155" }}>{s.name}</span>
              <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "14px", padding: "2px 6px" }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AdditionalRequestsPanel({ token, currentUser, allCompanies = false, companyId, onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(null); // { type: "assign"|"cutoff"|"view"|"services", req? }
  const isAdmin = currentUser?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = allCompanies ? "companyId=all" : (companyId ? `companyId=${companyId}` : "");
      const [reqs, us] = await Promise.all([
        getAdditionalRequestsAll(token, params),
        getAdditionalRequestUsers(token),
      ]);
      const reqList = Array.isArray(reqs) ? reqs : [];
      setRequests(reqList);
      setUsers(Array.isArray(us) ? us : []);
      if (onCountChange) onCountChange(reqList.filter((r) => r.status === "open").length);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, allCompanies, companyId, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const counts = {
    open:         requests.filter((r) => r.status === "open").length,
    acknowledged: requests.filter((r) => r.status === "acknowledged").length,
    in_progress:  requests.filter((r) => r.status === "in_progress").length,
    closed:       requests.filter((r) => r.status === "closed").length,
  };

  const filtered = requests.filter((r) => {
    if (statusTab !== "all" && r.status !== statusTab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.serviceName || "").toLowerCase().includes(q)
      || (r.raisedByName || "").toLowerCase().includes(q)
      || (r.assignedToName || "").toLowerCase().includes(q)
      || (r.requestNumber || "").toLowerCase().includes(q)
      || (r.remark || "").toLowerCase().includes(q)
      || (r.priority || "").toLowerCase().includes(q);
  });

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} request(s)? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/additional-requests/requests/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (res.ok) { setSelected(new Set()); await load(); }
    } catch { /* ignore */ }
  };

  const statusAction = async (req, status) => {
    try {
      await updateAdditionalRequestStatus(token, req.id, status);
      await load();
    } catch { /* ignore */ }
  };

  const deleteOne = async (req) => {
    if (!window.confirm(`Delete ${req.requestNumber}?`)) return;
    try {
      await fetch(`${API_BASE}/api/additional-requests/requests/${req.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Config button */}
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <button onClick={() => setModal({ type: "services" })}
            style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            ⚙ Configure Services
          </button>
        </div>
      )}

      {/* Status count cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { key: "open",         label: "OPEN",        color: "#dc2626", bg: "#fef2f2" },
          { key: "in_progress",  label: "IN PROGRESS", color: "#1d4ed8", bg: "#eff6ff" },
          { key: "closed",       label: "CLOSED",      color: "#16a34a", bg: "#f0fdf4" },
          { key: "total",        label: "TOTAL",       color: "#475569", bg: "#f8fafc" },
        ].map(({ key, label, color, bg }) => (
          <div key={key} style={{ background: bg, borderRadius: "10px", padding: "16px", border: `1px solid ${color}20` }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>{label}</p>
            <p style={{ fontSize: "26px", fontWeight: 800, color }}>{key === "total" ? requests.length : counts[key] || 0}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
        {/* Status tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              style={{ padding: "6px 14px", borderRadius: "20px", border: `1.5px solid ${statusTab === t.key ? (t.color || "#2563eb") : "#e2e8f0"}`, background: statusTab === t.key ? (t.color ? t.color + "18" : "#eff6ff") : "#fff", color: statusTab === t.key ? (t.color || "#2563eb") : "#64748b", fontWeight: statusTab === t.key ? 700 : 500, fontSize: "13px", cursor: "pointer" }}>
              {t.label}{t.key !== "all" && counts[t.key] > 0 ? ` ${counts[t.key]}` : ""}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Search */}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search service, raised by, remark…"
          style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", width: "240px" }} />
        {/* Bulk delete */}
        {isAdmin && selected.size > 0 && (
          <button onClick={bulkDelete} style={{ padding: "7px 14px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Delete {selected.size}
          </button>
        )}
        {/* Refresh */}
        <button onClick={load} style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No requests found</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {isAdmin && (
                    <th style={{ padding: "12px 10px", width: "36px" }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(filtered.map((r) => r.id)));
                          else setSelected(new Set());
                        }}
                        style={{ accentColor: "#2563eb" }} />
                    </th>
                  )}
                  {["REQ #", "SERVICE / PRIORITY", "REMARK", "RAISED BY", "ASSIGNED TO", "STATUS", "RAISED", "CUTOFF", "ACTIONS"].map((h) => (
                    <th key={h} style={{ padding: "12px 10px", fontSize: "11.5px", fontWeight: 700, color: "#64748b", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => {
                  const ss = STATUS_STYLES[req.status] || STATUS_STYLES.open;
                  const ps = PRIORITY_STYLES[req.priority] || PRIORITY_STYLES.Moderate;
                  const isClosed = req.status === "closed";
                  return (
                    <tr key={req.id} style={{ borderTop: "1px solid #f1f5f9", background: selected.has(req.id) ? "#f0f9ff" : undefined }}>
                      {isAdmin && (
                        <td style={{ padding: "12px 10px" }}>
                          <input type="checkbox" checked={selected.has(req.id)}
                            onChange={(e) => setSelected((p) => { const n = new Set(p); if (e.target.checked) n.add(req.id); else n.delete(req.id); return n; })}
                            style={{ accentColor: "#2563eb" }} />
                        </td>
                      )}
                      <td style={{ padding: "12px 10px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "12px", background: "#f1f5f9", padding: "2px 7px", borderRadius: "6px", color: "#475569" }}>{req.requestNumber}</span>
                        {req.escalationLevel > 0 && (
                          <div style={{ marginTop: "4px" }}>
                            <span style={{ fontSize: "10px", background: "#fff7ed", color: "#c2410c", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>⚠ Escalated L{req.escalationLevel}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{req.serviceName}</div>
                        <span style={{ marginTop: "3px", display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: ps.bg, color: ps.color }}>{req.priority}</span>
                      </td>
                      <td style={{ padding: "12px 10px", maxWidth: "180px" }}>
                        <span style={{ fontSize: "12.5px", color: "#475569", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{req.remark || "—"}</span>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", color: "#475569", whiteSpace: "nowrap" }}>{req.raisedByName || "—"}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", color: "#475569" }}>{req.assignedToName || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Unassigned</span>}</td>
                      <td style={{ padding: "12px 10px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, background: ss.bg, color: ss.color }}>{ss.label}</span>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "12.5px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {req.raisedAt ? new Date(req.raisedAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "12.5px", whiteSpace: "nowrap" }}>
                        {req.cutoffAt ? <span style={{ color: new Date(req.cutoffAt) < new Date() ? "#dc2626" : "#475569" }}>{new Date(req.cutoffAt).toLocaleDateString()}</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          <button onClick={() => setModal({ type: "view", req })}
                            style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>View</button>
                          {!isClosed && isAdmin && (
                            <>
                              <button onClick={() => setModal({ type: "assign", req })}
                                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Reassign</button>
                              <button onClick={() => setModal({ type: "cutoff", req })}
                                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Cutoff</button>
                              {req.status === "open" && (
                                <button onClick={() => statusAction(req, "acknowledged")}
                                  style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fde68a", background: "#fef3c7", color: "#92400e", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Acknowledge</button>
                              )}
                              {(req.status === "open" || req.status === "acknowledged") && (
                                <button onClick={() => statusAction(req, "in_progress")}
                                  style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>In Progress</button>
                              )}
                              <button onClick={() => statusAction(req, "closed")}
                                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #bbf7d0", background: "#dcfce7", color: "#166534", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Close</button>
                            </>
                          )}
                          {isClosed && isAdmin && (
                            <button onClick={() => statusAction(req, "open")}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Reopen</button>
                          )}
                          {isAdmin && (
                            <button onClick={() => deleteOne(req)}
                              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>✕</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.type === "assign"   && <AssignModal   req={modal.req} users={users} token={token} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} />}
      {modal?.type === "cutoff"   && <CutoffModal   req={modal.req} users={users} token={token} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} />}
      {modal?.type === "view"     && <ViewModal     id={modal.req.id} token={token} onClose={() => setModal(null)} />}
      {modal?.type === "services" && <ServicesModal token={token} companyId={companyId} onClose={() => setModal(null)} />}
    </div>
  );
}
