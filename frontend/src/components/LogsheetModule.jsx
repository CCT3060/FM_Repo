import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import TemplateImportModal from "./TemplateImportModal.jsx";
import {
  getLogsheetTemplates,
  createLogsheetTemplate,
  assignLogsheetTemplate,
  submitLogsheetEntry,
  getLogsheetEntriesByTemplate,
  getLogsheetGrid,
} from "../api.js";
import TabularLogsheetBuilder from "./TabularLogsheetBuilder.jsx";
import TabularLogsheetFill from "./TabularLogsheetFill.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/* ─────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────── */
const ASSET_CATEGORIES = [
  { value: "soft", label: "Soft Services" },
  { value: "technical", label: "Technical Assets" },
  { value: "fleet", label: "Fleet Assets" },
];

const ANSWER_TYPES = [
  { value: "yes_no", label: "Yes / No" },
  { value: "text", label: "Text Value" },
  { value: "number", label: "Number / Reading" },
];

const HEADER_FIELD_OPTIONS = [
  { key: "siteName", label: "Site Name" },
  { key: "location", label: "Location" },
  { key: "capacity", label: "Capacity" },
  { key: "assetId", label: "Asset ID" },
  { key: "monthYear", label: "Month / Year" },
  { key: "shift", label: "Shift" },
  { key: "technician", label: "Technician Name" },
  { key: "supervisor", label: "Supervisor Name" },
];

const PRIORITY_COLORS = {
  low: { bg: "#f0fdf4", col: "#16a34a" },
  medium: { bg: "#fffbeb", col: "#d97706" },
  high: { bg: "#fef2f2", col: "#dc2626" },
  critical: { bg: "#fdf4ff", col: "#7c3aed" },
};

const FREQUENCY_OPTIONS = [
  { value: "daily",       label: "Daily" },
  { value: "weekly",      label: "Weekly" },
  { value: "monthly",     label: "Monthly" },
  { value: "quarterly",   label: "Quarterly (3-Monthly)" },
  { value: "half_yearly", label: "Half-Yearly (6-Monthly)" },
  { value: "yearly",      label: "Yearly" },
];

const FREQ_COLORS = {
  daily:       { bg: "#f0fdf4", col: "#16a34a" },
  weekly:      { bg: "#eff6ff", col: "#2563eb" },
  monthly:     { bg: "#fffbeb", col: "#d97706" },
  quarterly:   { bg: "#f3e8ff", col: "#7c3aed" },
  half_yearly: { bg: "#ecfeff", col: "#0891b2" },
  yearly:      { bg: "#fff1f2", col: "#e11d48" },
};

const emptyQuestion = () => ({
  _id: Math.random().toString(36).slice(2),
  questionText: "",
  specification: "",
  answerType: "yes_no",
  rule: { ruleText: "", minValue: "", maxValue: "" },
  priority: "medium",
  mandatory: true,
});

