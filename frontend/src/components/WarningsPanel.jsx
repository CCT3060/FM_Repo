import { useState, useEffect, useCallback, useRef } from "react";

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

const SEV_STYLES = {
  critical: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626", border: "#fecaca" },
  high:     { bg: "#ffedd5", color: "#9a3412", dot: "#f97316", border: "#fed7aa" },
  medium:   { bg: "#fef9c3", color: "#854d0e", dot: "#eab308", border: "#fde68a" },
  low:      { bg: "#dcfce7", color: "#166534", dot: "#22c55e", border: "#bbf7d0" },
};
const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b" },
  in_progress: { bg: "#dbeafe", color: "#1d4ed8" },
  resolved:    { bg: "#dcfce7", color: "#166534" },
  closed:      { bg: "#f1f5f9", color: "#475569" },
  ignored:     { bg: "#f1f5f9", color: "#94a3b8" },
};
const SOURCE_LABELS = { checklist: "Checklist", logsheet: "Logsheet", manual: "Manual" };
const SEVERITY_SORT = { critical: 0, high: 1, medium: 2, low: 3 };
const FILTER_TABS = [
  { key: "open",        label: "Open",        color: "#dc2626" },
  { key: "all",         label: "All",         color: "#475569" },
  { key: "in_progress", label: "In Progress", color: "#1d4ed8" },
  { key: "resolved",    label: "Resolved",    color: "#16a34a" },
  { key: "critical",    label: "Critical ⚡", color: "#ea580c" },
];
const LIMIT = 50;

