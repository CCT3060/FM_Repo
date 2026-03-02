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
