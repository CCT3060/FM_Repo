import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/* ─── CSV export ──────────────────────────────────────────────── */
function exportToCSV(rows, type, detail) {
  if (detail) {
    const allAnswers = getAllAnswers(detail);
    const csvRows = [
      ["Template", detail.templateName || ""],
      ["Submitted By", detail.submittedBy || "—"],
      ["Asset", detail.assetName || "—"],
      ["Submitted At", detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "—"],
      ["Status", detail.status || ""],
      ...(type === "logsheets" && detail.month
        ? [["Period", `Month ${detail.month} / ${detail.year}`], ["Shift", detail.shift || "—"]]
        : []),
      [],
      ["Question", "Answer"],
      ...allAnswers.map((a) => [a.questionText || "", a.answerValue || a.answer || ""]),
    ];
    downloadCSV(csvRows, `${type}-submission-${detail.id}`);
    return;
  }
  const baseH = ["#", "Template", "Submitted By", "Asset", "Date", "Status"];
  const logH  = ["#", "Template", "Layout", "Submitted By", "Asset", "Period", "Shift", "Date", "Status"];
  const headers = type === "checklists" ? baseH : logH;
  const dataRows = rows.map((r, i) =>
    type === "checklists"
      ? [i + 1, r.templateName, r.submittedBy || "", r.assetName || "",
         r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "", r.status || ""]
      : [i + 1, r.templateName, r.layoutType || "standard", r.submittedBy || "", r.assetName || "",
         r.month && r.year ? `${MONTH_NAMES[r.month - 1]} ${r.year}` : "",
         r.shift || "", r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "", r.status || ""]
  );
  downloadCSV([headers, ...dataRows], `${type}-report-${new Date().toISOString().slice(0, 10)}`);
}