export default function WarningsPanel({ token, companyId: initialCompanyId, companies = [] }) {
  const [companyId,  setCompanyId]  = useState(initialCompanyId || null);
  const [flags,      setFlags]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [summary,    setSummary]    = useState(null);
  const [filter,     setFilter]     = useState("open");
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [updating,   setUpdating]   = useState(null);
  const [woModal,    setWoModal]    = useState(null);  // flag being converted → WO
  const [woUsers,    setWoUsers]    = useState([]);
  const [woForm,     setWoForm]     = useState({ priority: "high", assignedTo: "" });
  const [woSaving,   setWoSaving]   = useState(false);
  const [woErr,      setWoErr]      = useState(null);
  const prevCid = useRef(initialCompanyId);

  useEffect(() => {
    if (initialCompanyId && initialCompanyId !== prevCid.current) {
      prevCid.current = initialCompanyId;
      setCompanyId(initialCompanyId);
      setPage(0);
    }
  }, [initialCompanyId]);

  const loadFlags = useCallback(async () => {
    if (!token || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: page * LIMIT, companyId });
      if (filter === "critical") params.set("severity", "critical");
      else if (filter !== "all") params.set("status", filter);

      const [flagsRes, sumRes] = await Promise.all([
        apiFetch("GET", `/api/flags/admin/list?${params}`, undefined, token),
        apiFetch("GET", `/api/flags/admin/summary?companyId=${companyId}`, undefined, token).catch(() => null),
      ]);
      setFlags(flagsRes?.data ?? []);
      setTotal(flagsRes?.total ?? 0);
      if (sumRes) setSummary(sumRes);
    } catch (err) {
      setError(err.message || "Failed to load warnings");
    } finally {
      setLoading(false);
    }
  }, [token, companyId, filter, page]);

  useEffect(() => { loadFlags(); }, [loadFlags]);
  useEffect(() => { setPage(0); }, [filter, companyId]);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    try {
      await apiFetch("PUT", `/api/flags/admin/${id}/status`, { status }, token);
      setFlags((prev) => prev.map((f) => f.id === id ? { ...f, status } : f));
      if (status === "resolved" || status === "closed") {
        setSummary((s) => s ? { ...s, totals: { ...s.totals, open: Math.max(0, (s.totals?.open ?? 1) - 1) } } : s);
      }
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setUpdating(null);
    }
  };

  const openWoModal = async (flag) => {
    setWoErr(null);
    setWoForm({ priority: "high", assignedTo: "" });
    setWoModal(flag);
    try {
      const users = await apiFetch("GET", "/api/company-portal/work-orders/users", undefined, token);
      setWoUsers(users ?? []);
    } catch {
      setWoUsers([]);
    }
  };

  const submitWo = async () => {
    if (!woModal) return;
    setWoSaving(true);
    setWoErr(null);
    try {
      const body = {
        flagId: woModal.id,
        assetId: woModal.assetId || undefined,
        issueDescription: woModal.description || `Flag: ${woModal.severity} severity on ${woModal.assetName || "asset"}`,
        priority: woForm.priority,
      };
      if (woForm.assignedTo) body.assignedTo = Number(woForm.assignedTo);
      await apiFetch("POST", "/api/company-portal/work-orders", body, token);
      // update local flag to show WO badge
      setFlags((prev) =>
        prev.map((f) => f.id === woModal.id ? { ...f, workOrderCreated: true } : f)
      );
      setWoModal(null);
    } catch (e) {
      setWoErr(e.message);
    } finally {
      setWoSaving(false);
    }
  };

  const displayFlags = search.trim()
    ? flags.filter((f) => {
        const q = search.toLowerCase();
        return (f.assetName || "").toLowerCase().includes(q)
          || (f.description || "").toLowerCase().includes(q)
          || (f.severity || "").toLowerCase().includes(q)
          || (f.status || "").toLowerCase().includes(q)
          || (f.source || "").toLowerCase().includes(q)
          || (f.raisedByName || "").toLowerCase().includes(q);
      })
    : flags;

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const stats = [
    { label: "Total",     value: summary?.totals?.total     ?? "—", bg: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    { label: "Open",      value: summary?.totals?.open      ?? "—", bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
    { label: "Critical",  value: summary?.totals?.critical  ?? "—", bg: "#fff7ed", border: "#fed7aa", color: "#ea580c" },
    { label: "Escalated", value: summary?.totals?.escalated ?? "—", bg: "#fdf4ff", border: "#e9d5ff", color: "#7c3aed" },
  ];
  const companyName = companies.find((c) => c.id === companyId)?.companyName || "";

  return (
    <div style={{ padding: "24px", maxWidth: "1300px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>⚠️</div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Warnings &amp; Alerts</h2>
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
            Auto-raised flags when conditions are violated
            {companyName && <> — <strong style={{ color: "#0f172a" }}>{companyName}</strong></>}
          </p>
        </div>
        {companies.length > 1 && (
          <select
            value={companyId || ""}
            onChange={(e) => setCompanyId(Number(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff", cursor: "pointer" }}
          >
            <option value="">— Select company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        )}
        <button onClick={() => loadFlags()} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {!companyId && (
        <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: "10px", padding: "20px", color: "#854d0e", fontSize: "14px", fontWeight: 600 }}>
          ⚠ Please select a company from the Companies tab first, or use the picker above.
        </div>
      )}

      {companyId && (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", padding: "16px 20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                <div style={{ fontSize: "30px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Severity pills */}
          {(summary?.bySeverity?.length ?? 0) > 0 && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 20px", marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active by severity:</span>
              {[...summary.bySeverity]
                .sort((a, b) => (SEVERITY_SORT[a.severity] ?? 9) - (SEVERITY_SORT[b.severity] ?? 9))
                .map((s) => {
                  const st = SEV_STYLES[s.severity] || SEV_STYLES.medium;
                  return (
                    <span key={s.severity} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: st.dot }} />
                      {s.severity.charAt(0).toUpperCase() + s.severity.slice(1)} · {s.count}
                    </span>
                  );
                })}
            </div>
          )}

          {/* Card */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
            {/* Tabs + search */}
            <div style={{ borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 16px", overflowX: "auto" }}>
              {FILTER_TABS.map((f) => {
                const badge = f.key === "open" ? (summary?.totals?.open ?? 0) : f.key === "critical" ? (summary?.totals?.critical ?? 0) : 0;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    style={{ padding: "12px 16px", background: "none", border: "none", borderBottom: filter === f.key ? `2.5px solid ${f.color}` : "2.5px solid transparent", marginBottom: "-1px", fontSize: "13px", fontWeight: filter === f.key ? 700 : 500, color: filter === f.key ? f.color : "#64748b", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
                    {f.label}
                    {badge > 0 && <span style={{ background: f.color, color: "#fff", borderRadius: "20px", fontSize: "10px", fontWeight: 800, padding: "1px 7px" }}>{badge}</span>}
                  </button>
                );
              })}
              <div style={{ marginLeft: "auto", padding: "8px 0", flexShrink: 0 }}>
                <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", width: "200px", outline: "none" }} />
              </div>
            </div>

            {error && (
              <div style={{ padding: "14px 20px", background: "#fef2f2", color: "#dc2626", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                ⚠ {error}
                <button onClick={() => loadFlags()} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>Retry</button>
              </div>
            )}

            {loading && (
              <div style={{ padding: "50px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>⏳</div>Loading warnings…
              </div>
            )}

            {!loading && !error && displayFlags.length === 0 && (
              <div style={{ padding: "60px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "44px", marginBottom: "12px" }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a", marginBottom: "6px" }}>No warnings found</div>
                <div style={{ color: "#64748b", fontSize: "13px" }}>{filter === "open" ? "All flags have been addressed." : "No flags match this filter."}</div>
              </div>
            )}

            {!loading && displayFlags.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#","Severity","Asset","Description","Source","Raised By","Status","Raised At","Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayFlags.map((f, i) => {
                      const sev  = SEV_STYLES[f.severity]  || SEV_STYLES.medium;
                      const stat = STATUS_STYLES[f.status] || STATUS_STYLES.open;
                      const isUpd = updating === f.id;
                      return (
                        <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ padding: "12px 14px", color: "#94a3b8", fontWeight: 600, fontSize: "12px" }}>{page * LIMIT + i + 1}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: sev.bg, color: sev.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: sev.dot }} />{f.severity || "medium"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{f.assetName || "—"}</div>
                            {(f.building || f.floor) && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{[f.building, f.floor].filter(Boolean).join(" · ")}</div>}
                          </td>
                          <td style={{ padding: "12px 14px", maxWidth: "240px" }}>
                            <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.description || "—"}</div>
                            {f.escalated && <span style={{ marginTop: "4px", display: "inline-block", background: "#fdf4ff", color: "#7c3aed", fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "10px" }}>ESCALATED</span>}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: f.source === "checklist" ? "#dbeafe" : f.source === "logsheet" ? "#dcfce7" : "#f1f5f9", color: f.source === "checklist" ? "#1d4ed8" : f.source === "logsheet" ? "#166534" : "#475569" }}>
                              {SOURCE_LABELS[f.source] || f.source || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: "12px", color: "#64748b" }}>{f.raisedByName || "System"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: stat.bg, color: stat.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                              {(f.status || "open").replace("_", " ")}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>{f.createdAt ? new Date(f.createdAt).toLocaleString() : "—"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {f.status === "open" && (
                                <button disabled={isUpd} onClick={() => updateStatus(f.id, "in_progress")}
                                  style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                                  Acknowledge
                                </button>
                              )}
                              {(f.status === "open" || f.status === "in_progress") && (
                                <button disabled={isUpd} onClick={() => updateStatus(f.id, "resolved")}
                                  style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                                  Resolve
                                </button>
                              )}
                              {f.status === "resolved" && <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: 700 }}>✓ Resolved</span>}
                              {/* Work Order button — show whenever flag is open/in-progress and no WO has been
                                  manually created via this panel. Auto-created WOs (workOrderId) do NOT hide the button. */}
                              {(f.status === "open" || f.status === "in_progress") && !f.workOrderCreated && (
                                <button disabled={isUpd} onClick={() => openWoModal(f)}
                                  style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #fde68a", background: "#fefce8", color: "#92400e", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: isUpd ? 0.5 : 1, whiteSpace: "nowrap" }}>
                                  🔧 Create Work Order
                                </button>
                              )}
                              {f.workOrderCreated && (
                                <span style={{ padding: "4px 9px", borderRadius: "6px", background: "#f0fdf4", color: "#166534", fontSize: "11px", fontWeight: 700, border: "1px solid #86efac" }}>✓ WO Created</span>
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

            {!loading && total > LIMIT && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total} flags</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                    style={{ padding: "5px 14px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: page === 0 ? "#cbd5e1" : "#475569", cursor: page === 0 ? "default" : "pointer", fontWeight: 600, fontSize: "12px" }}>← Prev</button>
                  <span style={{ padding: "5px 12px", fontSize: "12px", color: "#475569", fontWeight: 600 }}>{page + 1} / {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
                    style={{ padding: "5px 14px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: page >= totalPages - 1 ? "#cbd5e1" : "#475569", cursor: page >= totalPages - 1 ? "default" : "pointer", fontWeight: 600, fontSize: "12px" }}>Next →</button>
                </div>
              </div>
            )}
            {!loading && displayFlags.length > 0 && total <= LIMIT && (
              <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", fontSize: "12px", color: "#94a3b8" }}>Showing all {total} flag{total !== 1 ? "s" : ""}</div>
            )}
          </div>
        </>
      )}

      {/* ── Create WO Modal ───────────────────────────────────── */}
      {woModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "500px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>Convert Warning → Work Order</h3>
            <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>
              Asset: <strong>{woModal.assetName || "—"}</strong> · Severity: <strong style={{ textTransform: "capitalize" }}>{woModal.severity}</strong>
            </p>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
              {woModal.description || "No description"}
            </div>

            {woErr && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{woErr}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Priority</label>
                <select value={woForm.priority} onChange={(e) => setWoForm((f) => ({ ...f, priority: e.target.value }))}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                  {["critical","high","medium","low"].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Assign To (optional)</label>
                <select value={woForm.assignedTo} onChange={(e) => setWoForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                  <option value="">— Assign later —</option>
                  {woUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.role}{u.designation ? ` · ${u.designation}` : ""})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "22px" }}>
              <button onClick={() => setWoModal(null)} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Cancel</button>
              <button onClick={submitWo} disabled={woSaving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#d97706", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: woSaving ? "not-allowed" : "pointer", opacity: woSaving ? 0.7 : 1 }}>
                {woSaving ? "Creating…" : "🔧 Create Work Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
