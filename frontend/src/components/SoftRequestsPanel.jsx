import { useState, useEffect, useCallback } from "react";
import SearchableSelect from "./SearchableSelect.jsx";
import { confirmDeleteAction } from "../pages/CompanyEmployeePortal.jsx";
import {
  getSoftServiceRequestsAll,
  assignSoftServiceRequest,
  setCutoffSoftRequest,
  updateSoftRequestStatus,
  resolveSoftServiceRequest,
  getSoftRequestUsers,
  getSoftRequestEscalationUsers,
  getOneSoftServiceRequest,
} from "../api.js";
import { getApiBaseUrl } from "../utils/runtimeConfig.js";

const API_BASE_SR = getApiBaseUrl();

/* ── Status config ─────────────────────────────────────────────────────────── */
const STATUS_STYLES = {
  open:         { bg: "#fee2e2", color: "#991b1b",  label: "Open" },
  acknowledged: { bg: "#fef3c7", color: "#92400e",  label: "Acknowledged" },
  in_progress:  { bg: "#dbeafe", color: "#1d4ed8",  label: "In Progress" },
  closed:       { bg: "#dcfce7", color: "#166534",  label: "Closed" },
  resolved:     { bg: "#dcfce7", color: "#166534",  label: "Closed" }, // legacy alias
};

const STATUS_TABS = [
  { key: "all",          label: "All" },
  { key: "open",         label: "Open",         color: "#dc2626" },
  { key: "acknowledged", label: "Acknowledged",  color: "#b45309" },
  { key: "in_progress",  label: "In Progress",  color: "#1d4ed8" },
  { key: "closed",       label: "Closed",       color: "#16a34a" },
];

