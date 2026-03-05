import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/* ─── CSV / Excel export ──────────────────────────────────────── */
function exportToCSV(rows, type, detail) {
  // Single submission detail export
  if (detail) {
    const answers = Array.isArray(detail.answers) ? detail.answers : [];
    let allAnswers = answers;
    if (answers.length === 0 && detail.data) {
      try {
        const raw = typeof detail.data === "string" ? JSON.parse(detail.data) : detail.data;
        if (Array.isArray(raw)) allAnswers = raw;
        else if (typeof raw === "object")
          allAnswers = Object.entries(raw).map(([k, v]) => ({ questionText: k, answerValue: String(v) }));
      } catch { /* ignore */ }
    }
    const csvRows = [
      ["Template", detail.templateName || ""],
      ["Submitted By", detail.submittedBy || "—"],
      ["Asset", detail.assetName || "—"],
      ["Submitted At", detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "—"],
      ["Status", detail.status || ""],
      [],
      ["Question", "Answer"],
      ...allAnswers.map((a) => [
        a.questionText || "",
        a.answerValue || a.answer || (a.answerJson ? JSON.stringify(a.answerJson) : "") || "",
      ]),
    ];
    downloadCSV(csvRows, `${type}-submission-${detail.id}`);
    return;
  }
  // Full list export
  const baseHeaders = ["ID", "Template", "Submitted By", "Asset", "Submitted At", "Status"];
  const logHeaders  = ["ID", "Template", "Submitted By", "Asset", "Period", "Shift", "Submitted At", "Status"];
  const headers = type === "checklists" ? baseHeaders : logHeaders;
  const dataRows = rows.map((r) =>
    type === "checklists"
      ? [r.id, r.templateName || "", r.submittedBy || "", r.assetName || "",
         r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "", r.status || ""]
      : [r.id, r.templateName || "", r.submittedBy || "", r.assetName || "",
         r.month && r.year ? `Month ${r.month} / ${r.year}` : "", r.shift || "",
         r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "", r.status || ""]
  );
  downloadCSV([headers, ...dataRows], `${type}-report-${new Date().toISOString().slice(0, 10)}`);
}

