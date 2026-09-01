import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import TemplateImportModal from "./TemplateImportModal.jsx";
import SearchableSelect from "./SearchableSelect.jsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const API_BASE = getApiBaseUrl();

/* ─────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────── */
const INPUT_TYPES = [
  { value: "text", label: "Text / Remark" },
  { value: "yes_no", label: "Yes / No" },
  { value: "ok_not_ok", label: "OK / Not OK" },
  { value: "cleaned_not_cleaned", label: "Cleaned / Not Cleaned" },
  { value: "number", label: "Number / Reading" },
  { value: "dropdown", label: "Dropdown" },
  { value: "custom_options", label: "Custom Options" },
  { value: "photo", label: "Photo Upload" },
  { value: "signature", label: "Signature" },
  { value: "remark", label: "Remark Only" },
];

const FREQUENCIES = ["Hourly", "Daily", "Weekly", "Monthly", "Custom"];

const ASSET_CATEGORIES = [
  { value: "soft", label: "Soft Services" },
  { value: "technical", label: "Technical" },
  { value: "fleet", label: "Fleet" },
  { value: "building", label: "Building" },
  { value: "room", label: "Room" },
  { value: "generic", label: "Generic" },
];

const emptyQuestion = () => ({
  _id: Math.random().toString(36).slice(2),
  questionText: "",
  inputType: "yes_no",
  inputTypes: ["yes_no"],
  isRequired: true,
  options: [],
  _optionsText: "",
  questionImageUrl: null,
  rule: { flagOn: "", minValue: "", maxValue: "", severity: "warning", action: "" },
});

/* ─────────────────────────────────────────────────────────────────
   Shared UI atoms
───────────────────────────────────────────────────────────────── */
const Label = ({ children, required }) => (
  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
    {children}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
  </label>
);

const Inp = (props) => (
  <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", ...(props.style || {}) }} />
);

const Sel = ({ children, ...props }) => (
  <select {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff", outline: "none", ...(props.style || {}) }}>
    {children}
  </select>
);

const SBtn = ({ children, color = "#2563eb", bg, outline, onClick, disabled, style = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: outline ? `1px solid ${color}` : "none", background: bg || (outline ? "#fff" : color), color: outline ? color : "#fff", opacity: disabled ? 0.6 : 1, ...style }}>
    {children}
  </button>
);

const Badge = ({ children, bg = "#eff6ff", col = "#2563eb" }) => (
  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: bg, color: col }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", ...style }}>{children}</div>
);

const CardHeader = ({ children, action }) => (
  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{children}</span>
    {action && <div>{action}</div>}
  </div>
);

