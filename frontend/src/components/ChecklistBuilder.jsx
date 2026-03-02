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
  allowFlagIssue: true,
  allowRemark: true,
  allowImage: false,
  requireReason: false,
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
        allowFlagIssue: q.allowFlagIssue !== false,
        allowRemark: q.allowRemark !== false,
        allowImage: !!q.allowImage,
        requireReason: !!q.requireReason,
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
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>Checklist Creation</h1>
        <p style={{ color: "#64748b", fontSize: "14px" }}>Create asset-wise checklists with ordered questions.</p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13.5px", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#f0fdf4", color: "#16a34a", padding: "10px 14px", borderRadius: "8px", fontSize: "13.5px", border: "1px solid #bbf7d0" }}>
          ✓ {success}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        {/* Asset selectors */}
        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Asset Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select" style={{ width: "100%" }}>
              {categories.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Asset</label>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="form-select" required style={{ width: "100%" }}>
              <option value="" disabled>
                {filteredAssets.length ? "Select asset" : "No assets for this category"}
              </option>
              {filteredAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.assetName}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Checklist Name</label>
            <input value={checklistName} onChange={(e) => setChecklistName(e.target.value)} className="form-input" placeholder="Daily Opening Checklist" required style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" placeholder="Purpose or scope" style={{ width: "100%" }} />
          </div>
        </div>

        {/* Questions */}
        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Questions</span>
            <button type="button" onClick={handleAddQuestion}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "7px", padding: "7px 14px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
              <PlusCircle size={15} /> Add Question
            </button>
          </div>
          <div style={{ padding: "8px 0" }}>
            {questions.map((q) => (
              <ChecklistQuestionRow
                key={q.id}
                question={q}
                onChange={handleUpdateQuestion}
                onRemove={handleRemoveQuestion}
                onDragStart={(dragId) => setDraggingId(dragId)}
                onDragOver={() => {}}
                onDrop={() => { reorder(draggingId, q.id); setDraggingId(null); }}
              />
            ))}
          </div>
        </div>

        <div>
          <button type="submit" disabled={saving}
            style={{ padding: "9px 26px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "none", background: saving ? "#93c5fd" : "#2563eb", color: "#fff", cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "Save Checklist"}
          </button>
        </div>
      </form>

      {/* Existing Checklists */}
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
          <ListChecks size={17} style={{ color: "#2563eb" }} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Existing Checklists</span>
        </div>
        {loading ? (
          <div style={{ padding: "32px 20px", color: "#94a3b8", fontSize: "14px" }}>Loading…</div>
        ) : checklists.length === 0 ? (
          <div style={{ padding: "32px 20px", color: "#94a3b8", fontSize: "14px" }}>No checklists yet for the selected asset.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr>
                  {["Name", "Asset", "Status", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checklists.map((c) => {
                  const assetName = assets.find((a) => String(a.id) === String(c.assetId))?.assetName || "—";
                  const catLabel = categories.find((cat) => cat.value === c.assetCategory)?.label || c.assetCategory || "—";
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>{c.name}</div>
                        {c.description && <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>{c.description}</div>}
                        <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>{(c.items || []).length} question{(c.items || []).length !== 1 ? "s" : ""}</div>
                      </td>
                      <td style={{ padding: "13px 16px", color: "#475569" }}>{assetName}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#f0fdf4", color: "#16a34a" }}>Active</span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <UsersRound size={13} style={{ color: "#64748b", flexShrink: 0 }} />
                            <span style={{ fontSize: "12px", color: "#64748b" }}>Assigned:</span>
                            {(assignees[c.id] || []).length === 0 ? (
                              <span style={{ color: "#94a3b8", fontSize: "12px" }}>None</span>
                            ) : (
                              (assignees[c.id] || []).map((u) => (
                                <span key={u.userId} style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 500 }}>
                                  {u.fullName || u.email}
                                </span>
                              ))
                            )}
                          </div>
                          {users.length > 0 && (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <select multiple size={2} value={assignSelection[c.id] || []}
                                onChange={(e) => { const sel = Array.from(e.target.selectedOptions).map((o) => o.value); setAssignSelection((prev) => ({ ...prev, [c.id]: sel })); }}
                                className="form-select" style={{ fontSize: "12px", padding: "3px 6px", minWidth: "120px" }}>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
                              </select>
                              <button type="button" onClick={() => handleAssign(c.id)}
                                style={{ padding: "5px 12px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                Assign
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChecklistBuilder;
