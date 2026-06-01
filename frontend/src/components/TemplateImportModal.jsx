/**
 * TemplateImportModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise template import modal — Upload → Preview → Configure → Save
 * Works for both "checklist" and "logsheet" types.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const API_BASE = getApiBaseUrl();

/* ── Shared UI atoms ─────────────────────────────────────────────────────── */
const Btn = ({ children, color = "#2563eb", bg, outline, onClick, disabled, small, style = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: small ? "6px 14px" : "9px 20px",
      borderRadius: "8px", fontSize: small ? "12.5px" : "13.5px", fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      border: outline ? `1.5px solid ${color}` : "none",
      background: bg || (outline ? "#fff" : color), color: outline ? color : "#fff",
      opacity: disabled ? 0.55 : 1, transition: "opacity .15s", ...style,
    }}>
    {children}
  </button>
);

const Label = ({ children }) => (
  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "5px", letterSpacing: "0.03em", textTransform: "uppercase" }}>
    {children}
  </label>
);

const Inp = (props) => (
  <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", outline: "none", ...(props.style || {}) }} />
);

const Sel = ({ children, ...props }) => (
  <select {...props} style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", background: "#fff", outline: "none", ...(props.style || {}) }}>
    {children}
  </select>
);

/* ── Type badge ──────────────────────────────────────────────────────────── */
const TypeBadge = ({ type }) => {
  const map = {
    yes_no: { label: "Yes/No",   bg: "#f0fdf4", col: "#16a34a" },
    text:   { label: "Text",     bg: "#eff6ff", col: "#2563eb" },
    number: { label: "Number",   bg: "#fffbeb", col: "#d97706" },
    dropdown: { label: "Dropdown", bg: "#f3e8ff", col: "#7c3aed" },
    multi_select: { label: "Multi-Select", bg: "#fdf4ff", col: "#9333ea" },
    photo:  { label: "Photo",    bg: "#fff1f2", col: "#e11d48" },
    signature: { label: "Signature", bg: "#f0fdfa", col: "#0d9488" },
    ok_not_ok: { label: "OK/Not OK", bg: "#fef3c7", col: "#92400e" },
    remark: { label: "Remark",   bg: "#f8fafc", col: "#64748b" },
  };
  const s = map[type] || { label: type || "?", bg: "#f1f5f9", col: "#475569" };
  return (
    <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
      background: s.bg, color: s.col, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

/* ── Step indicator ──────────────────────────────────────────────────────── */
const Steps = ({ current, steps }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "28px" }}>
    {steps.map((label, i) => {
      const done  = i < current;
      const active = i === current;
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? "1" : "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700,
              background: done ? "#16a34a" : active ? "#2563eb" : "#e2e8f0",
              color: done || active ? "#fff" : "#94a3b8", flexShrink: 0 }}>
              {done ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: active ? "#2563eb" : done ? "#16a34a" : "#94a3b8", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: "2px", background: done ? "#16a34a" : "#e2e8f0", margin: "0 8px", alignSelf: "flex-start", marginTop: "14px" }} />
          )}
        </div>
      );
    })}
  </div>
);

