import { useState, useEffect, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function apiFetch(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
  return data;
}

const PRIORITY_STYLES = {
  critical: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  high:     { bg: "#ffedd5", color: "#9a3412", dot: "#f97316" },
  medium:   { bg: "#fef9c3", color: "#854d0e", dot: "#eab308" },
  low:      { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
};
const STATUS_STYLES = {
  open:        { bg: "#fee2e2",  color: "#991b1b",  label: "Open" },
  in_progress: { bg: "#dbeafe",  color: "#1d4ed8",  label: "In Progress" },
  completed:   { bg: "#dcfce7",  color: "#166534",  label: "Completed" },
  closed:      { bg: "#f1f5f9",  color: "#475569",  label: "Closed" },
};
const SOURCE_STYLES = {
  flag:      { bg: "#fdf4ff",  color: "#7c3aed",  label: "Flag" },
  logsheet:  { bg: "#dcfce7",  color: "#166534",  label: "Logsheet" },
  checklist: { bg: "#dbeafe",  color: "#1d4ed8",  label: "Checklist" },
  manual:    { bg: "#f1f5f9",  color: "#475569",  label: "Manual" },
};

const STATUS_TABS = [
  { key: "all",         label: "All" },
  { key: "open",        label: "Open",        color: "#dc2626" },
  { key: "in_progress", label: "In Progress", color: "#1d4ed8" },
  { key: "completed",   label: "Completed",   color: "#16a34a" },
  { key: "closed",      label: "Closed",      color: "#64748b" },
  { key: "escalated",   label: "Escalated",   color: "#7c3aed" },
];

/* ── Assign Modal ─────────────────────────────────────────────────────── */
function AssignModal({ wo, users, token, companyPortalToken, onClose, onDone }) {
  const [selected, setSelected] = useState(wo.assignedTo ? String(wo.assignedTo) : "");
  const [note, setNote] = useState(wo.assignedNote || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!selected) { setErr("Please select a user."); return; }
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(
        "PUT",
        `/api/company-portal/work-orders/${wo.id}/assign`,
        { assignedTo: Number(selected), assignedNote: note || undefined },
        companyPortalToken
      );
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "480px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>Assign Work Order</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>
          {wo.workOrderNumber} — {wo.assetName || "No asset"}
        </p>

        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}

        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
            Assign To <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}
          >
            <option value="">— Select employee —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.role}{u.designation ? ` · ${u.designation}` : ""})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Instructions for assignee…"
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CUTOFF_STYLES = {
  overdue:  { bg: "#fee2e2", color: "#991b1b", label: "⏰ OVERDUE" },
  at_risk:  { bg: "#ffedd5", color: "#9a3412", label: "⚠ At Risk" },
  on_time:  { bg: "#dcfce7", color: "#166534", label: "✓ On Time" },
};

