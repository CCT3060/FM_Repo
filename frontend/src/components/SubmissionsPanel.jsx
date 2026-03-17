import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const API_BASE = getApiBaseUrl();

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
          {allAnswers.length > 0 ? (
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
                      {a.sectionName && (
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#7c3aed",
                          textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                          {a.sectionName}
                        </div>
                      )}
                      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "3px" }}>
                        {a.questionText}
                      </div>
                      <div style={{ fontSize: "14px", color: val ? (a.isIssue ? "#dc2626" : "#0f172a") : "#94a3b8",
                        fontWeight: val ? 600 : 400 }}>
                        {val || "No answer"}
                        {a.isIssue && <span style={{ marginLeft: "6px", fontSize: "11px", background: "#fee2e2",
                          color: "#dc2626", padding: "2px 7px", borderRadius: "9px" }}>⚠ Issue</span>}
                      </div>
                      {a.specification && (
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          Expected: {a.specification}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (isTabular || submission.tabularData || submission.data) ? (
            <TabularView />
          ) : (
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>No recorded answers for this submission.</p>
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

const DRILLDOWN_PERIODS = [
  { key: "today",  label: "Today" },
  { key: "week",   label: "This Week" },
  { key: "month",  label: "This Month" },
  { key: "year",   label: "This Year" },
  { key: "all",    label: "All Time" },
  { key: "custom", label: "Custom Range" },
];

/* ─── Consolidated Date-Wise Grid Report ───────────────────────── */
function ConsolidatedGridView({ userName, templateId, templateName, assetName, companyId, type, token, submissionRows, onBack }) {
  const [details,  setDetails]  = useState([]);   // [{id, submittedAt, answers:[]}]
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  /* Fetch full answers for every submission in submissionRows */
  useEffect(() => {
    if (!submissionRows || submissionRows.length === 0) { setLoading(false); return; }
    setLoading(true);
    const qs = companyId ? `?companyId=${companyId}` : "";
    Promise.all(
      submissionRows.map((r) =>
        fetch(`${API_BASE}/api/template-assignments/submissions/${type}/${r.id}${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.ok ? res.json() : null)
          .catch(() => null)
      )
    )
      .then((results) => {
        const valid = results.filter(Boolean).sort(
          (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
        );
        setDetails(valid);
      })
      .catch(() => setError("Failed to load submission details"))
      .finally(() => setLoading(false));
  }, [companyId, token, type, submissionRows]);

  /* Build grid: collect all unique question texts as rows */
  const { questions, columns } = useMemo(() => {
    const qSet  = [];
    const qSeen = new Set();
    for (const d of details) {
      const answers = getAllAnswers(d);
      for (const a of answers) {
        const key = (a.questionText || "").trim();
        if (key && !qSeen.has(key)) { qSeen.add(key); qSet.push(key); }
      }
    }
    const cols = details.map((d) => ({
      id: d.id,
      label: new Date(d.submittedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      dateTime: new Date(d.submittedAt).toLocaleString(undefined,
        { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      indexMap: Object.fromEntries(
        getAllAnswers(d).map((a) => [(a.questionText || "").trim(), a.answerValue || a.answer || "—"])
      ),
    }));
    return { questions: qSet, columns: cols };
  }, [details]);

  /* CSV export */
  const exportGrid = () => {
    const header = ["Question / Parameter", ...columns.map((c) => c.label)];
    const rows   = questions.map((q) => [q, ...columns.map((c) => c.indexMap[q] ?? "")]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => {
        const s = String(cell ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${userName}-${templateName}-consolidated.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const initials = (userName || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const hCell = {
    padding: "8px 10px", background: "#1e3a5f", color: "#fff", fontWeight: 700,
    fontSize: "12px", textAlign: "center", border: "1px solid #2d5282", whiteSpace: "nowrap",
  };
  const qCell = {
    padding: "8px 12px", background: "#fff", color: "#1e293b", fontWeight: 600,
    fontSize: "12.5px", border: "1px solid #e2e8f0", minWidth: "160px", maxWidth: "240px",
  };
  const vCell = (val) => ({
    padding: "7px 10px", textAlign: "center", fontSize: "12.5px",
    border: "1px solid #e2e8f0", background: val && val !== "—" ? "#fff" : "#f8fafc",
    color: val && val !== "—" ? "#0f172a" : "#94a3b8", fontWeight: val && val !== "—" ? 600 : 400,
    minWidth: "80px",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0", fontFamily: "inherit" }}>
      {/* ─ Header Card (matches logsheet style) ─ */}
      <div style={{ background: "#1e3a5f", color: "#fff", borderRadius: "12px 12px 0 0", padding: "20px 28px", textAlign: "center" }}>
        <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" }}>
          {templateName} — {assetName || "All Assets"}
        </div>
      </div>
      <div style={{ background: "#2563eb", color: "#fff", padding: "10px 28px", textAlign: "center",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>
          {columns.length > 0
            ? `${new Date(details[0]?.submittedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })} – ${new Date(details[details.length - 1]?.submittedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
            : "—"}
        </div>
        <span style={{ opacity: 0.5 }}>|</span>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{type === "checklists" ? "Checklist" : "Logsheet"}</div>
      </div>

      {/* ─ Person info bar ─ */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: "none",
        padding: "14px 24px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <button onClick={onBack}
          style={{ padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
            background: "#f8fafc", color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Back
        </button>
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#eff6ff",
          color: "#2563eb", fontWeight: 800, fontSize: "15px",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "16px", color: "#0f172a" }}>{userName}</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            {columns.length} submission{columns.length !== 1 ? "s" : ""} · {questions.length} parameter{questions.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()}
            style={{ padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
              background: "#f8fafc", color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            🖨 Print
          </button>
          <button onClick={exportGrid}
            style={{ padding: "7px 14px", border: "1px solid #bbf7d0", borderRadius: "8px",
              background: "#f0fdf4", color: "#16a34a", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* ─ Grid ─ */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: "none",
        borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
            ⏳ Loading submissions…
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#dc2626" }}>{error}</div>
        ) : columns.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
            No submissions found for this template
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "12.5px", width: "100%" }}>
              <thead>
                <tr>
                  {/* Section header row */}
                  <th style={{ ...hCell, background: "#1e3a5f", textAlign: "left", padding: "10px 14px" }}>
                    Sl.
                  </th>
                  <th style={{ ...hCell, background: "#1e3a5f", textAlign: "left", minWidth: "180px" }}>
                    Activities / Parameters
                  </th>
                  {columns.map((c, ci) => (
                    <th key={ci} style={{ ...hCell, background: "#1e3a5f" }}>
                      <div>{c.label}</div>
                      <div style={{ fontSize: "10px", opacity: 0.75, fontWeight: 400, marginTop: "2px" }}>
                        {new Date(details[ci]?.submittedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questions.map((q, qi) => (
                  <tr key={qi} style={{ background: qi % 2 === 0 ? "#f8fafc" : "#fff" }}>
                    <td style={{ ...qCell, width: "40px", textAlign: "center", minWidth: "0",
                      color: "#64748b", fontWeight: 700, background: "inherit" }}>
                      {qi + 1}
                    </td>
                    <td style={{ ...qCell, background: "inherit" }}>{q}</td>
                    {columns.map((c, ci) => {
                      const val = c.indexMap[q] ?? "";
                      return (
                        <td key={ci} style={vCell(val)}>
                          {val || "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature footer */}
        {!loading && columns.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            borderTop: "1px solid #e2e8f0", margin: "0" }}>
            {["Technician Signature", "Supervisor Signature", "Manager Signature"].map((label) => (
              <div key={label} style={{ padding: "28px 20px 16px", borderRight: "1px solid #e2e8f0",
                textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "8px",
                  fontSize: "12px", color: "#64748b", marginTop: "24px" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── User Drilldown View ──────────────────────────────────────── */
function UserDrilldown({ userName, companyId, type, token, onBack }) {
  const [period,   setPeriod]   = useState("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [detail,      setDetail]      = useState(null);
  const [consolidated, setConsolidated] = useState(null); // { templateId, templateName, assetName }

  const inputStyle = {
    padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px",
    fontSize: "13px", outline: "none", background: "#fff", boxSizing: "border-box",
  };

  const load = useCallback(async () => {
    if (period === "custom" && !(dateFrom && dateTo)) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (companyId) p.set("companyId", companyId);
      p.set("submittedBy", userName);
      if (period !== "all" && period !== "custom") p.set("period", period);
      if (period === "custom") {
        if (dateFrom) p.set("dateFrom", dateFrom);
        if (dateTo)   p.set("dateTo",   dateTo);
      }
      const res = await fetch(
        `${API_BASE}/api/template-assignments/submissions/${type}?${p}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setRows(await res.json());
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  }, [userName, companyId, type, token, period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    try {
      const qs = companyId ? `?companyId=${companyId}` : "";
      const res = await fetch(
        `${API_BASE}/api/template-assignments/submissions/${type}/${id}${qs}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setDetail(await res.json());
    } catch (e) { alert(e.message || "Failed to load"); }
  };

  const initials = (userName || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const panelLabel = type === "checklists" ? "Checklist Submissions" : "Logsheet Entries";

  /* ── show consolidated grid if selected ── */
  if (consolidated) {
    const submissionRows = rows.filter((r) => r.templateId === consolidated.templateId);
    return (
      <ConsolidatedGridView
        userName={userName}
        templateId={consolidated.templateId}
        templateName={consolidated.templateName}
        assetName={consolidated.assetName}
        companyId={companyId}
        type={type}
        token={token}
        submissionRows={submissionRows}
        onBack={() => setConsolidated(null)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {detail && <DetailModal submission={detail} type={type} onClose={() => setDetail(null)} />}

      {/* ─ Back + User Header ─ */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px",
            border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc",
            color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Back to List
        </button>
        <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#eff6ff",
          color: "#2563eb", fontWeight: 700, fontSize: "16px", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>{userName}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
            {panelLabel}
            {!loading && <span style={{ marginLeft: "6px", background: "#eff6ff", color: "#2563eb",
              borderRadius: "20px", padding: "1px 8px", fontWeight: 700 }}>{rows.length}</span>}
          </div>
        </div>
        <button onClick={load}
          style={{ marginLeft: "auto", padding: "7px 14px", border: "1px solid #e2e8f0",
            borderRadius: "8px", background: "#f8fafc", cursor: "pointer",
            fontSize: "13px", fontWeight: 600, color: "#475569" }}>
          ↻ Refresh
        </button>
      </div>

      {/* ─ Period Filter ─ */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px",
          borderBottom: period === "custom" ? "1px solid #e2e8f0" : "none",
          display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {DRILLDOWN_PERIODS.map(({ key, label: pl }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                cursor: "pointer",
                border: period === key ? "none" : "1px solid #e2e8f0",
                background: period === key
                  ? (key === "today" ? "#2563eb" : "#2563eb")
                  : "#f8fafc",
                color: period === key ? "#fff" : "#475569" }}>
              {pl}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#94a3b8" }}>
            {period === "today" ? new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
              : period === "week" ? "Last 7 days"
              : period === "month" ? new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })
              : period === "year" ? String(new Date().getFullYear())
              : ""}
          </span>
        </div>
        {period === "custom" && (
          <div style={{ padding: "12px 20px", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 160px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px" }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px" }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={load}
              style={{ padding: "7px 18px", background: "#2563eb", color: "#fff", border: "none",
                borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ─ Results ─ */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Submitted Data</span>
          </div>
          <button onClick={() => exportToCSV(rows, type)}
            style={{ padding: "7px 14px", border: "1px solid #bbf7d0", borderRadius: "8px",
              background: "#f0fdf4", cursor: "pointer", fontSize: "13px", fontWeight: 600,
              color: "#16a34a", display: "flex", alignItems: "center", gap: "5px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"
              style={{ marginBottom: "12px" }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 6px" }}>
              No submissions found for this period
            </p>
            <p style={{ color: "#cbd5e1", fontSize: "12px", margin: 0 }}>
              Try changing the time filter above
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr>
                  {["#", "Template",
                    ...(type === "logsheets" ? ["Type"] : []),
                    "Asset",
                    ...(type === "logsheets" ? ["Period", "Shift"] : []),
                    "Date & Time", "Status", ""].map((h, hi) => (
                    <th key={hi} style={{ padding: "11px 14px", textAlign: "left", background: "#f8fafc",
                      color: "#475569", fontWeight: 600, fontSize: "11.5px", textTransform: "uppercase",
                      letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}>
                    <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>{r.templateName}</td>
                    {type === "logsheets" && (
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                          background: r.layoutType === "tabular" ? "#f3e8ff" : "#eff6ff",
                          color: r.layoutType === "tabular" ? "#7c3aed" : "#2563eb" }}>
                          {r.layoutType === "tabular" ? "📊 Tabular" : "📋 Standard"}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{r.assetName || "—"}</td>
                    {type === "logsheets" && (
                      <>
                        <td style={{ padding: "10px 14px", color: "#475569", whiteSpace: "nowrap" }}>
                          {r.month && r.year ? `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{r.shift || "—"}</td>
                      </>
                    )}
                    <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <div>{new Date(r.submittedAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>
                        {new Date(r.submittedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button onClick={() =>
                          setConsolidated({ templateId: r.templateId, templateName: r.templateName, assetName: r.assetName })
                        }
                          style={{ padding: "5px 12px", background: "#eff6ff", color: "#2563eb",
                            border: "1px solid #bfdbfe", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                          📊 View Report
                        </button>
                        <button onClick={() => openDetail(r.id)}
                          style={{ padding: "5px 12px", background: "#f8fafc", color: "#475569",
                            border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", display: "flex",
            gap: "24px", fontSize: "12px", color: "#94a3b8", background: "#f8fafc", flexWrap: "wrap" }}>
            <span>Total entries: <strong style={{ color: "#475569" }}>{rows.length}</strong></span>
            {type === "logsheets" && (
              <>
                <span>Standard: <strong style={{ color: "#2563eb" }}>
                  {rows.filter((r) => !r.layoutType || r.layoutType === "standard").length}
                </strong></span>
                <span>Tabular: <strong style={{ color: "#7c3aed" }}>
                  {rows.filter((r) => r.layoutType === "tabular").length}
                </strong></span>
              </>
            )}
            {type === "checklists" && (
              <span>Submitted: <strong style={{ color: "#16a34a" }}>
                {rows.filter((r) => (r.status || "").toLowerCase() === "submitted").length}
              </strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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

  /* ── User drilldown ── */
  const [userView, setUserView] = useState({ active: false, userName: "", submittedById: null });

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
    if (!showAdvanced) return;
    const qs = companyId ? `?companyId=${companyId}` : "";
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
        { key: "companyName",  label: "Company",      sortable: true },
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
        { key: "companyName",  label: "Company",      sortable: true },
        { key: "period",       label: "Period",       sortable: false },
        { key: "shift",        label: "Shift",        sortable: true },
        { key: "submittedAt",  label: "Date",         sortable: true },
        { key: "status",       label: "Status",       sortable: true },
        { key: "action",       label: "",             sortable: false },
      ];

  /* ── If user drilldown is active, show it ── */
  if (userView.active) {
    return (
      <UserDrilldown
        userName={userView.userName}
        companyId={companyId}
        type={type}
        token={token}
        onBack={() => setUserView({ active: false, userName: "", submittedById: null })}
      />
    );
  }

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
                    <td style={{ padding: "10px 14px", color: "#475569", fontSize: "12px" }}>{r.companyName || "—"}</td>
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
                      <button
                        onClick={() => setUserView({ active: true, userName: r.submittedBy || "Unknown", submittedById: r.submittedById || null })}
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