/* ── Assign Modal ──────────────────────────────────────────────────────────── */
function AssignModal({ req, users, token, onClose, onDone }) {
  const [selected, setSelected] = useState(req.assignedToId ? String(req.assignedToId) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await assignSoftServiceRequest(token, req.id, selected ? Number(selected) : null);
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "460px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Assign Request</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>{req.templateName || req.assetName || req.locationName || 'Request'} · <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{req.requestNumber}</span></p>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Assign To</label>
        <SearchableSelect
          value={selected}
          onChange={setSelected}
          options={[
            { value: "", label: "— Unassigned —" },
            ...users.map((u) => ({ value: String(u.id), label: `${u.fullName} · ${u.roleLabel || u.role || ""}` }))
          ]}
          placeholder="Search user…"
          style={{ marginBottom: "20px" }}
        />
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cutoff Modal ──────────────────────────────────────────────────────────── */
// Convert UTC ISO string to YYYY-MM-DDTHH:MM local time for datetime-local input
const toLocalInput = (utcStr) => {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function CutoffModal({ req, escalationUsers, token, onClose, onDone }) {
  const [date, setDate] = useState(toLocalInput(req.cutoffAt));
  const [escalateUser, setEscalateUser] = useState(req.cutoffEscalateToId ? String(req.cutoffEscalateToId) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await setCutoffSoftRequest(
        token, req.id,
        date ? new Date(date).toISOString() : null,
        escalateUser ? Number(escalateUser) : null
      );
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "440px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Set Cutoff Date</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>{req.templateName || req.assetName || req.locationName || 'Request'} · <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{req.requestNumber}</span></p>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}

        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Deadline</label>
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", marginBottom: "16px", boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
          Escalate To (after cutoff)
          <span style={{ marginLeft: "6px", fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>— notified when deadline passes</span>
        </label>
        <SearchableSelect
          value={escalateUser}
          onChange={setEscalateUser}
          options={[
            { value: "", label: "— No escalation —" },
            ...escalationUsers.map((u) => ({ value: String(u.id), label: `${u.fullName} \u00b7 ${u.roleLabel || u.role || ""}` }))
          ]}
          placeholder="Search user…"
          style={{ marginBottom: "20px" }}
        />

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#f59e0b", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Set Cutoff"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── View Modal ────────────────────────────────────────────────────────────── */
function ViewModal({ req, token, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const ss = STATUS_STYLES[req.status] || STATUS_STYLES.open;

  useEffect(() => {
    getOneSoftServiceRequest(token, req.id)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [token, req.id]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "600px", maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: "13px", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px" }}>{req.requestNumber}</span>
              <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: ss.bg, color: ss.color }}>{ss.label}</span>
              {req.escalationLevel > 0 && <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#fee2e2", color: "#dc2626" }}>⚠ Escalated L{req.escalationLevel}</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{req.templateName || req.assetName || req.locationName || 'Soft Request'}</h2>
            {(req.assetName || req.locationName) && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>{req.assetName ? `Asset: ${req.assetName}` : `Location: ${req.locationName}`}{req.assetUniqueId ? ` · #${req.assetUniqueId}` : ''}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
          {[
            ["Raised By", req.raisedByName || "—"],
            ["Raised At", req.raisedAt ? new Date(req.raisedAt).toLocaleString() : "—"],
            ["Assigned To", req.assignedToName || "Unassigned"],
            ["Cutoff", req.cutoffAt ? new Date(req.cutoffAt).toLocaleString() : "—"],
            req.cutoffEscalateToName ? ["Escalate To", req.cutoffEscalateToName] : null,
            req.resolvedByName ? ["Closed By", req.resolvedByName] : null,
            req.resolvedAt ? ["Closed At", new Date(req.resolvedAt).toLocaleString()] : null,
          ].filter(Boolean).map(([label, val]) => (
            <div key={label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 14px" }}>
              <p style={{ margin: "0 0 3px", fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>{label}</p>
              <p style={{ margin: 0, fontSize: "13.5px", color: "#0f172a", fontWeight: 500 }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Submission answers */}
        {loading ? (
          <p style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>Loading details…</p>
        ) : (
          (() => {
            const renderAnswers = (answers) => {
              if (!answers?.length) return null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {answers.map((a, i) => {
                    let displayAnswer = a.answer || a.optionSelected;
                    let photoSrc = a.photoUrl;
                    if (!photoSrc && displayAnswer) {
                      try {
                        const parsed = JSON.parse(displayAnswer);
                        if (parsed && typeof parsed === 'object') {
                          photoSrc = parsed.photoUrl || parsed.url || parsed.uri || null;
                          displayAnswer = parsed.value != null ? String(parsed.value) : displayAnswer;
                        }
                      } catch { /* not JSON */ }
                    }
                    if (photoSrc && photoSrc.startsWith('http://3.110.166.39')) {
                      photoSrc = photoSrc.replace(/^http:\/\/3\.110\.166\.39/, '');
                    }
                    return (
                      <div key={i} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 14px", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#64748b" }}>{a.questionText}</p>
                        {photoSrc ? (
                          <>
                            {displayAnswer && <p style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{displayAnswer}</p>}
                            <img src={photoSrc} alt="submission photo" style={{ maxWidth: "100%", maxHeight: "220px", objectFit: "contain", borderRadius: "6px", border: "1px solid #e2e8f0" }} />
                          </>
                        ) : (
                          <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                            {displayAnswer || <span style={{ color: "#cbd5e1" }}>—</span>}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            };

            const hasCatalyst = detail?.catalystAnswers?.length > 0;
            const hasBefore   = detail?.beforeAnswers?.length > 0;
            const hasAfter    = detail?.afterAnswers?.length > 0;

            if (!hasCatalyst && !hasBefore && !hasAfter) {
              return <p style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: "13px" }}>No submission answers recorded.</p>;
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {hasCatalyst && (
                  <div>
                    <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.05em", background: "#eff6ff", padding: "6px 10px", borderRadius: "6px" }}>
                      Catalyst Supervisor Filled Response
                    </p>
                    {renderAnswers(detail.catalystAnswers)}
                  </div>
                )}
                {hasBefore && (
                  <div>
                    <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em", background: "#fef3c7", padding: "6px 10px", borderRadius: "6px" }}>
                      Client Raised Issue Response
                    </p>
                    {renderAnswers(detail.beforeAnswers)}
                  </div>
                )}
                {hasAfter && (
                  <div>
                    <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em", background: "#dcfce7", padding: "6px 10px", borderRadius: "6px" }}>
                      Resolved Response
                    </p>
                    {renderAnswers(detail.afterAnswers)}
                  </div>
                )}
              </div>
            );
          })()
        )}

        <div style={{ marginTop: "20px", textAlign: "right" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Panel ────────────────────────────────────────────────────────────── */
export default function SoftRequestsPanel({ token, currentUser, hasPerm, allCompanies = false, isViewOnly = false }) {
  const [requests, setRequests]         = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [assignModal, setAssignModal]   = useState(null);
  const [cutoffModal, setCutoffModal]   = useState(null);
  const [viewModal, setViewModal]       = useState(null);
  const [busy, setBusy]                 = useState({});
  const [selected, setSelected]         = useState(new Set());
  const [deleting, setDeleting]         = useState(false);
  const [escalationUsers, setEscalationUsers] = useState([]);

  const isAdmin    = currentUser?.role === "admin" || currentUser?.role === "catalyst_admin";
  const isManager  = isAdmin || currentUser?.role === "supervisor" || currentUser?.isSoftManager || currentUser?.roleCapabilities?.isSoftManager || currentUser?.role?.toLowerCase().includes("manager");
  const canResolve = isAdmin || isManager || currentUser?.canResolveSoftIssue || currentUser?.roleCapabilities?.canResolveSoftIssue;

  const canAssign       = !isViewOnly && (isAdmin || (hasPerm ? hasPerm("softrequests", "assign_cutoff_hk_web") : isManager));
  const canChangeStatus = !isViewOnly && (isAdmin || (hasPerm ? hasPerm("softrequests", "change_status_hk_web") : canResolve));
  const canDelete       = !isViewOnly && (isAdmin || (hasPerm ? hasPerm("softrequests", "d") : isAdmin));

  const load = useCallback(() => {
    setLoading(true);
    setSelected(new Set());
    getSoftServiceRequestsAll(token, allCompanies ? "companyId=all" : "")
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [token, allCompanies]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getSoftRequestUsers(token).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    getSoftRequestEscalationUsers(token).then((d) => setEscalationUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);

  const deleteOne = async (id) => {
    if (!confirmDeleteAction(canDelete, "Delete this request? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_SR}/api/soft-service/requests/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Delete failed"); }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const deleteBulk = async () => {
    if (!selected.size) return;
    if (!confirmDeleteAction(canDelete, `Delete ${selected.size} request${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_SR}/api/soft-service/requests/bulk-delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Bulk delete failed"); }
      const { deleted } = await res.json();
      setRequests((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      alert(`${deleted} request${deleted > 1 ? "s" : ""} deleted.`);
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const toggleSelect = (id) => setSelected((prev) => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  // Normalise legacy "resolved" → "closed" for display
  const normReqs = requests.map((r) => ({ ...r, status: r.status === "resolved" ? "closed" : r.status }));

  const counts = {
    open:         normReqs.filter((r) => r.status === "open").length,
    acknowledged: normReqs.filter((r) => r.status === "acknowledged").length,
    in_progress:  normReqs.filter((r) => r.status === "in_progress").length,
    closed:       normReqs.filter((r) => r.status === "closed").length,
    total:        normReqs.length,
  };

  const filtered = normReqs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.templateName || r.assetName || r.locationName || "").toLowerCase().includes(q)
        || (r.raisedByName || "").toLowerCase().includes(q)
        || (r.assignedToName || "").toLowerCase().includes(q)
        || (r.requestNumber || "").toLowerCase().includes(q);
    }
    return true;
  });

  const doStatus = async (r, status) => {
    setBusy((b) => ({ ...b, [r.id]: true }));
    try {
      if (status === "closed") {
        await resolveSoftServiceRequest(token, r.id);
      } else {
        await updateSoftRequestStatus(token, r.id, status);
      }
      load();
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setBusy((b) => ({ ...b, [r.id]: false }));
    }
  };

  const cutoffStatus = (r) => {
    if (!r.cutoffAt || r.status === "closed") return null;
    const ms = new Date(r.cutoffAt) - Date.now();
    if (ms < 0)            return { label: "Overdue", bg: "#fee2e2", color: "#dc2626" };
    if (ms < 3 * 3600000) return { label: "At Risk",  bg: "#fef3c7", color: "#b45309" };
    return null;
  };

  // Single progressive status button
  const StatusBtn = ({ r }) => {
    const busy_ = !!busy[r.id];
    if (!canChangeStatus) return null;
    if (r.status === "closed") {
      return <button onClick={() => doStatus(r, "open")} disabled={busy_} style={bStyle("#eff6ff","#bfdbfe","#2563eb",busy_)}>{busy_ ? "…" : "Reopen"}</button>;
    }
    if (r.status === "open")
      return <button onClick={() => doStatus(r, "acknowledged")} disabled={busy_} style={bStyle("#fffbeb","#fde68a","#b45309",busy_)}>{busy_ ? "…" : "Acknowledge"}</button>;
    if (r.status === "acknowledged")
      return <button onClick={() => doStatus(r, "in_progress")} disabled={busy_} style={bStyle("#dbeafe","#bfdbfe","#1d4ed8",busy_)}>{busy_ ? "…" : "Start"}</button>;
    if (r.status === "in_progress")
      return <button onClick={() => { if (window.confirm("Mark this request as Closed?")) doStatus(r, "closed"); }} disabled={busy_} style={bStyle("#f0fdf4","#bbf7d0","#16a34a",busy_)}>{busy_ ? "…" : "Resolve"}</button>;
    return null;
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* ── Page title ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "22px" }}>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>HK Request</h2>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Requests raised via QR scan from the mobile app</p>
      </div>

      {/* ── Overview cards ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
        {[
          { label: "OPEN",         value: counts.open,        bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
          { label: "IN PROGRESS",  value: counts.in_progress, bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb" },
          { label: "CLOSED",       value: counts.closed,      bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
          { label: "TOTAL",        value: counts.total,       bg: "#f8fafc", border: "#e2e8f0", color: "#475569" },
        ].map((c) => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "12px", padding: "16px 20px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", margin: "0 0 6px" }}>{c.label}</p>
            <p style={{ fontSize: "30px", fontWeight: 800, color: c.color, margin: 0, lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "10px", padding: "3px", gap: "2px", flexWrap: "wrap" }}>
          {STATUS_TABS.map((t) => {
            const cnt = t.key === "all" ? counts.total : (counts[t.key] ?? 0);
            return (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                style={{ padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, transition: "all 0.15s",
                  background: statusFilter === t.key ? "#fff" : "transparent",
                  color: statusFilter === t.key ? (t.color || "#0f172a") : "#64748b",
                  boxShadow: statusFilter === t.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
                {t.label}{cnt > 0 ? ` ${cnt}` : ""}
              </button>
            );
          })}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search checklist, location, raised by, request #…"
          style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#fff", flex: "1", minWidth: "180px" }} />
        <button onClick={load} style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
          ↻ Refresh
        </button>
        {canDelete && selected.size > 0 && (
          <button onClick={deleteBulk} disabled={deleting}
            style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #fecaca",
              background: "#fef2f2", color: "#dc2626", cursor: deleting ? "not-allowed" : "pointer",
              fontSize: "13px", fontWeight: 600, opacity: deleting ? 0.6 : 1 }}>
            🗑 Delete Selected ({selected.size})
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", color: "#94a3b8" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px" }}>🧹</div>
          <p style={{ fontWeight: 600, color: "#475569" }}>No requests found</p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "32px 100px 1.8fr 1fr 1fr 1fr 0.9fr 0.9fr 2.5fr", gap: "8px", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", alignItems: "center" }}>
            <span>
              {!isViewOnly && <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                onChange={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))}
                style={{ cursor: "pointer", width: "14px", height: "14px" }} />}
            </span>
            <span>Req #</span><span>Checklist</span><span>Raised By</span><span>Assigned To</span><span>Status</span><span>Raised</span><span>Cutoff</span><span>Actions</span>
          </div>

          {filtered.map((r, i) => {
            const ss = STATUS_STYLES[r.status] || STATUS_STYLES.open;
            const cs = cutoffStatus(r);
            const busy_ = !!busy[r.id];
            const isActive = r.status !== "closed";
            return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "32px 100px 1.8fr 1fr 1fr 1fr 0.9fr 0.9fr 2.5fr", gap: "8px", padding: "12px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none", alignItems: "center", background: selected.has(r.id) ? "#fff7ed" : (r.escalationLevel > 0 ? "#fffbeb" : "#fff") }}>

                {/* Checkbox */}
                <div>
                  {!isViewOnly && <input type="checkbox" checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)} style={{ cursor: "pointer", width: "14px", height: "14px" }} />}
                </div>

                {/* Req # */}
                <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "5px", display: "inline-block" }}>
                  {r.requestNumber}
                </div>

                {/* Checklist / Asset */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{r.templateName || r.assetName || r.locationName || "—"}</div>
                  {(r.assetName || r.locationName) && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{r.assetName || r.locationName}</div>}
                  {r.escalationLevel > 0 && <div style={{ fontSize: "10.5px", color: "#dc2626", fontWeight: 600 }}>⚠ Escalated L{r.escalationLevel}</div>}
                </div>

                {/* Raised By */}
                <div style={{ fontSize: "12.5px", color: "#475569" }}>{r.raisedByName || "—"}</div>

                {/* Assigned To */}
                <div style={{ fontSize: "12.5px", color: r.assignedToName ? "#0f172a" : "#94a3b8", fontStyle: r.assignedToName ? "normal" : "italic" }}>
                  {r.assignedToName || "Unassigned"}
                </div>

                {/* Status */}
                <div>
                  <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11.5px", fontWeight: 600, background: ss.bg, color: ss.color }}>
                    {ss.label}
                  </span>
                </div>

                {/* Raised At */}
                <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                  {r.raisedAt ? new Date(r.raisedAt).toLocaleDateString() : "—"}
                </div>

                {/* Cutoff */}
                <div style={{ fontSize: "11.5px" }}>
                  {r.cutoffAt ? (
                    <div>
                      {cs && <div style={{ fontSize: "10px", fontWeight: 700, color: cs.color }}>{cs.label}</div>}
                      <span style={{ color: cs ? cs.color : "#475569" }}>{new Date(r.cutoffAt).toLocaleDateString()}</span>
                      {r.cutoffEscalateToName && <div style={{ fontSize: "10px", color: "#94a3b8" }}>→ {r.cutoffEscalateToName}</div>}
                    </div>
                  ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  <button onClick={() => setViewModal(r)} style={bStyle("#f8fafc","#e2e8f0","#475569",false)}>View</button>
                  {isActive && canAssign && <button onClick={() => setAssignModal(r)} disabled={busy_} style={bStyle("#eff6ff","#bfdbfe","#2563eb",busy_)}>{r.assignedToId ? "Reassign" : "Assign"}</button>}
                  {isActive && canAssign && <button onClick={() => setCutoffModal(r)} disabled={busy_} style={bStyle("#fffbeb","#fde68a","#b45309",busy_)}>Cutoff</button>}
                  <StatusBtn r={r} />
                  {canDelete && <button onClick={() => deleteOne(r.id)} disabled={deleting} style={bStyle("#fef2f2","#fecaca","#dc2626",deleting)}>🗑</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {assignModal && (
        <AssignModal req={assignModal} users={users} token={token}
          onClose={() => setAssignModal(null)}
          onDone={() => { setAssignModal(null); load(); }} />
      )}
      {cutoffModal && (
        <CutoffModal req={cutoffModal} escalationUsers={escalationUsers} token={token}
          onClose={() => setCutoffModal(null)}
          onDone={() => { setCutoffModal(null); load(); }} />
      )}
      {viewModal && (
        <ViewModal req={viewModal} token={token} onClose={() => setViewModal(null)} />
      )}
    </div>
  );
}

/* ── tiny button style helper ──────────────────────────────────────────────── */
function bStyle(bg, border, color, disabled) {
  return {
    padding: "4px 9px", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${border}`, background: bg, color,
    opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
  };
}
