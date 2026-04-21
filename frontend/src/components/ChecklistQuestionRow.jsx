import { GripVertical, Trash2 } from "lucide-react";

const answerOptions = [
  { value: "yes_no", label: "Yes / No" },
  { value: "single_select", label: "Single Select" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multi_select", label: "Multiple Select" },
  { value: "text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "file", label: "Image / Document" },
  { value: "video", label: "Video Upload" },
  { value: "label", label: "Label (read-only)" },
  { value: "signature", label: "Signature" },
  { value: "gps", label: "GPS Location" },
  { value: "star_rating", label: "Star Rating" },
  { value: "scan_code", label: "Scan Code" },
  { value: "meter_reading", label: "Meter Reading" },
];

const defaultConfigForType = (type) => {
  if (["single_select", "dropdown", "multi_select"].includes(type)) {
    return { options: ["Option 1", "Option 2"] };
  }
  if (type === "number") {
    return { min: "", max: "", unit: "" };
  }
  if (type === "star_rating") {
    return { scale: 5 };
  }
  if (type === "label") {
    return { text: "" };
  }
  return null;
};

const ChecklistQuestionRow = ({
  question,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const selectedType = question.answerType;
  const config = question.config || null;
  const optionText = Array.isArray(config?.options) ? config.options.join("\n") : "";

  const handleTypeChange = (nextType) => {
    onChange(question.id, { answerType: nextType, config: defaultConfigForType(nextType) });
  };

  const handleOptionsChange = (value) => {
    const options = value
      .split(/\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
    onChange(question.id, { config: { ...(config || {}), options } });
  };

  const handleNumberConfig = (field, value) => {
    onChange(question.id, { config: { ...(config || {}), [field]: value } });
  };

  const handleStarScale = (value) => {
    const safe = Math.min(Math.max(Number(value) || 1, 1), 10);
    onChange(question.id, { config: { ...(config || {}), scale: safe } });
  };

  const handleLabelText = (value) => {
    onChange(question.id, { config: { ...(config || {}), text: value } });
  };

  const flagRule = config?.flagRule || null;
  const ruleEnabled = !!flagRule?.enabled;

  const updateRule = (patch) => {
    const next = { ...(flagRule || {}), ...patch };
    onChange(question.id, { config: { ...(config || {}), flagRule: next } });
  };

  const operatorOptionsFor = (type) => {
    if (["yes_no"].includes(type)) {
      return [
        { value: "eq", label: "equals" },
        { value: "neq", label: "not equals" },
      ];
    }
    if (["single_select", "dropdown", "multi_select", "text", "long_text", "scan_code"].includes(type)) {
      return [
        { value: "eq", label: "equals" },
        { value: "neq", label: "not equals" },
        { value: "contains", label: "contains" },
        { value: "not_contains", label: "does not contain" },
        { value: "empty", label: "is empty" },
        { value: "not_empty", label: "is not empty" },
      ];
    }
    if (["number", "star_rating", "meter_reading"].includes(type)) {
      return [
        { value: "gt", label: ">" },
        { value: "gte", label: "≥" },
        { value: "lt", label: "<" },
        { value: "lte", label: "≤" },
        { value: "eq", label: "=" },
        { value: "neq", label: "≠" },
        { value: "between", label: "between" },
        { value: "outside", label: "outside" },
      ];
    }
    if (["file", "video", "signature", "gps", "date", "datetime"].includes(type)) {
      return [
        { value: "empty", label: "is empty" },
        { value: "not_empty", label: "is not empty" },
      ];
    }
    return [{ value: "eq", label: "equals" }, { value: "neq", label: "not equals" }];
  };

  return (
    <div
      style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "10px", alignItems: "flex-start", background: "#fff" }}
      draggable
      onDragStart={() => onDragStart(question.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(question.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(question.id);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", paddingTop: "24px", color: "#94a3b8", flexShrink: 0, cursor: "grab" }}>
        <GripVertical size={18} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "3fr 1.5fr auto", gap: "10px", alignItems: "center" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: "12px", color: "#475569" }}>Question Text</label>
            <input
              value={question.text}
              onChange={(e) => onChange(question.id, { text: e.target.value })}
              className="form-input"
              placeholder="Describe the check to perform"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: "12px", color: "#475569" }}>Answer Type</label>
            <select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="form-select"
              required
            >
              <option value="" disabled>Select type</option>
              {answerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={question.isMandatory}
              onChange={(e) => onChange(question.id, { isMandatory: e.target.checked })}
              disabled={selectedType === "label"}
            />
            Mandatory
          </label>
        </div>

        {/* ── Behaviour flags row ── */}
        {selectedType && selectedType !== "label" && (
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", padding: "6px 10px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!question.allowFlagIssue}
                onChange={(e) => onChange(question.id, { allowFlagIssue: e.target.checked })}
              />
              Allow Flag Issue
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={question.allowRemark !== false}
                onChange={(e) => onChange(question.id, { allowRemark: e.target.checked })}
              />
              Allow Remark
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!question.allowImage}
                onChange={(e) => onChange(question.id, { allowImage: e.target.checked })}
              />
              Allow Image
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", fontStyle: "italic", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!question.requireReason}
                onChange={(e) => onChange(question.id, { requireReason: e.target.checked })}
                disabled={!question.allowFlagIssue}
              />
              Require reason if flagged
            </label>
          </div>
        )}

        {/* ── Custom auto-flag rule ── */}
        {selectedType && selectedType !== "label" && (
          <div style={{ padding: "8px 10px", background: "#fff7ed", border: "1px dashed #fdba74", borderRadius: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9a3412", cursor: "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={ruleEnabled}
                onChange={(e) => updateRule({ enabled: e.target.checked })}
              />
              Set Rule — auto-flag when condition matches
            </label>
            {ruleEnabled && (
              <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: "8px", alignItems: "end" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: "11px", color: "#9a3412" }}>Operator</label>
                  <select
                    className="form-select"
                    value={flagRule?.operator || ""}
                    onChange={(e) => updateRule({ operator: e.target.value })}
                  >
                    <option value="" disabled>Select</option>
                    {operatorOptionsFor(selectedType).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {!["empty", "not_empty"].includes(flagRule?.operator) && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: "11px", color: "#9a3412" }}>
                      {["between", "outside"].includes(flagRule?.operator) ? "Min" : "Value"}
                    </label>
                    {["single_select", "dropdown", "multi_select"].includes(selectedType) && Array.isArray(config?.options) ? (
                      <select
                        className="form-select"
                        value={flagRule?.value1 ?? ""}
                        onChange={(e) => updateRule({ value1: e.target.value })}
                      >
                        <option value="">—</option>
                        {config.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : selectedType === "yes_no" ? (
                      <select
                        className="form-select"
                        value={flagRule?.value1 ?? ""}
                        onChange={(e) => updateRule({ value1: e.target.value })}
                      >
                        <option value="">—</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        type={["number", "star_rating", "meter_reading"].includes(selectedType) ? "number" : "text"}
                        value={flagRule?.value1 ?? ""}
                        onChange={(e) => updateRule({ value1: e.target.value })}
                      />
                    )}
                  </div>
                )}

                {["between", "outside"].includes(flagRule?.operator) && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: "11px", color: "#9a3412" }}>Max</label>
                    <input
                      className="form-input"
                      type="number"
                      value={flagRule?.value2 ?? ""}
                      onChange={(e) => updateRule({ value2: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: "11px", color: "#9a3412" }}>Severity</label>
                  <select
                    className="form-select"
                    value={flagRule?.severity || "medium"}
                    onChange={(e) => updateRule({ severity: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

      {selectedType && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {["single_select", "dropdown", "multi_select"].includes(selectedType) && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "12px", color: "#475569" }}>Options (one per line)</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={optionText}
                onChange={(e) => handleOptionsChange(e.target.value)}
                placeholder="Option A\nOption B\nOption C"
              />
            </div>
          )}

          {selectedType === "number" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", alignItems: "end" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "12px", color: "#475569" }}>Min</label>
                <input className="form-input" type="number" value={config?.min ?? ""} onChange={(e) => handleNumberConfig("min", e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "12px", color: "#475569" }}>Max</label>
                <input className="form-input" type="number" value={config?.max ?? ""} onChange={(e) => handleNumberConfig("max", e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "12px", color: "#475569" }}>Unit</label>
                <input className="form-input" value={config?.unit ?? ""} onChange={(e) => handleNumberConfig("unit", e.target.value)} placeholder="kg, pcs" />
              </div>
            </div>
          )}

          {selectedType === "star_rating" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "12px", color: "#475569" }}>Scale (max stars)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={10}
                value={config?.scale ?? 5}
                onChange={(e) => handleStarScale(e.target.value)}
              />
            </div>
          )}

          {selectedType === "label" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "12px", color: "#475569" }}>Static label text (optional)</label>
              <input
                className="form-input"
                value={config?.text ?? ""}
                onChange={(e) => handleLabelText(e.target.value)}
                placeholder="Section header"
              />
            </div>
          )}
        </div>
      )}

      </div>{/* end column flex */}

      <button
        type="button"
        className="btn-cancel"
        style={{ height: "36px", alignSelf: "center" }}
        onClick={() => onRemove(question.id)}
        title="Delete question"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

export default ChecklistQuestionRow;
