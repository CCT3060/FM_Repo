/**
 * TabularLogsheetFill.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a Steam Engine Room-style tabular logsheet for data entry.
 * Accepts the template's header_config (with layoutType = "tabular") and
 * lets the user fill in cells, summary rows, and footer/signature blocks.
 *
 * Props:
 *   template    – logsheet template object (with headerConfig.columnGroups etc.)
 *   assets      – assets array for the <select>
 *   onSubmit    – async ({ assetId, month, year, shift, tabularData }) => void
 *   onCancel    – () => void
 *   submitting  – bool
 */

import { useState, useMemo } from "react";

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];

const INPUT_STYLE = {
  width: "100%", boxSizing: "border-box",
  padding: "3px 5px", border: "1px solid #e2e8f0",
  borderRadius: "4px", fontSize: "12px",
  background: "#fff", outline: "none",
  textAlign: "center",
};

export default function TabularLogsheetFill({ template, assets = [], onSubmit, onCancel, submitting = false }) {
  const cfg = template?.headerConfig || {};
  const {
    rowLabelHeader = "TIME",
    rows = [],
    columnGroups = [],
    summaryRows = [],
    footerBlocks = [],
  } = cfg;

  // ── Entry meta ─────────────────────────────────────────────────────────────
  const now = new Date();
  const [assetId, setAssetId]   = useState(template?.assetId ? String(template.assetId) : (assets[0]?.id ? String(assets[0].id) : ""));
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year, setYear]           = useState(now.getFullYear());
  const [shift, setShift]         = useState("");

  // ── Readings (main table cells) ────────────────────────────────────────────
  // key: `${rowId}__${groupId}__${colId}`
  const [readings, setReadings] = useState({});

  const getReading = (rowId, groupId, colId) =>
    readings[`${rowId}__${groupId}__${colId}`] ?? "";

  const setReading = (rowId, groupId, colId, value) =>
    setReadings((r) => ({ ...r, [`${rowId}__${groupId}__${colId}`]: value }));

  // ── Summary row values ──────────────────────────────────────────────────────
  const [summaryValues, setSummaryValues] = useState({});

  const getSummaryVal = (rowId, fieldId) => summaryValues[`${rowId}__${fieldId}`] ?? "";
  const setSummaryVal = (rowId, fieldId, val) =>
    setSummaryValues((v) => ({ ...v, [`${rowId}__${fieldId}`]: val }));

  // ── Footer / signature values ──────────────────────────────────────────────
  const [footerValues, setFooterValues] = useState({});

  const getFooterVal = (blockId, fieldId = null) =>
    fieldId ? (footerValues[blockId]?.[fieldId] ?? "") : (footerValues[blockId] ?? "");

  const setFooterVal = (blockId, value, fieldId = null) =>
    setFooterValues((v) =>
      fieldId
        ? { ...v, [blockId]: { ...(v[blockId] || {}), [fieldId]: value } }
        : { ...v, [blockId]: value }
    );

  // ── Computed stats ─────────────────────────────────────────────────────────
  const totalCols = useMemo(() =>
    columnGroups.reduce((acc, g) => acc + g.columns.length, 0),
    [columnGroups]
  );

  const hasSubLabels = columnGroups.some((g) => g.columns.some((c) => c.subLabel));
  const headerRows = hasSubLabels ? 3 : 2;

  // ── Validation ─────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState("");

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setErrors("");
    if (!assetId) return setErrors("Please select an asset.");

    // Build structured tabularData blob
    const readingsMap = {};
    for (const [key, val] of Object.entries(readings)) {
      if (val === "") continue;
      const [rowId, groupId, colId] = key.split("__");
      if (!readingsMap[rowId]) readingsMap[rowId] = {};
      readingsMap[rowId][`${groupId}__${colId}`] = val;
    }

    const summaryMap = {};
    for (const [key, val] of Object.entries(summaryValues)) {
      if (val === "") continue;
      const [rowId, fieldId] = key.split("__");
      if (!summaryMap[rowId]) summaryMap[rowId] = {};
      summaryMap[rowId][fieldId] = val;
    }

    const tabularData = { readings: readingsMap, summary: summaryMap, footer: footerValues };

    onSubmit({ assetId: Number(assetId), month: Number(month), year: Number(year), shift: shift || null, tabularData });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!template) return <p>No template provided.</p>;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ── Meta bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "20px",
                    padding: "16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={{ flex: "2 1 200px" }}>
          <label style={LABEL}>Asset</label>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}
            style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
            <option value="">— Select asset —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.asset_name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={LABEL}>Month</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={LABEL}>Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={LABEL}>Shift (optional)</label>
          <input value={shift} onChange={(e) => setShift(e.target.value)}
            placeholder="e.g. Day / Night"
            style={{ width: "100%", padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
        </div>
      </div>

      {/* ── Main table ─────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "12px", minWidth: "600px" }}>
          <thead>
            {/* Row 1 – Group headers */}
            <tr style={{ background: "#1e3a5f" }}>
              <th rowSpan={headerRows}
                style={{ border: "1px solid #2d4f7a", padding: "8px 12px", color: "#fff",
                          fontWeight: 700, textAlign: "center", minWidth: "55px", background: "#1e3a5f" }}>
                {rowLabelHeader}
              </th>
              {columnGroups.map((g) => (
                <th key={g.id} colSpan={g.columns.length}
                  style={{ border: "1px solid #2d4f7a", padding: "6px 8px", color: "#fff",
                            fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Row 2 – Column labels */}
            <tr style={{ background: "#2d4a6d" }}>
              {columnGroups.flatMap((g) =>
                g.columns.map((c) => (
                  <th key={`${g.id}_${c.id}`}
                    style={{ border: "1px solid #3d5f8a", padding: "5px 6px", color: "#e2e8f0",
                              fontWeight: 600, textAlign: "center", minWidth: "64px", whiteSpace: "nowrap" }}>
                    {c.label}
                  </th>
                ))
              )}
            </tr>
            {/* Row 3 – Sub-labels (units), only if any exist */}
            {hasSubLabels && (
              <tr style={{ background: "#3b5998" }}>
                {columnGroups.flatMap((g) =>
                  g.columns.map((c) => (
                    <th key={`${g.id}_${c.id}_sub`}
                      style={{ border: "1px solid #4a6fa5", padding: "3px 6px", color: "#cbd5e1",
                                fontWeight: 500, textAlign: "center", fontSize: "10px" }}>
                      {c.subLabel || ""}
                    </th>
                  ))
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id} style={{ background: ri % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td style={{ border: "1px solid #e2e8f0", padding: "4px 10px",
                              fontWeight: 700, background: "#f1f5f9", color: "#374151",
                              textAlign: "center", fontSize: "12px" }}>
                  {row.label}
                </td>
                {columnGroups.flatMap((g) =>
                  g.columns.map((c) => (
                    <td key={`${g.id}_${c.id}`} style={{ border: "1px solid #e2e8f0", padding: "2px 3px", minWidth: "64px" }}>
                      {c.dataType === "yes_no" ? (
                        <select
                          value={getReading(row.id, g.id, c.id)}
                          onChange={(e) => setReading(row.id, g.id, c.id, e.target.value)}
                          style={{ ...INPUT_STYLE, background: getReading(row.id, g.id, c.id) === "no" ? "#fef2f2" : "#fff" }}>
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <input
                          type={c.dataType === "number" ? "number" : "text"}
                          value={getReading(row.id, g.id, c.id)}
                          onChange={(e) => setReading(row.id, g.id, c.id, e.target.value)}
                          style={INPUT_STYLE}
                          placeholder=""
                        />
                      )}
                    </td>
                  ))
                )}
              </tr>
            ))}

            {/* ── Summary rows ───────────────────────────────────────────── */}
            {summaryRows.map((sr) => (
              <tr key={sr.id} style={{ background: "#fffbeb", borderTop: "2px solid #fde68a" }}>
                <td colSpan={totalCols + 1} style={{ border: "1px solid #fde68a", padding: "6px 10px" }}>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#92400e", minWidth: "130px"}}>{sr.label}</span>
                    {sr.fields.map((f) => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11px", color: "#78350f", fontWeight: 600 }}>{f.label}</span>
                        <input
                          value={getSummaryVal(sr.id, f.id)}
                          onChange={(e) => setSummaryVal(sr.id, f.id, e.target.value)}
                          style={{ ...INPUT_STYLE, width: "90px", textAlign: "left" }}
                        />
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer blocks ──────────────────────────────────────────────────── */}
      {footerBlocks.length > 0 && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
          {footerBlocks.map((block) => (
            <div key={block.id} style={{ marginBottom: "16px" }}>
              {block.type === "remarks" && (
                <div>
                  <label style={{ ...LABEL, display: "block", marginBottom: "6px" }}>{block.label || "Remarks"}</label>
                  <textarea
                    value={getFooterVal(block.id)}
                    onChange={(e) => setFooterVal(block.id, e.target.value)}
                    rows={3}
                    placeholder="Enter remarks..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "7px",
                              border: "1px solid #e2e8f0", fontSize: "13px", resize: "vertical" }}
                  />
                </div>
              )}
              {block.type === "signatures" && (
                <div>
                  <p style={{ fontWeight: 700, fontSize: "13px", color: "#374151", marginBottom: "10px" }}>
                    {block.label || "Signatures"}
                  </p>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {(block.fields || []).map((f) => (
                      <div key={f.id} style={{ flex: "1 1 160px", minWidth: "160px" }}>
                        <label style={{ ...LABEL, display: "block" }}>{f.label}</label>
                        <input
                          value={getFooterVal(block.id, f.id)}
                          onChange={(e) => setFooterVal(block.id, e.target.value, f.id)}
                          placeholder="Name / Signature"
                          style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px",
                                    borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px",
                                    borderBottom: "2px solid #94a3b8" }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Errors + Actions ───────────────────────────────────────────────── */}
      {errors && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca",
                      borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginBottom: "14px" }}>
          {errors}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
        {onCancel && (
          <button onClick={onCancel} disabled={submitting}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc",
                      color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Cancel
          </button>
        )}
        <button onClick={handleSubmit} disabled={submitting}
          style={{ padding: "9px 28px", borderRadius: "8px", border: "none", background: "#2563eb",
                    color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Submitting…" : "Submit Logsheet"}
        </button>
      </div>
    </div>
  );
}

const LABEL = {
  fontSize: "11px", fontWeight: 600, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.04em",
  display: "block", marginBottom: "4px",
};
