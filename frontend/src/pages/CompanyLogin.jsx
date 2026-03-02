import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { companyLogin } from "../api.js";
import logo from "../images/image.png";

export default function CompanyLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await companyLogin(form);
      sessionStorage.setItem("cp_token", res.token);
      sessionStorage.setItem("cp_user", JSON.stringify(res.user));
      navigate("/company/portal");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <img src={logo} alt="Logo" style={{ height: "52px", objectFit: "contain", marginBottom: "16px" }} />
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "6px" }}>
            Company Portal
          </h1>
          <p style={{ color: "#64748b", fontSize: "14.5px" }}>Sign in to access your company workspace</p>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "36px 40px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "11px 14px", borderRadius: "8px", fontSize: "13.5px", marginBottom: "20px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "7px" }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  style={{ width: "100%", padding: "11px 12px 11px 40px", border: "1.5px solid #e2e8f0", borderRadius: "9px", fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                  onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                />
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "7px" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  style={{ width: "100%", padding: "11px 42px 11px 40px", border: "1.5px solid #e2e8f0", borderRadius: "9px", fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                  onFocus={(e) => (e.target.style.borderColor = "#2563eb")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "13px", background: loading ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "9px", fontSize: "15px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "background 0.2s", letterSpacing: "0.01em" }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#94a3b8" }}>
          This portal is for company employees only.{" "}
          <button onClick={() => navigate("/client")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
            Admin Portal →
          </button>
        </p>
      </div>
    </div>
  );
}