/* ── Set Cutoff Modal ───────────────────────────────────────────────────── */
function SetCutoffModal({ wo, companyPortalToken, onClose, onDone }) {
  const toLocalDatetimeValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [value, setValue] = useState(toLocalDatetimeValue(wo.expectedCompletionAt));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await apiFetch(
        "PATCH",
        `/api/company-portal/work-orders/${wo.id}/cutoff`,
        { expectedCompletionAt: value ? new Date(value).toISOString() : null },
        companyPortalToken
      );
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "420px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>Set Cutoff Deadline</h3>
        <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>
          {wo.workOrderNumber} — {wo.assetName || "No asset"}
        </p>
        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
            Completion Deadline
          </label>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px" }}
          />
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>Leave blank to remove the deadline.</div>
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#f97316", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Create Work Order Modal ────────────────────────────────────────────── */
function CreateWOModal({ assets, users, companyPortalToken, onClose, onDone }) {
  const [form, setForm] = useState({
    assetId: "", issueDescription: "", priority: "medium", assignedTo: "",
    expectedCompletionAt: "", escalationIntervalMinutes: "120",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.issueDescription.trim()) { setErr("Issue description is required."); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        issueDescription: form.issueDescription.trim(),
        priority: form.priority,
      };
      if (form.assetId)   body.assetId   = Number(form.assetId);
      if (form.assignedTo) body.assignedTo = Number(form.assignedTo);
      if (form.expectedCompletionAt) body.expectedCompletionAt = form.expectedCompletionAt;
      if (form.escalationIntervalMinutes) body.escalationIntervalMinutes = Number(form.escalationIntervalMinutes);
      await apiFetch("POST", "/api/company-portal/work-orders", body, companyPortalToken);
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "520px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "18px" }}>Create Work Order</h3>

        {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Asset (optional)</label>
            <select value={form.assetId} onChange={(e) => set("assetId", e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
              <option value="">— No specific asset —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.asset_name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
              Issue Description <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea value={form.issueDescription} onChange={(e) => set("issueDescription", e.target.value)}
              placeholder="Describe the issue or task…" rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Priority</label>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
              {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Assign To (optional)</label>
            <select value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
              <option value="">— Assign later —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
            </select>
          </div>

          {/* ── Escalation Settings ─────────────────────────────────────────── */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>
              ⏰ Deadline &amp; Escalation
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Completion Deadline (optional)
                </label>
                <input
                  type="datetime-local"
                  value={form.expectedCompletionAt}
                  onChange={(e) => set("expectedCompletionAt", e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px" }}
                />
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>If set, auto-escalation will trigger when overdue.</div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Escalation Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10080"
                  value={form.escalationIntervalMinutes}
                  onChange={(e) => set("escalationIntervalMinutes", e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px" }}
                />
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>Minutes after deadline before escalating to supervisor (default 120 = 2h).</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "22px" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating…" : "Create Work Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────────── */
export default function WorkOrdersPanel({ token, companyId, assets = [] }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [total, setTotal]           = useState(0);
  const [users, setUsers]           = useState([]);
  const [filter, setFilter]         = useState("all");
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [updating, setUpdating]     = useState(null);
  const [assignWO, setAssignWO]     = useState(null);
  const [setCutoffWO, setCutoffWOState] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!token || !companyId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: 200 });
      // "escalated" is a client-side filter (escalationLevel > 0); load all for it
      if (filter !== "all" && filter !== "escalated") params.set("status", filter);

      const [woRes, usersRes] = await Promise.all([
        apiFetch("GET", `/api/company-portal/work-orders?${params}`, undefined, token),
        apiFetch("GET", `/api/company-portal/work-orders/users`, undefined, token),
      ]);
      setWorkOrders(woRes?.data ?? []);
      setTotal(woRes?.total ?? 0);
      setUsers(usersRes ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, companyId, filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (wo, status) => {
    setUpdating(wo.id);
    try {
      await apiFetch(
        "PUT",
        `/api/company-portal/work-orders/${wo.id}/status`,
        { status },
        token
      );
      setWorkOrders((prev) => prev.map((w) => w.id === wo.id ? { ...w, status } : w));
    } catch (e) {
      alert("Update failed: " + e.message);
    } finally {
      setUpdating(null);
    }
  };

  const displayed = search.trim()
    ? workOrders.filter((w) => {
        const q = search.toLowerCase();
        return (w.workOrderNumber || "").toLowerCase().includes(q)
          || (w.assetName || "").toLowerCase().includes(q)
          || (w.issueDescription || "").toLowerCase().includes(q)
          || (w.assignedToName || "").toLowerCase().includes(q);
      })
    : filter === "escalated"
      ? workOrders.filter((w) => Number(w.escalationLevel) > 0)
      : workOrders;

  const counts = { open: 0, in_progress: 0, completed: 0, closed: 0, escalated: 0 };
  for (const w of workOrders) {
    if (counts[w.status] !== undefined) counts[w.status]++;
    if (Number(w.escalationLevel) > 0) counts.escalated++;
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1300px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>🔧</div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Work Orders</h2>
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>Track and manage maintenance tasks and issue resolutions</p>
        </div>
        <button onClick={() => load()} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>↻ Refresh</button>
        <button onClick={() => setShowCreate(true)} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> New Work Order
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { key: "open",        label: "Open",        bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
          { key: "in_progress", label: "In Progress", bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
          { key: "completed",   label: "Completed",   bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
          { key: "closed",      label: "Closed",      bg: "#f8fafc", border: "#e2e8f0", color: "#475569" },
        ].map((s) => (
          <div key={s.key} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", padding: "16px 20px", cursor: "pointer" }} onClick={() => setFilter(s.key)}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{counts[s.key]}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
        {/* Tab bar + search */}
        <div style={{ borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 16px", overflowX: "auto" }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{ padding: "12px 16px", background: "none", border: "none", borderBottom: filter === t.key ? `2.5px solid ${t.color || "#2563eb"}` : "2.5px solid transparent", marginBottom: "-1px", fontSize: "13px", fontWeight: filter === t.key ? 700 : 500, color: filter === t.key ? (t.color || "#2563eb") : "#64748b", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
              {t.label}
              {t.key !== "all" && counts[t.key] > 0 && (
                <span style={{ background: t.color || "#2563eb", color: "#fff", borderRadius: "20px", fontSize: "10px", fontWeight: 800, padding: "1px 7px" }}>{counts[t.key]}</span>
              )}
            </button>
          ))}
          <div style={{ marginLeft: "auto", padding: "8px 0", flexShrink: 0 }}>
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", width: "200px", outline: "none" }} />
          </div>
        </div>

        {error && (
          <div style={{ padding: "14px 20px", background: "#fef2f2", color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>
            ⚠ {error}
            <button onClick={load} style={{ marginLeft: "10px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>Retry</button>
          </div>
        )}

        {loading && (
          <div style={{ padding: "50px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>⏳</div>Loading work orders…
          </div>
        )}

        {!loading && !error && displayed.length === 0 && (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "44px", marginBottom: "12px" }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "6px" }}>No work orders found</div>
            <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>
              {filter === "all" ? "No work orders yet." : `No ${filter.replace("_", " ")} work orders.`}
            </div>
            <button onClick={() => setShowCreate(true)} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
              + Create First Work Order
            </button>
          </div>
        )}

        {!loading && displayed.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["#", "WO Number", "Asset", "Description", "Priority", "Source", "Assigned To", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((wo, i) => {
                  const pri  = PRIORITY_STYLES[wo.priority]  || PRIORITY_STYLES.medium;
                  const stat = STATUS_STYLES[wo.status]      || STATUS_STYLES.open;
                  const src  = SOURCE_STYLES[wo.issueSource] || SOURCE_STYLES.manual;
                  const isUpd = updating === wo.id;
                  return (
                    <tr key={wo.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "12px 14px", color: "#94a3b8", fontWeight: 600, fontSize: "12px" }}>{i + 1}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a", fontFamily: "monospace" }}>{wo.workOrderNumber}</div>
                        {Number(wo.escalationLevel) > 0 && (
                          <span style={{ display: "inline-block", marginTop: "4px", background: "#f5f3ff", color: "#7c3aed", fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "10px", border: "1px solid #ddd6fe" }}>
                            ⏫ ESC LVL {wo.escalationLevel}
                          </span>
                        )}
                        {wo.expectedCompletionAt && (() => {
                          const cs = wo.cutoffStatus;
                          const style = cs ? CUTOFF_STYLES[cs] : null;
                          return (
                            <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                              {style && (
                                <span style={{ display: "inline-block", background: style.bg, color: style.color, fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "10px" }}>
                                  {style.label}
                                </span>
                              )}
                              <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                                📅 {new Date(wo.expectedCompletionAt).toLocaleString()}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{wo.assetName || <span style={{ color: "#94a3b8" }}>—</span>}</div>
                        {wo.location && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{wo.location}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", maxWidth: "260px" }}>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {wo.issueDescription || "—"}
                        </div>
                        {wo.flagId && (
                          <span style={{ marginTop: "4px", display: "inline-block", background: "#fdf4ff", color: "#7c3aed", fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "10px" }}>FROM FLAG</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: pri.bg, color: pri.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: pri.dot }} />{wo.priority}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {wo.assignedToName ? (
                          <span style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{wo.assignedToName}</span>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Unassigned</span>
                        )}
                        {wo.assignedNote && (
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", fontStyle: "italic" }} title={wo.assignedNote}>
                            {wo.assignedNote.length > 30 ? wo.assignedNote.slice(0, 30) + "…" : wo.assignedNote}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: stat.bg, color: stat.color, whiteSpace: "nowrap" }}>{stat.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {wo.createdAt ? new Date(wo.createdAt).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          {/* Assign button */}
                          <button disabled={isUpd} onClick={() => setAssignWO(wo)}
                            style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                            Assign
                          </button>
                          {/* Set Cutoff */}
                          {(wo.status === "open" || wo.status === "in_progress") && (
                            <button disabled={isUpd} onClick={() => setCutoffWOState(wo)}
                              style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                              ⏰ Cutoff
                            </button>
                          )}
                          {/* Progress */}
                          {wo.status === "open" && (
                            <button disabled={isUpd} onClick={() => updateStatus(wo, "in_progress")}
                              style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #a5b4fc", background: "#eef2ff", color: "#4338ca", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                              Start
                            </button>
                          )}
                          {(wo.status === "open" || wo.status === "in_progress") && (
                            <button disabled={isUpd} onClick={() => updateStatus(wo, "completed")}
                              style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                              Complete
                            </button>
                          )}
                          {wo.status === "completed" && (
                            <button disabled={isUpd} onClick={() => updateStatus(wo, "closed")}
                              style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                              Close
                            </button>
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

        {!loading && displayed.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", fontSize: "12px", color: "#94a3b8" }}>
            Showing {displayed.length} of {total} work order{total !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignWO && (
        <AssignModal
          wo={assignWO}
          users={users}
          companyPortalToken={token}
          onClose={() => setAssignWO(null)}
          onDone={() => { setAssignWO(null); load(); }}
        />
      )}

      {/* Set Cutoff Modal */}
      {setCutoffWO && (
        <SetCutoffModal
          wo={setCutoffWO}
          companyPortalToken={token}
          onClose={() => setCutoffWOState(null)}
          onDone={() => { setCutoffWOState(null); load(); }}
        />
      )}

      {/* Create WO Modal */}
      {showCreate && (
        <CreateWOModal
          assets={assets}
          users={users}
          companyPortalToken={token}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
