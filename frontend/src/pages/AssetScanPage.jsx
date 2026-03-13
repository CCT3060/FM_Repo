/**
 * AssetScanPage
 *
 * Public page loaded when a user scans an asset QR code.
 * Shows asset details + all assigned logsheet/checklist templates.
 * Allows anonymous fill of any template.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LogsheetModule from "../components/LogsheetModule.jsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

export default function AssetScanPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asset, setAsset] = useState(null);
  const [logsheetTemplates, setLogsheetTemplates] = useState([]);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  
  const [view, setView] = useState("overview"); // overview | fill-logsheet | fill-checklist
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [submitterName, setSubmitterName] = useState("");

  useEffect(() => {
    if (!assetId) return;
    setLoading(true);
    fetch(`${BASE}/api/asset-qr/${assetId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAsset(data.asset);
        setLogsheetTemplates(data.logsheetTemplates || []);
        setChecklistTemplates(data.checklistTemplates || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assetId]);

  /* ── OVERVIEW ──────────────────────────────────────────────────────────────── */
  if (view === "overview") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "40px 20px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "28px 32px", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" strokeLinecap="round" />
              </svg>
              <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>Asset Information</h1>
            </div>
            <p style={{ fontSize: "15px", opacity: 0.9, margin: 0 }}>
              Scan successful — Select a template to fill or view asset details below.
            </p>
          </div>

          {loading && (
            <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
              <div style={{ display: "inline-block", width: "40px", height: "40px", border: "4px solid #e2e8f0", borderTop: "4px solid #667eea", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <p style={{ marginTop: "16px", fontSize: "15px" }}>Loading asset…</p>
            </div>
          )}

          {error && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <div style={{ width: "64px", height: "64px", margin: "0 auto 20px", background: "#fef2f2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p style={{ fontSize: "16px", fontWeight: 600, color: "#dc2626", marginBottom: "8px" }}>Asset Not Found</p>
              <p style={{ fontSize: "14px", color: "#64748b" }}>{error}</p>
              <button onClick={() => navigate("/company")} style={{ marginTop: "20px", padding: "10px 24px", background: "#667eea", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                Go to Portal
              </button>
            </div>
          )}

          {!loading && !error && asset && (
            <div style={{ padding: "32px" }}>
              {/* Asset Details Card */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", marginBottom: "28px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                  {asset.assetName}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", fontSize: "14px" }}>
                  {asset.assetUniqueId && (
                    <div>
                      <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Asset ID</p>
                      <p style={{ color: "#0f172a", fontWeight: 600 }}>{asset.assetUniqueId}</p>
                    </div>
                  )}
                  <div>
                    <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Type</p>
                    <p style={{ color: "#0f172a", fontWeight: 600 }}>{asset.assetType}</p>
                  </div>
                  {asset.building && (
                    <div>
                      <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Building</p>
                      <p style={{ color: "#0f172a", fontWeight: 600 }}>{asset.building}</p>
                    </div>
                  )}
                  {asset.floor && (
                    <div>
                      <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Floor</p>
                      <p style={{ color: "#0f172a", fontWeight: 600 }}>{asset.floor}</p>
                    </div>
                  )}
                  {asset.room && (
                    <div>
                      <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Room</p>
                      <p style={{ color: "#0f172a", fontWeight: 600 }}>{asset.room}</p>
                    </div>
                  )}
                  <div>
                    <p style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Status</p>
                    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: asset.status === "Active" ? "#dcfce7" : "#f1f5f9", color: asset.status === "Active" ? "#16a34a" : "#64748b" }}>
                      {asset.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Name input */}
              <div style={{ marginBottom: "28px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "8px" }}>
                  Your Name (Optional)
                </label>
                <input
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  placeholder="Enter your name for record keeping"
                  style={{ width: "100%", padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </div>

              {/* Logsheet Templates */}
              {logsheetTemplates.length > 0 && (
                <div style={{ marginBottom: "28px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Logsheet Templates ({logsheetTemplates.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {logsheetTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setSelectedTemplate(t); setView("fill-logsheet"); }}
                        style={{ background: "#fff", border: "2px solid #e2e8f0", borderRadius: "10px", padding: "16px 18px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(102,126,234,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>{t.templateName}</p>
                            <p style={{ fontSize: "13px", color: "#64748b" }}>Frequency: {t.frequency || "N/A"}</p>
                          </div>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist Templates */}
              {checklistTemplates.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    Checklist Templates ({checklistTemplates.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {checklistTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setSelectedTemplate(t); setView("fill-checklist"); }}
                        style={{ background: "#fff", border: "2px solid #e2e8f0", borderRadius: "10px", padding: "16px 18px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(102,126,234,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>{t.templateName}</p>
                            {t.description && <p style={{ fontSize: "13px", color: "#64748b" }}>{t.description}</p>}
                          </div>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {logsheetTemplates.length === 0 && checklistTemplates.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <p style={{ fontSize: "14px", color: "#94a3b8" }}>No templates assigned to this asset yet.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── FILL LOGSHEET ─────────────────────────────────────────────────────────── */
  if (view === "fill-logsheet" && selectedTemplate) {
    return (
      <LogsheetModule
        token={null}
        assets={[asset]}
        isQRMode
        qrAssetId={asset.id}
        qrTemplateId={selectedTemplate.id}
        qrSubmitterName={submitterName}
        onBackToAsset={() => { setView("overview"); setSelectedTemplate(null); }}
      />
    );
  }

  /* ── FILL CHECKLIST ────────────────────────────────────────────────────────── */
  if (view === "fill-checklist" && selectedTemplate) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", background: "#fff", borderRadius: "16px", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", padding: "32px" }}>
          <button onClick={() => { setView("overview"); setSelectedTemplate(null); }} style={{ marginBottom: "20px", padding: "8px 16px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            ← Back to Asset
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>{selectedTemplate.templateName}</h1>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px" }}>{asset.assetName} — Checklist Fill</p>

          {/* TODO: Implement checklist fill form with selectedTemplate.questions */}
          <div style={{ padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "12px", border: "2px dashed #e2e8f0" }}>
            <p style={{ fontSize: "15px", color: "#64748b", marginBottom: "12px" }}>Checklist fill UI coming soon.</p>
            <p style={{ fontSize: "14px", color: "#94a3b8" }}>Template ID: {selectedTemplate.id} | Questions: {selectedTemplate.questions?.length || 0}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