function getAllAnswers(detail) {
  if (Array.isArray(detail.answers) && detail.answers.length) return detail.answers;
  if (detail.tabularData) {
    const d = typeof detail.tabularData === "string" ? tryParse(detail.tabularData) : detail.tabularData;
    if (d && typeof d === "object") {
      return Object.entries(d).flatMap(([row, cols]) =>
        Object.entries(cols || {}).map(([col, val]) => ({
          questionText: `${row} / ${col}`,
          answerValue: String(val ?? ""),
        }))
      );
    }
  }
  if (detail.data) {
    const d = typeof detail.data === "string" ? tryParse(detail.data) : detail.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object")
      return Object.entries(d).map(([k, v]) => ({ questionText: k, answerValue: String(v) }));
  }
  return [];
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function downloadCSV(rows, filename) {
  const csv = rows.map((row) =>
    row.map((cell) => {
      const s = String(cell ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

const thStyle = {
  padding: "8px 10px", textAlign: "left", background: "#f8fafc", color: "#64748b",
  fontWeight: 600, fontSize: "11px", textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
};
const tdStyle = { padding: "8px 10px", fontSize: "12.5px", color: "#0f172a", border: "1px solid #f1f5f9" };

/* ─── Detail Modal ─────────────────────────────────────────────── */
function DetailModal({ submission, type, onClose }) {
  if (!submission) return null;
  const allAnswers = getAllAnswers(submission);
  const isTabular  = submission.layoutType === "tabular";

  // Tabular grid display — handles ALL possible stored formats safely
  const TabularView = () => {
    // Always parse & validate first
    let raw = submission.tabularData;
    if (!raw && submission.data) raw = submission.data;
    if (!raw) return <p style={{ color: "#94a3b8", fontSize: "14px" }}>No tabular data recorded.</p>;
    const d = typeof raw === "string" ? tryParse(raw) : raw;
    if (!d || typeof d !== "object") return <p style={{ color: "#94a3b8", fontSize: "14px" }}>No tabular data recorded.</p>;

    // Safe value converter — NEVER returns a plain object/array as React child
    const safeVal = (v) => {
      if (v === null || v === undefined) return "—";
      if (typeof v !== "object") return String(v);
      // {id, label} shape → use label
      if (v.label !== undefined) return String(v.label);
      if (v.id   !== undefined) return String(v.id);
      return JSON.stringify(v);
    };
    const safeLabel = (x) => (x && typeof x === "object") ? String(x.label ?? x.id ?? JSON.stringify(x)) : String(x ?? "");
    const safeKey   = (x) => (x && typeof x === "object") ? (x.id ?? String(x)) : String(x ?? "");

    // ── Format 1: { rows:[...], columns:[...], cells:{} } ──────────────────
    if (Array.isArray(d.rows) && Array.isArray(d.columns)) {
      const { rows, columns, cells = {} } = d;
      return (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={thStyle}>Row</th>
                {columns.map((c, i) => <th key={i} style={thStyle}>{safeLabel(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{safeLabel(row)}</td>
                  {columns.map((col, ci) => (
                    <td key={ci} style={tdStyle}>
                      {safeVal(cells[safeKey(row)]?.[safeKey(col)] ?? cells[ri]?.[ci])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ── Format 2: { readings:{rowId:{groupId__colId:val}}, summary:{}, footer:{} } ──
    if (d.readings && typeof d.readings === "object") {
      const readingEntries = Object.entries(d.readings);
      if (readingEntries.length === 0) {
        return <p style={{ color: "#94a3b8", fontSize: "14px" }}>No readings recorded.</p>;
      }
      // Collect all column keys across all rows
      const allColKeys = [...new Set(
        readingEntries.flatMap(([, cols]) => Object.keys(cols || {}))
      )].sort();
      return (
        <div>
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e40af", marginBottom: "10px" }}>Readings</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Row</th>
                  {allColKeys.map((k) => (
                    <th key={k} style={thStyle}>{String(k).replace(/__/g, " / ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readingEntries.map(([rowId, cols]) => (
                  <tr key={rowId}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{String(rowId)}</td>
                    {allColKeys.map((k) => (
                      <td key={k} style={tdStyle}>{safeVal(cols?.[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.summary && Object.keys(d.summary).length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e40af", marginBottom: "8px" }}>Summary</div>
              {Object.entries(d.summary).map(([rowId, fields]) => (
                <div key={rowId} style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#64748b", fontSize: "12px", minWidth: "80px" }}>{String(rowId)}:</span>
                  {Object.entries(fields || {}).map(([fId, fVal]) => (
                    <span key={fId} style={{ fontSize: "12px", color: "#0f172a" }}>{String(fId)} = {safeVal(fVal)}</span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {d.footer && Object.keys(d.footer).length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e40af", marginBottom: "8px" }}>Footer</div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {Object.entries(d.footer).map(([k, v]) => (
                  <div key={k} style={{ fontSize: "12px" }}>
                    <span style={{ color: "#64748b", fontWeight: 600 }}>{String(k)}: </span>
                    <span style={{ color: "#0f172a" }}>{safeVal(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Format 3: flat key-value / unknown structure ────────────────────────
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {Object.entries(d).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: "12px", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontWeight: 600, color: "#64748b", minWidth: "120px", fontSize: "12px" }}>{String(k)}</span>
            <span style={{ fontSize: "13px", color: "#0f172a" }}>{safeVal(v)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px",
        width: "100%", maxWidth: "760px", maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex",
          justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>{submission.templateName}</div>
            <div style={{ color: "#64748b", fontSize: "13px", marginTop: "3px" }}>
              {type === "checklists" ? "Checklist" : `Logsheet (${submission.layoutType || "standard"})`}
              {" · "}Submission #{submission.id}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => exportToCSV([], type, submission)}
              style={{ padding: "7px 14px", background: "#f0fdf4", color: "#16a34a",
                border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              ⬇ Export CSV
            </button>
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px",
              width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Meta grid */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 24px", flexShrink: 0 }}>
          {[
            { label: "Submitted By", value: submission.submittedBy || "—" },
            { label: "Asset",        value: submission.assetName  || "—" },
            { label: "Date / Time",  value: fmt(submission.submittedAt) },
            { label: "Status",       value: <StatusBadge status={submission.status} /> },
            ...(type === "logsheets" ? [
              { label: "Period", value: submission.month
                ? `${MONTH_NAMES[(submission.month || 1) - 1]} ${submission.year}`
                : "—" },
              { label: "Shift", value: submission.shift || "—" },
            ] : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "14px", color: "#1e293b", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Header values (logsheet) */}
        {type === "logsheets" && submission.headerValues &&
          Object.keys(submission.headerValues).length > 0 && (
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #e2e8f0",
            display: "flex", flexWrap: "wrap", gap: "16px" }}>
            {Object.entries(submission.headerValues).map(([k, v]) => (
              <div key={k} style={{ fontSize: "12px" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600, textTransform: "capitalize" }}>{k}: </span>
                <span style={{ color: "#0f172a", fontWeight: 600 }}>{v || "—"}</span>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {(isTabular || submission.tabularData || submission.data) ? (
            <TabularView />
          ) : allAnswers.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>No recorded answers for this submission.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {allAnswers.map((a, i) => {
                const val = a.answerValue || a.answer || "";
                return (
                  <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: "9px", padding: "11px 14px", display: "flex", gap: "14px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8",
                      minWidth: "28px", paddingTop: "1px" }}>
                      {a.dateColumn ? `D${a.dateColumn}` : `Q${i + 1}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                        {a.questionText}
                      </div>
                      <div style={{ fontSize: "14px", color: val ? "#0f172a" : "#94a3b8", fontWeight: val ? 600 : 400 }}>
                        {val || "No answer"}
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

/* ─── Chip ─────────────────────────────────────────────────────── */
function Chip({ label, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px",
      borderRadius: "20px", background: "#eff6ff", color: "#2563eb", fontSize: "12px", fontWeight: 600 }}>
      {label}
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer",
        color: "#2563eb", padding: "0 0 0 2px", fontSize: "14px", lineHeight: 1,
        display: "flex", alignItems: "center" }}>
        ×
      </button>
    </span>
  );
}

/* ─── Constants ────────────────────────────────────────────────── */
const PERIODS = [
  { key: "all",    label: "All Time" },
  { key: "week",   label: "This Week" },
  { key: "month",  label: "This Month" },
  { key: "year",   label: "This Year" },
  { key: "custom", label: "Custom Range" },
];

const STATUS_OPTIONS = [
  { value: "",          label: "All Statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "pending",   label: "Pending" },
  { value: "approved",  label: "Approved" },
  { value: "rejected",  label: "Rejected" },
];

/* ─── Main SubmissionsPanel ────────────────────────────────────── */
export default function SubmissionsPanel({ token: tokenProp, type = "checklists", companyId }) {
  const token = tokenProp
    || sessionStorage.getItem("cp_token")
    || localStorage.getItem("companyAuthToken")
    || localStorage.getItem("authToken");

  /* ── Data ── */
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [detail,  setDetail]  = useState(null);

  /* ── Filter meta (loaded when advanced panel is opened) ── */
  const [filterMeta, setFilterMeta] = useState({ templates: [], employees: [], assets: [], shifts: [] });

  /* ── Period ── */
  const [period,   setPeriod]   = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  /* ── Advanced filters ── */
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fTemplate, setFTemplate] = useState("");
  const [fAsset,    setFAsset]    = useState("");
  const [fEmployee, setFEmployee] = useState("");
  const [fStatus,   setFStatus]   = useState("");
  const [fShift,    setFShift]    = useState("");
  const [fSearch,   setFSearch]   = useState("");

  /* ── Sorting ── */
  const [sortField, setSortField] = useState("submittedAt");
  const [sortDir,   setSortDir]   = useState("desc");

  /* ── Load filter meta whenever advanced panel is opened ── */
  useEffect(() => {
    if (!companyId || !showAdvanced) return;
    const qs = `?companyId=${companyId}`;
    fetch(`${API_BASE}/api/template-assignments/submissions/filters/${type}${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setFilterMeta(d); })
      .catch(() => {});
  }, [companyId, token, type, showAdvanced]);

  /* ── Build URL ── */
  const buildUrl = useCallback(() => {
    const base = `${API_BASE}/api/template-assignments/submissions/${type}`;
    const p = new URLSearchParams();
    if (companyId)   p.set("companyId",   companyId);
    if (period !== "all" && period !== "custom") p.set("period", period);
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
    }
    if (fTemplate) p.set("templateId",  fTemplate);
    if (fAsset)    p.set("assetId",     fAsset);
    if (fEmployee) p.set("submittedBy", fEmployee);
    if (fStatus)   p.set("status",      fStatus);
    if (fShift)    p.set("shift",       fShift);
    if (fSearch)   p.set("search",      fSearch);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  }, [type, period, dateFrom, dateTo, fTemplate, fAsset, fEmployee, fStatus, fShift, fSearch, companyId]);

  /* ── Load submissions ── */
  const load = useCallback(async () => {
    setLoading(true); setError(null);
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

  const firstLoad = useRef(true);
  useEffect(() => {
    if (period === "custom" && !(dateFrom && dateTo)) {
      if (firstLoad.current) { firstLoad.current = false; load(); }
      return;
    }
    firstLoad.current = false;
    load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Detail modal ── */
  const openDetail = async (id) => {
    try {
      const qs = companyId ? `?companyId=${companyId}` : "";
      const res = await fetch(
        `${API_BASE}/api/template-assignments/submissions/${type}/${id}${qs}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (e) { alert(e.message || "Failed to load details"); }
  };

  /* ── Sorting ── */
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    const cmp = typeof av === "string" ? av.localeCompare(bv) : (av > bv ? 1 : av < bv ? -1 : 0);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ color: "#cbd5e1", marginLeft: "4px" }}>↕</span>;
    return <span style={{ color: "#2563eb", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  /* ── Active filter chips ── */
  const activeFilters = [
    fTemplate && {
      key: "template",
      label: `Template: ${filterMeta.templates.find((t) => String(t.id) === fTemplate)?.templateName || fTemplate}`,
      clear: () => setFTemplate(""),
    },
    fAsset && {
      key: "asset",
      label: `Asset: ${filterMeta.assets.find((a) => String(a.id) === fAsset)?.assetName || fAsset}`,
      clear: () => setFAsset(""),
    },
    fEmployee && { key: "employee", label: `Employee: ${fEmployee}`, clear: () => setFEmployee("") },
    fStatus   && { key: "status",   label: `Status: ${fStatus}`,     clear: () => setFStatus("") },
    fShift    && { key: "shift",    label: `Shift: ${fShift}`,       clear: () => setFShift("") },
    fSearch   && { key: "search",   label: `Search: "${fSearch}"`,   clear: () => setFSearch("") },
  ].filter(Boolean);

  const clearAllFilters = () => {
    setFTemplate(""); setFAsset(""); setFEmployee("");
    setFStatus(""); setFShift(""); setFSearch("");
    setPeriod("all"); setDateFrom(""); setDateTo("");
  };

  const panelLabel = type === "checklists" ? "Checklist Submissions" : "Logsheet Entries";

  const inputStyle = {
    padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px",
    fontSize: "13px", outline: "none", background: "#fff", width: "100%", boxSizing: "border-box",
  };

  /* ── Column config ── */
  const cols = type === "checklists"
    ? [
        { key: "#",            label: "#",            sortable: false },
        { key: "templateName", label: "Template",     sortable: true },
        { key: "submittedBy",  label: "Submitted By", sortable: true },
        { key: "assetName",    label: "Asset",        sortable: true },
        { key: "submittedAt",  label: "Submitted At", sortable: true },
        { key: "status",       label: "Status",       sortable: true },
        { key: "action",       label: "",             sortable: false },
      ]
    : [
        { key: "#",            label: "#",            sortable: false },
        { key: "templateName", label: "Template",     sortable: true },
        { key: "layoutType",   label: "Type",         sortable: true },
        { key: "submittedBy",  label: "Submitted By", sortable: true },
        { key: "assetName",    label: "Asset",        sortable: true },
        { key: "period",       label: "Period",       sortable: false },
        { key: "shift",        label: "Shift",        sortable: true },
        { key: "submittedAt",  label: "Date",         sortable: true },
        { key: "status",       label: "Status",       sortable: true },
        { key: "action",       label: "",             sortable: false },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {detail && <DetailModal submission={detail} type={type} onClose={() => setDetail(null)} />}

      {/* ── Period + Advanced Filters ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>

        {/* Period tabs */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {PERIODS.map(({ key, label: pl }) => (
              <button key={key} onClick={() => setPeriod(key)}
                style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", border: period === key ? "none" : "1px solid #e2e8f0",
                  background: period === key ? "#2563eb" : "#f8fafc",
                  color: period === key ? "#fff" : "#475569" }}>
                {pl}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdvanced((v) => !v)}
            style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", border: `1px solid ${showAdvanced ? "#2563eb" : "#e2e8f0"}`,
              background: showAdvanced ? "#eff6ff" : "#f8fafc",
              color: showAdvanced ? "#2563eb" : "#64748b",
              display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Advanced Filters
            {activeFilters.length > 0 && (
              <span style={{ background: "#2563eb", color: "#fff", borderRadius: "50%",
                width: "18px", height: "18px", fontSize: "11px", fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {activeFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* Custom date range */}
        {period === "custom" && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex",
            gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 160px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>From Date</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>To Date</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={load}
              style={{ padding: "7px 18px", background: "#2563eb", color: "#fff", border: "none",
                borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </div>
        )}

        {/* Advanced filter panel */}
        {showAdvanced && (
          <div style={{ padding: "16px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "12px" }}>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>Template</label>
              <select value={fTemplate} onChange={(e) => setFTemplate(e.target.value)} style={inputStyle}>
                <option value="">All Templates</option>
                {filterMeta.templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.templateName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>Asset</label>
              <select value={fAsset} onChange={(e) => setFAsset(e.target.value)} style={inputStyle}>
                <option value="">All Assets</option>
                {filterMeta.assets.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.assetName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>Employee</label>
              <select value={fEmployee} onChange={(e) => setFEmployee(e.target.value)} style={inputStyle}>
                <option value="">All Employees</option>
                {filterMeta.employees.map((e) => (
                  <option key={e.id} value={e.fullName}>{e.fullName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>Status</label>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={inputStyle}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {type === "logsheets" && (
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                  display: "block", marginBottom: "4px" }}>Shift</label>
                <select value={fShift} onChange={(e) => setFShift(e.target.value)} style={inputStyle}>
                  <option value="">All Shifts</option>
                  {(filterMeta.shifts.length > 0
                    ? filterMeta.shifts
                    : ["1", "2", "3", "Morning", "Afternoon", "Night"]
                  ).map((s) => (
                    <option key={String(s)} value={String(s)}>{String(s)}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
                display: "block", marginBottom: "4px" }}>Search</label>
              <input
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                placeholder="Template / asset / name…"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <button onClick={load}
                style={{ flex: 1, padding: "7px 0", background: "#2563eb", color: "#fff",
                  border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                Apply
              </button>
              <button onClick={clearAllFilters}
                style={{ flex: 1, padding: "7px 0", background: "#fff", color: "#64748b",
                  border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div style={{ padding: "10px 20px", display: "flex", gap: "8px", flexWrap: "wrap",
            alignItems: "center", borderBottom: "1px solid #f1f5f9", background: "#eff6ff" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>Active:</span>
            {activeFilters.map((f) => (
              <Chip key={f.key} label={f.label} onRemove={() => f.clear()} />
            ))}
            <button onClick={clearAllFilters}
              style={{ fontSize: "12px", color: "#dc2626", background: "none", border: "none",
                cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Results panel ── */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}>

        {/* Panel header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{panelLabel}</span>
            <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: "20px",
              padding: "2px 10px", fontSize: "12px", fontWeight: 700 }}>
              {sorted.length}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={load}
              style={{ padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
                background: "#f8fafc", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#475569" }}>
              ↻ Refresh
            </button>
            <button onClick={() => exportToCSV(sorted, type)}
              style={{ padding: "7px 14px", border: "1px solid #bbf7d0", borderRadius: "8px",
                background: "#f0fdf4", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                color: "#16a34a", display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#dc2626" }}>⚠ {error}</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"
              style={{ marginBottom: "12px" }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
              {rows.length === 0 && !activeFilters.length
                ? `No ${panelLabel.toLowerCase()} yet`
                : "No results match the current filters"}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key}
                      onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                      style={{ padding: "11px 14px", textAlign: "left", background: "#f8fafc",
                        color: "#475569", fontWeight: 600, fontSize: "11.5px", textTransform: "uppercase",
                        letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
                        cursor: c.sortable ? "pointer" : "default", userSelect: "none" }}>
                      {c.label}{c.sortable && <SortIcon field={c.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}>
                    <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                      {r.templateName}
                    </td>
                    {type === "logsheets" && (
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                          background: r.layoutType === "tabular" ? "#f3e8ff" : "#eff6ff",
                          color: r.layoutType === "tabular" ? "#7c3aed" : "#2563eb" }}>
                          {r.layoutType === "tabular" ? "📊 Tabular" : "📋 Standard"}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: "10px 14px", color: "#475569" }}>
                      {r.submittedBy ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "24px", height: "24px", borderRadius: "50%",
                            background: "#eff6ff", color: "#2563eb", fontSize: "10px", fontWeight: 700,
                            display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {r.submittedBy.charAt(0).toUpperCase()}
                          </span>
                          {r.submittedBy}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{r.assetName || "—"}</td>
                    {type === "logsheets" && (
                      <>
                        <td style={{ padding: "10px 14px", color: "#475569", whiteSpace: "nowrap" }}>
                          {r.month && r.year ? `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{r.shift || "—"}</td>
                      </>
                    )}
                    <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {fmt(r.submittedAt)}
                    </td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => openDetail(r.id)}
                        style={{ padding: "5px 14px", background: "#eff6ff", color: "#2563eb",
                          border: "none", borderRadius: "7px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer stats */}
        {!loading && !error && sorted.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", display: "flex",
            gap: "24px", fontSize: "12px", color: "#94a3b8", background: "#f8fafc", flexWrap: "wrap" }}>
            <span>Showing <strong style={{ color: "#475569" }}>{sorted.length}</strong> entries</span>
            <span>Unique submitters: <strong style={{ color: "#475569" }}>
              {new Set(sorted.map((r) => r.submittedBy).filter(Boolean)).size}
            </strong></span>
            {type === "checklists" && (
              <span>Submitted: <strong style={{ color: "#2563eb" }}>
                {sorted.filter((r) => (r.status || "").toLowerCase() === "submitted").length}
              </strong></span>
            )}
            {type === "logsheets" && (
              <>
                <span>Standard: <strong style={{ color: "#2563eb" }}>
                  {sorted.filter((r) => !r.layoutType || r.layoutType === "standard").length}
                </strong></span>
                <span>Tabular: <strong style={{ color: "#7c3aed" }}>
                  {sorted.filter((r) => r.layoutType === "tabular").length}
                </strong></span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
