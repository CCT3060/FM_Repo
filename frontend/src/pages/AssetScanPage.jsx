/**
 * AssetScanPage
 *
 * When a user scans an asset QR code, this page immediately attempts to
 * open the Klean mobile app via deep link (klean://asset-scan?assetId=X).
 * If the app is not installed, it shows a fallback with Play Store link.
 * The Catalyst logo is shown prominently at the top.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/runtimeConfig";
import catalystLogo from "../assets/catalyst-logo.svg";

const BASE = getApiBaseUrl();
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.cct123.mobileapp";

export default function AssetScanPage() {
  const { assetId } = useParams();

  const [asset, setAsset] = useState(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [showFallback, setShowFallback] = useState(false);

  // Fetch asset info for display
  useEffect(() => {
    if (!assetId) return;
    fetch(`${BASE}/api/asset-qr/${assetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.asset) setAsset(data.asset); })
      .catch(() => {})
      .finally(() => setAssetLoading(false));
  }, [assetId]);

  // Immediately try to open the Klean app via deep link
  useEffect(() => {
    if (!assetId) return;
    window.location.href = `klean://asset-scan?assetId=${assetId}`;
    const timer = setTimeout(() => setShowFallback(true), 2500);
    return () => clearTimeout(timer);
  }, [assetId]);

  const handleOpenApp = () => {
    window.location.href = `klean://asset-scan?assetId=${assetId}`;
    setTimeout(() => setShowFallback(true), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f9ff 0%, #e8f4fd 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div style={{ maxWidth: "420px", width: "100%", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.12)", overflow: "hidden" }}>

        {/* Header with Catalyst logo */}
        <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "28px 24px", textAlign: "center" }}>
          <div style={{ background: "#fff", borderRadius: "10px", padding: "10px 20px", display: "inline-block", marginBottom: "16px" }}>
            <img src={catalystLogo} alt="Catalyst" style={{ height: "40px", display: "block" }} />
          </div>
          <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 800, margin: 0, marginBottom: "6px" }}>QR Code Scanned</h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px", margin: 0 }}>Open in the Klean app to fill templates</p>
        </div>

        <div style={{ padding: "28px 24px" }}>

          {/* Asset info (if loaded) */}
          {!assetLoading && asset && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ width: "36px", height: "36px", background: "#eff6ff", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>{asset.assetName}</p>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{asset.assetType}{asset.assetUniqueId ? ` · ${asset.assetUniqueId}` : ""}</p>
                </div>
              </div>
              {(asset.building || asset.floor) && (
                <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, paddingTop: "8px", borderTop: "1px solid #e2e8f0" }}>
                  📍 {[asset.building, asset.floor, asset.room].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {/* Launching indicator */}
          {!showFallback && (
            <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
              <div style={{ display: "inline-block", width: "36px", height: "36px", border: "3px solid #e2e8f0", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.9s linear infinite", marginBottom: "14px" }} />
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", marginBottom: "4px" }}>Opening Klean App…</p>
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>If the app doesn't open, it may not be installed.</p>
            </div>
          )}

          {/* Open in app button */}
          <button
            onClick={handleOpenApp}
            style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #1e3a8a, #2563eb)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: 700, cursor: "pointer", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            Open in Klean App
          </button>

          {/* Play Store fallback */}
          {showFallback && (
            <div style={{ marginTop: "4px" }}>
              <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
                <p style={{ fontSize: "13px", color: "#92400e", margin: 0, fontWeight: 500 }}>
                  ⚠️ App didn't open — Klean may not be installed on this device.
                </p>
              </div>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", width: "100%", padding: "13px", background: "#fff", border: "2px solid #16a34a", borderRadius: "10px", textDecoration: "none", color: "#16a34a", fontSize: "15px", fontWeight: 700 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Download from Google Play Store
              </a>
            </div>
          )}
        </div>
      </div>

      <p style={{ marginTop: "20px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
        Powered by <strong style={{ color: "#2563eb" }}>Catalyst</strong> — Partnering for Sustainability
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
