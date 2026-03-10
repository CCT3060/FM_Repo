/**
 * Enterprise Asset Management Dashboard
 * Full visibility into asset health, cost, maintenance, depreciation, and lifecycle.
 */

import { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/* ─── tiny chart primitives (no lib needed) ─────────────────────── */
function BarChart({ data = [], labelKey = "label", valueKey = "count", color = "#2563eb", height = 160 }) {
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "13px" }}>No data</div>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height, padding: "0 4px" }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} title={`${d[labelKey]}: ${val}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "default" }}>
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>{val}</span>
            <div style={{ width: "100%", background: "#f1f5f9", borderRadius: "4px 4px 0 0", height: `${height - 28}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ background: color, borderRadius: "3px 3px 0 0", width: "100%", height: `${Math.max(pct, 2)}%`, transition: "height 0.4s ease" }} />
            </div>
            <span style={{ fontSize: "9px", color: "#94a3b8", textAlign: "center", maxWidth: "44px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ data = [], labelKey = "month", valueKey = "count", color = "#2563eb", height = 120 }) {
  if (data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "13px" }}>Not enough data</div>;
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  const w = 400; const h = height - 28;
  const step = w / (data.length - 1);
  const pts = vals.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h + 28}`} style={{ width: "100%", height }} xmlns="http://www.w3.org/2000/svg">
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" points={pts} />
        {vals.map((v, i) => (
          <g key={i}>
            <circle cx={i * step} cy={h - (v / max) * h} r="4" fill={color} />
            <text x={i * step} y={h + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{data[i][labelKey]?.slice(-5)}</text>
            <text x={i * step} y={h - (v / max) * h - 7} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">{v || ""}</text>
          </g>
        ))}
        {/* gradient fill under line */}
        <defs>
          <linearGradient id={`lg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <polyline fill={`url(#lg-${color.replace("#","")})`} stroke="none"
          points={`0,${h} ${pts} ${w},${h}`} />
      </svg>
    </div>
  );
}

function DonutChart({ segments = [], size = 120 }) {
  if (!segments.length) return null;
  const total = segments.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) return null;
  const cx = size / 2; const cy = size / 2; const r = size * 0.38; const ir = size * 0.26;
  let angle = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const frac = (Number(seg.value) || 0) / total;
        const end = angle + frac * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle); const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(end);   const y2 = cy + r * Math.sin(end);
        const xi1 = cx + ir * Math.cos(angle); const yi1 = cy + ir * Math.sin(angle);
        const xi2 = cx + ir * Math.cos(end);   const yi2 = cy + ir * Math.sin(end);
        const large = frac > 0.5 ? 1 : 0;
        const d = `M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${ir},${ir} 0 ${large},0 ${xi1},${yi1} Z`;
        angle = end;
        return <path key={i} d={d} fill={seg.color || "#2563eb"} opacity="0.9"><title>{seg.label}: {seg.value}</title></path>;
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.14} fontWeight="800" fill="#0f172a">{total}</text>
    </svg>
  );
}

/* ─── formatting helpers ────────────────────────────────────────── */
const INR = (v) => {
  if (!v && v !== 0) return "₹0";
  const n = Number(v);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
};

const healthColor = (score) =>
  score >= 90 ? "#16a34a" : score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

const healthBg = (score) =>
  score >= 90 ? "#f0fdf4" : score >= 70 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2";

const severityColor = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
const severityBg   = { critical: "#fef2f2", high: "#fff7ed", medium: "#fffbeb", low: "#f0fdf4"  };

const typeColors = { soft: "#22c55e", technical: "#2563eb", fleet: "#7c3aed" };
const typeBgs    = { soft: "#f0fdf4", technical: "#eff6ff", fleet: "#f5f3ff"  };

const CHART_COLORS = ["#2563eb","#22c55e","#f59e0b","#ef4444","#7c3aed","#ec4899","#14b8a6","#f97316"];

/* ─── SummaryCard ───────────────────────────────────────────────── */
function SummaryCard({ label, value, sub, icon, iconBg, iconColor, subColor = "#64748b", trend }) {
  return (
    <div style={{ background: "#fff", borderRadius: "12px", padding: "20px 22px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "8px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>{label}</div>
        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      </div>
      <div style={{ fontSize: "30px", fontWeight: 800, color: "#0f172a", letterSpacing: "-1px", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "12.5px", color: subColor, fontWeight: 500 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ fontSize: "11px", color: trend >= 0 ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last month
        </div>
      )}
    </div>
  );
}

/* ─── HealthBadge ───────────────────────────────────────────────── */
function HealthBadge({ score, label }) {
  const c = healthColor(score); const bg = healthBg(score);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "52px", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: c, borderRadius: "4px", transition: "width 0.5s" }} />
      </div>
      <span style={{ background: bg, color: c, padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>
        {score} — {label}
      </span>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────────────── */
function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
      <div>
        <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: "12.5px", color: "#64748b", margin: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── Panel wrapper ──────────────────────────────────────────────── */
function Panel({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px 22px", ...style }}>
      {children}
    </div>
  );
}

/* ─── Alert Row ──────────────────────────────────────────────────── */
function AlertRow({ alert }) {
  const icons = {
    warranty: "🛡️", maintenance_overdue: "🔧", end_of_life: "⚠️",
    stale_work_order: "📋", insurance_expiry: "📄",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "8px",
      background: severityBg[alert.severity] || "#f8fafc", border: `1px solid ${severityColor[alert.severity]}22`, marginBottom: "6px" }}>
      <span style={{ fontSize: "18px" }}>{icons[alert.type] || "❗"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.assetName}</div>
        <div style={{ fontSize: "12px", color: "#475569" }}>{alert.message}</div>
      </div>
      <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700,
        background: severityBg[alert.severity], color: severityColor[alert.severity], flexShrink: 0, textTransform: "capitalize" }}>
        {alert.severity}
      </span>
    </div>
  );
}