const emptySection = () => ({
  _id: Math.random().toString(36).slice(2),
  name: "",
  questions: [emptyQuestion()],
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const daysInMonth = (month, year) => new Date(year, month, 0).getDate();

/* ─────────────────────────────────────────────────────────────────
   Small helper atoms
───────────────────────────────────────────────────────────────── */
const Label = ({ children, required }) => (
  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
    {children}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
  </label>
);

const Input = (props) => (
  <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", ...(props.style || {}) }} />
);

const Select = ({ children, ...props }) => (
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
   Template Builder – Section/Question editor
───────────────────────────────────────────────────────────────── */
function QuestionEditor({ q, sIdx, qIdx, onChange, onRemove }) {
  const update = (field, val) => onChange(sIdx, qIdx, { ...q, [field]: val });
  const updateRule = (field, val) => update("rule", { ...q.rule, [field]: val });

  return (
    <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 14px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 1.4fr 1fr", gap: "10px", alignItems: "flex-start", marginBottom: q.answerType === "number" ? "10px" : 0 }}>
        {/* Question text */}
        <div>
          <Label required>Question</Label>
          <Input value={q.questionText} onChange={(e) => update("questionText", e.target.value)} placeholder="e.g. Check for abnormal noise" />
          <input value={q.specification} onChange={(e) => update("specification", e.target.value)} placeholder="Spec / Expected (optional)" style={{ width: "100%", boxSizing: "border-box", padding: "6px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", outline: "none", marginTop: "6px", color: "#64748b" }} />
        </div>
        {/* Answer Type */}
        <div>
          <Label>Answer Type</Label>
          <Select value={q.answerType} onChange={(e) => update("answerType", e.target.value)}>
            {ANSWER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px", alignItems: "center" }}>
            <Select value={q.priority} onChange={(e) => update("priority", e.target.value)} style={{ flex: 1 }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
        </div>
        {/* Mandatory + delete */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <button type="button" onClick={() => onRemove(sIdx, qIdx)}
            style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fee2e2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={q.mandatory} onChange={(e) => update("mandatory", e.target.checked)} style={{ cursor: "pointer" }} />
            Mandatory
          </label>
        </div>
      </div>
      {/* Rule row */}
      {q.answerType === "number" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "8px" }}>
          <div>
            <Label>Min Value</Label>
            <Input type="number" value={q.rule.minValue} onChange={(e) => updateRule("minValue", e.target.value)} placeholder="e.g. 0" />
          </div>
          <div>
            <Label>Max Value</Label>
            <Input type="number" value={q.rule.maxValue} onChange={(e) => updateRule("maxValue", e.target.value)} placeholder="e.g. 90" />
          </div>
          <div>
            <Label>Alert Rule (text)</Label>
            <Input value={q.rule.ruleText} onChange={(e) => updateRule("ruleText", e.target.value)} placeholder="e.g. If > 90 → Alert" />
          </div>
        </div>
      )}
      {q.answerType === "yes_no" && (
        <div>
          <Label>Rule (text)</Label>
          <Input value={q.rule.ruleText} onChange={(e) => updateRule("ruleText", e.target.value)} placeholder="e.g. If NO → Raise issue" />
        </div>
      )}
    </div>
  );
}

function SectionEditor({ section, sIdx, onChange, onAddQ, onRemoveQ, onRemoveSection }) {
  return (
    <Card style={{ marginBottom: "16px" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "12px", alignItems: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <Input value={section.name} onChange={(e) => onChange(sIdx, { ...section, name: e.target.value })} placeholder="Section name (e.g. Inspection, Safety, Operation)" style={{ flex: 1 }} />
        <button type="button" onClick={() => onRemoveSection(sIdx)}
          style={{ padding: "6px 10px", background: "#fff0f0", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
          Remove Section
        </button>
      </div>
      <div style={{ padding: "14px 20px" }}>
        {section.questions.map((q, qIdx) => (
          <QuestionEditor key={q._id} q={q} sIdx={sIdx} qIdx={qIdx}
            onChange={(si, qi, updated) => {
              const qs = [...section.questions];
              qs[qi] = updated;
              onChange(si, { ...section, questions: qs });
            }}
            onRemove={(si, qi) => {
              const qs = section.questions.filter((_, i) => i !== qi);
              onChange(si, { ...section, questions: qs });
            }}
          />
        ))}
        <SBtn onClick={() => onAddQ(sIdx)} color="#2563eb" outline>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Add Question
        </SBtn>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Template Builder (create mode)
───────────────────────────────────────────────────────────────── */
function TemplateBuilder({ token, companies, assets, shifts = [], onBack, onSaved, createTemplate, assignTemplate, editTemplate, updateTemplate, companyPortalMode = false }) {
  const isEdit = !!editTemplate;

  const [form, setForm] = useState(() => {
    if (editTemplate) {
      return {
        companyId: editTemplate.companyId || companies[0]?.id || "",
        templateName: editTemplate.templateName || "",
        assetType: editTemplate.assetType || "technical",
        assetModel: editTemplate.assetModel || "",
        frequency: editTemplate.frequency || "daily",
        assetId: editTemplate.assetId ? String(editTemplate.assetId) : "",
        description: editTemplate.description || "",
        shiftId: editTemplate.shiftId ? String(editTemplate.shiftId) : "",
        headerConfig: editTemplate.headerConfig || { siteName: true, location: true, monthYear: true, shift: true, technician: true, supervisor: true },
      };
    }
    return {
      companyId: companies[0]?.id || "",
      templateName: "",
      assetType: "technical",
      assetModel: "",
      frequency: "daily",
      assetId: "",
      description: "",
      shiftId: "",
      headerConfig: { siteName: true, location: true, monthYear: true, shift: true, technician: true, supervisor: true },
    };
  });

  const [sections, setSections] = useState(() => {
    if (editTemplate?.sections?.length) {
      return editTemplate.sections.map((s) => ({
        _id: Math.random().toString(36).slice(2),
        name: s.sectionName || s.name || "",
        questions: (s.questions || []).map((q) => ({
          _id: Math.random().toString(36).slice(2),
          questionText: q.questionText || "",
          specification: q.specification || "",
          answerType: q.answerType || q.answer_type || "yes_no",
          rule: q.rule ? { ruleText: q.rule.ruleText || "", minValue: q.rule.minValue ?? "", maxValue: q.rule.maxValue ?? "" } : { ruleText: "", minValue: "", maxValue: "" },
          priority: q.priority || "medium",
          mandatory: q.isMandatory ?? q.mandatory ?? true,
        })),
      }));
    }
    return [emptySection()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [layoutType, setLayoutType] = useState(() =>
    isEdit ? (editTemplate?.layoutType || "standard") : "standard"
  );

  // Self-fetch assets for the selected company so this builder is independent of parent state
  const [fetchedAssets, setFetchedAssets] = useState(assets);
  useEffect(() => {
    if (!token || !form.companyId) return;
    let cancelled = false;
    setFetchedAssets([]);
    const assetUrl = companyPortalMode
      ? `${API_BASE}/api/company-portal/assets`
      : `${API_BASE}/api/assets?companyId=${form.companyId}`;
    fetch(assetUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (!cancelled) setFetchedAssets(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, form.companyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAssets = useMemo(() =>
    fetchedAssets.filter((a) => (a.assetType || a.asset_type) === form.assetType),
    [fetchedAssets, form.assetType]
  );

  const handleHeaderToggle = (key) => {
    setForm((prev) => ({ ...prev, headerConfig: { ...prev.headerConfig, [key]: !prev.headerConfig[key] } }));
  };

  const addSection = () => setSections((prev) => [...prev, emptySection()]);

  const updateSection = (sIdx, updated) => {
    setSections((prev) => prev.map((s, i) => (i === sIdx ? updated : s)));
  };

  const removeSection = (sIdx) => {
    if (sections.length === 1) return;
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  };

  const addQuestion = (sIdx) => {
    setSections((prev) => prev.map((s, i) => i === sIdx ? { ...s, questions: [...s.questions, emptyQuestion()] } : s));
  };

  const buildRule = (q) => {
    const r = {};
    if (q.rule.ruleText) r.ruleText = q.rule.ruleText;
    if (q.rule.minValue !== "") r.minValue = Number(q.rule.minValue);
    if (q.rule.maxValue !== "") r.maxValue = Number(q.rule.maxValue);
    return Object.keys(r).length ? r : undefined;
  };

  const handleSave = async () => {
    setError(null);
    if (!form.companyId) return setError("Select a company");
    if (!form.templateName.trim()) return setError("Template name is required");
    if (!form.assetId) return setError("Please select an asset to link this logsheet to");
    for (const [si, s] of sections.entries()) {
      if (!s.name.trim()) return setError(`Section ${si + 1} needs a name`);
      for (const [qi, q] of s.questions.entries()) {
        if (!q.questionText.trim()) return setError(`Section "${s.name}" – Question ${qi + 1} text is required`);
      }
    }
    setSaving(true);
    try {
      const payload = {
        companyId: Number(form.companyId),
        templateName: form.templateName.trim(),
        assetType: form.assetType,
        assetModel: form.assetModel.trim() || undefined,
        frequency: form.frequency,
        assetId: form.assetId ? Number(form.assetId) : undefined,
        description: form.description.trim() || undefined,
        shiftId: form.shiftId ? Number(form.shiftId) : undefined,
        headerConfig: form.headerConfig,
        sections: sections.map((s, si) => ({
          name: s.name.trim(),
          order: si,
          questions: s.questions.map((q, qi) => ({
            questionText: q.questionText.trim(),
            specification: q.specification.trim() || undefined,
            answerType: q.answerType,
            rule: buildRule(q),
            priority: q.priority,
            mandatory: q.mandatory,
            order: qi,
          })),
        })),
      };
      if (isEdit) {
        await (updateTemplate)(token, editTemplate.id, payload);
        onSaved(editTemplate.id);
      } else {
        const created = await (createTemplate || createLogsheetTemplate)(token, payload);
        onSaved(created.id);
      }
    } catch (err) {
      setError(err.message || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  const handleTabularCreate = async (tabularData) => {
    setError(null);
    if (!form.companyId) return setError("Select a company first");
    setSaving(true);
    try {
      const payload = {
        companyId: Number(form.companyId),
        ...tabularData,
      };
      const created = await (createTemplate || createLogsheetTemplate)(token, payload);
      onSaved(created.id);
    } catch (err) {
      setError(err.message || "Could not save tabular template");
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
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>{isEdit ? "Edit Logsheet Template" : "Create Logsheet Template"}</h1>
          <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Define sections &amp; questions for any asset type — reusable for all assets.</p>
        </div>
      </div>

      {error && <Alert type="error">⚠ {error}</Alert>}

      {/* Layout Type Selector — only for new templates */}
      {!isEdit && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {[{ v: "standard", l: "📋 Standard Form" }, { v: "tabular", l: "📊 Tabular Grid" }].map(({ v, l }) => (
            <button key={v} type="button" onClick={() => setLayoutType(v)}
              style={{ padding: "10px 22px", borderRadius: "8px", border: "2px solid", fontWeight: 700, fontSize: "14px", cursor: "pointer",
                background: layoutType === v ? "#2563eb" : "#f8fafc",
                borderColor: layoutType === v ? "#2563eb" : "#e2e8f0",
                color: layoutType === v ? "#fff" : "#64748b" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── TABULAR: company picker + builder ── */}
      {layoutType === "tabular" && !isEdit && (
        <>
          <Card style={{ marginBottom: "16px" }}>
            <CardHeader>Company</CardHeader>
            <div style={{ padding: "16px 20px" }}>
              <Label required>Company</Label>
              <Select value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Select>
              {!form.companyId && <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>Select a company before building the tabular template.</p>}
            </div>
          </Card>
          <TabularLogsheetBuilder
            assets={fetchedAssets}
            onSave={handleTabularCreate}
            onCancel={onBack}
            saving={saving}
          />
        </>
      )}

      {/* ── STANDARD form ── */}
      {(layoutType === "standard" || isEdit) && <>

      {/* Basic Info */}
      <Card style={{ marginBottom: "16px" }}>
        <CardHeader>Template Details</CardHeader>
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px 20px" }}>
          {!isEdit && (
          <div>
            <Label required>Company</Label>
            <Select value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value, assetId: "" }))}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </Select>
          </div>
          )}
          <div style={{ gridColumn: isEdit ? "span 2" : "span 2" }}>
            <Label required>Template / Logsheet Title</Label>
            <Input value={form.templateName} onChange={(e) => setForm((p) => ({ ...p, templateName: e.target.value }))} placeholder='e.g. "Daily A-Check – DG", "Monthly Boiler Log"' />
          </div>
          <div>
            <Label required>Frequency</Label>
            <Select value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}>
              {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Asset Category</Label>
            <Select value={form.assetType} onChange={(e) => setForm((p) => ({ ...p, assetType: e.target.value, assetId: "" }))}>
              {ASSET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Assign to Asset</Label>
            <Select value={form.assetId} onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value, assetModel: e.target.value ? (filteredAssets.find((a) => String(a.id) === e.target.value)?.assetName || p.assetModel) : p.assetModel }))}>
              <option value="">— Select asset —</option>
              {filteredAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName}</option>)}
            </Select>
            {filteredAssets.length === 0 && <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>No {form.assetType} assets found for this company</p>}
          </div>
          <div>
            <Label>Asset Model (auto-filled)</Label>
            <Input value={form.assetModel} onChange={(e) => setForm((p) => ({ ...p, assetModel: e.target.value }))} placeholder="e.g. Chiller, Boiler, DG Set" />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Purpose / scope of this logsheet" />
          </div>
          <div>
            <Label>Shift (optional)</Label>
            <Select value={form.shiftId} onChange={(e) => setForm((p) => ({ ...p, shiftId: e.target.value }))}>
              <option value="">— Any shift —</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {/* Header Fields */}
      <Card style={{ marginBottom: "16px" }}>
        <CardHeader>Header Fields</CardHeader>
        <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {HEADER_FIELD_OPTIONS.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", padding: "8px 14px", borderRadius: "8px", border: `1px solid ${form.headerConfig[f.key] ? "#2563eb" : "#e2e8f0"}`, background: form.headerConfig[f.key] ? "#eff6ff" : "#fff", fontSize: "13px", fontWeight: 500, color: form.headerConfig[f.key] ? "#2563eb" : "#475569" }}>
              <input type="checkbox" checked={!!form.headerConfig[f.key]} onChange={() => handleHeaderToggle(f.key)} style={{ display: "none" }} />
              {form.headerConfig[f.key] ? "✓" : "+"} {f.label}
            </label>
          ))}
        </div>
      </Card>

      {/* Sections */}
      <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Sections &amp; Questions</span>
        <SBtn onClick={addSection}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Section
        </SBtn>
      </div>
      {sections.map((s, sIdx) => (
        <SectionEditor key={s._id} section={s} sIdx={sIdx}
          onChange={updateSection}
          onAddQ={addQuestion}
          onRemoveQ={(si, qi) => {
            setSections((prev) => prev.map((sec, i) => i === si ? { ...sec, questions: sec.questions.filter((_, j) => j !== qi) } : sec));
          }}
          onRemoveSection={removeSection}
        />
      ))}

      <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
        <SBtn onClick={onBack} outline color="#64748b" bg="#fff">Cancel</SBtn>
        <SBtn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Template" : "Save Template"}</SBtn>
      </div>

      </>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Logsheet Grid Fill view
───────────────────────────────────────────────────────────────── */
function LogsheetFillView({ token, template, asset, onBack, fetchEntries, submitEntry }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [shift, setShift] = useState("1");
  const [headerValues, setHeaderValues] = useState({});
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [issueCount, setIssueCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const headerConfig = template.headerConfig || {};
  const days = daysInMonth(month, year);
  const dateColumns = Array.from({ length: days }, (_, i) => i + 1);

  const allQuestions = useMemo(() =>
    (template.sections || []).flatMap((s) => s.questions.map((q) => ({ ...q, sectionName: s.sectionName || s.name }))),
    [template]
  );

  useEffect(() => {
    const load = async () => {
      setLoadingEntries(true);
      try {
        const data = await (fetchEntries || getLogsheetEntriesByTemplate)(token, template.id, `assetId=${asset.id}&month=${month}&year=${year}`);
        setEntries(data);
        // Pre-fill answers from the latest entry
        if (data.length) {
          const latest = data[0];
          const prefilled = {};
          (latest.answers || []).forEach((a) => {
            if (!prefilled[a.questionId]) prefilled[a.questionId] = {};
            prefilled[a.questionId][a.dateColumn] = a.answerValue ?? "";
          });
          setAnswers(prefilled);
          if (latest.shift) setShift(latest.shift);
          if (latest.headerValues) setHeaderValues(latest.headerValues);
        }
      } catch (_) { /* ignore */ } finally {
        setLoadingEntries(false);
      }
    };
    load();
  }, [token, template.id, asset.id, month, year]);

  const setAnswer = (qId, day, val) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), [day]: val } }));
  };

  const renderCell = (q, day) => {
    const val = answers[q.id]?.[day] ?? "";
    const isIssue = (() => {
      if (q.answerType === "yes_no") {
        const v = String(val).toLowerCase();
        return v === "no" || v === "n";
      }
      if (q.answerType === "number" && val !== "" && q.rule) {
        const n = Number(val);
        if (q.rule.maxValue !== undefined && Number.isFinite(Number(q.rule.maxValue)) && n > Number(q.rule.maxValue)) return true;
        if (q.rule.minValue !== undefined && Number.isFinite(Number(q.rule.minValue)) && n < Number(q.rule.minValue)) return true;
      }
      return false;
    })();

    const cellBg = isIssue ? "#fef2f2" : "transparent";
    const cellColor = isIssue ? "#dc2626" : undefined;

    if (q.answerType === "yes_no") {
      return (
        <td key={day} style={{ padding: "0", textAlign: "center", background: cellBg, border: "1px solid #e2e8f0", minWidth: "36px" }}>
          <select value={val} onChange={(e) => setAnswer(q.id, day, e.target.value)}
            style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontSize: "12px", color: cellColor || (val === "Y" ? "#16a34a" : val === "N" ? "#dc2626" : "#475569"), cursor: "pointer", padding: "6px 2px", outline: "none" }}>
            <option value=""></option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </td>
      );
    }
    if (q.answerType === "number") {
      return (
        <td key={day} style={{ padding: "0", background: cellBg, border: "1px solid #e2e8f0", minWidth: "48px" }}>
          <input type="number" value={val} onChange={(e) => setAnswer(q.id, day, e.target.value)}
            style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontSize: "12px", color: cellColor, padding: "6px 2px", outline: "none", boxSizing: "border-box" }} />
        </td>
      );
    }
    return (
      <td key={day} style={{ padding: "0", background: cellBg, border: "1px solid #e2e8f0", minWidth: "60px" }}>
        <input value={val} onChange={(e) => setAnswer(q.id, day, e.target.value)}
          style={{ width: "100%", border: "none", background: "transparent", fontSize: "11px", padding: "6px 4px", outline: "none", boxSizing: "border-box" }} />
      </td>
    );
  };

  const handleSubmit = async () => {
    setError(null); setSuccess(null);
    const answersList = [];
    let issues = 0;
    for (const q of allQuestions) {
      for (const day of dateColumns) {
        const val = answers[q.id]?.[day];
        if (val !== undefined && val !== "") {
          answersList.push({ questionId: q.id, dateColumn: day, answerValue: val });
          // count issues
          if (q.answerType === "yes_no" && (String(val).toLowerCase() === "no" || val === "N")) issues++;
          if (q.answerType === "number" && q.rule) {
            const n = Number(val);
            if (Number.isFinite(Number(q.rule?.maxValue)) && n > Number(q.rule.maxValue)) issues++;
            else if (Number.isFinite(Number(q.rule?.minValue)) && n < Number(q.rule.minValue)) issues++;
          }
        }
      }
    }
    if (!answersList.length) return setError("No answers entered");
    setSaving(true);
    try {
      const res = await (submitEntry || submitLogsheetEntry)(token, template.id, {
        assetId: asset.id,
        month,
        year,
        shift: shift || undefined,
        headerValues,
        answers: answersList,
      });
      setIssueCount(res.issues || issues);
      setSuccess(`Logsheet saved! ${res.issues || issues} issue(s) detected.${res.issues ? " Work order(s) created automatically." : ""}`);
    } catch (err) {
      setError(err.message || "Could not submit logsheet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button type="button" onClick={onBack}
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>{template.templateName}</h1>
            <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
              Asset: <strong>{asset.assetName}</strong> &nbsp;|&nbsp; {MONTHS[month - 1]} {year}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: "100px" }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "90px" }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          {headerConfig.shift && (
            <Select value={shift} onChange={(e) => setShift(e.target.value)} style={{ width: "110px" }}>
              <option value="1">Shift 1</option>
              <option value="2">Shift 2</option>
              <option value="3">Shift 3</option>
            </Select>
          )}
        </div>
      </div>

      {error && <Alert type="error">⚠ {error}</Alert>}
      {success && <Alert type="success">✓ {success}{issueCount > 0 && <span style={{ marginLeft: "8px", fontWeight: 700, color: "#dc2626" }}>⚠ {issueCount} issue(s)</span>}</Alert>}

      {/* Header Values */}
      {Object.entries(headerConfig).some(([, v]) => v) && (
        <Card style={{ marginBottom: "16px" }}>
          <CardHeader>Header Information</CardHeader>
          <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            {HEADER_FIELD_OPTIONS.filter((f) => headerConfig[f.key]).map((f) => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input value={headerValues[f.key] || ""} onChange={(e) => setHeaderValues((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.label} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Date Grid */}
      <Card style={{ marginBottom: "16px", overflow: "hidden" }}>
        <CardHeader>Monthly Logsheet Grid — {MONTHS[month - 1]} {year}</CardHeader>
        <div style={{ overflowX: "auto" }}>
          {loadingEntries && <div style={{ padding: "16px 20px", color: "#94a3b8", fontSize: "13px" }}>Loading existing entries…</div>}
          {(template.sections || []).map((section, si) => (
            <div key={section.id || si}>
              {/* Section header */}
              <div style={{ padding: "8px 16px", background: "#f8fafc", borderTop: si ? "1px solid #e2e8f0" : "none", borderBottom: "1px solid #e2e8f0" }}>
                <span style={{ fontWeight: 700, fontSize: "13px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  § {section.sectionName || section.name}
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "11px", borderBottom: "1px solid #e2e8f0", minWidth: "220px", position: "sticky", left: 0, background: "#f8fafc", zIndex: 1 }}>
                      Question
                    </th>
                    <th style={{ padding: "8px 6px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", minWidth: "50px" }}>Spec</th>
                    {dateColumns.map((d) => (
                      <th key={d} style={{ padding: "8px 2px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", borderBottom: "1px solid #e2e8f0", minWidth: "36px", border: "1px solid #e2e8f0" }}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(section.questions || []).map((q, qi) => {
                    const hasIssueInRow = dateColumns.some((d) => {
                      const val = answers[q.id]?.[d];
                      if (!val) return false;
                      if (q.answerType === "yes_no") return String(val).toLowerCase() === "no" || val === "N";
                      if (q.answerType === "number" && q.rule) {
                        const n = Number(val);
                        if (Number.isFinite(Number(q.rule?.maxValue)) && n > Number(q.rule.maxValue)) return true;
                        if (Number.isFinite(Number(q.rule?.minValue)) && n < Number(q.rule.minValue)) return true;
                      }
                      return false;
                    });
                    return (
                      <tr key={q.id || qi} style={{ background: hasIssueInRow ? "#fff8f8" : (qi % 2 === 0 ? "#fff" : "#fafafa") }}>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "#334155", borderBottom: "1px solid #f1f5f9", position: "sticky", left: 0, background: hasIssueInRow ? "#fff8f8" : (qi % 2 === 0 ? "#fff" : "#fafafa"), zIndex: 1, borderRight: "2px solid #e2e8f0" }}>
                          <div style={{ fontWeight: q.isMandatory ? 600 : 400 }}>
                            {hasIssueInRow && <span style={{ color: "#dc2626", marginRight: "4px" }}>⚠</span>}
                            {q.questionText}
                            {q.isMandatory && <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>}
                          </div>
                          {q.specification && <div style={{ color: "#94a3b8", fontSize: "11px" }}>{q.specification}</div>}
                        </td>
                        <td style={{ padding: "6px", textAlign: "center", fontSize: "11px", color: "#64748b", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                          {q.specification || "—"}
                        </td>
                        {dateColumns.map((d) => renderCell(q, d))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>

      {/* Signature Section */}
      <Card style={{ marginBottom: "16px" }}>
        <CardHeader>Signatures</CardHeader>
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          {["1st Shift Technician", "2nd Shift Technician", "3rd Shift Technician", "Supervisor"].map((role) => (
            <div key={role} style={{ textAlign: "center" }}>
              <div style={{ height: "48px", borderBottom: "2px solid #94a3b8", marginBottom: "6px" }}></div>
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>{role}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Name / Emp. ID / Designation</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px" }}>
        <SBtn onClick={onBack} outline color="#64748b" bg="#fff">Back</SBtn>
        <SBtn onClick={handleSubmit} disabled={saving}
          style={{ background: saving ? "#93c5fd" : undefined }}>{saving ? "Submitting…" : "Submit Logsheet"}</SBtn>
      </div>

      {/* Issue Legend */}
      {issueCount > 0 && (
        <Card style={{ marginTop: "16px", padding: "14px 20px", background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ color: "#dc2626", fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>⚠ {issueCount} Issue(s) Detected</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Work orders have been created automatically for all flagged readings. Admin has been notified.</div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Logsheet DG-Grid View Modal
───────────────────────────────────────────────────────────────── */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function LogsheetGridViewModal({ template, token, onClose, fetchGrid }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [gridData, setGridData] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    if (!template || !token) return;
    setLoading(true);
    setError(null);
    const gridFn = fetchGrid || getLogsheetGrid;
    gridFn(token, template.id, `month=${month}&year=${year}`)
      .then((data) => {
        setGridData(data);
        const entries = data?.entries || [];
        setAllEntries(entries);
        setSelectedEntryId(entries[0]?.id ?? null);
      })
      .catch((err) => setError(err.message || "Could not load grid data"))
      .finally(() => setLoading(false));
  }, [template, token, month, year, fetchGrid]);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>${template?.templateName || "Logsheet"}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 10px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #000; padding: 2px 4px; text-align: center; }
        .title-bar { background: #1e3a5f; color: #fff; text-align: center; font-weight: bold; font-size: 14px; padding: 8px; }
        .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; }
        .header-cell { border: 1px solid #000; padding: 4px 6px; }
        .section-title { background: #d4e6f1; font-weight: bold; text-align: left; padding: 4px 6px; }
        .issue-cell { background: #fee2e2; color: #b91c1c; }
        @media print { @page { size: A3 landscape; margin: 10mm; } }
      </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };

  if (!template) return null;

  const days = gridData ? Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1) : Array.from({ length: 31 }, (_, i) => i + 1);
  const answerMap = gridData?.answerMap || {};
  const entry = gridData?.entry || null;
  const selectedEntry = allEntries.find((e) => e.id === selectedEntryId) || entry;
  const asset = gridData?.asset || null;
  const headerValues = entry?.headerValues || {};
  // Merge: use gridData template but fall back to the passed template's questions
  // if the API returns sections with no questions (edge case with some DB setups)
  const tmpl = (() => {
    const base = gridData?.template || template;
    if (!base.sections?.length && template?.sections?.length) return template;
    if (base.sections?.length && template?.sections?.length) {
      const merged = {
        ...base,
        sections: base.sections.map((s, si) => {
          if ((!s.questions || s.questions.length === 0) && template.sections[si]?.questions?.length) {
            return { ...s, questions: template.sections[si].questions };
          }
          return s;
        }),
      };
      return merged;
    }
    return base;
  })();
  const headerConfig = tmpl?.headerConfig || {};

  const cellVal = (qId, day) => answerMap[qId]?.[day]?.value ?? "";
  const cellIssue = (qId, day) => !!answerMap[qId]?.[day]?.isIssue;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "1200px", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,0.25)" }}>

        {/* Modal toolbar */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: "16px", color: "#0f172a", flex: 1, minWidth: "200px" }}>{template.templateName}</div>

          {/* Month/Year pickers */}
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "80px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "13px" }} />

          {/* Submission selector — shown when multiple entries exist (e.g. different shifts) */}
          {allEntries.length > 1 && (
            <select
              value={selectedEntryId || ""}
              onChange={(e) => setSelectedEntryId(Number(e.target.value) || null)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "13px", maxWidth: "260px" }}
            >
              {allEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.shift ? `Shift: ${e.shift} — ` : ""}
                  {new Date(e.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  {e.submittedByName ? ` · ${e.submittedByName}` : ""}
                </option>
              ))}
            </select>
          )}
          <button onClick={handlePrint} style={{ padding: "6px 14px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
            &#128424; Print
          </button>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Grid content */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading grid…</div>}
          {error && <div style={{ padding: "20px", color: "#b91c1c" }}>⚠ {error}</div>}

          {!loading && !error && (
            <div ref={printRef} style={{ padding: "16px", minWidth: "900px" }}>

              {/* ── Title Banner ── */}
              <div style={{ background: "#1e3a5f", color: "#fff", textAlign: "center", fontWeight: 800, fontSize: "16px", padding: "12px", letterSpacing: "0.5px", borderRadius: "6px 6px 0 0" }}>
                {tmpl.templateName || "Log Sheet"}
                {tmpl.assetModel ? ` — ${tmpl.assetModel}` : ""}
              </div>

              {/* ── Sub-title bar ── */}
              <div style={{ background: "#2563eb", color: "#fff", textAlign: "center", fontSize: "12px", fontWeight: 600, padding: "6px" }}>
                {MONTH_NAMES[month - 1]} {year} {"\u00a0|\u00a0"} {tmpl.assetType || ""}{asset ? ` — ${asset.assetName}` : ""}
                {selectedEntry?.submittedByName ? `\u00a0|\u00a0 Submitted by: ${selectedEntry.submittedByName}` : ""}
                {selectedEntry?.shift ? `\u00a0|\u00a0 Shift: ${selectedEntry.shift}` : ""}
              </div>

              {/* ── Tabular template preview ── */}
              {headerConfig.layoutType === "tabular" ? (() => {
                const safeStr = (v) => {
                  if (v === null || v === undefined) return "";
                  if (typeof v !== "object") return String(v);
                  return v.label ?? v.id ?? "";
                };
                const rows = headerConfig.rows || [];
                const columnGroups = headerConfig.columnGroups || [];
                const allCols = columnGroups.flatMap((g) => (g.columns || []).map((c) => ({ ...c, groupId: g.id, groupLabel: g.label })));
                const readings = selectedEntry?.data?.readings || {};
                const summaryData = selectedEntry?.data?.summary || {};
                const tabVal = (rowId, col) => readings[rowId]?.[`${col.groupId}__${col.id}`] || "";
                const sumVal = (rowId, col) => summaryData[rowId]?.[`${col.groupId}__${col.id}`] || readings[rowId]?.[`${col.groupId}__${col.id}`] || "";
                const hasSubLabels = allCols.some((c) => c.subLabel);
                return (
                  <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "11px" }}>
                      <thead>
                        {/* Group header row */}
                        <tr>
                          <th rowSpan={hasSubLabels ? 3 : 2} style={{ ...thStyle, background: "#1e3a5f", color: "#fff", verticalAlign: "middle", minWidth: "70px" }}>
                            {safeStr(headerConfig.rowLabelHeader) || "TIME"}
                          </th>
                          {columnGroups.map((g, gi) => (
                            <th key={gi} colSpan={(g.columns || []).length}
                              style={{ ...thStyle, background: "#1e3a5f", color: "#fff" }}>
                              {safeStr(g.label)}
                            </th>
                          ))}
                        </tr>
                        {/* Column label row */}
                        <tr>
                          {allCols.map((c, ci) => (
                            <th key={ci} rowSpan={hasSubLabels && !c.subLabel ? 2 : 1}
                              style={{ ...thStyle, background: "#334e7e", color: "#fff", minWidth: "50px" }}>
                              {safeStr(c.label)}
                            </th>
                          ))}
                        </tr>
                        {/* Sub-label row */}
                        {hasSubLabels && (
                          <tr>
                            {allCols.filter((c) => c.subLabel).map((c, ci) => (
                              <th key={ci} style={{ ...thStyle, background: "#4a6fa5", color: "#fff" }}>
                                {safeStr(c.subLabel)}
                              </th>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f8fafc" }}>
                            <td style={{ ...tdStyle, fontWeight: 700, textAlign: "left", paddingLeft: "8px" }}>
                              {safeStr(row)}
                            </td>
                            {allCols.map((col, ci) => {
                              const val = tabVal(row.id ?? row, col);
                              return (
                                <td key={ci} style={{
                                  ...tdStyle,
                                  background: val ? "#f0fdf4" : "#fff",
                                  color: val ? "#15803d" : "#94a3b8",
                                  fontWeight: val ? 700 : 400,
                                }}>{val}</td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Summary rows */}
                        {(headerConfig.summaryRows || []).map((sr, sri) => (
                          <tr key={`sum-${sri}`} style={{ background: "#f1f5f9" }}>
                            <td style={{ ...tdStyle, fontWeight: 700, textAlign: "left", paddingLeft: "8px", color: "#1e40af" }}>
                              {safeStr(sr.label)}
                            </td>
                            {allCols.map((col, ci) => {
                              const val = sumVal(sr.id ?? sr, col);
                              return (
                                <td key={ci} style={{
                                  ...tdStyle,
                                  background: val ? "#eff6ff" : "#f8fafc",
                                  color: val ? "#1e40af" : "#94a3b8",
                                  fontWeight: val ? 700 : 400,
                                }}>{val}</td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })() : (
                <>
              {/* ── Header fields (standard templates only) ── */}
              {Object.keys(headerConfig).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "1px solid #cbd5e1", borderTop: "none", marginBottom: "12px" }}>
                  {Object.entries(headerConfig)
                    .filter(([, v]) => typeof v === "string" || typeof v === "number")
                    .map(([key, label]) => (
                    <div key={key} style={{ display: "flex", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
                      <div style={{ background: "#f1f5f9", padding: "6px 10px", fontWeight: 700, fontSize: "11px", color: "#334155", minWidth: "110px", borderRight: "1px solid #e2e8f0" }}>{String(label)}</div>
                      <div style={{ padding: "6px 10px", fontSize: "12px", color: "#0f172a", flex: 1 }}>
                        {key === "monthYear" ? `${MONTH_NAMES[month - 1]} ${year}` : (headerValues[key] || "—")}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Sections + Questions Grid ── */}
              {(tmpl.sections || []).length === 0 && !loading && (
                <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "6px" }}>
                  No questions found for this template. Add sections and questions in the template builder.
                </div>
              )}
              {(tmpl.sections || []).map((section, si) => (
                <div key={section.id || si} style={{ marginBottom: "16px" }}>
                  {/* Section title row */}
                  <div style={{ background: "#dbeafe", padding: "6px 10px", fontWeight: 700, fontSize: "12px", color: "#1e40af", border: "1px solid #bfdbfe", borderBottom: "none" }}>
                    {si + 1}. {section.sectionName || section.name || `Section ${si + 1}`}
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "11px" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: "28px", background: "#1e3a5f", color: "#fff" }}>Sl.</th>
                          <th style={{ ...thStyle, textAlign: "left", minWidth: "160px", background: "#1e3a5f", color: "#fff" }}>Activities / Parameters</th>
                          <th style={{ ...thStyle, minWidth: "70px", background: "#1e3a5f", color: "#fff" }}>Specification</th>
                          {days.map((d) => (
                            <th key={d} style={{ ...thStyle, width: "24px", background: "#1e3a5f", color: "#fff", padding: "2px 0" }}>{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(section.questions || []).map((q, qi) => (
                          <tr key={q.id || qi} style={{ background: qi % 2 === 0 ? "#fff" : "#f8fafc" }}>
                            <td style={tdStyle}>{qi + 1}</td>
                            <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>
                              {q.questionText}
                            </td>
                            <td style={{ ...tdStyle, color: "#64748b", fontSize: "10px" }}>{q.specification || ""}</td>
                            {days.map((d) => {
                              const val = cellVal(q.id, d);
                              const issue = cellIssue(q.id, d);
                              return (
                                <td key={d} style={{
                                  ...tdStyle,
                                  background: issue ? "#fee2e2" : (val ? "#f0fdf4" : "#fff"),
                                  color: issue ? "#b91c1c" : (val ? "#15803d" : "#94a3b8"),
                                  fontWeight: val ? 700 : 400,
                                  fontSize: "10px",
                                }}>
                                  {val || ""}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
                </>
              )}

              {/* ── Signature section ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", border: "1px solid #cbd5e1", marginTop: "20px" }}>
                {["Technician Signature", "Supervisor Signature", "Manager Signature"].map((label) => (
                  <div key={label} style={{ padding: "16px 12px 8px", borderRight: "1px solid #cbd5e1", textAlign: "center" }}>
                    <div style={{ height: "40px", borderBottom: "1px solid #94a3b8", marginBottom: "6px" }} />
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Issue legend if any */}
              {Object.values(answerMap).some((days) => Object.values(days).some((c) => c.isIssue)) && (
                <div style={{ marginTop: "12px", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px", border: "1px solid #fecaca", fontSize: "11px", color: "#b91c1c" }}>
                  <strong>Issues flagged</strong> — cells highlighted in red contain out-of-range or flagged readings. Review with supervisor.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: "5px 4px", border: "1px solid #94a3b8", textAlign: "center", fontWeight: 700, fontSize: "11px" };
const tdStyle = { padding: "4px 4px", border: "1px solid #e2e8f0", textAlign: "center", verticalAlign: "middle" };



/* ─────────────────────────────────────────────────────────────────
   Assign Modal  (assign a logsheet template to a user)
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
      const res = await fetch(`${API_BASE}/api/company-portal/template-user-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateType, templateId: template.id, assignedTo: selectedUser, note }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to assign"); }
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
                <option key={u.id} value={u.id}>{u.fullName || u.username || u.email || `User #${u.id}`}</option>
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
   Template List (main view)
───────────────────────────────────────────────────────────────── */
function TemplateList({ token, companies, assets, onBuild, onImport, onFill, fetchTemplates, onEdit, onDelete, canBuild, fetchGrid, companyPortalMode = false }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [viewTemplate, setViewTemplate] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let params = "includeSections=false";
      if (filterCompanyId) params += `&companyId=${filterCompanyId}`;
      if (filterType) params += `&assetType=${filterType}`;
      const data = await (fetchTemplates || getLogsheetTemplates)(token, params);
      setTemplates(data);
    } catch (err) {
      setError(err.message || "Could not load templates");
    } finally {
      setLoading(false);
    }
  }, [token, filterCompanyId, filterType]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const filtered = useMemo(() =>
    templates.filter((t) => !search || t.templateName?.toLowerCase().includes(search.toLowerCase()) || (t.assetModel || "").toLowerCase().includes(search.toLowerCase())),
    [templates, search]
  );

  const statsTotal = templates.length;
  const statsActive = templates.filter((t) => t.isActive !== false).length;
  const typeCounts = useMemo(() => {
    const m = {};
    templates.forEach((t) => { m[t.assetType] = (m[t.assetType] || 0) + 1; });
    return m;
  }, [templates]);

  const handleDelete = async (id, name) => {
    if (!onDelete) return;
    if (!window.confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err.message || "Could not delete template");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {viewTemplate && <LogsheetGridViewModal template={viewTemplate} token={token} onClose={() => setViewTemplate(null)} fetchGrid={fetchGrid} />}
      {assignTarget && <AssignModal token={token} companyId={assignTarget?.companyId || filterCompanyId || companies?.[0]?.id} template={assignTarget} templateType="logsheet" onClose={() => setAssignTarget(null)} companyPortalMode={companyPortalMode} />}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>Logsheet Generator</h1>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>Create dynamic logsheet templates for any asset. Auto-generates monthly date-wise grids.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {onImport && (
            <SBtn onClick={onImport} outline color="#7c3aed" bg="#fff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              Import
            </SBtn>
          )}
          {onBuild && (
            <SBtn onClick={onBuild}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Template
            </SBtn>
          )}
        </div>
      </div>

      {error && <Alert type="error">⚠ {error}</Alert>}

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Total Templates", value: statsTotal, sub: "All templates", subCol: "#64748b", iconBg: "#dbeafe", iconCol: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
          { label: "Active Templates", value: statsActive, sub: "✓ Active", subCol: "#22c55e", iconBg: "#f0fdf4", iconCol: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
          { label: "Technical", value: typeCounts.technical || 0, sub: "Technical assets", subCol: "#2563eb", iconBg: "#eff6ff", iconCol: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg> },
          { label: "Fleet", value: typeCounts.fleet || 0, sub: "Fleet assets", subCol: "#7c3aed", iconBg: "#f3e8ff", iconCol: "#7c3aed", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>
              <p style={{ color: s.subCol, fontSize: "13px", marginTop: "10px", fontWeight: 500 }}>{s.sub}</p>
            </div>
            <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconCol, flexShrink: 0 }}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>Templates List</CardHeader>
        {/* Filters */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <Select value={filterCompanyId} onChange={(e) => setFilterCompanyId(e.target.value)} style={{ width: "160px" }}>
              <option value="">All Companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </Select>
            <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: "140px" }}>
              <option value="">All Types</option>
              {ASSET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#64748b" }}>Search:</span>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Template name..." style={{ width: "200px" }} />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr>
                {["#", "Template Name", "Asset / Frequency", "Asset Category", "Company", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading templates…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No logsheet templates yet.
                  {onBuild && <> {" "}<button onClick={onBuild} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Create your first template →</button></>}
                </td></tr>
              )}
              {!loading && filtered.map((t, i) => {
                const catLabel = ASSET_CATEGORIES.find((c) => c.value === t.assetType)?.label || t.assetType;
                const company = companies.find((c) => String(c.id) === String(t.companyId));
                // Only use the directly bound asset — never fall back to type-based matching
                const boundAsset = t.assetId
                  ? assets.find((a) => String(a.id) === String(t.assetId))
                  : null;
                const freqOpt = FREQUENCY_OPTIONS.find((f) => f.value === t.frequency);
                const freqColors = FREQ_COLORS[t.frequency] || FREQ_COLORS.daily;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{t.templateName}</div>
                      {t.description && <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>{t.description}</div>}
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>Created {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {t.assetName ? (
                          <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13px" }}>{t.assetName}</span>
                        ) : t.assetModel ? (
                          <span style={{ color: "#475569", fontSize: "13px" }}>{t.assetModel}</span>
                        ) : null}
                        <Badge bg={freqColors.bg} col={freqColors.col}>{freqOpt?.label || t.frequency || "Daily"}</Badge>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <Badge bg={t.assetType === "technical" ? "#eff6ff" : t.assetType === "fleet" ? "#f3e8ff" : "#f0fdf4"}
                        col={t.assetType === "technical" ? "#2563eb" : t.assetType === "fleet" ? "#7c3aed" : "#16a34a"}>
                        {catLabel}
                      </Badge>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#475569", fontSize: "13px" }}>{company?.companyName || "—"}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <Badge bg={t.isActive !== false ? "#f0fdf4" : "#f8fafc"} col={t.isActive !== false ? "#16a34a" : "#94a3b8"}>
                        {t.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap" }}>
                        {/* View */}
                        <button title="View template" onClick={() => setViewTemplate(t)}
                          style={{ padding: "5px 9px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                          👁 View
                        </button>
                        {/* Edit */}
                        {onEdit && canBuild && (
                          <button title="Edit template" onClick={() => onEdit(t)}
                            style={{ padding: "5px 9px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                            ✏ Edit
                          </button>
                        )}
                        {/* Delete */}
                        {onDelete && canBuild && (
                          <button title="Delete template" onClick={() => handleDelete(t.id, t.templateName)} disabled={deletingId === t.id}
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
                        {/* Fill button - only for the directly bound asset */}
                        {onFill && boundAsset ? (
                          <button title={`Fill logsheet for ${boundAsset.assetName || boundAsset.asset_name}`} onClick={() => onFill(t, boundAsset)}
                            style={{ padding: "5px 10px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                            📋 Fill Logsheet
                          </button>
                        ) : onFill && !boundAsset && t.layoutType === "tabular" ? (
                          // Tabular templates have their own asset picker inside the fill form
                          <button title="Fill tabular logsheet" onClick={() => onFill(t, { id: null })}
                            style={{ padding: "5px 10px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                            📋 Fill Logsheet
                          </button>
                        ) : onFill && !boundAsset ? (
                          <span title="Edit this template and assign an asset to enable filling" style={{ fontSize: "12px", color: "#94a3b8", padding: "5px 0" }}>No asset assigned</span>
                        ) : null}
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
}

/* ─────────────────────────────────────────────────────────────────
   LogsheetModule root
───────────────────────────────────────────────────────────────── */
export default function LogsheetModule({ token, assets, companies, shifts = [], fetchTemplates, fetchEntries, submitEntry, createTemplate, assignTemplate, canBuild = true, fetchTemplate, updateTemplate, deleteTemplate, fetchGrid, companyPortalMode = false, directFill = null, onDirectFillConsumed }) {
  const [showImport, setShowImport] = useState(false);
  // view: "list" | "builder" | "editor" | "fill"
  const [view, setView] = useState("list");
  const [fillTemplate, setFillTemplate] = useState(null);
  const [fillAsset, setFillAsset] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fillLoading, setFillLoading] = useState(false);

  // Auto-open fill view when directFill is provided (e.g. from My Tasks)
  useEffect(() => {
    if (!directFill) return;
    (async () => {
      let fullTemplate = directFill.template || { id: directFill.templateId };
      if (fetchTemplate && directFill.templateId) {
        try { fullTemplate = await fetchTemplate(token, directFill.templateId); } catch (_) { /* use partial */ }
      }
      setFillTemplate(fullTemplate);
      setFillAsset(directFill.asset || (directFill.assetId ? { id: directFill.assetId } : null));
      setView("fill");
      onDirectFillConsumed?.();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directFill]);

  const handleFill = async (template, asset) => {
    // If the template from the list doesn't have sections loaded, fetch the full template first
    let fullTemplate = template;
    if (fetchTemplate && (!template.sections || template.sections.length === 0)) {
      setFillLoading(true);
      try {
        fullTemplate = await fetchTemplate(token, template.id);
      } catch (_) {
        /* fall back to the partial template */
      } finally {
        setFillLoading(false);
      }
    }
    setFillTemplate(fullTemplate);
    setFillAsset(asset);
    setView("fill");
  };

  const handleEdit = async (template) => {
    // If we have a fetchTemplate function, load the full template with sections/questions
    if (fetchTemplate) {
      try {
        const full = await fetchTemplate(token, template.id);
        setEditTarget(full);
      } catch (_) {
        setEditTarget(template); // fallback to whatever we have
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

  if (view === "builder" && canBuild) {
    return (
      <TemplateBuilder
        token={token}
        companies={companies}
        assets={assets}
        shifts={shifts}
        onBack={() => setView("list")}
        onSaved={() => { setRefreshKey((k) => k + 1); setView("list"); }}
        createTemplate={createTemplate}
        assignTemplate={assignTemplate}
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
        assignTemplate={assignTemplate}
        companyPortalMode={companyPortalMode}
      />
    );
  }

  if (fillLoading) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Loading logsheet…</div>
        <div style={{ fontSize: "13px", color: "#94a3b8" }}>Fetching questions and sections</div>
      </div>
    );
  }

  if (view === "fill" && fillTemplate && (fillAsset || fillTemplate.layoutType === "tabular")) {
    // Tabular logsheets use their own specialised fill component
    if (fillTemplate.layoutType === "tabular") {
      return (
        <TabularLogsheetFill
          template={fillTemplate}
          assets={assets}
          onSubmit={async (data) => {
            await (submitEntry || submitLogsheetEntry)(token, fillTemplate.id, data);
            setView("list");
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setView("list")}
        />
      );
    }
    return (
      <LogsheetFillView
        token={token}
        template={fillTemplate}
        asset={fillAsset}
        onBack={() => setView("list")}
        fetchEntries={fetchEntries}
        submitEntry={submitEntry}
      />
    );
  }

  return (
    <>
      {showImport && (
        <TemplateImportModal
          type="logsheet"
          token={token}
          companies={companies}
          createTemplate={createTemplate}
          companyPortalMode={companyPortalMode}
          onClose={() => setShowImport(false)}
          onCreated={() => { setShowImport(false); setRefreshKey((k) => k + 1); }}
        />
      )}
      <TemplateList
        key={refreshKey}
        token={token}
        companies={companies}
        assets={assets}
        onBuild={canBuild ? () => setView("builder") : null}
        onImport={canBuild && createTemplate ? () => setShowImport(true) : null}
        onFill={handleFill}
        fetchTemplates={fetchTemplates}
        onEdit={canBuild && updateTemplate ? handleEdit : null}
        onDelete={canBuild && deleteTemplate ? handleDelete : null}
        canBuild={canBuild}
        fetchGrid={fetchGrid}
        companyPortalMode={companyPortalMode}
      />
    </>
  );
}