/* ── Sample-file download helpers ────────────────────────────────────────── */
function downloadSampleCSV(type) {
  const rows = type === "checklist"
    ? [
        ["Question", "Answer Type", "Required", "Section", "Flag Rule", "Flag Reason", "Severity", "Work Order Required", "Min Value", "Max Value", "Options", "Order"],
        ["Is the chiller pressure normal?", "yes_no", "Yes", "Safety", "No", "Pressure abnormal — notify engineer", "high", "Yes", "", "", "", "1"],
        ["Oil level correct?", "yes_no", "Yes", "Safety", "No", "Low oil level", "medium", "No", "", "", "", "2"],
        ["Operating temperature (°C)", "number", "Yes", "Performance", "", "Temperature out of range", "high", "Yes", "10", "90", "", "3"],
        ["Condition of belts", "dropdown", "Yes", "Mechanical", "Fail", "Belt needs replacement", "medium", "Yes", "", "", "Good;Fair;Fail", "4"],
        ["Any visible leaks?", "yes_no", "Yes", "Safety", "Yes", "Leakage detected", "critical", "Yes", "", "", "", "5"],
      ]
    : [
        ["Field Name", "Field Type", "Unit", "Section", "Required", "Min Value", "Max Value", "Specification", "Order"],
        ["Suction Pressure", "number", "bar", "Main Readings", "Yes", "2", "8", "Normal 3–6 bar", "1"],
        ["Discharge Pressure", "number", "bar", "Main Readings", "Yes", "8", "20", "", "2"],
        ["Oil Temperature", "number", "°C", "Main Readings", "Yes", "40", "90", "", "3"],
        ["Cooling Water In Temp", "number", "°C", "Cooling Circuit", "Yes", "10", "30", "", "4"],
        ["System Status", "yes_no", "", "Main Readings", "Yes", "", "", "", "5"],
        ["Operator Remarks", "text", "", "Remarks", "No", "", "", "", "6"],
      ];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `sample-${type}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Bulk sample Excel download (multi-sheet) ────────────────────────────── */
function downloadBulkSampleXLSX() {
  // Build a simple TSV-based multi-sheet xlsx using a data-URI trick with CSV fallback
  // Since we don't have SheetJS in the frontend, we produce a ZIP-like XLSX from raw data.
  // Simplest approach: generate two CSVs in a single "zip" xlsx by using base64 XLSX template.
  // For practicality, we generate a zip of two named sheets as an ods/xlsx file.
  // Best approach without SheetJS on frontend: just generate a CSV with a separator row.
  const headers = ["Question", "Answer Type", "Required", "Section", "Options", "Order"];
  const sheet1 = [
    headers,
    ["Is the area clean?", "yes_no", "Yes", "Cleanliness", "", "1"],
    ["Are bins emptied?", "yes_no", "Yes", "Cleanliness", "", "2"],
    ["Floor condition", "dropdown", "Yes", "General", "Good;Fair;Poor", "3"],
  ];
  const sheet2 = [
    headers,
    ["Washroom soap available?", "yes_no", "Yes", "Washroom", "", "1"],
    ["Tissue paper stocked?", "yes_no", "Yes", "Washroom", "", "2"],
    ["Any leakage?", "yes_no", "Yes", "Plumbing", "", "3"],
  ];
  // Create two CSV blobs with instructions
  const sep = "\n\n";
  const note = `# BULK IMPORT FORMAT — Each sheet in an Excel file becomes one template.\n# Sheet name = Template name.\n# Below are 2 sample templates. In Excel, put each in a separate worksheet named after the template.\n\n`;
  const toCsv = (rows) => rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const content = note + `# === TEMPLATE 1: Daily Cleaning Check ===\n` + toCsv(sheet1) + sep + `# === TEMPLATE 2: Washroom Inspection ===\n` + toCsv(sheet2);
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk-checklist-sample.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════════════════════
   STEP 1 — Upload
════════════════════════════════════════════════════════════════════════════ */
function UploadStep({ type, token, onParsed, onError }) {
  const [dragging,  setDragging]  = useState(false);
  const [file,      setFile]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const fileRef  = useRef();

  /* ── Process spreadsheet ─────────────────────────────────────────────── */
  const processFile = useCallback(async (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setError("Unsupported file type. Please upload .xlsx or .csv");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum allowed size is 5 MB.");
      return;
    }
    setFile(f);
    setError(null);
    setLoading(true);

    const fd = new FormData();
    fd.append("file", f);

    try {
      const res  = await fetch(`${API_BASE}/api/template-import/${type}/parse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Server error ${res.status}`);
        setLoading(false);
        return;
      }
      onParsed(data, f.name);
    } catch (err) {
      setError(err.message || "Network error — check backend connection");
    } finally {
      setLoading(false);
    }
  }, [type, token, onParsed]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Info banner */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px 18px", display: "flex", gap: "12px" }}>
        <span style={{ fontSize: "22px", flexShrink: 0 }}>📋</span>
        <div>
          <div style={{ fontWeight: 700, color: "#1d4ed8", fontSize: "14px", marginBottom: "4px" }}>
            {`Import ${type === "checklist" ? "Checklist" : "Logsheet"} Template`}
          </div>
          <div style={{ fontSize: "13px", color: "#3b82f6", lineHeight: "1.5" }}>
            {type === "checklist"
              ? "Upload an Excel/CSV file. Use multiple sheets in one Excel file to import multiple templates at once."
              : "Upload an Excel/CSV file with columns: Field Name, Field Type, Unit, Section, Required, Min Value, Max Value, Specification, Order"}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#2563eb" : "#cbd5e1"}`,
          borderRadius: "14px",
          padding: "52px 24px",
          textAlign: "center",
          cursor: loading ? "default" : "pointer",
          background: dragging ? "#eff6ff" : "#f8fafc",
          transition: "all .2s",
        }}>
        <input ref={fileRef}  type="file" accept=".xlsx,.xls,.csv"             style={{ display: "none" }} onChange={(e) => processFile(e.target.files[0])} />

        {loading ? (
          <div>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#2563eb", margin: "0 auto 14px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "#2563eb", fontWeight: 600, fontSize: "14px" }}>Parsing file…</p>
            <p style={{ color: "#94a3b8", fontSize: "12.5px" }}>Validating structure and mapping columns</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>{file ? "📄" : "📁"}</div>
            {file ? (
              <div>
                <p style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px", margin: "0 0 4px" }}>{file.name}</p>
                <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>{(file.size / 1024).toFixed(1)} KB — click to change</p>
              </div>
            ) : (
              <div>
                <p style={{ fontWeight: 700, color: "#0f172a", fontSize: "16px", margin: "0 0 6px" }}>Drop your file here, or click to browse</p>
                <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>Supported formats: .xlsx, .xls, .csv — Max 5 MB</p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "13.5px", display: "flex", gap: "8px" }}>
          <span>⚠</span><span>{error}</span>
        </div>
      )}

      {/* Sample download */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px", borderTop: "1px solid #f1f5f9" }}>
        <span style={{ fontSize: "13px", color: "#94a3b8" }}>Don't have a file yet?</span>
        <Btn small outline color="#2563eb" onClick={() => downloadSampleCSV(type)}>
          ⬇ Download Sample CSV
        </Btn>
        {type === "checklist" && (
          <Btn small outline color="#0d9488" onClick={downloadBulkSampleXLSX}>
            ⬇ Download Bulk Sample (Multi-Sheet)
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   STEP 2 — Preview
════════════════════════════════════════════════════════════════════════════ */
function PreviewStep({ parsed, fileName, type, onBack, onNext }) {
  const [expandedSections, setExpandedSections] = useState(new Set(
    (parsed.preview || []).map((_, i) => i)
  ));

  const toggleSection = (i) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const sections = parsed.preview || [];
  const stats    = parsed.stats || {};
  const errors   = parsed.errors || [];
  const warnings = parsed.warnings || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Summary banner */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        {[
          { label: "Total Fields", value: stats.total || 0, bg: "#eff6ff", col: "#2563eb" },
          { label: "Sections",     value: stats.sections || sections.length, bg: "#f0fdf4", col: "#16a34a" },
          { label: type === "checklist" ? "With Flag Rules" : "With Validation",
            value: stats.withFlagRules ?? stats.withRules ?? 0, bg: "#fffbeb", col: "#d97706" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: "10px", padding: "14px 18px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* File info */}
      <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", border: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: "20px" }}>📄</span>
        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{fileName}</span>
        {parsed.success !== false && (
          <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: "20px", background: "#f0fdf4", color: "#16a34a", fontSize: "12px", fontWeight: 700 }}>
            ✓ Parsed successfully
          </span>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px 18px" }}>
          <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: "8px", fontSize: "14px" }}>
            ⛔ {errors.length} error{errors.length > 1 ? "s" : ""} found
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", color: "#dc2626", fontSize: "13px" }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px 18px" }}>
          <div style={{ fontWeight: 700, color: "#d97706", marginBottom: "6px", fontSize: "13.5px" }}>
            ⚠ {warnings.length} warning{warnings.length > 1 ? "s" : ""}
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", color: "#b45309", fontSize: "12.5px" }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Questions/Fields preview */}
      {sections.length > 0 && (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>
            Preview — {type === "checklist" ? "Questions" : "Fields"} by Section
          </div>
          <div style={{ maxHeight: "340px", overflowY: "auto" }}>
            {sections.map((sec, si) => (
              <div key={si} style={{ borderBottom: si < sections.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                {/* Section header */}
                <button type="button" onClick={() => toggleSection(si)}
                  style={{ width: "100%", padding: "10px 18px", display: "flex", alignItems: "center", gap: "10px",
                    background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: "11px", color: expandedSections.has(si) ? "#2563eb" : "#94a3b8", fontWeight: 800, transition: "transform .15s", display: "inline-block", transform: expandedSections.has(si) ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                  <span style={{ fontWeight: 700, color: "#1e40af", fontSize: "13px", flex: 1 }}>{sec.name}</span>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {(type === "checklist" ? sec.questions : sec.questions)?.length} {type === "checklist" ? "questions" : "fields"}
                  </span>
                </button>

                {expandedSections.has(si) && (
                  <div style={{ paddingBottom: "6px" }}>
                    {(sec.questions || []).map((q, qi) => (
                      <div key={qi} style={{ display: "flex", alignItems: "flex-start", gap: "12px",
                        padding: "8px 18px 8px 40px", background: qi % 2 === 0 ? "#fafbff" : "#fff" }}>
                        <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, minWidth: "22px", paddingTop: "2px" }}>
                          {qi + 1}.
                        </span>
                        <span style={{ flex: 1, fontSize: "13px", color: "#0f172a", fontWeight: 500 }}>
                          {q.questionText}
                          {(q.unit || q.specification) && (
                            <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "6px", fontSize: "12px" }}>
                              {q.unit ? `(${q.unit})` : ""} {q.specification || ""}
                            </span>
                          )}
                        </span>
                        <TypeBadge type={q.inputType || q.answerType} />
                        {q.isRequired === false || q.mandatory === false
                          ? <span style={{ fontSize: "11px", color: "#94a3b8" }}>optional</span>
                          : null}
                        {(q.flagRule || q.rule) && (
                          <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "20px", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>⚠</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px" }}>
        <Btn outline color="#64748b" bg="#fff" onClick={onBack}>← Re-upload</Btn>
        {sections.length > 0 && (
          <Btn onClick={onNext} disabled={errors.length > 0 && (parsed.questions?.length ?? 0) === 0 && (parsed.sections?.length ?? 0) === 0}>
            Configure & Save →
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   STEP 3 — Configure & Save
════════════════════════════════════════════════════════════════════════════ */
const ASSET_CATEGORIES = [
  { value: "soft",      label: "Soft Services" },
  { value: "technical", label: "Technical" },
  { value: "fleet",     label: "Fleet" },
  { value: "building",  label: "Building" },
  { value: "room",      label: "Room" },
  { value: "generic",   label: "Generic" },
];

const CHECKLIST_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Custom"];
const LOGSHEET_FREQUENCIES  = ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"];

function ConfigureStep({ type, parsed, token, companies, companyId: defaultCompanyId, createTemplate, onBack, onCreated, companyPortalMode = false }) {
  const firstCompanyId = companies?.[0]?.id || "";

  const [form, setForm] = useState({
    companyId:    String(defaultCompanyId || firstCompanyId || ""),
    templateName: parsed?.templateName || "",
    assetType:    "generic",
    assetId:      "",
    category:     "",
    description:  "",
    frequency:    parsed?.frequency || (type === "checklist" ? "Daily" : "daily"),
    shift:        "",
    status:       "active",
    isActive:     true,
  });
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const [fetchedAssets, setFetchedAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  /* Fetch assets whenever company changes */
  useEffect(() => {
    if (!token || !form.companyId) { setFetchedAssets([]); return; }
    let cancelled = false;
    setAssetsLoading(true);
    setFetchedAssets([]);
    const url = companyPortalMode
      ? `${API_BASE}/api/company-portal/assets`
      : `${API_BASE}/api/assets?companyId=${form.companyId}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (!cancelled) setFetchedAssets(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAssetsLoading(false); });
    return () => { cancelled = true; };
  }, [token, form.companyId, companyPortalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filter fetched assets by selected asset type */
  const filteredAssets = useMemo(() => {
    return fetchedAssets.filter((a) => {
      const aType = a.assetType || a.asset_type || "";
      return !form.assetType || form.assetType === "generic" || aType === form.assetType;
    });
  }, [fetchedAssets, form.assetType]);

  const handleSave = async () => {
    setError(null);
    if (!form.templateName.trim()) return setError("Template name is required");
    if (!form.companyId)           return setError("Select a company");

    let payload;

    if (type === "checklist") {
      /* Flatten questions from all preview sections */
      const questions = (parsed.questions || []).map((q, idx) => ({
        questionText: q.questionText,
        inputType:    q.inputType || "yes_no",
        isRequired:   q.isRequired ?? true,
        orderIndex:   q.orderIndex ?? idx,
        options:      q.options?.length ? q.options : undefined,
        flagRule:     q.flagRule || undefined,
      }));

      payload = {
        companyId:    Number(form.companyId),
        templateName: form.templateName.trim(),
        assetType:    form.assetType,
        assetId:      form.assetId ? Number(form.assetId) : undefined,
        category:     form.category.trim() || undefined,
        description:  form.description.trim() || undefined,
        frequency:    form.frequency,
        shift:        form.shift.trim() || undefined,
        status:       form.status,
        questions,
      };
    } else {
      /* Logsheet — use sections as-is from parser */
      const sections = (parsed.sections || []).map((sec, si) => ({
        name:      sec.name,
        order:     sec.order ?? si,
        questions: (sec.questions || []).map((q, qi) => ({
          questionText: q.questionText,
          answerType:   q.answerType || "number",
          specification: q.specification || undefined,
          mandatory:     q.mandatory ?? true,
          priority:      q.priority || "medium",
          rule:          q.rule || undefined,
          order:         q.order ?? qi,
        })),
      }));

      payload = {
        companyId:    Number(form.companyId),
        templateName: form.templateName.trim(),
        assetType:    form.assetType,
        assetId:      form.assetId ? Number(form.assetId) : undefined,
        frequency:    form.frequency,
        description:  form.description.trim() || undefined,
        isActive:     true,
        sections,
      };
    }

    setSaving(true);
    try {
      const created = await createTemplate(token, payload);
      onCreated(created?.id || created);
    } catch (err) {
      setError(err.message || "Could not create template — check console");
    } finally {
      setSaving(false);
    }
  };

  const freqs = type === "checklist" ? CHECKLIST_FREQUENCIES : LOGSHEET_FREQUENCIES;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Summary */}
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 18px", display: "flex", gap: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "22px" }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, color: "#166534", fontSize: "13.5px" }}>File parsed successfully</div>
          <div style={{ color: "#16a34a", fontSize: "12.5px" }}>
            {parsed.stats?.total || 0} {type === "checklist" ? "questions" : "fields"} across {parsed.stats?.sections || (parsed.preview || []).length} section(s) ready to import
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "13.5px" }}>
          ⚠ {error}
        </div>
      )}

      {/* Form */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "22px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
        {/* Template name — full width */}
        <div style={{ gridColumn: "span 2" }}>
          <Label>Template Name *</Label>
          <Inp
            value={form.templateName}
            onChange={(e) => set("templateName", e.target.value)}
            placeholder={type === "checklist" ? "e.g. Daily Boiler Safety Check" : "e.g. Chiller Plant Logsheet"}
            autoFocus
          />
        </div>

        <div>
          <Label>Company *</Label>
          <Sel value={form.companyId} onChange={(e) => { set("companyId", e.target.value); set("assetId", ""); }}>
            <option value="">— Select company —</option>
            {(companies || []).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
        </div>

        <div>
          <Label>Asset Type *</Label>
          <Sel value={form.assetType} onChange={(e) => { set("assetType", e.target.value); set("assetId", ""); }}>
            {ASSET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Sel>
        </div>

        <div>
          <Label>Asset (Link to) *</Label>
          <Sel value={form.assetId} onChange={(e) => set("assetId", e.target.value)} disabled={assetsLoading}>
            <option value="">{assetsLoading ? "Loading assets…" : "— Select asset —"}</option>
            {filteredAssets.map((a) => (
              <option key={a.id} value={a.id}>{a.assetName || a.asset_name}</option>
            ))}
          </Sel>
          {!assetsLoading && filteredAssets.length === 0 && form.companyId && (
            <p style={{ fontSize: "11.5px", color: "#f59e0b", margin: "4px 0 0" }}>
              No {form.assetType === "generic" ? "" : form.assetType + " "}assets found for this company
            </p>
          )}
        </div>

        <div>
          <Label>Frequency</Label>
          <Sel value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
            {freqs.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1).replace("_", "-")}</option>)}
          </Sel>
        </div>

        {type === "checklist" && (
          <>
            <div>
              <Label>Category</Label>
              <Inp value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Safety, AMC, Preventive" />
            </div>
            <div>
              <Label>Shift</Label>
              <Inp value={form.shift} onChange={(e) => set("shift", e.target.value)} placeholder="e.g. Morning, Night" />
            </div>
          </>
        )}

        <div style={{ gridColumn: "span 2" }}>
          <Label>Description</Label>
          <Inp value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief purpose / scope of this template" />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px" }}>
        <Btn outline color="#64748b" bg="#fff" onClick={onBack}>← Preview</Btn>
        <Btn onClick={handleSave} disabled={saving} style={{ minWidth: "160px", justifyContent: "center" }}>
          {saving ? "Creating…" : `✓ Create ${type === "checklist" ? "Checklist" : "Logsheet"} Template`}
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Success screen
════════════════════════════════════════════════════════════════════════════ */
function SuccessStep({ type, onClose, onAnother, count }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 0" }}>
      <div style={{ fontSize: "64px", marginBottom: "16px" }}>🎉</div>
      <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
        {count > 1 ? `${count} Templates Created!` : "Template Created!"}
      </h2>
      <p style={{ color: "#64748b", fontSize: "14px", maxWidth: "360px", margin: "0 auto 28px" }}>
        {count > 1
          ? `${count} ${type === "checklist" ? "checklist" : "logsheet"} templates have been created successfully.`
          : `Your ${type === "checklist" ? "checklist" : "logsheet"} template has been created successfully.`}
        {" "}You can now assign them to users and assets.
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        <Btn outline color="#2563eb" bg="#fff" onClick={onAnother}>Import Another</Btn>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   BULK PREVIEW STEP
════════════════════════════════════════════════════════════════════════════ */
function BulkPreviewStep({ bulkData, fileName, onBack, onNext }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", gap: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "22px" }}>📦</span>
        <div>
          <div style={{ fontWeight: 700, color: "#166534", fontSize: "14px" }}>Bulk import detected</div>
          <div style={{ color: "#16a34a", fontSize: "13px" }}>
            {bulkData.stats?.templateCount} templates found in <strong>{fileName}</strong> — {bulkData.stats?.totalQuestions} total questions
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>
          Templates to Import ({bulkData.templates?.length})
        </div>
        <div style={{ maxHeight: "360px", overflowY: "auto" }}>
          {(bulkData.templates || []).map((t, i) => (
            <div key={i} style={{ padding: "12px 18px", borderBottom: i < bulkData.templates.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: t.errors?.length > 0 ? "#fef2f2" : "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: t.errors?.length > 0 ? "#dc2626" : "#2563eb" }}>{i + 1}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{t.templateName}</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>{t.stats?.total || 0} questions, {t.stats?.sections || 0} section(s)</div>
                {t.errors?.length > 0 && (
                  <div style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "2px" }}>⚠ {t.errors[0]}</div>
                )}
              </div>
              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700,
                background: t.errors?.length > 0 ? "#fef2f2" : (t.stats?.total > 0 ? "#f0fdf4" : "#fffbeb"),
                color: t.errors?.length > 0 ? "#dc2626" : (t.stats?.total > 0 ? "#16a34a" : "#d97706") }}>
                {t.errors?.length > 0 ? "Error" : t.stats?.total > 0 ? "Ready" : "Empty"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px" }}>
        <Btn outline color="#64748b" bg="#fff" onClick={onBack}>← Re-upload</Btn>
        <Btn onClick={onNext} disabled={(bulkData.templates || []).every((t) => (t.stats?.total || 0) === 0)}>
          Configure & Save All →
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   BULK CONFIGURE STEP
════════════════════════════════════════════════════════════════════════════ */
function BulkConfigureStep({ bulkData, token, companies, companyId: defaultCompanyId, createTemplate, onBack, onCreated, companyPortalMode = false }) {
  const firstCompanyId = companies?.[0]?.id || "";
  const [names, setNames] = useState(() => (bulkData.templates || []).map((t) => t.templateName || ""));
  const [form, setForm] = useState({
    companyId: String(defaultCompanyId || firstCompanyId || ""),
    assetType: "soft",
    serviceType: "soft_service",
    frequency: "Daily",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.companyId) return setError("Select a company");
    const validTemplates = (bulkData.templates || []).filter((t) => (t.stats?.total || 0) > 0);
    if (validTemplates.length === 0) return setError("No valid templates to import");
    setSaving(true);
    setProgress({ done: 0, total: validTemplates.length, errors: [] });

    const errs = [];
    let done = 0;
    for (let i = 0; i < validTemplates.length; i++) {
      const t = validTemplates[i];
      const questions = (t.questions || []).map((q, idx) => ({
        questionText: q.questionText,
        inputType:    q.inputType || "yes_no",
        isRequired:   q.isRequired ?? true,
        orderIndex:   q.orderIndex ?? idx,
        options:      q.options?.length ? q.options : undefined,
        flagRule:     q.flagRule || undefined,
      }));
      const payload = {
        companyId:    Number(form.companyId),
        templateName: (names[i] || t.templateName || `Template ${i + 1}`).trim(),
        assetType:    form.assetType,
        serviceType:  form.serviceType || undefined,
        frequency:    form.frequency,
        description:  form.description.trim() || undefined,
        status:       "active",
        questions,
      };
      try {
        await createTemplate(token, payload);
        done++;
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err) {
        errs.push(`"${payload.templateName}": ${err.message || "Failed"}`);
        setProgress((p) => ({ ...p, done: p.done + 1, errors: [...p.errors, errs[errs.length - 1]] }));
      }
    }
    setSaving(false);
    if (errs.length === 0 || done > 0) {
      onCreated(done);
    } else {
      setError(`All templates failed to create: ${errs.join("; ")}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 18px", display: "flex", gap: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>✅</span>
        <div style={{ fontWeight: 700, color: "#166534", fontSize: "13.5px" }}>
          {bulkData.stats?.templateCount} templates ready — configure shared settings below
        </div>
      </div>

      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "13.5px" }}>⚠ {error}</div>}

      {saving && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px 16px" }}>
          <div style={{ fontWeight: 600, color: "#1d4ed8", fontSize: "13.5px", marginBottom: "6px" }}>
            Creating templates… {progress.done} / {progress.total}
          </div>
          <div style={{ height: "8px", borderRadius: "4px", background: "#e2e8f0", overflow: "hidden" }}>
            <div style={{ height: "8px", borderRadius: "4px", background: "#2563eb", width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* Shared settings */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
        <div>
          <Label>Company *</Label>
          <Sel value={form.companyId} onChange={(e) => set("companyId", e.target.value)}>
            <option value="">— Select company —</option>
            {(companies || []).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
        </div>
        <div>
          <Label>Frequency</Label>
          <Sel value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
            {["Daily", "Weekly", "Monthly", "Custom"].map((f) => <option key={f} value={f}>{f}</option>)}
          </Sel>
        </div>
        <div>
          <Label>Asset Type</Label>
          <Sel value={form.assetType} onChange={(e) => set("assetType", e.target.value)}>
            <option value="soft">Soft Services</option>
            <option value="technical">Technical</option>
            <option value="fleet">Fleet</option>
            <option value="building">Building</option>
            <option value="generic">Generic</option>
          </Sel>
        </div>
        <div>
          <Label>Service Type</Label>
          <Sel value={form.serviceType} onChange={(e) => set("serviceType", e.target.value)}>
            <option value="">None</option>
            <option value="soft_service">Soft Service</option>
          </Sel>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Label>Description (shared)</Label>
          <Inp value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief purpose / scope of these templates" />
        </div>
      </div>

      {/* Per-template names */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>
          Template Names (editable)
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "260px", overflowY: "auto" }}>
          {(bulkData.templates || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "22px", fontSize: "12px", color: "#94a3b8", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <Inp
                value={names[i] || ""}
                onChange={(e) => setNames((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                placeholder={`Template ${i + 1}`}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: "12px", color: "#64748b", flexShrink: 0 }}>{t.stats?.total || 0}q</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px" }}>
        <Btn outline color="#64748b" bg="#fff" onClick={onBack}>← Preview</Btn>
        <Btn onClick={handleSave} disabled={saving} style={{ minWidth: "180px", justifyContent: "center" }}>
          {saving ? `Creating… ${progress.done}/${progress.total}` : `✓ Create All ${bulkData.stats?.templateCount} Templates`}
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Main Modal Export
════════════════════════════════════════════════════════════════════════════ */
export default function TemplateImportModal({
  type = "checklist",  // "checklist" | "logsheet"
  token,
  companies = [],
  companyId,
  createTemplate,
  onClose,
  onCreated,
  companyPortalMode = false,
}) {
  const [step,       setStep]       = useState(0); // 0 upload | 1 preview | 1b bulk-preview | 2 configure | 2b bulk-configure | 3 success
  const [parsed,     setParsed]     = useState(null);
  const [bulkParsed, setBulkParsed] = useState(null);
  const [fileName,   setFileName]   = useState("");
  const [createdCount, setCreatedCount] = useState(1);

  const STEP_LABELS = ["Upload", "Preview", "Configure", "Done"];

  const handleParsed = (data, name) => {
    setFileName(name);
    if (data.isBulk) {
      setBulkParsed(data);
      setParsed(null);
      setStep("bulk-preview");
    } else {
      setParsed(data);
      setBulkParsed(null);
      setStep(1);
    }
  };

  const reset = () => {
    setStep(0);
    setParsed(null);
    setBulkParsed(null);
    setFileName("");
    setCreatedCount(1);
  };

  const handleCreated = (countOrId) => {
    const n = typeof countOrId === "number" && countOrId > 1 ? countOrId : 1;
    setCreatedCount(n);
    setStep(3);
    onCreated?.(countOrId);
  };

  const isBulkFlow = step === "bulk-preview" || step === "bulk-configure";
  const stepIndex = step === 0 ? 0 : step === 1 ? 1 : step === "bulk-preview" ? 1 : step === 2 ? 2 : step === "bulk-configure" ? 2 : 3;

  return (
    <>
      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>

        {/* Modal  */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "720px",
            maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "0 32px 80px rgba(0,0,0,0.25)" }}>

          {/* Header */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex",
            justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>
                {type === "checklist" ? "📋 Import Checklist Template" : "📊 Import Logsheet Template"}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                Upload a CSV or Excel file to automatically generate a template
              </div>
            </div>
            <button onClick={onClose}
              style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#f1f5f9",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
            <Steps current={stepIndex} steps={STEP_LABELS} />

            {step === 0 && (
              <UploadStep type={type} token={token} onParsed={handleParsed} />
            )}
            {step === 1 && parsed && (
              <PreviewStep
                parsed={parsed}
                fileName={fileName}
                type={type}
                onBack={reset}
                onNext={() => setStep(2)}
              />
            )}
            {step === "bulk-preview" && bulkParsed && (
              <BulkPreviewStep
                bulkData={bulkParsed}
                fileName={fileName}
                onBack={reset}
                onNext={() => setStep("bulk-configure")}
              />
            )}
            {step === 2 && parsed && (
              <ConfigureStep
                type={type}
                parsed={parsed}
                token={token}
                companies={companies}
                companyId={companyId}
                createTemplate={createTemplate}
                onBack={() => setStep(1)}
                onCreated={handleCreated}
                companyPortalMode={companyPortalMode}
              />
            )}
            {step === "bulk-configure" && bulkParsed && (
              <BulkConfigureStep
                bulkData={bulkParsed}
                token={token}
                companies={companies}
                companyId={companyId}
                createTemplate={createTemplate}
                onBack={() => setStep("bulk-preview")}
                onCreated={handleCreated}
                companyPortalMode={companyPortalMode}
              />
            )}
            {step === 3 && (
              <SuccessStep type={type} onClose={onClose} onAnother={reset} count={createdCount} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