function downloadCSV(rows, filename) {
  const csv = rows.map((row) =>
    row.map((cell) => {
      const s = String(cell ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
  const blob = new Blob(["\uFEFF" + csv, { type: "text/csv;charset=utf-8;" }]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ─── helpers ─────────────────────────────────────────────────── */
function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function StatusBadge({ status }) {
  const map = {
    submitted: { bg: "#eff6ff", col: "#2563eb" },
    approved:  { bg: "#f0fdf4", col: "#16a34a" },
    pending:   { bg: "#fffbeb", col: "#d97706" },
    rejected:  { bg: "#fef2f2", col: "#dc2626" },
  };
  const s = map[(status || "").toLowerCase()] || { bg: "#f1f5f9", col: "#64748b" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
      background: s.bg, color: s.col, textTransform: "capitalize" }}>
      {status || "—"}
    </span>
  );
}

/* ─── Detail Modal ─────────────────────────────────────────────── */
function DetailModal({ submission, type, onClose }) {
  if (!submission) return null;

  const answers = Array.isArray(submission.answers) ? submission.answers : [];

  let dataRows = [];
  if (answers.length === 0 && submission.data) {
    try {
      const raw = typeof submission.data === "string" ? JSON.parse(submission.data) : submission.data;
      if (Array.isArray(raw)) {
        dataRows = raw;
      } else if (typeof raw === "object") {
        dataRows = Object.entries(raw).map(([k, v]) => ({ questionText: k, answerValue: String(v) }));
      }
    } catch { /* ignore */ }
  }

  const allAnswers = answers.length > 0 ? answers : dataRows;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "680px", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex",
          justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>{submission.templateName}</div>
            <div style={{ color: "#64748b", fontSize: "13px", marginTop: "3px" }}>
              {type === "checklists" ? "Checklist" : "Logsheet"} Submission #{submission.id}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => exportToCSV([], type, submission)}
              style={{ padding: "7px 14px", background: "#f0fdf4", color: "#16a34a",
                border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px",
                fontWeight: 600, cursor: "pointer" }}>
              ⬇ Export
            </button>
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px",
              width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Meta info */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "grid",
          gridTemplateColumns: "1fr 1fr", gap: "10px 24px", flexShrink: 0 }}>
          {[
            { label: "Submitted By", value: submission.submittedBy || "—" },
            { label: "Asset",        value: submission.assetName  || "—" },
            { label: "Submitted At", value: fmt(submission.submittedAt) },
            { label: "Status",       value: <StatusBadge status={submission.status} /> },
            ...(type === "logsheets" && submission.month ? [
              { label: "Period", value: `Month ${submission.month} / ${submission.year}` },
              { label: "Shift",  value: submission.shift || "—" },
            ] : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "14px", color: "#1e293b", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Answers */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            Responses ({allAnswers.length})
          </div>
          {allAnswers.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>No recorded answers for this submission.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {allAnswers.map((a, i) => {
                const val = a.answerValue || a.answer ||
                  (a.answerJson ? (typeof a.answerJson === "string" ? a.answerJson : JSON.stringify(a.answerJson)) : null);
                return (
                  <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: "10px", padding: "12px 16px", display: "flex", gap: "16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8",
                      minWidth: "28px", paddingTop: "1px" }}>Q{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569",
                        marginBottom: "4px" }}>{a.questionText}</div>
                      <div style={{ fontSize: "14px", color: val ? "#0f172a" : "#94a3b8",
                        fontWeight: val ? 600 : 400 }}>
                        {val || "No answer provided"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Period Tabs ──────────────────────────────────────────────── */
const PERIODS = [
  { key: "all",    label: "All Time" },
  { key: "week",   label: "This Week" },
  { key: "month",  label: "This Month" },
  { key: "year",   label: "This Year" },
  { key: "custom", label: "Custom Range" },
];

/* ─── Main SubmissionsPanel ────────────────────────────────────── */
export default function SubmissionsPanel({ token: tokenProp, type = "checklists", companyId }) {
  const token = tokenProp || localStorage.getItem("companyAuthToken") || localStorage.getItem("authToken");

  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [detail, setDetail]     = useState(null);
  const [search, setSearch]     = useState("");
  const [period, setPeriod]     = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const buildUrl = useCallback(() => {
    const base = `${API_BASE}/api/template-assignments/submissions/${type}`;
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (period !== "all" && period !== "custom") params.set("period", period);
    if (period === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo)   params.set("dateTo", dateTo);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [type, period, dateFrom, dateTo, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(), {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, buildUrl]);

  useEffect(() => {
    if (period === "custom" && (dateFrom || dateTo) && !(dateFrom && dateTo)) return;
    load();
  }, [load, period, dateFrom, dateTo]);

  const openDetail = async (id) => {
    try {
      const qs = companyId ? `?companyId=${companyId}` : "";
      const res = await fetch(
        `${API_BASE}/api/template-assignments/submissions/${type}/${id}${qs}`,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (e) {
      alert(e.message || "Failed to load details");
    }
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.templateName?.toLowerCase().includes(q) ||
      r.assetName?.toLowerCase().includes(q) ||
      r.submittedBy?.toLowerCase().includes(q)
    );
  });

  const label = type === "checklists" ? "Checklist Submissions" : "Logsheet Entries";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {detail && <DetailModal submission={detail} type={type} onClose={() => setDetail(null)} />}

      {/* Period filter card */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "10px",
          textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter by Period</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {PERIODS.map(({ key, label: pl }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: "7px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", border: period === key ? "none" : "1px solid #e2e8f0",
                background: period === key ? "#2563eb" : "#f8fafc",
                color: period === key ? "#fff" : "#475569" }}>
              {pl}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginTop: "12px", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px",
                  fontSize: "13px", outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px",
                  fontSize: "13px", outline: "none" }} />
            </div>
            <button onClick={load} style={{ padding: "7px 16px", background: "#2563eb",
              color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px",
              fontWeight: 600, cursor: "pointer" }}>Apply</button>
          </div>
        )}
      </div>

      {/* Main panel */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {/* Panel header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{label}</span>
            <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: "20px",
              padding: "2px 10px", fontSize: "12px", fontWeight: 700 }}>
              {filtered.length}{filtered.length !== rows.length ? ` / ${rows.length}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search template / asset / user…"
              style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: "8px",
                fontSize: "13px", outline: "none", width: "220px" }} />
            <button onClick={load}
              style={{ padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
                background: "#f8fafc", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#475569" }}>
              ↻ Refresh
            </button>
            <button onClick={() => exportToCSV(filtered, type)}
              style={{ padding: "7px 14px", border: "1px solid #bbf7d0", borderRadius: "8px",
                background: "#f0fdf4", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                color: "#16a34a", display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export Excel
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#dc2626" }}>⚠ {error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
            {rows.length === 0 ? `No ${label.toLowerCase()} yet.` : "No results match your search."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr>
                  {(type === "checklists"
                    ? ["#", "Template", "Submitted By", "Asset", "Submitted At", "Status", ""]
                    : ["#", "Template", "Submitted By", "Asset", "Period", "Shift", "Submitted At", "Status", ""]
                  ).map((h) => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", background: "#f8fafc",
                      color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase",
                      letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "11px 16px", color: "#94a3b8", fontSize: "12px", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: "11px 16px", fontWeight: 600, color: "#0f172a" }}>{r.templateName}</td>
                    <td style={{ padding: "11px 16px", color: "#475569" }}>
                      {r.submittedBy ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "26px", height: "26px", borderRadius: "50%",
                            background: "#eff6ff", color: "#2563eb", fontSize: "11px", fontWeight: 700,
                            display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {r.submittedBy.charAt(0).toUpperCase()}
                          </span>
                          {r.submittedBy}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: "#475569" }}>{r.assetName || "—"}</td>
                    {type === "logsheets" && (
                      <>
                        <td style={{ padding: "11px 16px", color: "#475569", whiteSpace: "nowrap" }}>
                          {r.month && r.year ? `Month ${r.month} / ${r.year}` : "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "#64748b" }}>{r.shift || "—"}</td>
                      </>
                    )}
                    <td style={{ padding: "11px 16px", color: "#64748b", whiteSpace: "nowrap" }}>{fmt(r.submittedAt)}</td>
                    <td style={{ padding: "11px 16px" }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: "11px 16px" }}>
                      <button onClick={() => openDetail(r.id)}
                        style={{ padding: "5px 14px", background: "#eff6ff", color: "#2563eb",
                          border: "none", borderRadius: "7px", fontSize: "13px",
                          fontWeight: 600, cursor: "pointer" }}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", display: "flex",
            gap: "24px", fontSize: "12px", color: "#94a3b8", background: "#f8fafc", flexWrap: "wrap" }}>
            <span>Total: <strong style={{ color: "#475569" }}>{filtered.length}</strong></span>
            <span>Unique technicians: <strong style={{ color: "#475569" }}>
              {new Set(filtered.map(r => r.submittedBy).filter(Boolean)).size || "—"}
            </strong></span>
            {type === "checklists" && (
              <span>Submitted: <strong style={{ color: "#2563eb" }}>
                {filtered.filter((r) => (r.status || "").toLowerCase() === "submitted").length}
              </strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
