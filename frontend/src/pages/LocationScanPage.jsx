import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

const APK_URL =
  "https://expo.dev/accounts/rahulcct/projects/softfm/builds/c5a932d7-cb7f-42b6-8eaf-34176b4d0457";

export default function LocationScanPage() {
  const { id } = useParams();
  const [status, setStatus] = useState("trying"); // trying | opened | notInstalled
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Try to open the app via the fmapp:// scheme
    // The URL fmapp://location-scan?locationId=ID&fromQR=1 maps to
    // the existing location-scan.tsx route in the Expo Router app.
    const deepLink = `fmapp://location-scan?locationId=${id}&fromQR=1`;

    // On Android, attempt via intent URL for better reliability
    const intentUrl =
      `intent://location-scan?locationId=${id}&fromQR=1` +
      `#Intent;scheme=fmapp;package=com.cct123.fmmobilev2;` +
      `S.browser_fallback_url=${encodeURIComponent(window.location.href + "?fallback=1")};end`;

    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      // Intent URL redirects to fallback URL automatically if app not installed
      window.location.href = intentUrl;
      // After 3 s, if still here, app is not installed
      setTimeout(() => setStatus("notInstalled"), 3000);
    } else {
      // iOS / Desktop: try custom scheme, show fallback after timeout
      window.location.href = deepLink;
      setTimeout(() => setStatus("notInstalled"), 2500);
    }
  }, [id]);

  // If the user arrives via fallback URL (?fallback=1), skip the app-open attempt
  useEffect(() => {
    if (window.location.search.includes("fallback=1")) {
      setStatus("notInstalled");
    }
  }, []);

  const openApp = () => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const intentUrl =
      `intent://location-scan?locationId=${id}&fromQR=1` +
      `#Intent;scheme=fmapp;package=com.cct123.fmmobilev2;` +
      `S.browser_fallback_url=${encodeURIComponent(APK_URL)};end`;
    window.location.href = isAndroid
      ? intentUrl
      : `fmapp://location-scan?locationId=${id}&fromQR=1`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
        fontFamily: "Arial, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      {/* Logo / Header */}
      <div
        style={{
          width: "72px",
          height: "72px",
          background: "#2563eb",
          borderRadius: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "24px",
          boxShadow: "0 8px 24px rgba(37,99,235,0.3)",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>

      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>
        Facility Manager
      </h1>
      <p style={{ fontSize: "15px", color: "#64748b", margin: "0 0 32px", maxWidth: "320px", lineHeight: 1.5 }}>
        This QR code links to a location in the FM app.
      </p>

      {status === "trying" ? (
        <div>
          <div
            style={{
              width: "44px",
              height: "44px",
              border: "4px solid #e2e8f0",
              borderTop: "4px solid #2563eb",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#64748b", fontSize: "14px" }}>Opening app…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "28px 24px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            border: "1px solid #e2e8f0",
            maxWidth: "340px",
            width: "100%",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#475569",
              marginBottom: "20px",
              lineHeight: 1.5,
            }}
          >
            {/Android/i.test(navigator.userAgent)
              ? "The FM app is not installed on your device."
              : "Could not open the FM app automatically."}
          </p>

          {/* Try open app */}
          <button
            onClick={openApp}
            style={{
              width: "100%",
              padding: "13px 20px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: "12px",
            }}
          >
            Open in App
          </button>

          {/* Download APK */}
          <a
            href={APK_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              width: "100%",
              padding: "13px 20px",
              background: "#f1f5f9",
              color: "#1e293b",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: 600,
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            📲 Download FM App (.apk)
          </a>

          <p
            style={{
              fontSize: "11.5px",
              color: "#94a3b8",
              marginTop: "16px",
              lineHeight: 1.4,
            }}
          >
            After installing the app, tap "Open in App" above or scan this QR code again.
          </p>
        </div>
      )}
    </div>
  );
}
