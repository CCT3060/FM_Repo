/**
 * TabularLogsheetBuilder.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual builder for "tabular" style logsheets (e.g. Steam Engine Room Log).
 *
 * The template is stored as header_config JSON:
 * {
 *   layoutType     : "tabular",
 *   rowLabelHeader : "TIME",
 *   rows           : [{ id, label }],        // row labels (time slots)
 *   columnGroups   : [                        // grouped + nested columns
 *     { id, label, columns: [{ id, label, subLabel, dataType, required }] }
 *   ],
 *   summaryRows    : [                        // footer table rows
 *     { id, label, fields: [{ id, label, computed? }] }
 *   ],
 *   footerBlocks   : [                        // remarks + signature section
 *     { id, type: "remarks"|"signatures", label?, fields?: [{ id, label }] }
 *   ]
 * }
 */

import { useState } from "react";

/* ─── Preset row configurations ───────────────────────────────────────────── */
const ROW_PRESETS = {
  hourly_07_06: {
    label: "Hourly 07:00 → 06:00 (24h, steam-engine style)",
    rows: ["07","08","09","10","11","12","13","14","15","16","17","18",
           "19","20","21","22","23","00","01","02","03","04","05","06"]
      .map((h) => ({ id: h, label: `${h}..` })),
  },
  hourly_00_23: {
    label: "Hourly 00:00 → 23:00 (midnight start)",
    rows: Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, "0");
      return { id: h, label: `${h}:00` };
    }),
  },
  shifts_3: {
    label: "Three shifts (Morning / Afternoon / Night)",
    rows: [
      { id: "morning", label: "Morning (06:00–14:00)" },
      { id: "afternoon", label: "Afternoon (14:00–22:00)" },
      { id: "night", label: "Night (22:00–06:00)" },
    ],
  },
  custom: { label: "Custom rows (enter manually)", rows: [] },
};

