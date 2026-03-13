import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  getOjtTraining, createOjtTraining, updateOjtTraining, deleteOjtTraining, publishOjtTraining,
  createOjtModule, deleteOjtModule, addOjtModuleContent, deleteOjtContent,
  createOjtTest, addOjtQuestion, deleteOjtQuestion, getOjtTrainingUsers, grantOjtCertificate, uploadOjtFile,
  assignOjtTraining, trainerOjtSignOff,
} from "../api.js";
import { getCompanyPortalWOUsers } from "../api.js";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const apiBaseUrl = getApiBaseUrl();

// Helper to get marks from questions
const getTotalMarks = (questions) => questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
const getPassingMarks = (totalMarks, passingPercentage) => Math.ceil((totalMarks * passingPercentage) / 100);

const Btn = ({ children, onClick, outline, color = "#2563eb", bg, disabled, style = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: outline ? `1.5px solid ${color}` : "none", background: bg || (outline ? "#fff" : color), color: outline ? color : "#fff", opacity: disabled ? 0.6 : 1, ...style }}>
    {children}
  </button>
);

const Alert = ({ children, type = "error" }) => {
  const s = type === "error" ? { bg: "#fef2f2", col: "#dc2626", border: "#fecaca" } : { bg: "#f0fdf4", col: "#16a34a", border: "#bbf7d0" };
  return <div style={{ background: s.bg, color: s.col, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${s.border}`, marginBottom: "14px" }}>{children}</div>;
};

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", ...style }}>{children}</div>
);

const FInput = ({ label, required, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", ...props.style }} />
  </div>
);

const FSelect = ({ label, required, children, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <select {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff", outline: "none" }}>{children}</select>
  </div>
);

// ═════════════════════════════════════════════════════════════════════
// MAIN BUILDER - SINGLE FORM WITH ALL SECTIONS
// ═════════════════════════════════════════════════════════════════════

export default function OjtTrainingBuilder({ token, assets = [], onBack, trainingId = null }) {
  const [view, setView] = useState(trainingId ? "overview" : "create"); // create, overview
  const [training, setTraining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state for create/edit
  const [form, setForm] = useState({ assetId: "", title: "", description: "" });
  const [category, setCategory] = useState("general");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(60);
  const [isSequential, setIsSequential] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [trainerId, setTrainerId] = useState("");
  const [modules, setModules] = useState([]);
  const [newModule, setNewModule] = useState({ title: "" });
  const [questions, setQuestions] = useState([]);
  const [passingPercentage, setPassingPercentage] = useState(70);
  const [newQuestion, setNewQuestion] = useState({ question: "", qType: "mcq", options: "", correctAnswer: "", marks: 5 });
  // Per-module content form state: { [moduleId]: { type, url, description, file } }
  const [moduleContentForms, setModuleContentForms] = useState({});
  const [moduleNameError, setModuleNameError] = useState("");
  const [testInitialized, setTestInitialized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [uploadingContent, setUploadingContent] = useState({});

  // Load existing training
  useEffect(() => {
    if (trainingId) {
      const load = async () => {
        try {
          setLoading(true);
          const data = await getOjtTraining(token, trainingId);
          if (!data) {
            setError("Training not found");
            return;
          }
          setTraining(data);
          setForm({
            assetId: data.assetId || "",
            title: data.title || "",
            description: data.description || "",
          });
          setPassingPercentage(data.passingPercentage || 70);
          setCategory(data.category || "general");
          setEstimatedDurationMinutes(data.estimatedDurationMinutes || 60);
          setIsSequential(!!data.isSequential);
          setMaxAttempts(data.maxAttempts || 3);
          setTrainerId(data.trainerId || "");
          setModules(data.modules || []);
          setQuestions(data.test?.questions || []);
          setTestInitialized(!!data.test);
        } catch (e) {
          console.error("Error loading training:", e);
          setError(e.message || "Failed to load training");
        } finally {
          setLoading(false);
        }
      };
      load();
    }
  }, [trainingId, token]);

  const getModuleContentForm = (moduleId) => moduleContentForms[moduleId] || { type: "text", url: "", description: "", file: null };
  const setModuleContentForm = (moduleId, updates) =>
    setModuleContentForms(prev => ({ ...prev, [moduleId]: { ...getModuleContentForm(moduleId), ...updates } }));

  const handleAddModule = () => {
    if (!newModule.title.trim()) {
      setModuleNameError("Module title is required");
      return;
    }
    const module = { id: Date.now(), title: newModule.title, contents: [] };
    setModules([...modules, module]);
    setNewModule({ title: "" });
    setModuleNameError("");
    setError(null);
  };

  const handleDeleteModule = (moduleId) => {
    setModules(modules.filter(m => m.id !== moduleId));
    setModuleContentForms(prev => { const n = { ...prev }; delete n[moduleId]; return n; });
  };

  const handleUploadFile = async (moduleId, file) => {
    setUploadingContent(prev => ({ ...prev, [moduleId]: true }));
    try {
      const { url } = await uploadOjtFile(token, file);
      setModuleContentForm(moduleId, { url, file });
      return url;
    } catch (e) {
      setError("File upload failed: " + e.message);
      return null;
    } finally {
      setUploadingContent(prev => ({ ...prev, [moduleId]: false }));
    }
  };

  const handleAddContent = (moduleId, moduleIdx) => {
    const form = getModuleContentForm(moduleId);
    if (!form.description.trim()) {
      setError("Content description is required");
      return;
    }
    if (form.type !== "text" && !form.url.trim()) {
      setError("Please upload a file or provide a URL for this content");
      return;
    }
    const updated = [...modules];
    updated[moduleIdx].contents.push({ id: Date.now(), type: form.type, url: form.url, description: form.description });
    setModules(updated);
    setModuleContentForm(moduleId, { type: "text", url: "", description: "", file: null });
    setError(null);
  };

  const handleDeleteContent = (moduleIdx, contentId) => {
    const updated = [...modules];
    updated[moduleIdx].contents = updated[moduleIdx].contents.filter(c => c.id !== contentId);
    setModules(updated);
  };

  const handleShowQR = async (trainingForQR) => {
    const url = `${window.location.origin}/training/${trainingForQR.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setQrDataUrl(dataUrl);
      setShowQR(trainingForQR);
    } catch (e) {
      alert("Failed to generate QR");
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.question.trim() || !newQuestion.correctAnswer.trim()) {
      setError("Question and answer are required");
      return;
    }
    const marks = Number(newQuestion.marks) || 1;
    if (marks < 1) {
      setError("Marks must be at least 1");
      return;
    }
    const options = newQuestion.qType !== "descriptive" && newQuestion.options.trim() ? newQuestion.options.split(",").map(o => o.trim()).filter(o => o) : [];
    if (newQuestion.qType !== "descriptive" && options.length === 0) {
      setError("At least one option is required for MCQ/Multiselect");
      return;
    }
    setQuestions([...questions, { id: Date.now(), question: newQuestion.question.trim(), qType: newQuestion.qType, options, correctAnswer: newQuestion.correctAnswer.trim(), marks }]);
    setNewQuestion({ question: "", qType: "mcq", options: "", correctAnswer: "", marks: 5 });
    if (!testInitialized) setTestInitialized(true);
    setError(null);
  };

  const handleDeleteQuestion = (qId) => {
    setQuestions(questions.filter(q => q.id !== qId));
  };

  const handleSaveTraining = async () => {
    if (!form.title.trim()) {
      setError("Training title is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Step 1: Create or update training
      const trainingData = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assetId: form.assetId ? Number(form.assetId) : null,
        passingPercentage: Number(passingPercentage),
        category,
        estimatedDurationMinutes: Number(estimatedDurationMinutes) || 60,
        isSequential,
        maxAttempts: Number(maxAttempts) || 3,
        trainerId: trainerId ? Number(trainerId) : null,
      };

      let currentTrainingId;
      if (training) {
        // Update existing training (returns null / 204)
        await updateOjtTraining(token, training.id, trainingData);
        currentTrainingId = training.id;
      } else {
        // Create new training
        const savedTraining = await createOjtTraining(token, trainingData);
        setTraining(savedTraining);
        currentTrainingId = savedTraining.id;
      }

      // Step 2: Save modules and their contents
      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        if (typeof mod.id === "number" && mod.id > 100000000000) {
          // New module (temp ID) - create in DB then save all content
          const moduleData = { title: mod.title, orderNumber: i };
          let createdMod;
          try {
            createdMod = await createOjtModule(token, currentTrainingId, moduleData);
          } catch (mErr) {
            throw new Error((mErr.body && mErr.body.message) || mErr.message || "Failed creating module");
          }
          for (const content of mod.contents || []) {
            const contentData = { type: content.type || "text", url: content.url || null, description: content.description || "" };
            try {
              await addOjtModuleContent(token, createdMod.id, contentData);
            } catch (cErr) {
              throw new Error((cErr.body && cErr.body.message) || cErr.message || "Failed adding module content");
            }
          }
        } else {
          // Existing module - save only NEW content items (those with temp IDs)
          for (const content of mod.contents || []) {
            if (typeof content.id === "number" && content.id > 100000000000) {
              const contentData = { type: content.type || "text", url: content.url || null, description: content.description || "" };
              try {
                await addOjtModuleContent(token, mod.id, contentData);
              } catch (cErr) {
                throw new Error((cErr.body && cErr.body.message) || cErr.message || "Failed adding content to existing module");
              }
            }
          }
        }
      }

      // Step 3: Save test and questions
      if (testInitialized && questions.length > 0) {
        const totalMarks = getTotalMarks(questions);
        const testData = { totalMarks };

        // Use existing test from training state if available
        let testObj = training?.test ?? null;
        if (!testObj) {
          try {
            testObj = await createOjtTest(token, currentTrainingId, testData);
          } catch (tErr) {
            throw new Error((tErr.body && tErr.body.message) || tErr.message || "Failed creating test");
          }
        }

        // Add only new questions (temp IDs)
        for (const q of questions) {
          if (typeof q.id === "number" && q.id > 100000000000) {
            const questionData = {
              question: q.question,
              options: q.options && q.options.length > 0 ? q.options : null,
              correctAnswer: q.correctAnswer,
              marks: Number(q.marks) || 1,
            };
            try {
              await addOjtQuestion(token, testObj.id, questionData);
            } catch (qErr) {
              throw new Error((qErr.body && qErr.body.message) || qErr.message || "Failed adding question");
            }
          }
        }
      }

      // Re-fetch full training (includes modules and test data) so overview tabs show correctly
      const freshData = await getOjtTraining(token, currentTrainingId);
      if (freshData) {
        setTraining(freshData);
        setModules(freshData.modules || []);
        setQuestions(freshData.test?.questions || []);
        setTestInitialized(!!freshData.test);
        setPassingPercentage(freshData.passingPercentage || 70);
      } else {
        setTraining(null);
        setModules([]);
        setQuestions([]);
        setTestInitialized(false);
        setPassingPercentage(70);
      }

      alert("✓ Training saved successfully!");
      setView("overview");
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save training");
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // CREATE VIEW - ALL IN ONE FORM
  // ═══════════════════════════════════════════════════════════════════
  if (view === "create") {
    return (
      <Card>
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", borderBottom: "1px solid #e2e8f0", paddingBottom: "16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{training ? "Edit Training" : "Create New OJT Training"}</h2>
            <Btn onClick={onBack} outline color="#64748b" bg="#fff">← Back</Btn>
          </div>

          {error && <Alert>{error}</Alert>}

          <div style={{ maxWidth: "1000px", display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* ───────────────── SECTION 1: TRAINING DETAILS ───────────────── */}
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "#2563eb", color: "#fff", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>1</span>
                Training Details
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <FSelect label="Associated Technical Asset *" required value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
                  <option value="">— Select an asset —</option>
                  {assets.filter(a => a.assetType === "technical").map(a => (
                    <option key={a.id} value={a.id}>{a.assetName || a.assetUniqueId || `Asset #${a.id}`}</option>
                  ))}
                </FSelect>
                <FSelect label="Training Category *" required value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="general">General</option>
                  <option value="safety">Safety & Compliance</option>
                  <option value="equipment">Equipment Operation</option>
                  <option value="technical">Technical Skills</option>
                  <option value="maintenance">Preventive Maintenance</option>
                  <option value="quality">Quality Control</option>
                  <option value="emergency">Emergency Procedures</option>
                </FSelect>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <FInput label="Estimated Duration (minutes)" type="number" min="10" max="480" value={estimatedDurationMinutes} onChange={(e) => setEstimatedDurationMinutes(Math.max(10, Number(e.target.value) || 60))} />
                <FInput label="Max Test Attempts" type="number" min="1" max="10" value={maxAttempts} onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value) || 3))} />
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Sequential Modules</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontWeight: 500, fontSize: "13.5px", background: isSequential ? "#eff6ff" : "#fff" }}>
                    <input type="checkbox" checked={isSequential} onChange={(e) => setIsSequential(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
                    <span style={{ color: isSequential ? "#2563eb" : "#475569" }}>{isSequential ? "Locked in order" : "Any order"}</span>
                  </label>
                </div>
              </div>
              <FInput label="Training Title *" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. HVAC Maintenance Certification" />
              <div style={{ marginTop: "16px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", minHeight: "80px" }} placeholder="Describe the training scope, objectives, and prerequisites" />
              </div>
            </div>

            {/* ───────────────── SECTION 2: MODULES ───────────────── */}
            <div style={{ borderTop: "2px solid #f1f5f9", paddingTop: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "#0ea5e9", color: "#fff", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>2</span>
                📚 Training Modules
              </h3>
              
              <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", marginBottom: "16px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={newModule.title}
                    onChange={(e) => { setNewModule({ ...newModule, title: e.target.value }); if (moduleNameError) setModuleNameError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddModule()}
                    placeholder="Module title (e.g. Introduction to HVAC)"
                    style={{ flex: 1, padding: "8px", border: moduleNameError ? "1.5px solid #ef4444" : "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13.5px", outline: "none" }}
                  />
                  <Btn onClick={handleAddModule}>+ Add Module</Btn>
                </div>
                {moduleNameError && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#ef4444", fontWeight: 500 }}>⚠ {moduleNameError}</p>}
              </div>

              {modules.length === 0 ? (
                <Card style={{ padding: "24px", textAlign: "center", background: "#f8fafc", border: "1px dashed #cbd5e1", color: "#94a3b8" }}>
                  No modules yet. Add one above to start.
                </Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {modules.map((m, idx) => {
                    const cf = getModuleContentForm(m.id);
                    const isUploading = uploadingContent[m.id];
                    return (
                      <Card key={m.id} style={{ border: "1px solid #bfdbfe" }}>
                        {/* Module Header */}
                        <div style={{ padding: "12px 16px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#1e40af" }}>📋 Module {idx + 1}: {m.title}</h4>
                          <Btn onClick={() => handleDeleteModule(m.id)} outline color="#dc2626" bg="#fff" style={{ fontSize: "11px", padding: "4px 10px" }}>× Delete</Btn>
                        </div>

                        <div style={{ padding: "16px" }}>
                          {/* Existing Content Items */}
                          {m.contents && m.contents.length > 0 && (
                            <div style={{ marginBottom: "16px" }}>
                              <p style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Added Content ({m.contents.length}):</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {m.contents.map(c => (
                                  <div key={c.id} style={{ padding: "10px 12px", background: "#f1f5f9", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", border: "1px solid #e2e8f0" }}>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ display: "inline-block", padding: "2px 8px", background: c.type === "video" ? "#dbeafe" : c.type === "document" ? "#fef3c7" : "#e2e8f0", borderRadius: "10px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: c.type === "video" ? "#1d4ed8" : c.type === "document" ? "#92400e" : "#475569", marginRight: "8px" }}>{c.type}</span>
                                      <span style={{ fontSize: "13px", color: "#334155", fontWeight: 500 }}>{c.description}</span>
                                      {c.url && <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "3px", wordBreak: "break-all" }}>🔗 {c.url}</div>}
                                    </div>
                                    <button onClick={() => handleDeleteContent(idx, c.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "18px", lineHeight: 1, marginLeft: "8px" }}>×</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Add Content Form - always visible */}
                          <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", border: "1px dashed #cbd5e1" }}>
                            <p style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>+ Add Content to this Module</p>
                            <FSelect label="Content Type" value={cf.type} onChange={(e) => setModuleContentForm(m.id, { type: e.target.value, url: "", file: null })}>
                              <option value="text">📝 Text / Description</option>
                              <option value="video">🎬 Video (Upload or URL)</option>
                              <option value="document">📄 Document (Upload or URL)</option>
                            </FSelect>

                            {cf.type === "video" && (
                              <div style={{ marginTop: "12px" }}>
                                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Upload Video File</label>
                                <input type="file" accept=".mp4,.mkv,.avi,.mov,.webm,.wmv,.flv,.3gp" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) await handleUploadFile(m.id, file);
                                }} style={{ display: "block", marginBottom: "8px", fontSize: "13px" }} />
                                <p style={{ fontSize: "11px", color: "#94a3b8", margin: "0 0 8px" }}>Accepted: .mp4, .mkv, .avi, .mov, .webm, .wmv — or paste a URL below</p>
                                <FInput label="Or paste Video URL" placeholder="https://youtube.com/... or https://..." value={cf.url} onChange={(e) => setModuleContentForm(m.id, { url: e.target.value })} />
                                {isUploading && <p style={{ color: "#2563eb", fontSize: "12px", marginTop: "6px" }}>⏳ Uploading...</p>}
                                {cf.url && !isUploading && <p style={{ color: "#16a34a", fontSize: "11px", marginTop: "4px" }}>✓ File ready: {cf.url.split("/").pop()}</p>}
                              </div>
                            )}

                            {cf.type === "document" && (
                              <div style={{ marginTop: "12px" }}>
                                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Upload Document</label>
                                <input type="file" accept=".pdf,.doc,.docx,.csv,.xlsx,.xls,.pptx,.ppt,.txt,.odt,.ods" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) await handleUploadFile(m.id, file);
                                }} style={{ display: "block", marginBottom: "8px", fontSize: "13px" }} />
                                <p style={{ fontSize: "11px", color: "#94a3b8", margin: "0 0 8px" }}>Accepted: .pdf, .docx, .doc, .csv, .xlsx, .pptx, .txt — or paste a URL below</p>
                                <FInput label="Or paste Document URL" placeholder="https://example.com/document.pdf" value={cf.url} onChange={(e) => setModuleContentForm(m.id, { url: e.target.value })} />
                                {isUploading && <p style={{ color: "#2563eb", fontSize: "12px", marginTop: "6px" }}>⏳ Uploading...</p>}
                                {cf.url && !isUploading && <p style={{ color: "#16a34a", fontSize: "11px", marginTop: "4px" }}>✓ File ready: {cf.url.split("/").pop()}</p>}
                              </div>
                            )}

                            <div style={{ marginTop: "12px" }}>
                              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Title / Description *</label>
                              <textarea
                                value={cf.description}
                                onChange={(e) => setModuleContentForm(m.id, { description: e.target.value })}
                                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", minHeight: "50px", fontSize: "13.5px", resize: "vertical" }}
                                placeholder="What does this content cover?"
                              />
                            </div>
                            <Btn onClick={() => handleAddContent(m.id, idx)} disabled={isUploading} style={{ marginTop: "10px" }}>+ Add to Module</Btn>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ───────────────── SECTION 3: TEST QUESTIONS ───────────────── */}
            <div style={{ borderTop: "2px solid #f1f5f9", paddingTop: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "#16a34a", color: "#fff", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>3</span>
                ✓ Test Criteria & Questions
              </h3>

              {/* Passing Percentage */}
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "16px", alignItems: "center" }}>
                  <FInput label="Passing Percentage (%)" type="number" min="0" max="100" value={passingPercentage} onChange={(e) => setPassingPercentage(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} style={{ maxWidth: "120px" }} />
                  <div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#475569" }}>
                      {questions.length > 0 ? (
                        <>
                          Total Available: <strong>{getTotalMarks(questions)} marks</strong> | 
                          Passing: <strong style={{ color: "#16a34a" }}>{getPassingMarks(getTotalMarks(questions), passingPercentage)} marks</strong>
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>Add questions below to see total marks</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Question Type & Form */}
              <Card style={{ background: "#f8fafc", padding: "14px", marginBottom: "16px" }}>
                <FSelect label="Question Type" value={newQuestion.qType} onChange={(e) => setNewQuestion({ ...newQuestion, qType: e.target.value })}>
                  <option value="mcq">Multiple Choice (Single Answer)</option>
                  <option value="multiselect">Multiple Select (Multiple Answers)</option>
                  <option value="descriptive">Descriptive (Free Text)</option>
                </FSelect>

                <div style={{ marginTop: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Question *</label>
                  <textarea value={newQuestion.question} onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", minHeight: "50px" }} placeholder="Enter your question here" />
                </div>

                {newQuestion.qType !== "descriptive" && (
                  <div style={{ marginTop: "12px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Options (comma-separated) *</label>
                    <textarea value={newQuestion.options} onChange={(e) => setNewQuestion({ ...newQuestion, options: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", minHeight: "50px" }} placeholder="Option 1, Option 2, Option 3" />
                  </div>
                )}

                <FInput label={`Correct Answer ${newQuestion.qType === "multiselect" ? "(comma-separated)" : ""} *`} value={newQuestion.correctAnswer} onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })} placeholder={newQuestion.qType === "descriptive" ? "Leave blank if manually evaluated" : "e.g. Option 1"} style={{ marginTop: "12px" }} />

                <FInput label="Marks per Question *" type="number" min="1" max="100" value={newQuestion.marks} onChange={(e) => setNewQuestion({ ...newQuestion, marks: Math.max(1, Number(e.target.value) || 1) })} style={{ marginTop: "12px" }} />

                <Btn onClick={handleAddQuestion} style={{ marginTop: "12px" }}>+ Add Question</Btn>
              </Card>

              {/* Questions List */}
              {questions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "#475569", margin: 0 }}>Questions Added ({questions.length})</p>
                    <span style={{ fontSize: "11px", color: "#94a3b8", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px" }}>Total: {getTotalMarks(questions)} marks</span>
                  </div>
                  {questions.map((q, i) => (
                    <Card key={q.id} style={{ border: "1px solid #e2e8f0" }}>
                      <div style={{ padding: "12px 16px", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#0f172a", marginBottom: "4px" }}>Q{i + 1}. {q.question}</p>
                          {q.options && q.options.length > 0 && (
                            <p style={{ margin: 0, fontSize: "12px", color: "#475569", marginBottom: "4px" }}>Options: {q.options.join(", ")}</p>
                          )}
                          <p style={{ margin: "4px 0 0", fontSize: "12px", fontWeight: 600, color: "#16a34a" }}>Answer: {q.correctAnswer} | Marks: {q.marks}</p>
                        </div>
                        <Btn onClick={() => handleDeleteQuestion(q.id)} outline color="#dc2626" bg="#fff" style={{ fontSize: "12px", padding: "4px 10px" }}>Delete</Btn>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* ───────────────── SAVE BUTTON ───────────────── */}
            <div style={{ borderTop: "2px solid #f1f5f9", paddingTop: "24px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Btn onClick={onBack} outline color="#64748b" bg="#fff">Cancel</Btn>
              <Btn onClick={handleSaveTraining} disabled={saving} style={{ background: "#16a34a" }} >
                {saving ? "Saving..." : "Save Training"}
              </Btn>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // OVERVIEW VIEW
  // ═══════════════════════════════════════════════════════════════════
  if (loading) return <Card style={{ padding: "40px", textAlign: "center" }}>Loading...</Card>;
  if (!training) return <Card style={{ padding: "40px", textAlign: "center" }}>No training data</Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Card */}
      <Card style={{ borderTop: "4px solid #2563eb" }}>
        <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button onClick={onBack} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            </button>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{training.title}</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13.5px" }}>Status: <span style={{ fontWeight: 600, color: training.status === "published" ? "#16a34a" : "#ca8a04" }}>{training.status}</span></p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={() => setView("create")} outline color="#2563eb" bg="#fff">Edit</Btn>
            {training.status !== "published" && (
              <Btn onClick={async () => {
                try {
                  await publishOjtTraining(token, training.id);
                  setTraining(prev => ({ ...prev, status: "published" }));
                  alert("Training published!");
                } catch (e) {
                  alert("Error: " + e.message);
                }
              }} style={{ background: "#16a34a" }}>Publish</Btn>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", flexWrap: "wrap" }}>
          {[
            { id: "overview", label: "Overview" },
            { id: "modules", label: `Modules (${training.modules?.length || 0})` },
            { id: "test", label: "Test" },
            { id: "assign", label: "Assign Users" },
            { id: "tracking", label: "Enrollment" }
          ].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              style={{ padding: "16px 20px", background: "none", border: "none", borderBottom: view === tab.id ? "3px solid #2563eb" : "3px solid transparent", color: view === tab.id ? "#2563eb" : "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Tab Content */}
      {view === "overview" && (
        <Card style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>Training Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Title</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.title}</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Category</div>
              <div style={{ fontWeight: "600", color: "#0f172a", textTransform: "capitalize" }}>{(training.category || "general").replace(/_/g, " ")}</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Associated Asset</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.assetName || "General / Not Assigned"}</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Passing Percentage</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.passingPercentage}%</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Estimated Duration</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>
                {Number(training.estimatedDurationMinutes) >= 60
                  ? `${Math.floor(Number(training.estimatedDurationMinutes) / 60)}h ${Number(training.estimatedDurationMinutes) % 60 > 0 ? `${Number(training.estimatedDurationMinutes) % 60}m` : ""}`
                  : `${training.estimatedDurationMinutes}m`}
              </div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Number of Modules</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.modules?.length || 0}</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Sequential Modules</div>
              <div style={{ fontWeight: "600", color: training.isSequential ? "#2563eb" : "#64748b" }}>{training.isSequential ? "Yes – locked in order" : "No – any order"}</div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Max Test Attempts</div>
              <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.maxAttempts || 3}</div>
            </div>
            {training.trainerName && (
              <div>
                <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px", fontWeight: "500" }}>Assigned Trainer</div>
                <div style={{ fontWeight: "600", color: "#0f172a" }}>{training.trainerName}</div>
              </div>
            )}
          </div>
          {training.description && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "6px", fontWeight: "500" }}>Description</div>
              <p style={{ color: "#475569", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>{training.description}</p>
            </div>
          )}
          {/* Analytics row */}
          {(training.enrolledCount > 0 || training.completedCount > 0) && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {[
                { label: "Enrolled", value: training.enrolledCount, color: "#2563eb", bg: "#eff6ff" },
                { label: "Completed", value: training.completedCount, color: "#16a34a", bg: "#f0fdf4" },
                { label: "Avg Score", value: training.avgScore != null ? `${Math.round(training.avgScore)}%` : "—", color: "#ca8a04", bg: "#fefce8" },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: "10px", padding: "12px 20px", textAlign: "center", minWidth: "90px" }}>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginTop: "2px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {view === "modules" && (
        <Card style={{ padding: "24px" }}>
          {training.modules && training.modules.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {training.modules.map((m, idx) => (
                <Card key={m.id} style={{ border: "1px solid #e2e8f0" }}>
                  <div style={{ padding: "12px 16px", background: "#f8fafc", fontWeight: 700, color: "#334155", fontSize: "14px" }}>{idx + 1}. {m.title}</div>
                  {m.contents && m.contents.length > 0 && (
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {m.contents.map(c => {
                        const fileUrl = c.url ? (c.url.startsWith("http") ? c.url : `${apiBaseUrl}${c.url}`) : null;
                        return (
                          <div key={c.id} style={{ padding: "10px 12px", background: "#f1f5f9", borderRadius: "6px", fontSize: "12px", border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: c.url ? "8px" : "0" }}>
                              <span style={{ display: "inline-block", padding: "2px 6px", background: c.type === "video" ? "#dbeafe" : c.type === "document" ? "#fef3c7" : "#e2e8f0", borderRadius: "4px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: c.type === "video" ? "#1d4ed8" : c.type === "document" ? "#92400e" : "#475569" }}>{c.type}</span>
                              <span style={{ color: "#334155", fontWeight: 500 }}>{c.description}</span>
                            </div>
                            {fileUrl && c.type === "video" && (
                              <div>
                                <video src={fileUrl} controls style={{ width: "100%", maxHeight: "220px", borderRadius: "6px", background: "#000", display: "block" }} />
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#2563eb", display: "block", marginTop: "4px" }}>🔗 Open Video →</a>
                              </div>
                            )}
                            {fileUrl && c.type === "document" && (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#2563eb", display: "block" }}>📎 Open Document →</a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>No modules</p>
          )}
        </Card>
      )}

      {view === "test" && (
        <Card style={{ padding: "24px" }}>
          {training.test && training.test.questions && training.test.questions.length > 0 ? (
            <>
              {/* Test Summary */}
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
                <p style={{ margin: 0, fontSize: "13px", color: "#16a34a", fontWeight: 600 }}>
                  Total Available Marks: {getTotalMarks(training.test.questions)} | 
                  Passing Score: {getPassingMarks(getTotalMarks(training.test.questions), training.passingPercentage)} marks ({training.passingPercentage}%)
                </p>
              </div>

              {/* Questions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#475569", margin: 0 }}>Total Questions: {training.test.questions.length}</p>
                {training.test.questions.map((q, i) => (
                  <Card key={q.id} style={{ border: "1px solid #e2e8f0", padding: "12px 16px" }}>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: "#0f172a" }}>Q{i + 1}. {q.question}</p>
                    {q.options && <p style={{ margin: 0, fontSize: "12px", color: "#475569", marginBottom: "4px" }}>Options: {Array.isArray(q.options) ? q.options.join(", ") : q.options}</p>}
                    <p style={{ margin: 0, fontSize: "12px", fontWeight: 600 }}>
                      Answer: <span style={{ color: "#16a34a" }}>{q.correctAnswer}</span> | 
                      Marks: <span style={{ color: "#2563eb" }}>{q.marks}</span>
                    </p>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>No test/questions created yet.</p>
          )}
        </Card>
      )}

      {view === "assign" && <AssignTab training={training} token={token} />}

      {view === "tracking" && <EnrollmentTab training={training} token={token} />}

      {/* Modals */}
      {showPreview && (
        <TrainingPreviewModal training={showPreview} onClose={() => setShowPreview(false)} />
      )}
      {showQR && (
        <TrainingQRModal training={showQR} qrDataUrl={qrDataUrl} onClose={() => { setShowQR(false); setQrDataUrl(null); }} />
      )}
    </div>
  );
}

function AssignTab({ training, token }) {
  const [users, setUsers] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [u, e] = await Promise.all([
          getCompanyPortalWOUsers(token),
          getOjtTrainingUsers(token, training.id),
        ]);
        setUsers(Array.isArray(u) ? u : []);
        setEnrolled(Array.isArray(e.users) ? e.users : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, training.id]);

  const enrolledIds = new Set(enrolled.map(e => e.companyUserId));
  const unassigned = users.filter(u => !enrolledIds.has(u.id));

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    setMsg(null);
    try {
      await assignOjtTraining(token, training.id, { userId: Number(selectedUserId), dueDate: dueDate || null });
      const freshEnrolled = await getOjtTrainingUsers(token, training.id);
      setEnrolled(Array.isArray(freshEnrolled.users) ? freshEnrolled.users : []);
      setMsg({ type: "success", text: "Training assigned successfully." });
      setSelectedUserId("");
      setDueDate("");
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Failed to assign training" });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <Card style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>Loading users...</Card>;

  return (
    <Card style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>Assign Training to Employees</h3>
      <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "13.5px" }}>
        Assign this training to specific technicians and optionally set a completion deadline.
        Assigned employees will see it in their "My Assignments" list even before they start.
      </p>

      {/* Assignment form */}
      <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px", marginBottom: "20px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "flex-end" }}>
          <FSelect label="Select Employee" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">— Choose a technician —</option>
            {unassigned.map(u => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.role || "Technician"})</option>
            ))}
            {unassigned.length === 0 && users.length > 0 && (
              <option disabled>All employees already assigned</option>
            )}
          </FSelect>
          <FInput label="Due Date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ minWidth: "160px" }} />
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#fff", marginBottom: "5px" }}>‌</label>
            <Btn onClick={handleAssign} disabled={assigning || !selectedUserId} style={{ background: "#16a34a" }}>
              {assigning ? "Assigning..." : "Assign"}
            </Btn>
          </div>
        </div>
        {msg && <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "6px", fontSize: "13px", background: msg.type === "success" ? "#f0fdf4" : "#fef2f2", color: msg.type === "success" ? "#16a34a" : "#dc2626", border: `1px solid ${msg.type === "success" ? "#bbf7d0" : "#fecaca"}` }}>{msg.text}</div>}
      </div>

      {/* Assigned users list */}
      <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
        Assigned Employees ({enrolled.length})
      </h4>
      {enrolled.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: "13.5px" }}>No one assigned yet. Use the form above to assign this training.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Employee</th>
                <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Due Date</th>
                <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Assigned By</th>
                <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {enrolled.map(u => {
                const isOverdue = u.dueDate && new Date(u.dueDate) < new Date() && u.status !== "completed";
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.userName}</div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>{u.email}</div>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                        background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef3c7" : u.status === "failed" ? "#fee2e2" : "#f1f5f9",
                        color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#92400e" : u.status === "failed" ? "#991b1b" : "#475569"
                      }}>
                        {u.status === "completed" ? "✓ Completed" : u.status === "in_progress" ? "⟳ In Progress" : u.status === "failed" ? "✗ Failed" : "● Not Started"}
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      {u.dueDate ? (
                        <span style={{ color: isOverdue ? "#dc2626" : "#0f172a", fontWeight: isOverdue ? 700 : 500, fontSize: "13px" }}>
                          {isOverdue ? "⚠ Overdue — " : ""}{new Date(u.dueDate).toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "#475569" }}>{u.assignedByName || "—"}</td>
                    <td style={{ padding: "12px", textAlign: "center", fontWeight: 600, color: u.score >= training.passingPercentage ? "#16a34a" : u.score != null ? "#dc2626" : "#94a3b8" }}>
                      {u.score != null ? `${u.score}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function EnrollmentTab({ training, token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [signingOff, setSigningOff] = useState(null);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signOffProgressId, setSignOffProgressId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOjtTrainingUsers(token, training.id);
      setUsers(Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error loading users:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, training.id]);

  const handleSignOff = async () => {
    if (!signOffProgressId) return;
    setSigningOff(signOffProgressId);
    try {
      await trainerOjtSignOff(token, signOffProgressId, { notes: signOffNotes });
      setSignOffProgressId(null);
      setSignOffNotes("");
      await load();
    } catch (e) {
      alert("Sign-off failed: " + e.message);
    } finally {
      setSigningOff(null);
    }
  };

  if (loading) return <p style={{ color: "#64748b", padding: "20px" }}>Loading enrollment data...</p>;

  const today = new Date();
  const completed = users.filter(u => u.status === "completed").length;
  const inProgress = users.filter(u => u.status === "in_progress").length;
  const avgScore = users.filter(u => u.score != null).length > 0
    ? Math.round(users.filter(u => u.score != null).reduce((s, u) => s + u.score, 0) / users.filter(u => u.score != null).length)
    : null;

  return (
    <Card style={{ padding: "24px" }}>
      {/* Sign-off modal */}
      {signOffProgressId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Trainer Sign-Off</h3>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "13.5px" }}>Confirm practical competency verification for this technician.</p>
            <textarea
              placeholder="Sign-off notes (practical skills verified, observations, etc.)"
              value={signOffNotes}
              onChange={e => setSignOffNotes(e.target.value)}
              style={{ width: "100%", minHeight: "90px", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "14px", justifyContent: "flex-end" }}>
              <button onClick={() => { setSignOffProgressId(null); setSignOffNotes(""); }} style={{ padding: "8px 18px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Cancel</button>
              <button onClick={handleSignOff} disabled={signingOff === signOffProgressId} style={{ padding: "8px 18px", border: "none", borderRadius: "8px", background: "#16a34a", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>
                {signingOff === signOffProgressId ? "Signing..." : "Confirm Sign-Off"}
              </button>
            </div>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
          <p style={{ fontSize: "14px", margin: 0 }}>No technicians have enrolled in this training yet.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "Total Enrolled", value: users.length, color: "#2563eb" },
              { label: "Completed", value: completed, color: "#16a34a" },
              { label: "In Progress", value: inProgress, color: "#ca8a04" },
              { label: "Avg. Score", value: avgScore != null ? `${avgScore}%` : "—", color: avgScore >= training.passingPercentage ? "#16a34a" : avgScore != null ? "#dc2626" : "#64748b" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Technician</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Due Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Attempts</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Score</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Trainer Sign-Off</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isPassed = u.score != null && u.score >= training.passingPercentage;
                  const isOverdue = u.dueDate && new Date(u.dueDate) < today && u.status !== "completed";

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: u.status === "completed" ? "#f0fdf4" : "#fff" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.userName || `User #${u.companyUserId}`}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{u.email || "—"}</div>
                        {u.assignedByName && <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>Assigned by {u.assignedByName}</div>}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                          background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef3c7" : u.status === "failed" ? "#fee2e2" : "#f1f5f9",
                          color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#92400e" : u.status === "failed" ? "#991b1b" : "#475569"
                        }}>
                          {u.status === "completed" ? "✓ Completed" : u.status === "in_progress" ? "⟳ In Progress" : u.status === "failed" ? "✗ Failed" : "● Not Started"}
                        </span>
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {u.dueDate ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "12.5px", color: isOverdue ? "#dc2626" : "#0f172a" }}>
                              {new Date(u.dueDate).toLocaleDateString()}
                            </div>
                            {isOverdue && <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }}>OVERDUE</div>}
                          </div>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: (u.attemptNumber || 1) >= training.maxAttempts ? "#dc2626" : "#0f172a" }}>
                        {u.attemptNumber || 1} / {training.maxAttempts}
                        {(u.attemptNumber || 1) >= training.maxAttempts && u.status !== "completed" && (
                          <div style={{ fontSize: "10px", color: "#dc2626" }}>Max attempts reached</div>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {u.score != null ? (
                          <>
                            <span style={{ fontWeight: 700, fontSize: "14px", color: isPassed ? "#16a34a" : "#dc2626" }}>{u.score}%</span>
                            <div style={{ fontSize: "10px", marginTop: "2px" }}>
                              <span style={{ padding: "2px 6px", borderRadius: "6px", fontWeight: 700, background: isPassed ? "#dcfce7" : "#fee2e2", color: isPassed ? "#166534" : "#991b1b" }}>
                                {isPassed ? "PASS" : "FAIL"}
                              </span>
                            </div>
                          </>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {u.trainerSignOffAt ? (
                          <div>
                            <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "11px" }}>✓ Signed Off</span>
                            <div style={{ fontSize: "10px", color: "#64748b" }}>{new Date(u.trainerSignOffAt).toLocaleDateString()}</div>
                            {u.trainerSignOffNotes && <div style={{ fontSize: "10px", color: "#94a3b8", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.trainerSignOffNotes}>{u.trainerSignOffNotes}</div>}
                          </div>
                        ) : isPassed && u.status === "completed" ? (
                          <button onClick={() => setSignOffProgressId(u.id)} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer" }}>
                            Sign Off
                          </button>
                        ) : <span style={{ color: "#94a3b8", fontSize: "11px" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {u.certificateUrl ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                            <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
                            <a href={u.certificateUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: "11px", textDecoration: "underline" }}>View</a>
                          </div>
                        ) : isPassed && u.status === "completed" && u.trainerSignOffAt ? (
                          <button onClick={async () => {
                            try {
                              await grantOjtCertificate(token, u.id);
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, certificateUrl: "/certificate-granted" } : x));
                              alert("Certificate granted!");
                            } catch (e) { alert("Failed: " + e.message); }
                          }} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer" }}>
                            Grant
                          </button>
                        ) : <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════
// TRAINING PREVIEW MODAL (admin sees training as technician would)
// ═════════════════════════════════════════════════════════════════════
export function TrainingPreviewModal({ training, onClose }) {
  const [activeModule, setActiveModule] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  const modules = training.modules || [];
  const questions = training.test?.questions || [];
  const passingPct = training.passingPercentage || 70;
  const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 1), 0);
  const passingMarks = Math.ceil((totalMarks * passingPct) / 100);

  const handleSubmitTest = () => {
    let earned = 0;
    questions.forEach(q => {
      const ans = (answers[q.id] || "").trim().toLowerCase();
      const correct = (q.correctAnswer || "").trim().toLowerCase();
      if (ans === correct) earned += Number(q.marks) || 1;
    });
    const pct = totalMarks > 0 ? Math.round((earned / totalMarks) * 100) : 0;
    setScore({ earned, pct, passed: pct >= passingPct });
    setSubmitted(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#f1f5f9", borderRadius: "16px", width: "100%", maxWidth: "420px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div style={{ background: "#2563eb", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: "11px", color: "#93c5fd", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>Training Preview</p>
            <h3 style={{ margin: "4px 0 0", color: "#fff", fontSize: "16px", fontWeight: 700 }}>{training.title}</h3>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "18px" }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px" }}>
          {!testMode ? (
            <>
              {/* Progress bar */}
              <div style={{ background: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "14px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Your Progress</p>
                <p style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                  {activeModule}/{modules.length} modules completed
                </p>
                <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${modules.length ? (activeModule / modules.length) * 100 : 0}%`, background: "#2563eb", borderRadius: "3px", transition: "width 0.3s" }} />
                </div>
              </div>

              {/* Module list */}
              {modules.map((m, idx) => (
                <div key={m.id} style={{ background: "#fff", borderRadius: "12px", marginBottom: "10px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: idx < activeModule ? "#dcfce7" : "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {idx < activeModule ? (
                          <span style={{ color: "#16a34a", fontSize: "18px" }}>✓</span>
                        ) : (
                          <span style={{ color: "#2563eb", fontSize: "14px", fontWeight: 700 }}>{idx + 1}</span>
                        )}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{m.title}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>{m.contents?.length || 0} content items</p>
                      </div>
                    </div>
                    {idx >= activeModule && (
                      <button onClick={() => setActiveModule(idx + 1)} style={{ padding: "6px 14px", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        {idx === 0 && activeModule === 0 ? "Start" : "Done"}
                      </button>
                    )}
                  </div>
                  {m.contents && m.contents.length > 0 && idx >= activeModule && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: "10px 16px", background: "#f8fafc" }}>
                      {m.contents.map(c => (
                        <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                          <span style={{ fontSize: "16px" }}>{c.type === "video" ? "🎬" : c.type === "document" ? "📄" : "📝"}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>{c.description}</p>
                            {c.type === "video" && c.url && (() => {
                              const videoUrl = c.url.startsWith("http") ? c.url : `${apiBaseUrl}${c.url}`;
                              return (
                                <>
                                  <video src={videoUrl} controls
                                    style={{ marginTop: "8px", width: "100%", maxHeight: "180px", borderRadius: "8px", background: "#000" }} />
                                  <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: "11px", color: "#2563eb", display: "block", marginTop: "4px" }}>🔗 Open Video Source →</a>
                                </>
                              );
                            })()}
                            {c.type === "document" && c.url && (
                              <a href={c.url.startsWith("http") ? c.url : `${apiBaseUrl}${c.url}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#2563eb", display: "block", marginTop: "4px" }}>📎 Open Document →</a>
                            )}
                            {c.type === "text" && !c.url && null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {activeModule >= modules.length && modules.length > 0 && (
                <button onClick={() => setTestMode(true)} style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#16a34a", color: "#fff", border: "none", fontSize: "15px", fontWeight: 700, cursor: "pointer", marginTop: "8px" }}>
                  🎯 Take Test
                </button>
              )}
            </>
          ) : submitted ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "64px", marginBottom: "16px" }}>{score.passed ? "🏆" : "😔"}</div>
              <h2 style={{ color: score.passed ? "#16a34a" : "#dc2626", fontSize: "24px", fontWeight: 800, margin: "0 0 8px" }}>
                {score.passed ? "Congratulations!" : "Not Passed"}
              </h2>
              <p style={{ color: "#64748b", margin: "0 0 16px" }}>Your Score: <strong style={{ color: "#0f172a", fontSize: "20px" }}>{score.pct}%</strong></p>
              <p style={{ color: "#64748b", fontSize: "13px" }}>
                {score.passed ? `You scored ${score.earned}/${totalMarks} marks. Certificate will be assigned by admin.` : `You scored ${score.earned}/${totalMarks} marks. Passing requires ${passingMarks} marks (${passingPct}%).`}
              </p>
              {score.passed && (
                <div style={{ marginTop: "20px", padding: "16px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
                  <span style={{ fontSize: "32px" }}>🎓</span>
                  <p style={{ margin: "8px 0 0", color: "#16a34a", fontWeight: 600 }}>Certificate will be visible in your profile once granted by admin.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ background: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "14px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a", fontWeight: 700 }}>Final Test</h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                  {questions.length} questions • Passing: {passingPct}% ({passingMarks} marks)
                </p>
              </div>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "10px" }}>
                  <p style={{ margin: "0 0 10px", fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Q{i + 1}. {q.question}</p>
                  <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#64748b" }}>{q.marks} marks</p>
                  {q.options && q.options.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(Array.isArray(q.options) ? q.options : []).map((opt) => (
                        <button key={opt} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          style={{ padding: "10px 14px", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", border: answers[q.id] === opt ? "2px solid #2563eb" : "1px solid #e2e8f0", background: answers[q.id] === opt ? "#eff6ff" : "#f8fafc", color: answers[q.id] === opt ? "#1d4ed8" : "#334155", fontWeight: answers[q.id] === opt ? 700 : 400 }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Your answer..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", minHeight: "60px", resize: "vertical" }}
                    />
                  )}
                </div>
              ))}
              <button onClick={handleSubmitTest} style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#2563eb", color: "#fff", border: "none", fontSize: "15px", fontWeight: 700, cursor: "pointer", marginTop: "8px" }}>
                Submit Test
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// QR CODE MODAL
// ═════════════════════════════════════════════════════════════════════
export function TrainingQRModal({ training, qrDataUrl, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "360px", padding: "32px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Training QR Code</h3>
        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>{training.title}</p>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code" style={{ width: "220px", height: "220px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
        ) : (
          <p style={{ color: "#94a3b8" }}>Generating QR...</p>
        )}
        <p style={{ marginTop: "16px", fontSize: "11px", color: "#94a3b8" }}>Scan to access this training on mobile</p>
        <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "center" }}>
          {qrDataUrl && (
            <a href={qrDataUrl} download={`training-${training.id}-qr.png`} style={{ padding: "8px 18px", borderRadius: "8px", background: "#2563eb", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
              Download QR
            </a>
          )}
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
}