const Alert = ({ type = "error", children }) => {
  const styles = type === "error"
    ? { bg: "#fef2f2", col: "#dc2626", border: "#fecaca" }
    : { bg: "#f0fdf4", col: "#16a34a", border: "#bbf7d0" };
  return (
    <div style={{ background: styles.bg, color: styles.col, padding: "10px 14px", borderRadius: "8px", fontSize: "13.5px", border: `1px solid ${styles.border}`, marginBottom: "12px" }}>
      {children}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────
   Template View Modal (read-only)
───────────────────────────────────────────────────────────────── */
function ViewModal({ template, onClose }) {
  if (!template) return null;
  const questions = Array.isArray(template.questions) ? template.questions : [];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "760px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>{template.templateName}</div>
            <div style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
              {template.assetType}{template.category ? ` · ${template.category}` : ""}{template.frequency ? ` · ${template.frequency}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {template.description && <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>{template.description}</p>}
          {questions.length === 0 && (
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>No questions configured for this template.</p>
          )}
          {questions.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["#", "Question", "Input Type", "Required", "Options", "Flag Rule"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questions.map((q, qi) => {
                  const r = q.rule || {};
                  let ruleSummary = "—";
                  if (q.inputType === "yes_no") ruleSummary = r.action ? `Flag if No → ${r.action}` : (r.severity ? `Flag if No (${r.severity})` : "—");
                  else if (q.inputType === "ok_not_ok") ruleSummary = r.action ? `Flag if Not OK → ${r.action}` : (r.severity ? `Flag if Not OK (${r.severity})` : "—");
                  else if (q.inputType === "cleaned_not_cleaned") ruleSummary = r.action ? `Flag if Not Cleaned → ${r.action}` : (r.severity ? `Flag if Not Cleaned (${r.severity})` : "—");
                  else if (q.inputType === "number") ruleSummary = (r.minValue !== "" || r.maxValue !== "") ? `Range: ${r.minValue || "•"} – ${r.maxValue || "•"}` : "—";
                  else if (q.inputType === "dropdown") ruleSummary = r.flagOn ? `Flag if: ${r.flagOn}` : "—";
                  return (
                    <tr key={q.id || qi} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "9px 12px", color: "#94a3b8" }}>{qi + 1}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a" }}>{q.questionText}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <Badge bg="#eff6ff" col="#2563eb">{q.inputType}</Badge>
                      </td>
                      <td style={{ padding: "9px 12px", color: (q.isRequired || q.is_required) ? "#16a34a" : "#94a3b8" }}>
                        {(q.isRequired || q.is_required) ? "Yes" : "No"}
                      </td>
                      <td style={{ padding: "9px 12px", color: "#64748b", fontSize: "12px" }}>
                        {Array.isArray(q.options) && q.options.length ? q.options.join(", ") : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: ruleSummary === "—" ? "#94a3b8" : (r.severity === "critical" ? "#dc2626" : "#ca8a04") }}>
                        {ruleSummary !== "—" && <span style={{ marginRight: "4px" }}>⚠</span>}{ruleSummary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0" }}>
          <SBtn onClick={onClose} outline color="#64748b" bg="#fff">Close</SBtn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Question Row Editor
───────────────────────────────────────────────────────────────── */
function QuestionRow({ q, idx, onChange, onRemove, token, apiBase }) {
  const update = (field, val) => onChange(idx, { ...q, [field]: val });
  const updateRule = (field, val) => update("rule", { ...(q.rule || {}), [field]: val });
  const [imgUploading, setImgUploading] = useState(false);
  const [qImgUploading, setQImgUploading] = useState(false);
  const [inputTypeOpen, setInputTypeOpen] = useState(false);
  const inputTypeRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!inputTypeOpen) return;
    const handler = (e) => {
      if (inputTypeRef.current && !inputTypeRef.current.contains(e.target)) {
        setInputTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inputTypeOpen]);

  // Helper: compute selected types array
  const selectedTypes = Array.isArray(q.inputTypes) && q.inputTypes.length > 0
    ? q.inputTypes
    : [q.inputType || "yes_no"];

  const toggleType = (value) => {
    const already = selectedTypes.includes(value);
    let next;
    if (already) {
      if (selectedTypes.length === 1) return; // must keep at least one
      next = selectedTypes.filter((v) => v !== value);
    } else {
      next = [...selectedTypes, value];
    }
    // Single onChange call — two separate update() calls each spread the OLD q,
    // so the second would stomp the first. Merge both fields in one shot.
    onChange(idx, { ...q, inputTypes: next, inputType: next[0] });
  };

  const uploadImage = async (file, onDone, setUploading) => {
    if (!file || !token) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/api/company-portal/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onDone(data.url);
    } catch {
      alert("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRefImgUpload = (e) => {
    const file = e.target.files?.[0];
    uploadImage(file, (url) => update("referenceImageUrl", url), setImgUploading);
  };

  const handleQImgUpload = (e) => {
    const file = e.target.files?.[0];
    uploadImage(file, (url) => update("questionImageUrl", url), setQImgUploading);
  };
  const rule = q.rule || {};
  const hasRule = ["yes_no", "ok_not_ok", "cleaned_not_cleaned", "number", "dropdown"].includes(q.inputType);

  const isBinaryType = q.inputType === "yes_no" || q.inputType === "ok_not_ok" || q.inputType === "cleaned_not_cleaned";
  const binaryOptions = q.inputType === "yes_no"
    ? ["Yes", "No"]
    : q.inputType === "ok_not_ok"
      ? ["OK", "Not OK"]
      : q.inputType === "cleaned_not_cleaned"
        ? ["Cleaned", "Not Cleaned"]
        : [];

  return (
    <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 14px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 1.4fr 60px 32px", gap: "10px", alignItems: "flex-start" }}>
        <div>
          <Label required={!q.questionImageUrl}>Question {q.questionImageUrl ? <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "11px" }}>(optional when photo is set)</span> : null}</Label>
          <Inp
            value={q.questionText}
            onChange={(e) => update("questionText", e.target.value)}
            placeholder={q.questionImageUrl ? "Optional — photo is the question" : "e.g. Check oil level"}
            style={q.questionImageUrl ? { background: "#f1f5f9", color: "#94a3b8" } : {}}
          />
          {/* Question image upload */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: qImgUploading ? "not-allowed" : "pointer", fontSize: "12px", color: q.questionImageUrl ? "#dc2626" : "#2563eb", fontWeight: 600, border: `1px solid ${q.questionImageUrl ? "#fecaca" : "#bfdbfe"}`, borderRadius: "6px", padding: "4px 10px", background: q.questionImageUrl ? "#fef2f2" : "#eff6ff", opacity: qImgUploading ? 0.6 : 1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {qImgUploading ? "Uploading…" : q.questionImageUrl ? "Change photo" : "Use photo as question"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleQImgUpload} disabled={qImgUploading} />
            </label>
            {q.questionImageUrl && (
              <>
                <img src={q.questionImageUrl.startsWith("http") ? q.questionImageUrl : `${apiBase}${q.questionImageUrl}`} alt="question" style={{ width: 40, height: 40, borderRadius: "5px", objectFit: "cover", border: "1px solid #e2e8f0" }} />
                <button type="button" onClick={() => update("questionImageUrl", null)} style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: "5px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Remove</button>
              </>
            )}
          </div>
        </div>
        <div style={{ position: "relative" }} ref={inputTypeRef}>
          <Label>Input Type</Label>
          {/* Trigger button — looks like a select, opens multiselect panel */}
          <button
            type="button"
            onClick={() => setInputTypeOpen((o) => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px",
              background: "#fff", cursor: "pointer", fontSize: "13px", color: "#0f172a",
              textAlign: "left", gap: "6px", minHeight: "36px",
              boxShadow: inputTypeOpen ? "0 0 0 2px #bfdbfe" : "none",
              outline: "none",
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedTypes.length === 1
                ? (INPUT_TYPES.find((t) => t.value === selectedTypes[0])?.label || selectedTypes[0])
                : `${INPUT_TYPES.find((t) => t.value === selectedTypes[0])?.label || selectedTypes[0]} +${selectedTypes.length - 1} more`
              }
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"
              style={{ flexShrink: 0, transform: inputTypeOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {/* Dropdown panel */}
          {inputTypeOpen && (
            <div style={{
              position: "absolute", zIndex: 200, top: "calc(100% + 4px)", left: 0, right: 0,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: "4px",
              maxHeight: "220px", overflowY: "auto",
            }}>
              {INPUT_TYPES.map((t) => {
                const checked = selectedTypes.includes(t.value);
                const isPrimary = selectedTypes[0] === t.value;
                return (
                  <label key={t.value} style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px",
                    cursor: "pointer", borderRadius: "6px", userSelect: "none",
                    background: checked ? "#eff6ff" : "transparent",
                    color: checked ? "#2563eb" : "#374151",
                    fontSize: "13px", fontWeight: checked ? 600 : 400,
                  }}>
                    <input
                      type="checkbox" checked={checked}
                      onChange={() => toggleType(t.value)}
                      style={{ accentColor: "#2563eb", cursor: "pointer", width: "14px", height: "14px", flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {isPrimary && selectedTypes.length > 1 && (
                      <span style={{ fontSize: "10px", color: "#94a3b8", background: "#f1f5f9", borderRadius: "4px", padding: "1px 5px" }}>primary</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <Label>Required</Label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", cursor: "pointer", fontSize: "13px", color: "#475569" }}>
            <input type="checkbox" checked={q.isRequired} onChange={(e) => update("isRequired", e.target.checked)} />
            Yes
          </label>
        </div>
        <div style={{ paddingTop: "22px" }}>
          <button type="button" onClick={() => onRemove(idx)}
            style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fee2e2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>

      {/* Dropdown / custom options */}
      {(q.inputType === "dropdown" || q.inputType === "custom_options") && (
        <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: q.inputType === "custom_options" ? "1fr 1fr" : "1fr", gap: "10px" }}>
          {q.inputType === "custom_options" && (
            <div>
              <Label required>Response Label (e.g. Working / Not Working)</Label>
              <Inp value={q._customLabel || ""} onChange={(e) => update("_customLabel", e.target.value)} placeholder="e.g. Working / Not Working" />
            </div>
          )}
          <div>
            <Label>Options (comma-separated)</Label>
            <Inp value={q._optionsText || ""} onChange={(e) => update("_optionsText", e.target.value)} placeholder={q.inputType === "custom_options" ? "e.g. Working, Not Working, Needs Service" : "e.g. Good, Fair, Poor"} />
          </div>
        </div>
      )}

      {/* Flag Rule section */}
      {hasRule && (
        <div style={{ marginTop: "10px", borderTop: "1px dashed #e2e8f0", paddingTop: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: rule._showRule ? "10px" : "0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12.5px", fontWeight: 600, color: rule._showRule ? "#d97706" : "#64748b", userSelect: "none" }}>
              <input type="checkbox" checked={!!rule._showRule}
                onChange={(e) => updateRule("_showRule", e.target.checked)}
                style={{ cursor: "pointer", accentColor: "#d97706" }} />
              ⚠ Add Flag / Alert Rule
            </label>
            {rule._showRule && rule.severity && (
              <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                background: rule.severity === "critical" ? "#fee2e2" : "#fef3c7",
                color: rule.severity === "critical" ? "#dc2626" : "#d97706" }}>
                {rule.severity === "critical" ? "🔴 Critical" : "🟡 Warning"}
              </span>
            )}
          </div>

          {rule._showRule && (
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Condition description / control for binary types */}
              {isBinaryType && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
                  <Label>Raise warning when answer is</Label>
                  <Sel
                    value={q.rule?.flagOn || (q.inputType === "yes_no" ? "No" : "Not OK")}
                    onChange={(e) => updateRule("flagOn", e.target.value)}
                  >
                    {binaryOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </Sel>
                  <div style={{ fontSize: "12px", color: "#92400e", background: "#fef3c7", padding: "7px 12px", borderRadius: "6px", fontWeight: 500 }}>
                    ⚠ A warning will be created when this answer equals <strong>"{q.rule?.flagOn || (q.inputType === "yes_no" ? "No" : "Not OK")}"</strong>.
                  </div>
                </div>
              )}

              {/* Number range */}
              {q.inputType === "number" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <Label>Min Acceptable Value</Label>
                    <Inp type="number" value={rule.minValue || ""} onChange={(e) => updateRule("minValue", e.target.value)} placeholder="e.g. 0" />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>Flag if value is below this</span>
                  </div>
                  <div>
                    <Label>Max Acceptable Value</Label>
                    <Inp type="number" value={rule.maxValue || ""} onChange={(e) => updateRule("maxValue", e.target.value)} placeholder="e.g. 90" />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>Flag if value is above this</span>
                  </div>
                </div>
              )}

              {/* Dropdown flag-on options */}
              {q.inputType === "dropdown" && (
                <div>
                  <Label>Flag when answer is (comma-separated options)</Label>
                  <Inp value={rule.flagOn || ""} onChange={(e) => updateRule("flagOn", e.target.value)}
                    placeholder={`e.g. Poor, Fail${q._optionsText ? " (from: " + q._optionsText + ")" : ""}`} />
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>Enter the option values that should trigger a flag</span>
                </div>
              )}

              {/* Severity + Action — common to all */}
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px" }}>
                <div>
                  <Label>Severity</Label>
                  <Sel value={rule.severity || "warning"} onChange={(e) => updateRule("severity", e.target.value)}>
                    <option value="warning">🟡 Warning</option>
                    <option value="critical">🔴 Critical</option>
                  </Sel>
                </div>
                <div>
                  <Label>Action / Alert Message</Label>
                  <Inp value={rule.action || ""} onChange={(e) => updateRule("action", e.target.value)}
                    placeholder="e.g. Stop operation and notify supervisor" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reference image upload */}
      <div style={{ marginTop: "10px", borderTop: "1px dashed #e2e8f0", paddingTop: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12.5px", color: "#475569", fontWeight: 600, border: "1px dashed #cbd5e1", borderRadius: "7px", padding: "5px 12px", background: "#f8fafc", opacity: imgUploading ? 0.6 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {imgUploading ? "Uploading…" : "Add Reference Photo"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleRefImgUpload} disabled={imgUploading} />
          </label>
          {q.referenceImageUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src={q.referenceImageUrl.startsWith("http") ? q.referenceImageUrl : `${apiBase}${q.referenceImageUrl}`} alt="ref" style={{ width: 48, height: 48, borderRadius: "6px", objectFit: "cover", border: "1px solid #e2e8f0" }} />
              <button type="button" onClick={() => update("referenceImageUrl", null)} style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: "5px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Remove</button>
            </div>
          )}
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Optional: upload a photo to guide the technician</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Template Builder (create / edit)
───────────────────────────────────────────────────────────────── */
function TemplateBuilder({ token, companies, assets: assetsProp = [], shifts = [], onBack, onSaved, createTemplate, updateTemplate, editTemplate, cloneFrom, companyPortalMode = false }) {
  const isEdit = !!editTemplate;
  const isClone = !isEdit && !!cloneFrom;
  const source = isEdit ? editTemplate : isClone ? cloneFrom : null;

  const [form, setForm] = useState(() => {
    if (source) {
      return {
        companyId: source.companyId || companies[0]?.id || "",
        templateName: isClone ? source.templateName : (source.templateName || ""),
        assetType: source.assetType || "generic",
        serviceType: source.serviceType || "",
        assetId: source.assetId ? String(source.assetId) : "",
        locationId: source.locationId ? String(source.locationId) : "",
        buildingId: source.buildingId ? String(source.buildingId) : "",
        floorId: source.floorId ? String(source.floorId) : "",
        roomId: source.roomId ? String(source.roomId) : "",
        category: source.category || "",
        description: source.description || "",
        status: source.status || "active",
        hasRemark: source.hasRemark != null ? !!source.hasRemark : true,
      };
    }
    return {
      companyId: companies[0]?.id || "",
      templateName: "",
      assetType: "generic",
      serviceType: "",
      assetId: "",
      locationId: "",
      buildingId: "",
      floorId: "",
      roomId: "",
      category: "",
      description: "",
      status: "active",
      hasRemark: true,
    };
  });

  const [questions, setQuestions] = useState(() => {
    const qs = Array.isArray(source?.questions) ? source.questions : [];
    if (qs.length) {
      return qs.map((q) => ({
        _id: Math.random().toString(36).slice(2),
        questionText: q.questionText || "",
        inputType: q.inputType || "yes_no",
        inputTypes: Array.isArray(q.inputTypes) ? q.inputTypes : [q.inputType || "yes_no"],
        isRequired: q.isRequired ?? q.is_required ?? true,
        options: q.options || [],
        _optionsText: Array.isArray(q.options) ? q.options.join(", ") : "",
        referenceImageUrl: q.referenceImageUrl || q.reference_image_url || null,
        questionImageUrl: q.questionImageUrl || q.question_image_url || null,
        rule: q.rule
          ? { ...q.rule, _showRule: !!(q.rule.action || q.rule.minValue || q.rule.maxValue || q.rule.flagOn) }
          : { flagOn: "", minValue: "", maxValue: "", severity: "warning", action: "", _showRule: false },
      }));
    }
    return [emptyQuestion()];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [assets, setAssets] = useState(assetsProp);
  const [locations, setLocations] = useState([]);
  // Track latest assets without triggering the reset effect on load
  const assetsRef = useRef(assetsProp);
  // Track previous company/type so reset only fires on explicit user changes
  const prevResetKeyRef = useRef({ companyId: form.companyId, assetType: form.assetType });

  // Fetch assets for the selected company from the API
  useEffect(() => {
    if (!token) return;
    const companyId = form.companyId || (companies[0]?.id ?? "");
    if (!companyId) return;
    let cancelled = false;
    // In edit mode, keep existing assets visible while re-fetching to prevent the
    // asset dropdown from visually "deselecting" during the loading phase.
    if (!isEdit) setAssets([]);
    const assetUrl = companyPortalMode
      ? `${API_BASE}/api/company-portal/assets`
      : `${API_BASE}/api/assets?companyId=${companyId}`;
    fetch(assetUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (!cancelled) setAssets(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, form.companyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep assetsRef in sync so the reset effect always reads the latest list
  useEffect(() => { assetsRef.current = assets; }, [assets]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Reset assetId ONLY when the user explicitly changes company or assetType —
  // never on initial mount or when the async assets list just finished loading.
  useEffect(() => {
    const prev = prevResetKeyRef.current;
    const curr = { companyId: form.companyId, assetType: form.assetType };
    prevResetKeyRef.current = curr;
    if (prev.companyId === curr.companyId && prev.assetType === curr.assetType) return;
    setForm((p) => {
      const cur = assetsRef.current;
      const filtered = cur.filter((a) => !p.assetType || p.assetType === "generic" || (a.assetType || a.asset_type) === p.assetType);
      const stillValid = filtered.some((a) => String(a.id) === String(p.assetId));
      return stillValid ? p : { ...p, assetId: "" };
    });
  }, [form.companyId, form.assetType]);  // eslint-disable-line react-hooks/exhaustive-deps

  const filteredChecklistAssets = useMemo(
    () => assets.filter((a) => !form.assetType || form.assetType === "generic" || (a.assetType || a.asset_type) === form.assetType),
    [assets, form.assetType]
  );

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const updateQuestion = (idx, updated) => {
    setQuestions((prev) => prev.map((q, i) => i === idx ? updated : q));
  };

  const removeQuestion = (idx) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    if (!isEdit && !form.companyId) return setError("Select a company");
    if (!form.templateName.trim()) return setError("Checklist name is required");
    for (const [i, q] of questions.entries()) {
      if (!q.questionText.trim() && !q.questionImageUrl) return setError(`Question ${i + 1}: provide either question text or a photo`);
    }

    const payload = {
      templateName: form.templateName.trim(),
      assetType: form.assetType,
      serviceType: form.serviceType || undefined,
      assetId: form.serviceType !== "soft_service" && form.assetId ? Number(form.assetId) : undefined,
      locationId: form.serviceType === "soft_service" && form.locationId ? Number(form.locationId) : undefined,
      buildingId: form.serviceType === "soft_service" && form.buildingId ? Number(form.buildingId) : undefined,
      floorId: form.serviceType === "soft_service" && form.floorId ? Number(form.floorId) : undefined,
      roomId: form.serviceType === "soft_service" && form.roomId ? Number(form.roomId) : undefined,
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      status: form.status,
      hasRemark: !!form.hasRemark,
      questions: questions.map((q, idx) => ({
        questionText: q.questionText.trim() || (q.questionImageUrl ? "[Photo Question]" : ""),
        inputType: q.inputType,
        inputTypes: q.inputTypes || [q.inputType],
        isRequired: q.isRequired,
        orderIndex: idx,
        referenceImageUrl: q.referenceImageUrl || undefined,
        questionImageUrl: q.questionImageUrl || undefined,
        options: (q.inputType === "dropdown" || q.inputType === "custom_options")
          ? (q._optionsText || "").split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        customLabel: q.inputType === "custom_options" ? (q._customLabel || "").trim() || undefined : undefined,
        rule: q.rule?._showRule
          ? {
              flagOn: q.rule.flagOn?.trim()
                || (q.inputType === "yes_no" ? "No"
                  : q.inputType === "ok_not_ok" ? "Not OK"
                  : undefined),
              minValue: q.inputType === "number" && q.rule.minValue !== "" ? Number(q.rule.minValue) : undefined,
              maxValue: q.inputType === "number" && q.rule.maxValue !== "" ? Number(q.rule.maxValue) : undefined,
              severity: q.rule.severity || "warning",
              action: q.rule.action?.trim() || undefined,
            }
          : undefined,
      })),
    };

    if (!isEdit) payload.companyId = Number(form.companyId);

    setSaving(true);
    try {
      if (isEdit && !isClone) {
        await updateTemplate(token, editTemplate.id, payload);
        onSaved(editTemplate.id);
      } else {
        const created = await createTemplate(token, payload);
        onSaved(created.id);
      }
    } catch (err) {
      setError(err.message || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <button type="button" onClick={onBack}
          style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>
            {isEdit ? "Edit Checklist" : isClone ? `New Frequency Variant — ${cloneFrom.templateName}` : "Create Checklist"}
          </h1>
          <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Define questions for a reusable checklist — assign to assets, departments, or users.</p>
        </div>
      </div>

      {error && <Alert type="error">⚠ {error}</Alert>}

      {/* Basic Info */}
      <Card style={{ marginBottom: "16px" }}>
        <CardHeader>Checklist Details</CardHeader>
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px 20px" }}>
          {!isEdit && (
            <div>
              <Label required>Company</Label>
              <Sel value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Sel>
            </div>
          )}
          <div style={{ gridColumn: isEdit ? "1 / span 2" : "span 2" }}>
            <Label required>Checklist Name</Label>
            <Inp value={form.templateName} onChange={(e) => setForm((p) => ({ ...p, templateName: e.target.value }))} placeholder='e.g. "Daily Safety Check", "AMC Inspection Form"' />
          </div>
          <div>
            <Label>Select Service Type</Label>
            <SearchableSelect
              value={form.serviceType || ""}
              onChange={(v) => setForm((p) => ({ ...p, serviceType: v, assetType: v || "generic", assetId: "", locationId: "", buildingId: "", floorId: "", roomId: "" }))}
              options={[
                { value: "", label: "— Select service type —" },
                { value: "soft_service", label: "Soft Service" },
                { value: "htm_service", label: "HTM Service" },
                { value: "technical", label: "Technical Service" },
                { value: "fleet_service", label: "Fleet Service" },
              ]}
              placeholder="Search service type…"
            />
          </div>
          {form.serviceType !== "soft_service" && (
            <div>
              <Label>Asset</Label>
              <SearchableSelect
                value={String(form.assetId ?? "")}
                onChange={(v) => setForm((p) => ({ ...p, assetId: v }))}
                options={[
                  { value: "", label: "— Select asset —" },
                  ...filteredChecklistAssets.map((a) => ({ value: String(a.id), label: a.assetName || a.asset_name }))
                ]}
                placeholder="Search & select asset…"
              />
                {assets.length > 0 && filteredChecklistAssets.length === 0 && (
                  <p style={{ fontSize: "11px", color: "#f59e0b", marginTop: "4px" }}>No {form.assetType} assets found for this company.</p>
                )}
                {assets.length === 0 && form.companyId && (
                  <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>Loading assets…</p>
                )}
            </div>
          )}
          <div>
            <Label>Category</Label>
            <Inp value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. Safety, Preventive, AMC" />
          </div>
          <div>
            <Label>Status</Label>
            <Sel value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Sel>
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <Label>Description</Label>
            <Inp value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Purpose / scope of this checklist" />
          </div>
          {/* Remark field toggle */}
          <div style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <input
              type="checkbox"
              id="has-remark-cb"
              checked={!!form.hasRemark}
              onChange={(e) => setForm((p) => ({ ...p, hasRemark: e.target.checked }))}
              style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
            />
            <label htmlFor="has-remark-cb" style={{ fontSize: "13px", fontWeight: 600, color: "#374151", cursor: "pointer", userSelect: "none" }}>
              Enable overall remark field
              <span style={{ fontWeight: 400, color: "#64748b", marginLeft: "6px" }}>— shows a free-text remark box at the end of this checklist</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Questions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Questions ({questions.length})</span>
        <SBtn onClick={addQuestion}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Question
        </SBtn>
      </div>

      {questions.map((q, idx) => (
        <QuestionRow key={q._id} q={q} idx={idx} onChange={updateQuestion} onRemove={removeQuestion} token={token} apiBase={API_BASE} />
      ))}

      <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
        <SBtn onClick={onBack} outline color="#64748b" bg="#fff">Cancel</SBtn>
        <SBtn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Template" : "Save Template"}</SBtn>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Assign Modal  (assign a checklist template to a user)
───────────────────────────────────────────────────────────────── */
function AssignModal({ token, companyId, template, templateType, onClose, companyPortalMode = false }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!companyPortalMode && !companyId) { setLoadingUsers(false); return; }
    const usersUrl = companyPortalMode
      ? `${API_BASE}/api/company-portal/employees`
      : `${API_BASE}/api/company-users?companyId=${companyId}`;
    fetch(usersUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [token, companyId, companyPortalMode]);

  const handleSubmit = async () => {
    if (!selectedUser) { setErr("Please select a user."); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        ...(companyPortalMode ? {} : { companyId }),
        templateType,
        templateId: Number(template.id),
        assignedTo: Number(selectedUser),
        note,
      };
      let res;
      if (companyPortalMode) {
        // Company portal auth — uses company JWT
        res = await fetch(`${API_BASE}/api/company-portal/template-user-assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } else {
        // Admin portal (client) — uses platform JWT + companyId
        res = await fetch(`${API_BASE}/api/company-users/template-assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || d.message || "Failed to assign"); }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal = { background: "#fff", borderRadius: "14px", padding: "28px 32px", minWidth: "360px", maxWidth: "480px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Assign Template</h3>
        <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13px" }}>Assign <b>{template.templateName}</b> to a user</p>
        {loadingUsers ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>Loading users…</p>
        ) : (
          <>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>Select User *</label>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", marginBottom: "14px", background: "#fff" }}>
              <option value="">— Choose a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName || u.displayName || u.username || u.email || `User #${u.id}`}</option>
              ))}
            </select>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", marginBottom: "18px", boxSizing: "border-box" }} />
          </>
        )}
        {err && <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>{err}</p>}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || loadingUsers}
            style={{ padding: "9px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Variant Modal  (clone template with new frequency + location)
───────────────────────────────────────────────────────────────── */
function VariantModal({ template, token, onClose, onCreate }) {
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/company-portal/locations`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);  // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLocation = locations.find((l) => String(l.id) === String(locationId)) || null;

  const handleCreate = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        templateName: template.templateName,
        assetType: template.assetType,
        serviceType: template.serviceType || template.assetType || undefined,
        category: template.category || undefined,
        description: template.description || undefined,
        locationId: locationId ? Number(locationId) : undefined,
        buildingId: selectedLocation?.buildingId ? Number(selectedLocation.buildingId) : undefined,
        floorId: selectedLocation?.floorId ? Number(selectedLocation.floorId) : undefined,
        roomId: selectedLocation?.roomId ? Number(selectedLocation.roomId) : undefined,
        questions: Array.isArray(template.questions) ? template.questions : [],
      };
      await onCreate(payload);
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to create variant");
    } finally {
      setSaving(false);
    }
  };

  const questionCount = Array.isArray(template.questions) ? template.questions.length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", padding: "28px 32px", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>⎘ Create Variant</h3>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 22px" }}>
          Clone <strong>"{template.templateName}"</strong> for a different location.
          {questionCount > 0 && <span style={{ color: "#16a34a", fontWeight: 600 }}> All {questionCount} question{questionCount !== 1 ? "s" : ""} will be copied.</span>}
        </p>

        <div style={{ marginBottom: "22px" }}>
          <Label>Location <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "11px" }}>(optional)</span></Label>
          <Sel value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— No specific location —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.building ? ` (${l.building})` : ""}</option>
            ))}
          </Sel>
          {locations.length === 0 && <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>No locations configured yet.</p>}
        </div>

        {err && <Alert type="error">{err}</Alert>}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <SBtn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</SBtn>
          <SBtn onClick={handleCreate} disabled={saving} bg="#059669">
            {saving ? "Creating…" : "⎘ Create Variant"}
          </SBtn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Template List
───────────────────────────────────────────────────────────────── */
const TemplateList = memo(function TemplateList({ token, companies, fetchTemplates, onBuild, onImport, onEdit, onDelete, canBuild, companyId, companyPortalMode = false, refreshKey = 0, createTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [variantTarget, setVariantTarget] = useState(null);
  const [filterType, setFilterType] = useState("");
  const [viewTemplate, setViewTemplate] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [filterAsset, setFilterAsset] = useState("");


  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend supports companyId="all" for multi-company aggregation
      const params = companyId ? `companyId=${companyId}&includeQuestions=true` : "includeQuestions=true";
      const data = await fetchTemplates(token, params);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load templates");
    } finally {
      setLoading(false);
    }
  }, [token, fetchTemplates, companyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTemplates(); }, [loadTemplates, refreshKey]);  // refreshKey triggers reload without remount

  const filtered = useMemo(() =>
    templates.filter((t) => {
      if (filterType && (t.serviceType || t.assetType) !== filterType) return false;
      if (filterAsset && String(t.assetId) !== String(filterAsset)) return false;
      if (search && !t.templateName?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    [templates, search, filterType, filterAsset]
  );

  // Derive unique values for filter dropdowns
  const uniqueFrequencies = useMemo(() => [...new Set(templates.map(t => t.frequency).filter(Boolean))], [templates]);
  const uniqueServiceTypes = useMemo(() => [...new Set(templates.map(t => t.serviceType || t.assetType).filter(Boolean))], [templates]);
  const uniqueAssets = useMemo(() => {
    const seen = new Map();
    templates.forEach(t => { if (t.assetId && t.assetName && !seen.has(t.assetId)) seen.set(t.assetId, t.assetName); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [templates]);


  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !onDelete) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected template(s)? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => onDelete(id)));
      setTemplates((prev) => prev.filter((t) => !ids.includes(t.id)));
      setSelectedIds(new Set());
    } catch (err) {
      alert(err.message || "Some templates could not be deleted");
      loadTemplates();
    }
  };

  const handleDelete = async (id, name) => {
    if (!onDelete) return;
    if (!window.confirm(`Delete checklist template "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (err) {
      alert(err.message || "Could not delete template");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {viewTemplate && <ViewModal template={viewTemplate} onClose={() => setViewTemplate(null)} />}
      {assignTarget && <AssignModal token={token} companyId={companyId} template={assignTarget} templateType="checklist" onClose={() => setAssignTarget(null)} companyPortalMode={companyPortalMode} />}
      {variantTarget && (
        <VariantModal
          template={variantTarget}
          token={token}
          onClose={() => setVariantTarget(null)}
          onCreate={async (payload) => {
            if (!createTemplate) throw new Error("createTemplate not available");
            await createTemplate(token, payload);
            setVariantTarget(null);
            loadTemplates();
          }}
        />
      )}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>Checklist</h1>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>Build inspection checklists for Locations, Assets.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {canBuild && onImport && (
            <SBtn onClick={onImport} outline color="#7c3aed" bg="#fff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              Import
            </SBtn>
          )}
          {canBuild && onBuild && (
            <SBtn onClick={onBuild}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Checklist
            </SBtn>
          )}
        </div>
      </div>

      {error && <Alert type="error">⚠ {error}</Alert>}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Total Templates", value: templates.length, bg: "#eff6ff", col: "#2563eb" },
          { label: "Active", value: templates.filter((t) => t.status === "active" || t.isActive).length, bg: "#f0fdf4", col: "#16a34a" },
          { label: "Total Questions", value: templates.reduce((acc, t) => acc + (t.questionCount != null ? t.questionCount : (Array.isArray(t.questions) ? t.questions.length : 0)), 0), bg: "#fffbeb", col: "#d97706" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "18px 22px", border: "1px solid #e2e8f0" }}>
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "8px", fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: "30px", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>All Checklists</CardHeader>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {canBuild && onDelete && selectedIds.size > 0 && (
            <SBtn onClick={handleBulkDelete} bg="#dc2626" style={{ marginRight: "4px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete Selected ({selectedIds.size})
            </SBtn>
          )}
          <Sel value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterAsset(""); }} style={{ width: "150px" }}>
            <option value="">All Service Types</option>
            {uniqueServiceTypes.map((v) => <option key={v} value={v}>{v}</option>)}
          </Sel>
          <Sel value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)} style={{ width: "150px" }}>
            <option value="">All Assets</option>
            {uniqueAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
          <Inp value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" style={{ width: "180px" }} />
          <SBtn onClick={loadTemplates} outline color="#64748b" bg="#fff" style={{ marginLeft: "auto" }}>Refresh</SBtn>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr>
                {canBuild && onDelete && (
                  <th style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", width: "40px" }}>
                    <input type="checkbox" checked={allSelected} onChange={handleSelectAll} style={{ cursor: "pointer", width: "15px", height: "15px" }} title={allSelected ? "Deselect all" : "Select all"} />
                  </th>
                )}
                {["Sr.No", "Checklist Name", "Service Type", "Category", "Questions", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="9" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading templates…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="9" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No checklist templates found.{canBuild && onBuild && (
                    <> <button onClick={onBuild} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Create your first →</button></>
                  )}
                </td></tr>
              )}
              {!loading && filtered.map((t, i) => {
                const qs = Array.isArray(t.questions) ? t.questions : [];
                const qCount = t.questionCount != null ? t.questionCount : qs.length;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedIds.has(t.id) ? "#f0f9ff" : undefined }}>
                    {canBuild && onDelete && (
                      <td style={{ padding: "13px 16px" }}>
                        <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => handleToggleSelect(t.id)} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                      </td>
                    )}
                    <td style={{ padding: "13px 16px", color: "#64748b" }}>{i + 1}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{t.templateName}</div>
                      {t.description && <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>{t.description}</div>}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <Badge bg="#eff6ff" col="#2563eb">{t.serviceType || t.assetType}</Badge>
                    </td>
                    <td style={{ padding: "13px 16px", color: "#64748b", fontSize: "13px" }}>{t.category || "—"}</td>
                    <td style={{ padding: "13px 16px", color: "#475569" }}>{qCount}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <Badge
                        bg={(t.status === "active" || t.isActive) ? "#f0fdf4" : "#fef2f2"}
                        col={(t.status === "active" || t.isActive) ? "#16a34a" : "#dc2626"}>
                        {t.status || (t.isActive ? "active" : "inactive")}
                      </Badge>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
                        {/* View */}
                        <button onClick={() => setViewTemplate(t)} title="View template"
                          style={{ padding: "5px 9px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                          👁 View
                        </button>
                        {/* Edit */}
                        {canBuild && onEdit && (
                          <button onClick={() => onEdit(t)} title="Edit template"
                            style={{ padding: "5px 9px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                            ✏ Edit
                          </button>
                        )}
                        {/* Delete */}
                        {canBuild && onDelete && (
                          <button onClick={() => handleDelete(t.id, t.templateName)} title="Delete template" disabled={deletingId === t.id}
                            style={{ padding: "5px 9px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600, opacity: deletingId === t.id ? 0.6 : 1 }}>
                            🗑 {deletingId === t.id ? "…" : "Del"}
                          </button>
                        )}
                        {/* Assign */}
                        {canBuild && (
                          <button onClick={() => setAssignTarget(t)} title="Assign to user"
                            style={{ padding: "5px 9px", background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                            👤 Assign
                          </button>
                        )}
                        {/* Clone for frequency */}
                        {canBuild && (companyPortalMode ? createTemplate : onBuild) && (
                          <button onClick={() => companyPortalMode ? setVariantTarget(t) : onBuild && onBuild(t)} title="Clone for different frequency / location"
                            style={{ padding: "5px 9px", background: "#f0fdf4", color: "#059669", border: "1px solid #6ee7b7", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                            ⎘ Variant
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
      </Card>
    </div>
  );
});  // end memo(TemplateList)

/* ─────────────────────────────────────────────────────────────────
   ChecklistTemplateModule root
───────────────────────────────────────────────────────────────── */
export default function ChecklistTemplateModule({
  token,
  companies = [],
  assets = [],
  shifts = [],
  fetchTemplates,
  createTemplate,
  fetchTemplate,
  updateTemplate,
  deleteTemplate,
  canBuild = true,
  companyId,
  companyPortalMode = false,
}) {
  const [view, setView] = useState("list");
  const [editTarget, setEditTarget] = useState(null);
  const [cloneTarget, setCloneTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showImport, setShowImport] = useState(false);

  const handleEdit = async (template) => {
    if (fetchTemplate) {
      try {
        const full = await fetchTemplate(token, template.id);
        setEditTarget(full);
      } catch (_) {
        setEditTarget(template);
      }
    } else {
      setEditTarget(template);
    }
    setView("editor");
  };

  const handleDelete = async (id) => {
    if (!deleteTemplate) return;
    await deleteTemplate(token, id);
  };

  if ((view === "builder" || view === "clone") && canBuild) {
    return (
      <TemplateBuilder
        token={token}
        companies={companies}
        assets={assets}
        shifts={shifts}
        onBack={() => { setCloneTarget(null); setView("list"); }}
        onSaved={() => { setCloneTarget(null); setRefreshKey((k) => k + 1); setView("list"); }}
        createTemplate={createTemplate}
        updateTemplate={updateTemplate}
        cloneFrom={view === "clone" ? cloneTarget : undefined}
        companyPortalMode={companyPortalMode}
      />
    );
  }

  if (view === "editor" && canBuild && editTarget) {
    return (
      <TemplateBuilder
        token={token}
        companies={companies}
        assets={assets}
        shifts={shifts}
        onBack={() => { setEditTarget(null); setView("list"); }}
        onSaved={() => { setEditTarget(null); setRefreshKey((k) => k + 1); setView("list"); }}
        editTemplate={editTarget}
        updateTemplate={updateTemplate}
        createTemplate={createTemplate}
        companyPortalMode={companyPortalMode}
      />
    );
  }

  return (
    <>
      {showImport && (
        <TemplateImportModal
          type="checklist"
          token={token}
          companies={companies}
          companyId={companyId}
          createTemplate={createTemplate}
          companyPortalMode={companyPortalMode}
          onClose={() => setShowImport(false)}
          onCreated={() => { setShowImport(false); setRefreshKey((k) => k + 1); }}
        />
      )}
      <TemplateList
        token={token}
        companies={companies}
        fetchTemplates={fetchTemplates}
        companyId={companyId}
        refreshKey={refreshKey}
        createTemplate={createTemplate}
        onBuild={canBuild && createTemplate ? (t) => {
          if (t && t.id) { setCloneTarget(t); setView("clone"); }
          else setView("builder");
        } : null}
        onImport={canBuild && createTemplate ? () => setShowImport(true) : null}
        onEdit={canBuild && updateTemplate ? handleEdit : null}
        onDelete={canBuild && deleteTemplate ? handleDelete : null}
        canBuild={canBuild}
        companyPortalMode={companyPortalMode}
      />
    </>
  );
}
