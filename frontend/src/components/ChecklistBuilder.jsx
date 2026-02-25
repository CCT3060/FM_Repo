import { useEffect, useMemo, useState } from "react";
import { PlusCircle, ListChecks, AlertCircle, UsersRound } from "lucide-react";
import { createChecklist, getChecklists, getChecklistAssignees, assignChecklistToUsers } from "../api";
import ChecklistQuestionRow from "./ChecklistQuestionRow";

const categories = [
  { value: "soft", label: "Soft Services" },
  { value: "technical", label: "Technical Assets" },
  { value: "fleet", label: "Fleet Assets" },
];

const answerTypeLabels = {
  yes_no: "Yes / No",
  single_select: "Single Select",
  dropdown: "Dropdown",
  multi_select: "Multiple Select",
  text: "Short Text",
  long_text: "Long Text",
  number: "Number",
  date: "Date",
  datetime: "Date & Time",
  file: "Image / Document",
  video: "Video Upload",
  label: "Label",
  signature: "Signature",
  gps: "GPS Location",
  star_rating: "Star Rating",
  scan_code: "Scan Code",
  meter_reading: "Meter Reading",
};

const makeQuestion = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  text: "",
  answerType: "yes_no",
  isMandatory: false,
  config: null,
});

const ChecklistBuilder = ({ token, assets, users = [] }) => {
  const [category, setCategory] = useState("soft");
  const [assetId, setAssetId] = useState("");
  const [checklistName, setChecklistName] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState([makeQuestion()]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [assignees, setAssignees] = useState({});
  const [assignSelection, setAssignSelection] = useState({});

  const filteredAssets = useMemo(
    () => assets.filter((a) => a.assetType === category),
    [assets, category]
  );

  useEffect(() => {
    const firstId = filteredAssets[0]?.id ? String(filteredAssets[0].id) : "";
    setAssetId((prev) => (filteredAssets.some((a) => String(a.id) === String(prev)) ? prev : firstId));
  }, [filteredAssets]);

  useEffect(() => {
    if (!token || !assetId) {
      setChecklists([]);
      return;
    }
    setLoading(true);
    setError(null);
    getChecklists(token, `assetId=${assetId}`)
      .then(async (data) => {
        const list = Array.isArray(data) ? data : [];
        setChecklists(list);
        // prefetch assignees for the loaded checklists
        if (token && list.length) {
          const results = await Promise.all(
            list.map(async (c) => {
              try {
                const assigneeList = await getChecklistAssignees(token, c.id);
                return [c.id, assigneeList];
              } catch (_) {
                return [c.id, []];
              }
            })
          );
          const map = {};
          results.forEach(([id, listVal]) => { map[id] = listVal; });
          setAssignees(map);
        }
      })
      .catch((err) => setError(err.message || "Could not load checklists"))
      .finally(() => setLoading(false));
  }, [assetId, token]);

  const handleAssign = async (checklistId) => {
    if (!token) return;
    const selected = assignSelection[checklistId] || [];
    if (!selected.length) return;
    try {
      const assigned = await assignChecklistToUsers(token, checklistId, selected.map((v) => Number(v)));
      setAssignees((prev) => ({ ...prev, [checklistId]: assigned }));
      setSuccess("Checklist assigned");
    } catch (err) {
      setError(err.message || "Could not assign checklist");
    }
  };

  const handleAddQuestion = () => setQuestions((prev) => [...prev, makeQuestion()]);

  const handleUpdateQuestion = (id, patch) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleRemoveQuestion = (id) => {
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((q) => q.id !== id)));
  };

  const reorder = (dragId, targetId) => {
    if (!dragId || dragId === targetId) return;
    setQuestions((prev) => {
      const next = [...prev];
      const from = next.findIndex((q) => q.id === dragId);
      const to = next.findIndex((q) => q.id === targetId);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const normalizeConfig = (q) => {
    if (["single_select", "dropdown", "multi_select"].includes(q.answerType)) {
      const raw = q.config?.options || [];
      const options = Array.isArray(raw)
        ? raw
        : String(raw || "")
            .split(/\n|,/)
            .map((v) => v.trim())
            .filter(Boolean);
      return { options };
    }
    if (q.answerType === "number") {
      return {
        min: q.config?.min ?? "",
        max: q.config?.max ?? "",
        unit: q.config?.unit ?? "",
      };
    }
    if (q.answerType === "star_rating") {
      return { scale: q.config?.scale || 5 };
    }
    if (q.answerType === "label") {
      return { text: q.config?.text || "" };
    }
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess("");

    const trimmedName = checklistName.trim();
    if (!trimmedName) return setError("Checklist name is required");
    if (!assetId) return setError("Select an asset");
    const validQuestions = questions.filter((q) => q.text.trim() && q.answerType);
    if (!validQuestions.length) return setError("Add at least one question with text and type");

    const payload = {
      assetId: Number(assetId),
      name: trimmedName,
      description: description.trim() || undefined,
      items: validQuestions.map((q, idx) => ({
        title: q.text.trim(),
        answerType: q.answerType,
        isRequired: !!q.isMandatory,
        order: idx,
        config: normalizeConfig(q),
      })),
    };

    setSaving(true);
    try {
      await createChecklist(token, payload);
      setSuccess("Checklist saved");
      setQuestions([makeQuestion()]);
      setChecklistName("");
      setDescription("");
      const currentAssetId = assetId;
      setLoading(true);
      const data = await getChecklists(token, `assetId=${currentAssetId}`);
      setChecklists(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ marginBottom: "4px" }}>Checklist Creation</h1>
          <p style={{ margin: 0 }}>Create asset-wise checklists with ordered questions.</p>
        </div>
      </div>

      {error && (
        <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", fontSize: "14px" }}>
          <AlertCircle size={16} style={{ marginRight: "6px" }} /> {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#022c22", color: "#34d399", padding: "10px 14px", borderRadius: "6px", fontSize: "14px" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label>Asset Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
              {categories.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Asset</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="form-select"
              required
            >
              <option value="" disabled>
                {filteredAssets.length ? "Select asset" : "No assets for this category"}
              </option>
              {filteredAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.assetName}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "12px" }}>
          <div className="form-group">
            <label>Checklist Name</label>
            <input
              value={checklistName}
              onChange={(e) => setChecklistName(e.target.value)}
              className="form-input"
              placeholder="Daily Opening Checklist"
              required
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-input"
              placeholder="Purpose or scope"
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Questions</h3>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Drag to reorder. Configure options for select types; numbers support min/max; labels are read-only.</p>
          </div>
          <button type="button" className="add-btn" onClick={handleAddQuestion} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <PlusCircle size={18} />
            Add Question
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {questions.map((q, idx) => (
            <ChecklistQuestionRow
              key={q.id}
              question={q}
              onChange={handleUpdateQuestion}
              onRemove={handleRemoveQuestion}
              onDragStart={(dragId) => setDraggingId(dragId)}
              onDragOver={() => {}}
              onDrop={() => {
                reorder(draggingId, q.id);
                setDraggingId(null);
              }}
            />
          ))}
        </div>

        <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: "4px" }}>
          <button type="submit" className="btn-submit" disabled={saving}>
            {saving ? "Saving…" : "Save Checklist"}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: "12px", border: "1px solid #e2e8f0" }}>
        <div className="page-header" style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ListChecks size={18} />
            <h3 style={{ margin: 0 }}>Existing Checklists</h3>
          </div>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Asset-specific, ordered questions preserved.</p>
        </div>
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : checklists.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No checklists yet for the selected asset.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {checklists.map((c) => (
              <div key={c.id} className="card" style={{ padding: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: "12px" }}>{c.assetCategory ? categories.find((cat) => cat.value === c.assetCategory)?.label : ""}</div>
                    {c.description && <div style={{ color: "#475569", fontSize: "13px" }}>{c.description}</div>}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{(c.items || []).length} questions</div>
                </div>
                <ol style={{ margin: "8px 0 0 18px", color: "#475569", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(c.items || []).map((i) => (
                    <li key={i.id || `${i.title}-${i.orderIndex || 0}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span>{i.title}</span>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>({answerTypeLabels[i.answerType] || "Yes / No"}{i.isRequired ? ", mandatory" : ""})</span>
                    </li>
                  ))}
                </ol>
                <div style={{ marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "10px", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "10px", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <UsersRound size={16} />
                    <span style={{ fontSize: "13px", color: "#475569" }}>Assigned to:</span>
                    {(assignees[c.id] || []).length === 0 ? (
                      <span style={{ color: "#94a3b8", fontSize: "13px" }}>No users yet</span>
                    ) : (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {(assignees[c.id] || []).map((u) => (
                          <span key={u.userId} style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "999px", fontSize: "12px" }}>
                            {u.fullName || u.email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      multiple
                      size={3}
                      value={assignSelection[c.id] || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                        setAssignSelection((prev) => ({ ...prev, [c.id]: selected }));
                      }}
                      className="form-select"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName || u.email}</option>
                      ))}
                    </select>
                    <button type="button" className="pill-btn" onClick={() => handleAssign(c.id)} disabled={!users.length} style={{ whiteSpace: "nowrap" }}>
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChecklistBuilder;