const DATA_TYPES = [
  { value: "number", label: "Number / Reading" },
  { value: "text",   label: "Text" },
  { value: "yes_no", label: "Yes / No" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function SectionCard({ title, children, onAdd, addLabel }) {
  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{title}</span>
        {onAdd && (
          <button onClick={onAdd} style={{ padding: "5px 14px", borderRadius: "8px", border: "none",
            background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>
            + {addLabel || "Add"}
          </button>
        )}
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function ColInput({ label, value, onChange, placeholder, type = "text", width = "100%" }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width, boxSizing: "border-box", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0",
                 fontSize: "13px", color: "#0f172a", outline: "none", background: "#fafafa" }}
      />
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export default function TabularLogsheetBuilder({ assets = [], onSave, onCancel, saving = false }) {
  const [tab, setTab] = useState("setup");

  // ── Template meta ──────────────────────────────────────────────────────────
  const [meta, setMeta] = useState({
    templateName: "",
    assetType: "technical",
    frequency: "daily",
    assetId: "",
    description: "",
  });

  // ── Rows ───────────────────────────────────────────────────────────────────
  const [rowPreset, setRowPreset] = useState("hourly_07_06");
  const [rows, setRows] = useState(ROW_PRESETS.hourly_07_06.rows);
  const [rowLabelHeader, setRowLabelHeader] = useState("TIME");
  const [customRowInput, setCustomRowInput] = useState("");

  // ── Column groups ──────────────────────────────────────────────────────────
  const [columnGroups, setColumnGroups] = useState([
    {
      id: uid(), label: "Group 1",
      columns: [{ id: uid(), label: "Parameter 1", subLabel: "", dataType: "number", required: false }],
    },
  ]);

  // ── Summary rows ───────────────────────────────────────────────────────────
  const [summaryRows, setSummaryRows] = useState([]);

  // ── Footer blocks ──────────────────────────────────────────────────────────
  const [footerBlocks, setFooterBlocks] = useState([]);

  const [error, setError] = useState("");

  // ──────────────────────────────────────────────────────────────────────────
  // Row helpers
  // ──────────────────────────────────────────────────────────────────────────
  const handlePresetChange = (preset) => {
    setRowPreset(preset);
    if (preset !== "custom") setRows(ROW_PRESETS[preset].rows);
  };

  const addCustomRow = () => {
    const label = customRowInput.trim();
    if (!label) return;
    setRows((prev) => [...prev, { id: uid(), label }]);
    setCustomRowInput("");
  };

  const removeRow = (id) => setRows((r) => r.filter((x) => x.id !== id));

  // ──────────────────────────────────────────────────────────────────────────
  // Column group helpers
  // ──────────────────────────────────────────────────────────────────────────
  const addGroup = () =>
    setColumnGroups((g) => [...g, { id: uid(), label: `Group ${g.length + 1}`, columns: [] }]);

  const removeGroup = (gId) => setColumnGroups((g) => g.filter((x) => x.id !== gId));

  const updateGroup = (gId, field, value) =>
    setColumnGroups((g) => g.map((x) => x.id === gId ? { ...x, [field]: value } : x));

  const addColumn = (gId) =>
    setColumnGroups((g) =>
      g.map((x) =>
        x.id === gId
          ? { ...x, columns: [...x.columns, { id: uid(), label: "Column", subLabel: "", dataType: "number", required: false }] }
          : x
      )
    );

  const removeColumn = (gId, cId) =>
    setColumnGroups((g) =>
      g.map((x) => x.id === gId ? { ...x, columns: x.columns.filter((c) => c.id !== cId) } : x)
    );

  const updateColumn = (gId, cId, field, value) =>
    setColumnGroups((g) =>
      g.map((x) =>
        x.id === gId
          ? { ...x, columns: x.columns.map((c) => c.id === cId ? { ...c, [field]: value } : c) }
          : x
      )
    );

  // ──────────────────────────────────────────────────────────────────────────
  // Summary row helpers
  // ──────────────────────────────────────────────────────────────────────────
  const addSummaryRow = () =>
    setSummaryRows((r) => [
      ...r,
      { id: uid(), label: "Summary Row", fields: [{ id: uid(), label: "Field" }] },
    ]);

  const removeSummaryRow = (rId) => setSummaryRows((r) => r.filter((x) => x.id !== rId));

  const updateSummaryRow = (rId, field, value) =>
    setSummaryRows((r) => r.map((x) => x.id === rId ? { ...x, [field]: value } : x));

  const addSummaryField = (rId) =>
    setSummaryRows((r) =>
      r.map((x) => x.id === rId ? { ...x, fields: [...x.fields, { id: uid(), label: "Field" }] } : x)
    );

  const removeSummaryField = (rId, fId) =>
    setSummaryRows((r) =>
      r.map((x) => x.id === rId ? { ...x, fields: x.fields.filter((f) => f.id !== fId) } : x)
    );

  const updateSummaryField = (rId, fId, value) =>
    setSummaryRows((r) =>
      r.map((x) =>
        x.id === rId
          ? { ...x, fields: x.fields.map((f) => f.id === fId ? { ...f, label: value } : f) }
          : x
      )
    );

  // ──────────────────────────────────────────────────────────────────────────
  // Footer block helpers
  // ──────────────────────────────────────────────────────────────────────────
  const addRemarksBlock = () =>
    setFooterBlocks((b) => [...b, { id: uid(), type: "remarks", label: "Remarks" }]);

  const addSignatureBlock = () =>
    setFooterBlocks((b) => [
      ...b,
      {
        id: uid(), type: "signatures", label: "Signatures",
        fields: [
          { id: uid(), label: "Checked By" },
          { id: uid(), label: "Approved By" },
        ],
      },
    ]);

  const removeFooterBlock = (bId) => setFooterBlocks((b) => b.filter((x) => x.id !== bId));

  const addSignatureField = (bId) =>
    setFooterBlocks((b) =>
      b.map((x) =>
        x.id === bId ? { ...x, fields: [...(x.fields || []), { id: uid(), label: "Signature" }] } : x
      )
    );

  const removeSignatureField = (bId, fId) =>
    setFooterBlocks((b) =>
      b.map((x) =>
        x.id === bId ? { ...x, fields: (x.fields || []).filter((f) => f.id !== fId) } : x
      )
    );

  const updateSignatureField = (bId, fId, value) =>
    setFooterBlocks((b) =>
      b.map((x) =>
        x.id === bId
          ? { ...x, fields: (x.fields || []).map((f) => f.id === fId ? { ...f, label: value } : f) }
          : x
      )
    );

  const updateFooterBlock = (bId, field, value) =>
    setFooterBlocks((b) => b.map((x) => x.id === bId ? { ...x, [field]: value } : x));

  // ──────────────────────────────────────────────────────────────────────────
  // Validate + Save
  // ──────────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    setError("");
    if (!meta.templateName.trim()) return setError("Template name is required.");
    if (!columnGroups.length) return setError("Add at least one column group.");
    if (columnGroups.some((g) => !g.columns.length)) return setError("Each column group must have at least one column.");
    if (!rows.length) return setError("At least one row is required.");

    const headerConfig = {
      layoutType: "tabular",
      rowLabelHeader,
      rows,
      columnGroups,
      summaryRows,
      footerBlocks,
    };

    onSave({
      templateName: meta.templateName.trim(),
      assetType: meta.assetType,
      frequency: meta.frequency,
      assetId: meta.assetId || null,
      description: meta.description || null,
      layoutType: "tabular",
      headerConfig,
      sections: [], // not used for tabular
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Total column count for preview header
  // ──────────────────────────────────────────────────────────────────────────
  const totalCols = columnGroups.reduce((acc, g) => acc + g.columns.length, 0);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    { key: "setup",    label: "1 · Setup" },
    { key: "columns",  label: "2 · Columns" },
    { key: "footer",   label: "3 · Summary & Footer" },
    { key: "preview",  label: "4 · Preview" },
  ];

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: "900px" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "9px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: "13px",
              background: tab === t.key ? "#2563eb" : "transparent",
              color: tab === t.key ? "#fff" : "#64748b",
              borderBottom: tab === t.key ? "2px solid #2563eb" : "none",
              marginBottom: "-2px",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ──────────── TAB: SETUP ──────────── */}
      {tab === "setup" && (
        <div>
          <SectionCard title="Template Details">
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
              <div style={{ flex: "2 1 240px" }}>
                <ColInput label="Template Name" value={meta.templateName}
                  onChange={(v) => setMeta((m) => ({ ...m, templateName: v }))}
                  placeholder="e.g. Steam Engine Room Log Sheet" />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Asset Type</label>
                <select value={meta.assetType} onChange={(e) => setMeta((m) => ({ ...m, assetType: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fafafa" }}>
                  <option value="technical">Technical</option>
                  <option value="soft">Soft Services</option>
                  <option value="fleet">Fleet</option>
                </select>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Frequency</label>
                <select value={meta.frequency} onChange={(e) => setMeta((m) => ({ ...m, frequency: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fafafa" }}>
                  {["daily","weekly","monthly","quarterly","half_yearly","yearly"].map((f) => (
                    <option key={f} value={f}>{f.replace("_"," ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Link to Asset (optional)</label>
              <select value={meta.assetId} onChange={(e) => setMeta((m) => ({ ...m, assetId: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fafafa" }}>
                <option value="">— No asset linked —</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.asset_name}</option>)}
              </select>
              {assets.length === 0 && <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>No assets available. Select a company first.</p>}
            </div>
            <ColInput label="Description (optional)" value={meta.description}
              onChange={(v) => setMeta((m) => ({ ...m, description: v }))}
              placeholder="Brief description of this logsheet" width="100%" />
          </SectionCard>

          <SectionCard title="Row Configuration">
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Row Label Header (first column header)</label>
              <input value={rowLabelHeader} onChange={(e) => setRowLabelHeader(e.target.value)}
                style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", width: "200px" }} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Row Preset</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.entries(ROW_PRESETS).map(([key, { label }]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                    <input type="radio" name="rowPreset" value={key} checked={rowPreset === key} onChange={() => handlePresetChange(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {rowPreset === "custom" && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <input value={customRowInput} onChange={(e) => setCustomRowInput(e.target.value)}
                    placeholder="Row label (e.g. 07:00)"
                    onKeyDown={(e) => e.key === "Enter" && addCustomRow()}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
                  <button onClick={addCustomRow} style={{ padding: "7px 16px", borderRadius: "7px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {rows.map((r) => (
                  <span key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "20px", background: "#eff6ff", color: "#2563eb", fontSize: "12px", fontWeight: 600 }}>
                    {r.label}
                    {rowPreset === "custom" && (
                      <span onClick={() => removeRow(r.id)} style={{ cursor: "pointer", color: "#93c5fd", fontWeight: 700 }}>×</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ──────────── TAB: COLUMNS ──────────── */}
      {tab === "columns" && (
        <div>
          <div style={{ marginBottom: "16px", fontSize: "13px", color: "#64748b", background: "#f0f9ff", padding: "12px 16px", borderRadius: "8px", border: "1px solid #bae6fd" }}>
            <strong>Column Groups</strong> allow multi-level headers (like "STEAM PRESSURE → Inlet / Nozzle / Exhaust"). Each group can have one or more columns.
          </div>
          {columnGroups.map((group, gi) => (
            <SectionCard key={group.id}
              title={<span>Group {gi + 1}: <em style={{ color: "#2563eb" }}>{group.label || "(unnamed)"}</em></span>}
              onAdd={() => addColumn(group.id)} addLabel="Add Column">
              <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
                <ColInput label="Group Header Label" value={group.label}
                  onChange={(v) => updateGroup(group.id, "label", v)} placeholder="e.g. STEAM PRESSURE" />
                {columnGroups.length > 1 && (
                  <button onClick={() => removeGroup(group.id)}
                    style={{ alignSelf: "flex-end", padding: "7px 14px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontWeight: 600, fontSize: "12px", whiteSpace: "nowrap" }}>
                    Remove Group
                  </button>
                )}
              </div>

              {group.columns.length === 0 && (
                <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>No columns yet. Click "Add Column".</p>
              )}
              {group.columns.map((col, ci) => (
                <div key={col.id} style={{ display: "flex", gap: "10px", marginBottom: "10px", padding: "12px", background: "#f8fafc", borderRadius: "8px", flexWrap: "wrap" }}>
                  <ColInput label={`Col ${ci + 1} Label`} value={col.label}
                    onChange={(v) => updateColumn(group.id, col.id, "label", v)} placeholder="e.g. Inlet" />
                  <ColInput label="Unit / Sub-label" value={col.subLabel}
                    onChange={(v) => updateColumn(group.id, col.id, "subLabel", v)} placeholder="e.g. Kg/Cm²" />
                  <div style={{ flex: "0 0 130px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Data Type</label>
                    <select value={col.dataType} onChange={(e) => updateColumn(group.id, col.id, "dataType", e.target.value)}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff" }}>
                      {DATA_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "0 0 80px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Required</label>
                    <input type="checkbox" checked={col.required}
                      onChange={(e) => updateColumn(group.id, col.id, "required", e.target.checked)}
                      style={{ width: "18px", height: "18px" }} />
                  </div>
                  {group.columns.length > 1 && (
                    <button onClick={() => removeColumn(group.id, col.id)}
                      style={{ alignSelf: "flex-end", padding: "7px 10px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", fontSize: "13px" }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </SectionCard>
          ))}
          <button onClick={addGroup} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "2px dashed #cbd5e1", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>
            + Add Column Group
          </button>
        </div>
      )}

      {/* ──────────── TAB: SUMMARY & FOOTER ──────────── */}
      {tab === "footer" && (
        <div>
          <SectionCard title="Summary Rows (bottom of table)" onAdd={addSummaryRow} addLabel="Add Summary Row">
            <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 12px 0" }}>
              Summary rows appear at the bottom of the log table (e.g. "KWh Running Today | START: | FINISH: | TOTAL:").
            </p>
            {summaryRows.map((row) => (
              <div key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <ColInput label="Row Label" value={row.label}
                    onChange={(v) => updateSummaryRow(row.id, "label", v)} placeholder="e.g. KWh Running Today" />
                  <button onClick={() => removeSummaryRow(row.id)}
                    style={{ alignSelf: "flex-end", padding: "7px 12px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: "12px" }}>
                    Remove
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {row.fields.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input value={f.label} onChange={(e) => updateSummaryField(row.id, f.id, e.target.value)}
                        placeholder="Field label"
                        style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px", width: "120px" }} />
                      {row.fields.length > 1 && (
                        <span onClick={() => removeSummaryField(row.id, f.id)} style={{ cursor: "pointer", color: "#94a3b8", fontWeight: 700 }}>×</span>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addSummaryField(row.id)}
                    style={{ padding: "5px 10px", borderRadius: "6px", background: "#f1f5f9", border: "none", cursor: "pointer", fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>
                    + Field
                  </button>
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Footer Blocks (below table)">
            <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 12px 0" }}>
              Add remarks text areas and/or signature blocks that appear below the main table.
            </p>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <button onClick={addRemarksBlock} style={{ padding: "8px 16px", borderRadius: "8px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                + Add Remarks Block
              </button>
              <button onClick={addSignatureBlock} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                + Add Signature Block
              </button>
            </div>
            {footerBlocks.map((block) => (
              <div key={block.id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: block.type === "remarks" ? "#2563eb" : "#16a34a",
                    padding: "3px 8px", borderRadius: "4px", background: block.type === "remarks" ? "#eff6ff" : "#f0fdf4" }}>
                    {block.type === "remarks" ? "Remarks" : "Signatures"}
                  </span>
                  <ColInput label="" value={block.label} onChange={(v) => updateFooterBlock(block.id, "label", v)} placeholder="Block label" />
                  <button onClick={() => removeFooterBlock(block.id)}
                    style={{ padding: "6px 12px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: "12px" }}>
                    Remove
                  </button>
                </div>
                {block.type === "signatures" && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(block.fields || []).map((f) => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input value={f.label} onChange={(e) => updateSignatureField(block.id, f.id, e.target.value)}
                          style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px", width: "140px" }} />
                        <span onClick={() => removeSignatureField(block.id, f.id)} style={{ cursor: "pointer", color: "#94a3b8", fontWeight: 700 }}>×</span>
                      </div>
                    ))}
                    <button onClick={() => addSignatureField(block.id)}
                      style={{ padding: "5px 10px", borderRadius: "6px", background: "#f0fdf4", border: "none", cursor: "pointer", fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>
                      + Signatory
                    </button>
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        </div>
      )}

      {/* ──────────── TAB: PREVIEW ──────────── */}
      {tab === "preview" && (
        <div>
          <div style={{ marginBottom: "12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "12px 16px", fontSize: "13px", color: "#0369a1" }}>
            Preview of your tabular logsheet layout — <strong>{rows.length} rows × {totalCols} columns</strong>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "11px", minWidth: "500px" }}>
              <thead>
                {/* Row 1: Group headers */}
                <tr style={{ background: "#f1f5f9" }}>
                  <th rowSpan={columnGroups.some((g) => g.columns.some((c) => c.subLabel)) ? 3 : 2}
                    style={{ border: "1px solid #cbd5e1", padding: "6px 10px", fontWeight: 700, color: "#0f172a", minWidth: "60px" }}>
                    {rowLabelHeader}
                  </th>
                  {columnGroups.map((g) => (
                    <th key={g.id} colSpan={g.columns.length}
                      style={{ border: "1px solid #cbd5e1", padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>
                      {g.label || "—"}
                    </th>
                  ))}
                </tr>
                {/* Row 2: Column labels */}
                <tr style={{ background: "#f8fafc" }}>
                  {columnGroups.flatMap((g) =>
                    g.columns.map((c) => (
                      <th key={c.id} style={{ border: "1px solid #cbd5e1", padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#374151" }}>
                        {c.label || "—"}
                      </th>
                    ))
                  )}
                </tr>
                {/* Row 3: Sub-labels — only if any exist */}
                {columnGroups.some((g) => g.columns.some((c) => c.subLabel)) && (
                  <tr style={{ background: "#fafafa" }}>
                    {columnGroups.flatMap((g) =>
                      g.columns.map((c) => (
                        <th key={c.id} style={{ border: "1px solid #cbd5e1", padding: "3px 6px", textAlign: "center", fontSize: "10px", color: "#64748b" }}>
                          {c.subLabel || ""}
                        </th>
                      ))
                    )}
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <td style={{ border: "1px solid #e2e8f0", padding: "5px 8px", fontWeight: 600, background: "#f8fafc", color: "#374151" }}>{row.label}</td>
                    {columnGroups.flatMap((g) =>
                      g.columns.map((c) => (
                        <td key={c.id} style={{ border: "1px solid #e2e8f0", padding: "5px 8px", minWidth: "60px", color: "#94a3b8", textAlign: "center", fontSize: "10px" }}>—</td>
                      ))
                    )}
                  </tr>
                ))}
                {rows.length > 5 && (
                  <tr>
                    <td colSpan={totalCols + 1} style={{ border: "1px solid #e2e8f0", padding: "6px", textAlign: "center", color: "#94a3b8", fontSize: "11px", fontStyle: "italic" }}>
                      … {rows.length - 5} more rows
                    </td>
                  </tr>
                )}
                {summaryRows.map((sr) => (
                  <tr key={sr.id} style={{ background: "#fffbeb" }}>
                    <td colSpan={totalCols + 1} style={{ border: "1px solid #fde68a", padding: "6px 10px", fontSize: "11px", color: "#92400e", fontWeight: 600 }}>
                      {sr.label} — {sr.fields.map((f) => f.label).join(" | ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {footerBlocks.length > 0 && (
            <div style={{ marginTop: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
              <p style={{ fontWeight: 700, fontSize: "12px", color: "#64748b", marginBottom: "8px", textTransform: "uppercase" }}>Footer Blocks</p>
              {footerBlocks.map((b) => (
                <div key={b.id} style={{ marginBottom: "8px" }}>
                  <span style={{ fontWeight: 600, fontSize: "12px", color: "#374151" }}>{b.label}: </span>
                  {b.type === "signatures" && (
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {(b.fields || []).map((f) => f.label).join(" | ")}
                    </span>
                  )}
                  {b.type === "remarks" && <span style={{ fontSize: "12px", color: "#94a3b8" }}>(text area)</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error + Actions ───────────────────────────────────────────────── */}
      {error && (
        <div style={{ margin: "16px 0", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "16px", borderTop: "1px solid #e2e8f0", marginTop: "20px" }}>
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Cancel
          </button>
        )}
        {tab !== "preview" && (
          <button onClick={() => setTab(tab === "setup" ? "columns" : tab === "columns" ? "footer" : "preview")}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#f1f5f9", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Next →
          </button>
        )}
        <button onClick={handleSave} disabled={saving}
          style={{ padding: "9px 24px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save Template"}
        </button>
      </div>
    </div>
  );
}