/* ─── Timeline Item ──────────────────────────────────────────────── */
function TimelineItem({ item }) {
  const icons = { history: "📝", workorder: "🔧", checklist: "✅", logsheet: "📊" };
  const colors = { history: "#2563eb", workorder: "#f59e0b", checklist: "#22c55e", logsheet: "#7c3aed" };
  return (
    <div style={{ display: "flex", gap: "12px", marginBottom: "14px", position: "relative" }}>
      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: `${colors[item.type]}22`,
        color: colors[item.type], fontSize: "14px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icons[item.type] || "📌"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{item.title}</div>
        <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>{item.description}</div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
          {new Date(item.date).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {item.actor ? ` · ${item.actor}` : ""}
        </div>
      </div>
    </div>
  );
}

/* ─── DepreciationTable ──────────────────────────────────────────── */
function DepreciationTable({ asset }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Year", "Book Value", "Accumulated Dep."].map((h) => (
              <th key={h} style={{ padding: "8px 12px", textAlign: h === "Year" ? "left" : "right",
                color: "#475569", fontWeight: 700, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {asset.schedule.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ padding: "7px 12px", color: "#0f172a", fontWeight: 600 }}>{row.year}</td>
              <td style={{ padding: "7px 12px", textAlign: "right", color: row.bookValue <= 0 ? "#ef4444" : "#0f172a" }}>{INR(row.bookValue)}</td>
              <td style={{ padding: "7px 12px", textAlign: "right", color: "#64748b" }}>{INR(row.depreciation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function AssetDashboard({ token, companyId, assetList = [], onViewAsset, endpointPrefix = "/api/asset-dashboard" }) {
  const [activeTab, setActiveTab]         = useState("overview");
  const [summary, setSummary]             = useState(null);
  const [distribution, setDistribution]   = useState(null);
  const [performance, setPerformance]     = useState([]);
  const [workOrders, setWorkOrders]       = useState(null);
  const [maintenanceCost, setMaintenanceCost] = useState(null);
  const [alerts, setAlerts]               = useState([]);
  const [depreciation, setDepreciation]   = useState([]);
  const [predictive, setPredictive]       = useState([]);
  const [loading, setLoading]             = useState({});
  const [error, setError]                 = useState(null);

  // filters
  const [filterType, setFilterType]       = useState("all");
  const [filterBuilding, setFilterBuilding] = useState("all");
  const [filterSearch, setFilterSearch]   = useState("");
  const [filterHealth, setFilterHealth]   = useState("all"); // all, excellent, good, attention, critical

  // drilldown
  const [historyAsset, setHistoryAsset]   = useState(null);   // { id, name }
  const [history, setHistory]             = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // comparison
  const [compareIds, setCompareIds]       = useState([]);
  const [compareData, setCompareData]     = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // depreciation drilldown
  const [depAsset, setDepAsset]           = useState(null);

  // pagination for performance table
  const [perfPage, setPerfPage]           = useState(0);
  const PERF_PAGE_SIZE = 15;

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const qs = useCallback((extra = {}) => {
    const p = new URLSearchParams();
    if (companyId) p.set("companyId", companyId);
    if (filterType !== "all") p.set("assetType", filterType);
    if (filterBuilding !== "all") p.set("building", filterBuilding);
    Object.entries(extra).forEach(([k, v]) => v !== undefined && p.set(k, v));
    return p.toString();
  }, [companyId, filterType, filterBuilding]);

  const load = useCallback(async (key, path, setter) => {
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers });
      if (res.ok) setter(await res.json());
      else setError(`Failed to load ${key}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  }, [headers]);

  // Load core data when filters or endpoint prefix changes
  useEffect(() => {
    load("summary",    `${endpointPrefix}/summary?${qs()}`,       setSummary);
    load("dist",       `${endpointPrefix}/distribution?${qs()}`,  setDistribution);
    load("perf",       `${endpointPrefix}/performance?${qs()}`,   setPerformance);
    load("alerts",     `${endpointPrefix}/alerts?${qs()}`,         setAlerts);
  }, [qs, load, endpointPrefix]);

  // Load tab-specific data on demand
  useEffect(() => {
    if (activeTab === "maintenance") load("wo",   `${endpointPrefix}/work-orders?${qs()}`,      setWorkOrders);
    if (activeTab === "cost")        load("mc",   `${endpointPrefix}/maintenance-cost?${qs()}`, setMaintenanceCost);
    if (activeTab === "depreciation") load("dep", `${endpointPrefix}/depreciation?${qs()}`,     setDepreciation);
    if (activeTab === "predictive")  load("pred", `${endpointPrefix}/predictive?${qs()}`,       setPredictive);
  }, [activeTab, qs, load, endpointPrefix]);

  /* ── History drilldown ── */
  const loadHistory = useCallback(async (asset) => {
    setHistoryAsset(asset);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpointPrefix}/${asset.id}/history`, { headers });
      if (res.ok) setHistory(await res.json());
    } catch (_) {}
    setHistoryLoading(false);
  }, [headers, endpointPrefix]);

  /* ── Comparison ── */
  const loadComparison = useCallback(async () => {
    if (!compareIds.length) return;
    setCompareLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpointPrefix}/compare?${qs({ ids: compareIds.join(",") })}`, { headers });
      if (res.ok) setCompareData(await res.json());
    } catch (_) {}
    setCompareLoading(false);
  }, [compareIds, qs, headers, endpointPrefix]);

  /* ── derived data ── */
  const buildings = useMemo(() => {
    const b = new Set(assetList.map((a) => a.building).filter(Boolean));
    return ["all", ...Array.from(b).sort()];
  }, [assetList]);

  const assetTypes = useMemo(() => {
    const t = new Set(assetList.map((a) => a.assetType).filter(Boolean));
    return ["all", ...Array.from(t).sort()];
  }, [assetList]);

  const filteredPerf = useMemo(() => {
    let rows = [...performance];
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      rows = rows.filter((r) => r.assetName?.toLowerCase().includes(s) || r.building?.toLowerCase().includes(s));
    }
    if (filterHealth !== "all") {
      rows = rows.filter((r) => {
        if (filterHealth === "excellent") return r.healthScore >= 90;
        if (filterHealth === "good")      return r.healthScore >= 70 && r.healthScore < 90;
        if (filterHealth === "attention") return r.healthScore >= 50 && r.healthScore < 70;
        if (filterHealth === "critical")  return r.healthScore < 50;
        return true;
      });
    }
    rows.sort((a, b) => a.healthScore - b.healthScore); // worst first
    return rows;
  }, [performance, filterSearch, filterHealth]);

  const pagedPerf = filteredPerf.slice(perfPage * PERF_PAGE_SIZE, (perfPage + 1) * PERF_PAGE_SIZE);
  const totalPerfPages = Math.max(1, Math.ceil(filteredPerf.length / PERF_PAGE_SIZE));

  /* ── scorecard distribution ── */
  const healthDist = useMemo(() => {
    const bands = { excellent: 0, good: 0, attention: 0, critical: 0 };
    performance.forEach((r) => {
      if (r.healthScore >= 90) bands.excellent++;
      else if (r.healthScore >= 70) bands.good++;
      else if (r.healthScore >= 50) bands.attention++;
      else bands.critical++;
    });
    return [
      { label: "Excellent", value: bands.excellent, color: "#16a34a" },
      { label: "Good",      value: bands.good,      color: "#22c55e" },
      { label: "Attention", value: bands.attention,  color: "#f59e0b" },
      { label: "Critical",  value: bands.critical,   color: "#ef4444" },
    ];
  }, [performance]);

  /* ── Export CSV ── */
  const exportCSV = (rows, filename) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => {
      const v = String(r[k] ?? "");
      return v.includes(",") ? `"${v}"` : v;
    }).join(","))].join("\n");
    const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { key: "overview",    label: "📊 Overview" },
    { key: "health",      label: "❤️ Health" },
    { key: "maintenance", label: "🔧 Maintenance" },
    { key: "cost",        label: "💰 Cost Analytics" },
    { key: "depreciation",label: "📉 Depreciation" },
    { key: "alerts",      label: `🔔 Alerts${alerts.length ? ` (${alerts.length})` : ""}` },
    { key: "history",     label: "📜 Asset History" },
    { key: "compare",     label: "⚖️ Compare" },
    { key: "predictive",  label: "📈 Predictive" },
  ];

  /* ── Full-screen history drawer ── */
  if (historyAsset) return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", background: "#fff", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <button onClick={() => setHistoryAsset(null)}
          style={{ padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc", color: "#475569", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Back to Dashboard
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Asset History — {historyAsset.name}</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>Full lifecycle timeline</div>
        </div>
      </div>
      <Panel>
        {historyLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>⏳ Loading history…</div>
        ) : !history.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No history records found</div>
        ) : (
          <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "8px" }}>
            {history.map((item) => <TimelineItem key={item.id} item={item} />)}
          </div>
        )}
      </Panel>
    </div>
  );

  return (
    <div style={{ fontFamily: "inherit", display: "flex", flexDirection: "column", gap: "0" }}>
      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>
            Asset Management Dashboard
          </h1>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>
            Enterprise-grade visibility into asset health, cost, maintenance, and lifecycle performance.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => exportCSV(performance, "asset-performance.csv")}
            style={{ padding: "8px 18px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            ⬇ Export Report
          </button>
          <button onClick={() => window.print()}
            style={{ padding: "8px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* ── Global Filters ── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 18px", marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#475569" }}>Filters:</span>
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPerfPage(0); }}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc" }}>
          {assetTypes.map((t) => <option key={t} value={t}>{t === "all" ? "All Types" : t}</option>)}
        </select>
        <select value={filterBuilding} onChange={(e) => { setFilterBuilding(e.target.value); setPerfPage(0); }}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc" }}>
          {buildings.map((b) => <option key={b} value={b}>{b === "all" ? "All Buildings" : b}</option>)}
        </select>
        <input value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setPerfPage(0); }}
          placeholder="Search assets…"
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc", width: "170px" }} />
        <select value={filterHealth} onChange={(e) => { setFilterHealth(e.target.value); setPerfPage(0); }}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#f8fafc" }}>
          {[["all","All Health"], ["excellent","Excellent (90-100)"], ["good","Good (70-89)"], ["attention","Needs Attention (50-69)"], ["critical","Critical (<50)"]].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {(filterType !== "all" || filterBuilding !== "all" || filterSearch || filterHealth !== "all") && (
          <button onClick={() => { setFilterType("all"); setFilterBuilding("all"); setFilterSearch(""); setFilterHealth("all"); setPerfPage(0); }}
            style={{ padding: "6px 12px", background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            ✕ Clear
          </button>
        )}
      </div>

      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", border: "1px solid #fecaca" }}>⚠️ {error}</div>}

      {/* ── Tab Bar ── */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "2px solid #e2e8f0", marginBottom: "22px", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: "9px 16px", background: "none", border: "none",
              borderBottom: activeTab === t.key ? "3px solid #2563eb" : "3px solid transparent",
              marginBottom: "-2px", fontSize: "13px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              color: activeTab === t.key ? "#2563eb" : "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB: Overview ═════════════════════════ */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "14px" }}>
            {[
              {
                label: "Total Assets", value: summary?.total ?? "…",
                sub: `${summary?.active ?? 0} active · ${summary?.inactive ?? 0} inactive`, subColor: "#64748b",
                iconBg: "#dbeafe", iconColor: "#2563eb",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              },
              {
                label: "Total Asset Value", value: INR(summary?.totalPurchaseValue),
                sub: `Current: ${INR(summary?.totalCurrentValue)}`, subColor: "#2563eb",
                iconBg: "#f0fdf4", iconColor: "#16a34a",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              },
              {
                label: "Open Work Orders", value: summary?.openWorkOrders ?? "…",
                sub: alerts.filter((a) => a.type === "stale_work_order").length + " stale", subColor: "#f59e0b",
                iconBg: "#fffbeb", iconColor: "#f59e0b",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              },
              {
                label: "Near End-of-Life", value: summary?.assetsNearEndOfLife ?? "…",
                sub: "≥80% useful life elapsed", subColor: "#ef4444",
                iconBg: "#fef2f2", iconColor: "#ef4444",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              },
              {
                label: "Total Depreciation", value: INR(summary?.totalDepreciation),
                sub: `₹${INR(summary?.totalMaintenanceCost)} maint. cost`, subColor: "#7c3aed",
                iconBg: "#f5f3ff", iconColor: "#7c3aed",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              },
              {
                label: "Active Alerts", value: alerts.length,
                sub: `${alerts.filter((a) => a.severity === "critical").length} critical`, subColor: "#ef4444",
                iconBg: "#fef2f2", iconColor: "#ef4444",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              },
              {
                label: "Assets w/ Open WOs", value: summary?.assetsWithOpenWO ?? "…",
                sub: `${summary?.openWorkOrders ?? 0} total open work orders`, subColor: "#f97316",
                iconBg: "#fff7ed", iconColor: "#f97316",
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              },
            ].map((s) => <SummaryCard key={s.label} {...s} />)}
          </div>

          {/* Distribution charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            {/* By type */}
            <Panel>
              <SectionHeader title="By Asset Type" subtitle="Distribution of assets" />
              {distribution?.byType?.length ? (
                <>
                  <BarChart data={distribution.byType} labelKey="type" valueKey="count"
                    color="#2563eb" height={140} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
                    {distribution.byType.map((d, i) => (
                      <span key={i} style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                        background: typeBgs[d.type] || "#f1f5f9", color: typeColors[d.type] || "#475569" }}>
                        {d.type}: {d.count}
                      </span>
                    ))}
                  </div>
                </>
              ) : <div style={{ color: "#94a3b8", fontSize: "13px", padding: "30px 0", textAlign: "center" }}>No data</div>}
            </Panel>

            {/* By location */}
            <Panel>
              <SectionHeader title="By Location" subtitle="Assets per building/area" />
              {distribution?.byBuilding?.length ? (
                <BarChart data={distribution.byBuilding} labelKey="location" valueKey="count"
                  color="#22c55e" height={172} />
              ) : <div style={{ color: "#94a3b8", fontSize: "13px", padding: "30px 0", textAlign: "center" }}>No data</div>}
            </Panel>

            {/* Health distribution donut */}
            <Panel style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
              <SectionHeader title="Health Distribution" />
              <DonutChart segments={healthDist} size={120} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
                {healthDist.map((d) => (
                  <span key={d.label} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600 }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.color, display: "inline-block" }} />
                    {d.label}: {d.value}
                  </span>
                ))}
              </div>
            </Panel>
          </div>

          {/* Financial row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Panel>
              <SectionHeader title="Financial Overview"
                subtitle="Purchase value vs current (depreciated) value" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Purchase Value", val: INR(summary?.totalPurchaseValue), color: "#2563eb" },
                  { label: "Current Value",  val: INR(summary?.totalCurrentValue),  color: "#22c55e" },
                  { label: "Depreciation",   val: INR(summary?.totalDepreciation),   color: "#f59e0b" },
                  { label: "Maint. Cost",    val: INR(summary?.totalMaintenanceCost), color: "#7c3aed" },
                ].map((f) => (
                  <div key={f.label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", borderLeft: `3px solid ${f.color}` }}>
                    <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "6px" }}>{f.label}</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{f.val}</div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Top critical alerts preview */}
            <Panel>
              <SectionHeader title="Top Alerts"
                subtitle="Requires immediate attention"
                action={<button onClick={() => setActiveTab("alerts")} style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>View All →</button>} />
              {alerts.length === 0
                ? <div style={{ color: "#94a3b8", fontSize: "13px", padding: "16px 0", textAlign: "center" }}>No active alerts 🎉</div>
                : alerts.slice(0, 5).map((a, i) => <AlertRow key={i} alert={a} />)
              }
            </Panel>
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB: Health ════════════════════════════ */}
      {activeTab === "health" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Health score band cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
            {[
              { label: "Excellent (90-100)", count: healthDist[0]?.value, color: "#16a34a", bg: "#f0fdf4", icon: "🟢" },
              { label: "Good (70-89)",       count: healthDist[1]?.value, color: "#22c55e", bg: "#f0fdf4", icon: "🟡" },
              { label: "Needs Attention (50-69)", count: healthDist[2]?.value, color: "#f59e0b", bg: "#fffbeb", icon: "🟠" },
              { label: "Critical (<50)",     count: healthDist[3]?.value, color: "#ef4444", bg: "#fef2f2", icon: "🔴" },
            ].map((b) => (
              <div key={b.label} style={{ background: b.bg, borderRadius: "12px", padding: "18px 20px", border: `1px solid ${b.color}33` }}>
                <div style={{ fontSize: "24px", marginBottom: "6px" }}>{b.icon}</div>
                <div style={{ fontSize: "32px", fontWeight: 800, color: b.color }}>{b.count}</div>
                <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", fontWeight: 600 }}>{b.label}</div>
              </div>
            ))}
          </div>

          {/* Performance & Health Table */}
          <Panel>
            <SectionHeader title="Asset Health Scores"
              subtitle={`${filteredPerf.length} assets · worst first`}
              action={
                <button onClick={() => exportCSV(filteredPerf, "asset-health.csv")}
                  style={{ padding: "6px 14px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                  ⬇ CSV
                </button>
              } />
            {loading.perf ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>⏳ Loading…</div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Asset", "Type", "Building", "Health Score", "Work Orders", "Checklists", "Install Date", "Purchase Val.", "Current Val.", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: h === "Health Score" ? "center" : "left",
                            color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase",
                            letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPerf.length === 0 ? (
                        <tr><td colSpan="10" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets match current filters</td></tr>
                      ) : pagedPerf.map((a) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>{a.assetName}</div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                              background: typeBgs[a.assetType] || "#f1f5f9", color: typeColors[a.assetType] || "#475569" }}>
                              {a.assetType}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#475569", fontSize: "12.5px" }}>{a.building || "—"}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <HealthBadge score={a.healthScore} label={a.healthLabel} />
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <span style={{ fontWeight: 700, color: a.workOrdersOpen > 0 ? "#f59e0b" : "#64748b" }}>
                              {a.workOrdersOpen} / {a.workOrdersTotal}
                            </span>
                            <div style={{ fontSize: "10px", color: "#94a3b8" }}>open / total</div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <span style={{ fontWeight: 700, color: a.checklistFails > 0 ? "#ef4444" : "#64748b" }}>
                              {a.checklistFails} fails
                            </span>
                            <div style={{ fontSize: "10px", color: "#94a3b8" }}>{a.checklistTotal} total</div>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>
                            {a.installationDate ? new Date(a.installationDate).toLocaleDateString() : "—"}
                            {a.ageYears > 0 && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{a.ageYears}y old</div>}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>{INR(a.purchaseValue)}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>
                            <span style={{ color: a.currentValue < a.purchaseValue * 0.3 ? "#ef4444" : "#22c55e" }}>
                              {INR(a.currentValue)}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <button onClick={() => loadHistory({ id: a.id, name: a.assetName })}
                              style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe",
                                borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}>
                              History
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalPerfPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", fontSize: "13px", color: "#64748b" }}>
                    <span>Page {perfPage + 1} of {totalPerfPages} · {filteredPerf.length} assets</span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button onClick={() => setPerfPage((p) => Math.max(0, p - 1))} disabled={!perfPage}
                        style={{ padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: perfPage ? "pointer" : "default", background: "#fff", color: perfPage ? "#0f172a" : "#94a3b8" }}>Prev</button>
                      <button onClick={() => setPerfPage((p) => Math.min(totalPerfPages - 1, p + 1))} disabled={perfPage >= totalPerfPages - 1}
                        style={{ padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: perfPage < totalPerfPages - 1 ? "pointer" : "default", background: "#fff", color: perfPage < totalPerfPages - 1 ? "#0f172a" : "#94a3b8" }}>Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}

      {/* ═══════════════════ TAB: Maintenance ══════════════════════ */}
      {activeTab === "maintenance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading.wo ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>⏳ Loading maintenance data…</div>
          ) : !workOrders ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No maintenance data</div>
          ) : (
            <>
              {/* Status strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                {(workOrders.byStatus || []).map((s) => (
                  <div key={s.status} style={{ background: "#fff", borderRadius: "10px", padding: "16px 18px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{s.count}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "capitalize", marginTop: "4px", fontWeight: 600 }}>{s.status?.replace(/_/g," ")}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
                {/* Monthly trend */}
                <Panel>
                  <SectionHeader title="Work Order Trend" subtitle="Monthly work orders created" />
                  <LineChart data={workOrders.trend || []} labelKey="month" valueKey="count" height={150} />
                </Panel>

                {/* By priority */}
                <Panel>
                  <SectionHeader title="By Priority" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                    {(workOrders.byPriority || []).map((p) => {
                      const pc = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
                      const maxCount = Math.max(...(workOrders.byPriority || []).map((x) => Number(x.count)), 1);
                      return (
                        <div key={p.priority}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, textTransform: "capitalize", color: "#0f172a" }}>{p.priority}</span>
                            <span style={{ color: "#64748b" }}>{p.count}</span>
                          </div>
                          <div style={{ height: "7px", background: "#f1f5f9", borderRadius: "4px" }}>
                            <div style={{ height: "100%", width: `${(Number(p.count) / maxCount) * 100}%`, background: pc[p.priority] || "#2563eb", borderRadius: "4px" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>

              {/* Top failing assets */}
              <Panel>
                <SectionHeader title="Top Assets by Work Orders" subtitle="Most maintenance-intensive assets" />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Rank","Asset","Building","Total WOs","Open WOs","MTBF"].map((h) => (
                          <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(workOrders.topFailing || []).map((a, i) => {
                        const mtbf = workOrders.mtbf?.find((m) => m.id === a.id);
                        return (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 12px", color: i < 3 ? "#ef4444" : "#94a3b8", fontWeight: 700 }}>#{i + 1}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>{a.assetName}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b" }}>{a.building || "—"}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>{a.workOrderCount}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: "12px", fontWeight: 700, fontSize: "12px",
                                background: Number(a.openCount) > 0 ? "#fef2f2" : "#f0fdf4", color: Number(a.openCount) > 0 ? "#ef4444" : "#16a34a" }}>
                                {a.openCount}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>
                              {mtbf ? `${mtbf.mtbfDays} days` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {!workOrders.topFailing?.length && (
                        <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>No work orders recorded</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {/* MTBF table */}
              {workOrders.mtbf?.length > 0 && (
                <Panel>
                  <SectionHeader title="Mean Time Between Failures (MTBF)"
                    subtitle="Higher MTBF = more reliable asset" />
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Asset","Failures","First Failure","Last Failure","MTBF (days)"].map((h) => (
                            <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workOrders.mtbf.map((m) => (
                          <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>{m.assetName}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#ef4444" }}>{m.total_failures}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>{m.first_date ? new Date(m.first_date).toLocaleDateString() : "—"}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>{m.last_date ? new Date(m.last_date).toLocaleDateString() : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontWeight: 800, color: m.mtbfDays > 60 ? "#22c55e" : m.mtbfDays > 14 ? "#f59e0b" : "#ef4444" }}>
                                {m.mtbfDays} days
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Cost Analytics ═══════════════════ */}
      {activeTab === "cost" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading.mc ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>⏳ Loading cost data…</div>
          ) : !maintenanceCost ? null : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
                {/* Monthly trend */}
                <Panel>
                  <SectionHeader title="Maintenance Frequency Trend" subtitle="Monthly work order count (proxy for cost)" />
                  <LineChart data={maintenanceCost.monthlyTrend || []} labelKey="month" valueKey="count" color="#7c3aed" height={150} />
                </Panel>

                {/* By type */}
                <Panel>
                  <SectionHeader title="By Asset Type" />
                  <BarChart data={maintenanceCost.perType || []} labelKey="assetType" valueKey="maintenanceCount" color="#7c3aed" height={160} />
                </Panel>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Per asset */}
                <Panel>
                  <SectionHeader title="Top Asset Maintenance Events"
                    subtitle="Assets with most maintenance events"
                    action={<button onClick={() => exportCSV(maintenanceCost.perAsset || [], "maintenance-cost.csv")}
                      style={{ padding: "5px 12px", background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>⬇ CSV</button>} />
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Asset","Type","Building","Events"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11px", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(maintenanceCost.perAsset || []).map((a, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600, color: "#0f172a", fontSize: "12.5px" }}>{a.assetName}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ padding: "2px 7px", borderRadius: "10px", fontSize: "10.5px", fontWeight: 600,
                                background: typeBgs[a.assetType] || "#f1f5f9", color: typeColors[a.assetType] || "#475569" }}>
                                {a.assetType}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#64748b", fontSize: "12px" }}>{a.building || "—"}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: Number(a.maintenanceCount) > 5 ? "#ef4444" : "#0f172a" }}>{a.maintenanceCount}</td>
                          </tr>
                        ))}
                        {!(maintenanceCost.perAsset?.length) && <tr><td colSpan="4" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>No data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                {/* Per building */}
                <Panel>
                  <SectionHeader title="By Location" subtitle="Maintenance events per building" />
                  <BarChart data={maintenanceCost.perBuilding || []} labelKey="building" valueKey="count" color="#f59e0b" height={200} />
                </Panel>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Depreciation ═════════════════════ */}
      {activeTab === "depreciation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading.dep ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>⏳ Loading depreciation data…</div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
                {[
                  { label: "Total Purchase Value",  val: INR(depreciation.reduce((s,d) => s + d.purchaseValue, 0)), color: "#2563eb" },
                  { label: "Total Depreciation",    val: INR(depreciation.reduce((s,d) => s + d.accumulated, 0)),   color: "#f59e0b" },
                  { label: "Current (Book) Value",  val: INR(depreciation.reduce((s,d) => s + d.currentValue, 0)),  color: "#22c55e" },
                ].map((f) => (
                  <div key={f.label} style={{ background: "#fff", borderRadius: "10px", padding: "18px 20px", border: "1px solid #e2e8f0", borderLeft: `4px solid ${f.color}` }}>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: f.color, marginTop: "6px" }}>{f.val}</div>
                  </div>
                ))}
              </div>

              {/* Depreciation table list */}
              <Panel>
                <SectionHeader title="Depreciation Schedule"
                  subtitle="Assets with purchase value set · Straight-line method"
                  action={<button onClick={() => exportCSV(depreciation.map((d) => ({
                    asset: d.assetName, type: d.assetType, purchaseValue: d.purchaseValue,
                    usefulLife: d.usefulLifeYears, ageYears: d.ageYears,
                    accumulated: d.accumulated, currentValue: d.currentValue,
                  })), "depreciation.csv")}
                    style={{ padding: "5px 12px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                    ⬇ CSV
                  </button>} />
                {depreciation.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                    No assets with purchase value found.<br />
                    <span style={{ fontSize: "12px" }}>Set "purchaseValue" and "usefulLifeYears" in asset metadata to enable depreciation tracking.</span>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Asset","Type","Purchase Value","Useful Life","Age","Accumulated Dep.","Current Value","% Remaining","Actions"].map((h) => (
                            <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {depreciation.map((d) => {
                          const pctRemaining = d.purchaseValue > 0 ? Math.round((d.currentValue / d.purchaseValue) * 100) : 0;
                          return (
                            <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>{d.assetName}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{ padding: "2px 7px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                                  background: typeBgs[d.assetType] || "#f1f5f9", color: typeColors[d.assetType] || "#475569" }}>
                                  {d.assetType}
                                </span>
                              </td>
                              <td style={{ padding: "10px 12px", fontWeight: 600 }}>{INR(d.purchaseValue)}</td>
                              <td style={{ padding: "10px 12px", color: "#64748b" }}>{d.usefulLifeYears}y</td>
                              <td style={{ padding: "10px 12px", color: "#64748b" }}>{d.ageYears}y</td>
                              <td style={{ padding: "10px 12px", color: "#f59e0b", fontWeight: 700 }}>{INR(d.accumulated)}</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: pctRemaining < 30 ? "#ef4444" : "#22c55e" }}>{INR(d.currentValue)}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <div style={{ width: "50px", height: "6px", background: "#e2e8f0", borderRadius: "3px" }}>
                                    <div style={{ height: "100%", width: `${pctRemaining}%`, background: pctRemaining > 50 ? "#22c55e" : pctRemaining > 20 ? "#f59e0b" : "#ef4444", borderRadius: "3px" }} />
                                  </div>
                                  <span style={{ fontSize: "11px", fontWeight: 700, color: pctRemaining < 20 ? "#ef4444" : "#64748b" }}>{pctRemaining}%</span>
                                </div>
                              </td>
                              <td style={{ padding: "10px 12px" }}>
                                <button onClick={() => setDepAsset(depAsset?.id === d.id ? null : d)}
                                  style={{ padding: "4px 10px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a",
                                    borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                                  {depAsset?.id === d.id ? "Hide" : "Schedule"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Depreciation schedule for selected asset */}
              {depAsset && (
                <Panel style={{ borderLeft: "4px solid #f59e0b" }}>
                  <SectionHeader title={`Depreciation Schedule — ${depAsset.assetName}`}
                    subtitle={`${depAsset.usefulLifeYears}y useful life · Annual: ${INR(depAsset.annualRate)}`} />
                  <DepreciationTable asset={depAsset} />
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Alerts ════════════════════════════ */}
      {activeTab === "alerts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
            {["critical","high","medium","low"].map((s) => {
              const cnt = alerts.filter((a) => a.severity === s).length;
              return (
                <div key={s} style={{ background: severityBg[s], borderRadius: "10px", padding: "16px 18px",
                  border: `1px solid ${severityColor[s]}33` }}>
                  <div style={{ fontSize: "26px", fontWeight: 800, color: severityColor[s] }}>{cnt}</div>
                  <div style={{ fontSize: "12px", color: "#475569", textTransform: "capitalize", fontWeight: 600, marginTop: "4px" }}>{s} alerts</div>
                </div>
              );
            })}
          </div>

          {loading.alerts ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>⏳ Loading alerts…</div>
          ) : !alerts.length ? (
            <Panel style={{ textAlign: "center", padding: "60px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎉</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>No Active Alerts</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>All assets are healthy and within schedule.</div>
            </Panel>
          ) : (
            <Panel>
              <SectionHeader title={`${alerts.length} Active Alerts`} subtitle="Sorted by severity" />
              {alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
            </Panel>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: History ═══════════════════════════ */}
      {activeTab === "history" && (
        <Panel>
          <SectionHeader title="Asset History Lookup"
            subtitle="Select an asset below to view its full lifecycle timeline" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px", maxHeight: "70vh", overflowY: "auto" }}>
            {assetList.map((a) => (
              <div key={a.id} onClick={() => loadHistory({ id: a.id, name: a.assetName })}
                style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", cursor: "pointer", background: "#fff",
                  transition: "all 0.15s", display: "flex", alignItems: "center", gap: "12px" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}>
                <div style={{ width: "36px", height: "36px", borderRadius: "8px",
                  background: typeBgs[a.assetType] || "#f1f5f9", color: typeColors[a.assetType] || "#475569",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px", flexShrink: 0 }}>
                  {a.assetType?.charAt(0).toUpperCase() || "A"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName}</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>{a.building || a.departmentName || a.assetType}</div>
                </div>
                <span style={{ color: "#2563eb", fontSize: "18px" }}>›</span>
              </div>
            ))}
            {!assetList.length && (
              <div style={{ gridColumn: "1 / -1", padding: "30px", textAlign: "center", color: "#94a3b8" }}>No assets available</div>
            )}
          </div>
        </Panel>
      )}

      {/* ═══════════════════ TAB: Compare ═══════════════════════════ */}
      {activeTab === "compare" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Panel>
            <SectionHeader title="Asset Comparison Tool"
              subtitle="Select 2–4 assets to compare performance, cost, and health" />
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                Select Assets ({compareIds.length}/4 selected):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                {assetList.map((a) => {
                  const sel = compareIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => {
                      if (sel) setCompareIds((ids) => ids.filter((id) => id !== a.id));
                      else if (compareIds.length < 4) setCompareIds((ids) => [...ids, a.id]);
                    }}
                      style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${sel ? "#2563eb" : "#e2e8f0"}`,
                        background: sel ? "#eff6ff" : "#fff", color: sel ? "#2563eb" : "#64748b" }}>
                      {sel && "✓ "}{a.assetName}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={loadComparison} disabled={compareIds.length < 2 || compareLoading}
                style={{ padding: "8px 20px", background: compareIds.length >= 2 ? "#2563eb" : "#94a3b8",
                  color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px",
                  cursor: compareIds.length >= 2 ? "pointer" : "default" }}>
                {compareLoading ? "Loading…" : "Compare Assets"}
              </button>
              {compareIds.length > 0 && (
                <button onClick={() => { setCompareIds([]); setCompareData([]); }}
                  style={{ padding: "8px 16px", background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  Clear
                </button>
              )}
            </div>
          </Panel>

          {compareData.length >= 2 && (
            <Panel>
              <SectionHeader title="Comparison Results" />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Metric</th>
                      {compareData.map((a) => (
                        <th key={a.id} style={{ padding: "10px 14px", textAlign: "center", color: "#0f172a", fontWeight: 700, borderBottom: "1px solid #e2e8f0", minWidth: "130px" }}>{a.assetName}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Type", f: (a) => a.assetType },
                      { label: "Building", f: (a) => a.building || "—" },
                      { label: "Status", f: (a) => a.status },
                      { label: "Health Score", f: (a) => <HealthBadge score={a.healthScore} label={a.healthScore >= 90 ? "Excellent" : a.healthScore >= 70 ? "Good" : a.healthScore >= 50 ? "Attention" : "Critical"} /> },
                      { label: "Age (years)", f: (a) => a.ageYears },
                      { label: "Purchase Value", f: (a) => INR(a.purchaseValue) },
                      { label: "Current Value", f: (a) => <span style={{ fontWeight: 700, color: "#22c55e" }}>{INR(a.currentValue)}</span> },
                      { label: "Depreciation", f: (a) => <span style={{ color: "#f59e0b" }}>{INR(a.depreciation)}</span> },
                      { label: "Work Orders (Total)", f: (a) => a.workOrdersTotal },
                      { label: "Work Orders (Open)", f: (a) => <span style={{ color: a.workOrdersOpen > 0 ? "#ef4444" : "#22c55e", fontWeight: 700 }}>{a.workOrdersOpen}</span> },
                      { label: "Brand / Model", f: (a) => [a.brand, a.model].filter(Boolean).join(" / ") || "—" },
                      { label: "Warranty Expiry", f: (a) => a.warranty ? new Date(a.warranty).toLocaleDateString() : "—" },
                      { label: "Next Service", f: (a) => a.nextService ? new Date(a.nextService).toLocaleDateString() : "—" },
                    ].map((row) => (
                      <tr key={row.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "#475569", fontSize: "12.5px", background: "#f8fafc", whiteSpace: "nowrap" }}>{row.label}</td>
                        {compareData.map((a) => (
                          <td key={a.id} style={{ padding: "10px 14px", textAlign: "center", color: "#0f172a" }}>{row.f(a)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Predictive ═══════════════════════ */}
      {activeTab === "predictive" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Risk summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
            {[
              { label: "High Risk", risk: "high",   color: "#ef4444", bg: "#fef2f2", icon: "🔴" },
              { label: "Medium Risk", risk: "medium", color: "#f59e0b", bg: "#fffbeb", icon: "🟠" },
              { label: "Low Risk",  risk: "low",    color: "#22c55e", bg: "#f0fdf4", icon: "🟢" },
            ].map(({ label, risk, color, bg, icon }) => {
              const cnt = predictive.filter((p) => p.riskLevel === risk).length;
              return (
                <div key={risk} style={{ background: bg, borderRadius: "12px", padding: "20px", border: `1px solid ${color}33` }}>
                  <div style={{ fontSize: "28px", marginBottom: "4px" }}>{icon}</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color }}>{cnt}</div>
                  <div style={{ fontSize: "13px", color: "#475569", fontWeight: 600, marginTop: "4px" }}>{label}</div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>assets flagged</div>
                </div>
              );
            })}
          </div>

          {loading.pred ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>⏳ Running predictive analysis…</div>
          ) : !predictive.length ? (
            <Panel style={{ textAlign: "center", padding: "60px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>No Predictive Risk Detected</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>All assets look healthy based on current maintenance patterns.</div>
            </Panel>
          ) : (
            <>
              {["high", "medium", "low"].map((riskLevel) => {
                const group = predictive.filter((p) => p.riskLevel === riskLevel);
                if (!group.length) return null;
                const riskColor = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" }[riskLevel];
                const riskBg    = { high: "#fef2f2", medium: "#fffbeb", low: "#f0fdf4" }[riskLevel];
                return (
                  <Panel key={riskLevel} style={{ borderLeft: `4px solid ${riskColor}` }}>
                    <SectionHeader
                      title={`${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk Assets`}
                      subtitle={`${group.length} asset${group.length > 1 ? "s" : ""} identified`}
                      action={
                        <span style={{ padding: "3px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 700,
                          background: riskBg, color: riskColor, textTransform: "uppercase" }}>
                          {riskLevel}
                        </span>
                      }
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                      {group.map((p) => (
                        <div key={p.id} style={{ background: riskBg, borderRadius: "10px", padding: "16px", border: `1px solid ${riskColor}22` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "14px", color: "#0f172a" }}>{p.assetName}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>{p.assetType} · {p.building || "No location"}</div>
                            </div>
                            <span style={{ padding: "4px 12px", borderRadius: "12px", fontSize: "11px", fontWeight: 800,
                              background: riskColor, color: "#fff" }}>
                              {p.riskScore}/100
                            </span>
                          </div>

                          {/* Risk factors */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px" }}>
                            {(p.factors || []).map((f, fi) => (
                              <div key={fi} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569" }}>
                                <span style={{ color: riskColor }}>⚑</span>
                                {f}
                              </div>
                            ))}
                          </div>

                          {/* Stats row */}
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            {p.mtbfDays != null && (
                              <div style={{ background: "#fff", borderRadius: "6px", padding: "6px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: "16px", fontWeight: 800, color: riskColor }}>{p.mtbfDays}d</div>
                                <div style={{ fontSize: "10px", color: "#64748b" }}>MTBF</div>
                              </div>
                            )}
                            {p.recentWOs != null && (
                              <div style={{ background: "#fff", borderRadius: "6px", padding: "6px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{p.recentWOs}</div>
                                <div style={{ fontSize: "10px", color: "#64748b" }}>WOs (90d)</div>
                              </div>
                            )}
                            {p.ageYears != null && (
                              <div style={{ background: "#fff", borderRadius: "6px", padding: "6px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{p.ageYears}y</div>
                                <div style={{ fontSize: "10px", color: "#64748b" }}>Age</div>
                              </div>
                            )}
                            {p.estimatedDaysToFailure != null && (
                              <div style={{ background: "#fff", borderRadius: "6px", padding: "6px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: "16px", fontWeight: 800, color: riskColor }}>~{p.estimatedDaysToFailure}d</div>
                                <div style={{ fontSize: "10px", color: "#64748b" }}>Est. to next fail</div>
                              </div>
                            )}
                          </div>

                          {p.recommendation && (
                            <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fff", borderRadius: "6px",
                              borderLeft: `3px solid ${riskColor}`, fontSize: "12px", color: "#475569" }}>
                              💡 {p.recommendation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Panel>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
