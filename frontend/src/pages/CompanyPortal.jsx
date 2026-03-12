import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  login,
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  getDepartments,
  createDepartment,
  deleteDepartment,
  getLogs,
  createLog,
  deleteLog,
  getChecklistAssignees,
  assignChecklistToUsers,
  getAssetTypes,
  createAssetType,
  getUsers,
  getCompanyUsers,
  createCompanyUser,
  updateCompanyUser,
  deleteCompanyUser,
  getChecklistTemplates,
  createChecklistTemplate,
  getChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  getLogsheetTemplate,
  updateLogsheetTemplate,
  deleteLogsheetTemplate,
  getLogsheetTemplates,
  createLogsheetTemplate,
  assignLogsheetTemplate,
  getLogsheetEntriesByTemplate,
  submitLogsheetEntry,
  getRecentLogsheetEntries,
  getRecentChecklistSubmissions,
  getLogsheetEntryDetail,
  getChecklistSubmissionDetail,
  getCompanyOverview,
  getLogsheetIssuesReport,
} from "../api";
import ChecklistBuilder from "../components/ChecklistBuilder";
import LogsheetModule from "../components/LogsheetModule.jsx";
import ChecklistTemplateModule from "../components/ChecklistTemplateModule.jsx";
import SubmissionsPanel from "../components/SubmissionsPanel.jsx";
import WarningsPanel from "../components/WarningsPanel.jsx";
import AssetDashboard from "../components/AssetDashboard.jsx";
import { useAlertSound } from "../hooks/useAlertSound";
import QRCode from "qrcode";

const TOKEN_KEY = "company_portal_token";

const emptyCompany = {
  companyName: "",
  companyCode: "",
  description: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  gstNumber: "",
  panNumber: "",
  cinNumber: "",
  contractStartDate: "",
  contractEndDate: "",
  billingCycle: "Monthly",
  paymentTermsDays: "30",
  maxEmployees: "",
  qsrModule: true,
  premealModule: true,
  deliveryModule: true,
  allowGuestBooking: false, // mapped to OJT training toggle
  status: "Active",
};

const emptyUser = {
  fullName: "",
  email: "",
  phone: "",
  designation: "",
  role: "employee",
  status: "Active",
  password: "",
  username: "",
};

const emptyAsset = {
  id: null,
  companyId: "",
  departmentId: "",
  assetName: "",
  assetUniqueId: "",
  assetType: "soft",
  building: "",
  floor: "",
  room: "",
  status: "Active",
  qrCode: "",
  imageUrl: "",
  // Common attachments / description
  description: "",
  checklist: "",
  documentLinks: "",
  // Soft services
  serviceArea: "",
  frequency: "Daily",
  shift: "Morning",
  supervisor: "",
  staffRequired: "",
  specialInstructions: "",
  // Technical
  machineName: "",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  installationDate: "",
  warrantyExpiry: "",
  maintenanceFrequency: "",
  lastServiceDate: "",
  nextServiceDate: "",
  technician: "",
  // Fleet
  vehicleNumber: "",
  vehicleType: "",
  fuelType: "",
  driver: "",
  rcNumber: "",
  insuranceExpiry: "",
  pucExpiry: "",
  serviceDueDate: "",
  purchaseDate: "",
  vendor: "",
  dailyKmTracking: false,
};

const emptyDepartment = {
  name: "",
  description: "",
};

const assetTypeLabels = {
  soft: "Soft Services",
  technical: "Technical",
  fleet: "Fleet",
};

const CompanyPortal = () => {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored || stored === "undefined" || stored === "null") return "";
    return stored;
  });
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [companyError, setCompanyError] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [nav, setNav] = useState(() => localStorage.getItem("portal_nav") || "dashboard");
  const [checklistSubNav, setChecklistSubNav] = useState("templates");
  const [checklistSelectedCompanyId, setChecklistSelectedCompanyId] = useState(null);
  const [assetSubNav, setAssetSubNav] = useState("dashboard");
  const [logsheetSubNav, setLogsheetSubNav] = useState("templates");
  const [logsheetSelectedCompanyId, setLogsheetSelectedCompanyId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [assets, setAssets] = useState([]);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetQrModal, setAssetQrModal] = useState(null);
  const [assetQrDataUrl, setAssetQrDataUrl] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [assetTypes, setAssetTypes] = useState([]);
  const [assetTypeDraft, setAssetTypeDraft] = useState({ code: "", label: "", category: "" });
  const [departments, setDepartments] = useState([]);
  const [departmentForm, setDepartmentForm] = useState(emptyDepartment);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState(null);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [logs, setLogs] = useState([]);
  const [logForm, setLogForm] = useState({ assetId: "", note: "" });
  const [logError, setLogError] = useState(null);
  const [portalUsers, setPortalUsers] = useState([]);

  // Company table UI state
  const [tableSearch, setTableSearch] = useState("");
  const [tableEntries, setTableEntries] = useState(25);
  const [tablePage, setTablePage] = useState(0);
  const [sortField, setSortField] = useState("companyName");
  const [sortDir, setSortDir] = useState("asc");
  const [viewCompanyId, setViewCompanyId] = useState(null);
  const [editCompanyId, setEditCompanyId] = useState(null);
  const [editCompanyForm, setEditCompanyForm] = useState(emptyCompany);
  const [editCompanyLoading, setEditCompanyLoading] = useState(false);
  const [editCompanyError, setEditCompanyError] = useState(null);

  // Company Users (Admin) state
  const [adminCompanyId, setAdminCompanyId] = useState(null);
  const [companyOverview, setCompanyOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentEntriesLoading, setRecentEntriesLoading] = useState(false);
  const [recentChecklists, setRecentChecklists] = useState([]);
  const [recentChecklistsLoading, setRecentChecklistsLoading] = useState(false);
  const [dashboardTab, setDashboardTab] = useState("logsheets");
  const [logsheetShowAll, setLogsheetShowAll] = useState(false);
  const [checklistShowAll, setChecklistShowAll] = useState(false);
  const [detailModal, setDetailModal] = useState({ open: false, type: null, data: null, loading: false, error: null });

  const getQrBaseUrl = () => {
    try {
      const u = new URL(import.meta.env.VITE_API_URL || "");
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        return `${u.protocol}//${u.hostname}:5173`;
      }
    } catch {}
    return window.location.origin;
  };

  const handleShowAssetQR = async (assetId, assetName) => {
    try {
      const url = `${getQrBaseUrl()}/asset-scan/${assetId}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setAssetQrDataUrl(dataUrl);
      setAssetQrModal({ assetId, assetName, url });
    } catch (err) {
      alert("QR generation failed: " + err.message);
    }
  };

  const openDetail = async (type, id) => {
    setDetailModal({ open: true, type, data: null, loading: true, error: null });
    try {
      const data = type === "logsheet"
        ? await getLogsheetEntryDetail(token, id)
        : await getChecklistSubmissionDetail(token, id);
      setDetailModal({ open: true, type, data, loading: false, error: null });
    } catch (err) {
      setDetailModal({ open: true, type, data: null, loading: false, error: err.message || "Failed to load details" });
    }
  };
  const [issuesReport, setIssuesReport] = useState({ issues: [], summary: null });
  const [issuesReportLoading, setIssuesReportLoading] = useState(false);
  // Warnings nav badge
  const [warnOpenCount, setWarnOpenCount] = useState(0);
  // Notification bell + toasts
  const [bellOpen,     setBellOpen]    = useState(false);
  const [bellRinging,  setBellRinging] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState([]); // [{id,severity,assetName,description,createdAt}]
  const [toasts,       setToasts]      = useState([]);   // [{id,text,severity}]
  const prevWarnCount = useRef(0);
  const toastId = useRef(0);

  // Modular alert sound hook — single shared AudioContext, throttled, localStorage preference
  const {
    play: playAlertSound,
    preview: previewAlertSound,
    enabled: soundEnabled,
    toggle: toggleSound,
    volume: alarmVolume,
    updateVolume: updateAlarmVolume,
    severityConfig: alarmSevConfig,
    updateSeverityConfig: updateAlarmSevConfig,
  } = useAlertSound();

  const [alarmSettingsOpen, setAlarmSettingsOpen] = useState(false);

  /** Trigger bell ring animation (auto-clears after 650 ms). */
  const ringBell = useCallback(() => {
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 650);
  }, []);

  const pushToast = useCallback((text, severity = "high") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, severity }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // Persist active tab so page refresh returns to the same section
  useEffect(() => { localStorage.setItem("portal_nav", nav); }, [nav]);

  const [companyUsers, setCompanyUsers] = useState([]);
  const [companyUsersLoading, setCompanyUsersLoading] = useState(false);
  const [companyUsersError, setCompanyUsersError] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [userForm, setUserForm] = useState(emptyUser);
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [userFormError, setUserFormError] = useState(null);
  const [userTableSearch, setUserTableSearch] = useState("");
  const [userTablePage, setUserTablePage] = useState(0);
  const [userTableEntries, setUserTableEntries] = useState(10);
  const [userSortField, setUserSortField] = useState("fullName");
  const [userSortDir, setUserSortDir] = useState("asc");
  // Asset table UI state
  const [assetTablePage, setAssetTablePage] = useState(0);
  const [assetTableEntries, setAssetTableEntries] = useState(25);
  const [assetSortField, setAssetSortField] = useState("assetName");
  const [assetSortDir, setAssetSortDir] = useState("asc");

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) || companies[0],
    [companies, selectedCompanyId]
  );

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const status = (c.status || "Active").toLowerCase();
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && status === "active") ||
        (statusFilter === "inactive" && status === "inactive") ||
        (statusFilter === "pending" && status === "pending");
      const term = searchTerm.trim().toLowerCase();
      const matchesTerm = term
        ? c.companyName?.toLowerCase().includes(term) ||
          c.city?.toLowerCase().includes(term) ||
          c.description?.toLowerCase().includes(term)
        : true;
      return matchesStatus && matchesTerm;
    });
  }, [companies, statusFilter, searchTerm]);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const matchesType = assetTypeFilter === "all" || a.assetType === assetTypeFilter;
      const term = assetSearch.trim().toLowerCase();
      const matchesTerm = term
        ? a.assetName?.toLowerCase().includes(term) ||
          a.assetUniqueId?.toLowerCase().includes(term) ||
          a.building?.toLowerCase().includes(term) ||
          a.room?.toLowerCase().includes(term) ||
          a.companyName?.toLowerCase().includes(term)
        : true;
      return matchesType && matchesTerm;
    });
  }, [assets, assetTypeFilter, assetSearch]);

  const assetTypeLabelMap = useMemo(() => {
    const map = {};
    assetTypes.forEach((t) => { map[t.code] = t.label; });
    return map;
  }, [assetTypes]);

  const filteredDepartments = useMemo(() => {
    const term = departmentSearch.trim().toLowerCase();
    const activeCompanyId = selectedCompanyId || companies[0]?.id;
    return departments.filter((d) => {
      const matchesCompany = activeCompanyId ? String(d.companyId) === String(activeCompanyId) : true;
      const matchesTerm = term
        ? d.name.toLowerCase().includes(term) || (d.description || "").toLowerCase().includes(term)
        : true;
      return matchesCompany && matchesTerm;
    });
  }, [companies, departmentSearch, departments, selectedCompanyId]);

  const companyDepartmentOptions = useMemo(() => {
    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;
    return departments.filter((d) => String(d.companyId) === String(companyId));
  }, [assetForm.companyId, companies, departments, selectedCompanyId]);

  const assetOptions = useMemo(() => {
    const companyId = selectedCompanyId || companies[0]?.id;
    return assets.filter((a) => String(a.companyId) === String(companyId));
  }, [assets, companies, selectedCompanyId]);

  // --- Company table computed values ---
  const companyStats = useMemo(() => ({
    total: companies.length,
    active: companies.filter((c) => (c.status || "Active").toLowerCase() === "active").length,
    inactive: companies.filter((c) => (c.status || "Active").toLowerCase() !== "active").length,
    totalEmployees: companies.reduce((sum, c) => sum + (Number(c.employeeCount) || 0), 0),
  }), [companies]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setTablePage(0);
  };

  const sortedFilteredCompanies = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    const filtered = companies.filter((c) => {
      if (!term) return true;
      return (
        c.companyName?.toLowerCase().includes(term) ||
        c.companyCode?.toLowerCase().includes(term) ||
        c.city?.toLowerCase().includes(term) ||
        c.description?.toLowerCase().includes(term)
      );
    });
    return [...filtered].sort((a, b) => {
      let av = a[sortField] || "";
      let bv = b[sortField] || "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [companies, tableSearch, sortField, sortDir]);

  const tablePages = useMemo(() => {
    const total = sortedFilteredCompanies.length;
    const totalPages = Math.max(1, Math.ceil(total / tableEntries));
    const startIndex = tablePage * tableEntries;
    return { total, totalPages, startIndex };
  }, [sortedFilteredCompanies, tableEntries, tablePage]);

  const pagedCompanies = useMemo(
    () => sortedFilteredCompanies.slice(tablePages.startIndex, tablePages.startIndex + tableEntries),
    [sortedFilteredCompanies, tablePages.startIndex, tableEntries]
  );

  const loadCompanies = async (authToken) => {
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const list = await getCompanies(authToken);
      const normalized = list.map((c) => ({ ...emptyCompany, ...c }));
      setCompanies(normalized);
      setSelectedCompanyId((prev) => prev || normalized[0]?.id || null);
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
        setAuthError("Session expired. Please log in again.");
        return;
      }
      setCompanyError(err.message);
    } finally {
      setCompanyLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadCompanies(token).catch(() => {});
    }
  }, [token]);

  const loadAssets = async (authToken, companyId) => {
    setAssetLoading(true);
    setAssetError(null);
    try {
      const params = companyId ? `companyId=${companyId}` : "";
      const list = await getAssets(authToken, params);
      setAssets(list.map((a) => ({
        ...a,
        metadata: a.metadata || {},
      })));
    } catch (err) {
      setAssetError(err.message || "Could not load assets");
    } finally {
      setAssetLoading(false);
    }
  };

  const loadDepartments = async (authToken, companyId) => {
    if (!companyId) return;
    setDepartmentLoading(true);
    setDepartmentError(null);
    try {
      const params = companyId ? `companyId=${companyId}` : "";
      const list = await getDepartments(authToken, params);
      setDepartments(list);
      setDepartmentForm((prev) => ({ ...prev, companyId }));
    } catch (err) {
      setDepartmentError(err.message || "Could not load departments");
    } finally {
      setDepartmentLoading(false);
    }
  };

  const loadAssetTypes = async (authToken) => {
    if (!authToken) return;
    try {
      const list = await getAssetTypes(authToken);
      setAssetTypes(list);
      const defaultType = list[0]?.code || "";
      setAssetForm((prev) => ({ ...prev, assetType: prev.assetType || defaultType }));
    } catch (err) {
      // keep silent but avoid crash
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  useEffect(() => {
    if (token && nav === "assets") {
      // Load assets for ALL companies (no companyId filter)
      loadAssets(token, null).catch(() => {});
      const defaultCompanyId = selectedCompanyId || companies[0]?.id;
      if (defaultCompanyId) setAssetForm((prev) => ({ ...prev, companyId: defaultCompanyId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav, selectedCompanyId]);

  useEffect(() => {
    if (token) {
      loadAssetTypes(token).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token && (nav === "checklists" || nav === "logs")) {
      const companyId = selectedCompanyId || companies[0]?.id;
      if (companyId) {
        loadAssets(token, companyId).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav, selectedCompanyId]);

  useEffect(() => {
    if (nav === "checklists" && portalUsers.length === 0) {
      loadUsers().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  useEffect(() => {
    if (nav === "logs" && logForm.assetId) {
      loadLogs(logForm.assetId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, logForm.assetId]);

  useEffect(() => {
    if (token && (nav === "assets" || nav === "departments" || nav === "companies")) {
      const companyId = selectedCompanyId || companies[0]?.id;
      if (nav === "companies" || nav === "departments") {
        // Load ALL departments so filteredDepartments memo can filter client-side
        setDepartmentLoading(true);
        getDepartments(token, "").then((list) => {
          setDepartments(list);
          if (companyId) {
            setDepartmentForm((prev) => ({ ...prev, companyId }));
          }
        }).catch(() => {}).finally(() => setDepartmentLoading(false));
      } else if (companyId) {
        loadDepartments(token, companyId).catch(() => {});
        setDepartmentForm((prev) => ({ ...prev, companyId }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav, selectedCompanyId, companies]);

  // ── Poll for new flags every 30 s — show toast when count increases ─────────
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      const cid = selectedCompanyId || companies[0]?.id;
      if (!cid) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/flags/admin/list?companyId=${cid}&status=open&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const newCount = data?.total ?? 0;
        const prev    = prevWarnCount.current;
        prevWarnCount.current = newCount;
        setWarnOpenCount(newCount);
        if (data?.data?.length) setRecentAlerts(data.data.slice(0, 5));
        if (newCount > prev) {
          const diff = newCount - prev;
          const newest = data?.data?.[0];
          const sev = newest?.severity || "high";
          const msg = newest
            ? `${diff} new warning${diff > 1 ? "s" : ""}: ${newest.severity?.toUpperCase()} – ${newest.assetName || "unknown asset"}`
            : `${diff} new warning${diff > 1 ? "s" : ""} raised`;
          pushToast(msg, sev);
          playAlertSound(sev);
          ringBell();
        }
      } catch (_) { /* silent */ }
    };
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [token, selectedCompanyId, companies, pushToast, playAlertSound, ringBell]);

  // ── Initial data load on login ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setRecentEntriesLoading(true);
    getRecentLogsheetEntries(token)
      .then((data) => setRecentEntries(data))
      .catch(() => {})
      .finally(() => setRecentEntriesLoading(false));
    setRecentChecklistsLoading(true);
    getRecentChecklistSubmissions(token)
      .then((data) => setRecentChecklists(data))
      .catch(() => {})
      .finally(() => setRecentChecklistsLoading(false));
    setIssuesReportLoading(true);
    getLogsheetIssuesReport(token, "limit=100")
      .then((data) => setIssuesReport(data))
      .catch(() => {})
      .finally(() => setIssuesReportLoading(false));
    // Pre-load open flag count for nav badge — use admin endpoint
    const cid = selectedCompanyId || companies[0]?.id;
    if (cid) {
      fetch(`${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/flags/admin/list?companyId=${cid}&status=open&limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((r) => r.json())
        .then((res) => {
          const count = res?.total ?? 0;
          prevWarnCount.current = count;
          setWarnOpenCount(count);
        })
        .catch(() => {});
    }
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const res = await login(loginForm);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err) {
      setAuthError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;
    const companyDepartments = departments.filter((d) => String(d.companyId) === String(companyId));
    const hasSelected = companyDepartments.some((d) => String(d.id) === String(assetForm.departmentId));
    if (companyId && companyDepartments.length > 0 && !hasSelected) {
      setAssetForm((prev) => ({ ...prev, companyId, departmentId: String(companyDepartments[0].id) }));
    }
  }, [assetForm.companyId, assetForm.departmentId, companies, departments, selectedCompanyId]);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setCompanies([]);
    setSelectedCompanyId(null);
  };

  const handleCompanyChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCompanyForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleAssetChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "companyId") {
      const companyDepartments = departments.filter((d) => String(d.companyId) === String(value));
      const nextDepartmentId = companyDepartments[0] ? String(companyDepartments[0].id) : "";
      setAssetForm((prev) => ({
        ...prev,
        companyId: value,
        departmentId: nextDepartmentId,
      }));
      return;
    }
    setAssetForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleLogChange = (e) => {
    const { name, value } = e.target;
    setLogForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleDepartmentChange = (e) => {
    const { name, value } = e.target;
    setDepartmentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    if (!token) return;
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const created = await createCompany(token, companyForm);
      const merged = { ...emptyCompany, ...companyForm, ...created };
      setCompanies((prev) => [merged, ...prev]);
      setSelectedCompanyId(created.id);
      setCompanyForm(emptyCompany);
      setShowAddForm(false);
      setNav("companies");
    } catch (err) {
      setCompanyError(err.message || "Could not create company");
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!token) return;
    const companyId = departmentForm.companyId || selectedCompanyId || companies[0]?.id;
    if (!companyId) {
      setDepartmentError("Please create a company first");
      return;
    }
    setDepartmentLoading(true);
    setDepartmentError(null);
    try {
      const created = await createDepartment(token, {
        companyId: Number(companyId),
        name: departmentForm.name,
        description: departmentForm.description,
      });
      setDepartments((prev) => [created, ...prev]);
      setDepartmentForm({ ...emptyDepartment, companyId });
    } catch (err) {
      setDepartmentError(err.message || "Could not create department");
    } finally {
      setDepartmentLoading(false);
    }
  };

  const handleCreateAssetType = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (!assetTypeDraft.code.trim() || !assetTypeDraft.label.trim()) {
      setAssetError("Type code and label are required");
      return;
    }
    setAssetError(null);
    setAssetLoading(true);
    try {
      const payload = {
        code: assetTypeDraft.code.trim().toLowerCase(),
        label: assetTypeDraft.label.trim(),
        category: assetTypeDraft.category.trim() || undefined,
      };
      const created = await createAssetType(token, payload);
      setAssetTypes((prev) => [...prev, created].sort((a, b) => a.label.localeCompare(b.label)));
      setAssetTypeDraft({ code: "", label: "", category: "" });
    } catch (err) {
      setAssetError(err.message || "Could not create asset type");
    } finally {
      setAssetLoading(false);
    }
  };

  const buildMetadataFromForm = (form) => {
    if (form.assetType === "soft") {
      return {
        serviceArea: form.serviceArea,
        frequency: form.frequency,
        shift: form.shift,
        supervisor: form.supervisor,
        staffRequired: form.staffRequired,
        specialInstructions: form.specialInstructions,
        checklist: form.checklist,
        description: form.description,
        imageUrl: form.imageUrl,
      };
    }
    if (form.assetType === "technical") {
      return {
        machineName: form.machineName,
        brand: form.brand,
        modelNumber: form.modelNumber,
        serialNumber: form.serialNumber,
        installationDate: form.installationDate,
        warrantyExpiry: form.warrantyExpiry,
        maintenanceFrequency: form.maintenanceFrequency,
        lastServiceDate: form.lastServiceDate,
        nextServiceDate: form.nextServiceDate,
        technician: form.technician,
        checklist: form.checklist,
        description: form.description,
        imageUrl: form.imageUrl,
        documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],
      };
    }
    if (form.assetType === "fleet") {
      return {
        vehicleNumber: form.vehicleNumber,
        vehicleType: form.vehicleType,
        fuelType: form.fuelType,
        driver: form.driver,
        rcNumber: form.rcNumber,
        insuranceExpiry: form.insuranceExpiry,
        pucExpiry: form.pucExpiry,
        serviceDueDate: form.serviceDueDate,
        purchaseDate: form.purchaseDate,
        vendor: form.vendor,
        dailyKmTracking: !!form.dailyKmTracking,
        checklist: form.checklist,
        description: form.description,
        imageUrl: form.imageUrl,
        documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],
      };
    }
    return {
      description: form.description,
      imageUrl: form.imageUrl,
      documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],
    };
  };

  const normalizeAssetFormFromRecord = (asset) => {
    const meta = asset.metadata || {};
    if (asset.assetType === "soft") {
      return {
        ...emptyAsset,
        ...asset,
        departmentId: asset.departmentId ? String(asset.departmentId) : "",
        serviceArea: meta.serviceArea || "",
        frequency: meta.frequency || "Daily",
        shift: meta.shift || "Morning",
        supervisor: meta.supervisor || "",
        staffRequired: meta.staffRequired || "",
        specialInstructions: meta.specialInstructions || "",
        checklist: meta.checklist || "",
        description: meta.description || "",
        imageUrl: meta.imageUrl || "",
      };
    }
    if (asset.assetType === "technical") {
      return {
        ...emptyAsset,
        ...asset,
        departmentId: asset.departmentId ? String(asset.departmentId) : "",
        machineName: meta.machineName || "",
        brand: meta.brand || "",
        modelNumber: meta.modelNumber || "",
        serialNumber: meta.serialNumber || "",
        installationDate: meta.installationDate || "",
        warrantyExpiry: meta.warrantyExpiry || "",
        maintenanceFrequency: meta.maintenanceFrequency || "",
        lastServiceDate: meta.lastServiceDate || "",
        nextServiceDate: meta.nextServiceDate || "",
        technician: meta.technician || "",
        checklist: meta.checklist || "",
        description: meta.description || "",
        imageUrl: meta.imageUrl || "",
        documentLinks: (meta.documents || []).join("\n"),
      };
    }
    if (asset.assetType === "fleet") {
      return {
        ...emptyAsset,
        ...asset,
        departmentId: asset.departmentId ? String(asset.departmentId) : "",
        vehicleNumber: meta.vehicleNumber || "",
        vehicleType: meta.vehicleType || "",
        fuelType: meta.fuelType || "",
        driver: meta.driver || "",
        rcNumber: meta.rcNumber || "",
        insuranceExpiry: meta.insuranceExpiry || "",
        pucExpiry: meta.pucExpiry || "",
        serviceDueDate: meta.serviceDueDate || "",
        purchaseDate: meta.purchaseDate || "",
        vendor: meta.vendor || "",
        dailyKmTracking: !!meta.dailyKmTracking,
        checklist: meta.checklist || "",
        description: meta.description || "",
        imageUrl: meta.imageUrl || "",
        documentLinks: (meta.documents || []).join("\n"),
      };
    }
    return {
      ...emptyAsset,
      ...asset,
      departmentId: asset.departmentId ? String(asset.departmentId) : "",
      description: meta.description || "",
      imageUrl: meta.imageUrl || "",
      documentLinks: (meta.documents || []).join("\n"),
    };
  };

  const handleSubmitAsset = async (e) => {
    e.preventDefault();
    if (!token) return;
    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;
    if (!companyId) {
      setAssetError("Please create a company first");
      return;
    }
    const companyDepartments = departments.filter((d) => String(d.companyId) === String(companyId));
    if (!companyDepartments.length) {
      setAssetError("Please add a department for this company first");
      return;
    }
    if (!assetForm.departmentId) {
      setAssetError("Please select a department for this asset");
      return;
    }
    setAssetLoading(true);
    setAssetError(null);
    try {
      const metadata = buildMetadataFromForm(assetForm);
      const payload = {
        companyId,
        departmentId: Number(assetForm.departmentId),
        assetName: assetForm.assetName,
        assetUniqueId: assetForm.assetUniqueId,
        assetType: assetForm.assetType,
        building: assetForm.building,
        floor: assetForm.floor,
        room: assetForm.room,
        status: assetForm.status,
        qrCode: assetForm.qrCode,
        metadata,
      };

      if (editingAssetId) {
        await updateAsset(token, editingAssetId, payload);
        await loadAssets(token, companyId);
      } else {
        await createAsset(token, payload);
        await loadAssets(token, companyId);
      }

      setAssetForm({ ...emptyAsset, companyId, departmentId: assetForm.departmentId });
      setEditingAssetId(null);
      setShowAssetModal(false);
    } catch (err) {
      setAssetError(err.message || "Could not save asset");
    } finally {
      setAssetLoading(false);
    }
  };

  const handleEditAsset = (asset) => {
    setEditingAssetId(asset.id);
    setAssetForm(normalizeAssetFormFromRecord(asset));
    setShowAssetModal(true);
  };

  const handleDeleteAsset = async (id) => {
    if (!token) return;
    if (!window.confirm("Delete this asset?")) return;
    try {
      await deleteAsset(token, id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setAssetError(err.message || "Delete failed");
    }
  };

  const loadLogs = async (assetId) => {
    if (!token || !assetId) return;
    try {
      const list = await getLogs(token, `assetId=${assetId}`);
      setLogs(list);
    } catch (err) {
      setLogError(err.message || "Could not load logs");
    }
  };

  const loadUsers = async () => {
    try {
      const list = await getUsers();
      setPortalUsers(list);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const handleCreateLog = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (!logForm.assetId) {
      setLogError("Select an asset first");
      return;
    }
    if (!logForm.note.trim()) {
      setLogError("Note is required");
      return;
    }
    setLogError(null);
    try {
      await createLog(token, { assetId: Number(logForm.assetId), note: logForm.note });
      await loadLogs(logForm.assetId);
      setLogForm({ ...logForm, note: "" });
    } catch (err) {
      setLogError(err.message || "Could not create log" );
    }
  };

  const handleDeleteLog = async (id) => {
    if (!token) return;
    if (!window.confirm("Delete this log entry?")) return;
    try {
      await deleteLog(token, id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setLogError(err.message || "Delete failed");
    }
  };

  const handleDeleteDepartment = async (id) => {
    if (!token) return;
    if (!window.confirm("Delete this department?")) return;
    try {
      await deleteDepartment(token, id);
      setDepartments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setDepartmentError(err.message || "Delete failed");
    }
  };

  const handleDeleteCompany = async (id) => {
    if (!token) return;
    if (!window.confirm("Delete this company?")) return;
    try {
      await deleteCompany(token, id);
      setCompanies((prev) => prev.filter((c) => c.id !== id));
      setSelectedCompanyId((prev) => (prev === id ? null : prev));
    } catch (err) {
      setCompanyError(err.message || "Delete failed");
    }
  };

  const openEditCompany = (c) => {
    setEditCompanyId(c.id);
    setEditCompanyForm({ ...emptyCompany, ...c });
    setEditCompanyError(null);
  };

  const handleEditCompanyChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditCompanyForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    if (!token || !editCompanyId) return;
    setEditCompanyLoading(true);
    setEditCompanyError(null);
    try {
      const updated = await updateCompany(token, editCompanyId, editCompanyForm);
      setCompanies((prev) =>
        prev.map((c) => (c.id === editCompanyId ? { ...emptyCompany, ...c, ...updated } : c))
      );
      setEditCompanyId(null);
    } catch (err) {
      setEditCompanyError(err.message || "Could not update company");
    } finally {
      setEditCompanyLoading(false);
    }
  };

  // ── Company Users (Admin) ─────────────────────────────────────────────────
  const loadCompanyUsers = async (companyId) => {
    if (!token || !companyId) return;
    setCompanyUsersLoading(true);
    setCompanyUsersError(null);
    try {
      const list = await getCompanyUsers(token, companyId);
      setCompanyUsers(list);
    } catch (err) {
      setCompanyUsersError(err.message || "Could not load users");
    } finally {
      setCompanyUsersLoading(false);
    }
  };

  const openAdminView = (companyId) => {
    setAdminCompanyId(companyId);
    setUserTableSearch("");
    setUserTablePage(0);
    setCompanyOverview(null);
    loadCompanyUsers(companyId);
    setOverviewLoading(true);
    getCompanyOverview(token, companyId)
      .then((d) => setCompanyOverview(d))
      .catch(() => {})
      .finally(() => setOverviewLoading(false));
  };

  const handleUserFormChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenAddUser = () => {
    setEditUserId(null);
    setUserForm(emptyUser);
    setUserFormError(null);
    setShowAddUserModal(true);
  };

  const handleOpenEditUser = (u) => {
    setEditUserId(u.id);
    setUserForm({ fullName: u.fullName, email: u.email, phone: u.phone || "", designation: u.designation || "", role: u.role || "employee", status: u.status, password: "", username: u.username || "" });
    setUserFormError(null);
    setShowAddUserModal(true);
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    if (!token || !adminCompanyId) return;
    setUserFormLoading(true);
    setUserFormError(null);
    try {
      const payload = { ...userForm, companyId: adminCompanyId };
      if (editUserId) {
        const updated = await updateCompanyUser(token, editUserId, payload);
        setCompanyUsers((prev) => prev.map((u) => (u.id === editUserId ? { ...u, ...updated } : u)));
      } else {
        if (!userForm.password) { setUserFormError("Password is required for new users"); setUserFormLoading(false); return; }
        const created = await createCompanyUser(token, payload);
        setCompanyUsers((prev) => [created, ...prev]);
        // refresh companies list so employee count updates in the table
        loadCompanies(token).catch(() => {});
      }
      setShowAddUserModal(false);
    } catch (err) {
      setUserFormError(err.message || "Could not save user");
    } finally {
      setUserFormLoading(false);
    }
  };

  const handleDeleteCompanyUser = async (id) => {
    if (!token) return;
    if (!window.confirm("Delete this user?")) return;
    try {
      await deleteCompanyUser(token, id);
      setCompanyUsers((prev) => prev.filter((u) => u.id !== id));
      // refresh companies list so employee count updates
      loadCompanies(token).catch(() => {});
    } catch (err) {
      setCompanyUsersError(err.message || "Delete failed");
    }
  };

  if (!token) {
    return (
      <div className="page" style={{ maxWidth: "480px" }}>
        <div className="page-header">
          <h1>Client Portal Login</h1>
          <p>Sign in with the user credentials created in the client portal.</p>
        </div>

        {authError && (
          <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
            ⚠️ {authError}
          </div>
        )}

        <form onSubmit={handleLogin} className="card" style={{ padding: "20px" }}>
          <div className="form-group">
            <label>Email</label>
            <input
              name="email"
              type="email"
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              name="password"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              required
              className="form-input"
            />
          </div>
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="client-portal-shell">
      {/* ── Submission Detail Modal ───────────────────────────────────────── */}
      {detailModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetailModal({ open: false, type: null, data: null, loading: false, error: null }); }}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "860px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,0.25)" }}>
            {/* Modal header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>
                  {detailModal.loading ? "Loading…" : (detailModal.data?.templateName || (detailModal.type === "logsheet" ? "Logsheet Entry" : "Checklist Submission"))}
                </div>
                {detailModal.data && (
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>
                    {detailModal.data.assetName && <span>Asset: <strong>{detailModal.data.assetName}</strong></span>}
                    {detailModal.data.companyName && <span style={{ marginLeft: "12px" }}>Company: {detailModal.data.companyName}</span>}
                  </div>
                )}
              </div>
              <button onClick={() => setDetailModal({ open: false, type: null, data: null, loading: false, error: null })}
                style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer", fontSize: "18px", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
              {detailModal.loading && <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8", fontSize: "14px" }}>Loading submission details…</div>}
              {detailModal.error && <div style={{ color: "#dc2626", padding: "20px", fontWeight: 600 }}>⚠ {detailModal.error}</div>}
              {detailModal.data && detailModal.type === "logsheet" && (() => {
                const d = detailModal.data;
                const MONAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const isTabular = d.layoutType === "tabular" || (d.data && typeof d.data === "object");
                return (
                  <div>
                    {/* Summary row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                      {[
                        { label: "Period", value: `${MONAMES[(d.month || 1) - 1]} ${d.year}${d.shift ? ` · Shift ${d.shift}` : ""}` },
                        { label: "Frequency", value: d.frequency || "—" },
                        { label: "Submitted By", value: d.submittedBy || "—" },
                        { label: "Submitted At", value: d.submittedAt ? new Date(d.submittedAt).toLocaleString() : "—" },
                        { label: "Status", value: d.status || "submitted" },
                      ].map((f) => (
                        <div key={f.label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{f.label}</div>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Tabular data */}
                    {isTabular && d.data?.readings && (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>Tabular Readings</div>
                        <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", fontSize: "13px", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0" }}>
                          {JSON.stringify(d.data, null, 2)}
                        </div>
                      </div>
                    )}
                    {/* Standard Q&A answers */}
                    {!isTabular && d.answers && d.answers.length > 0 && (() => {
                      const grouped = d.answers.reduce((acc, a) => {
                        const sec = a.sectionName || "General";
                        if (!acc[sec]) acc[sec] = [];
                        const dayParts = acc[sec];
                        const existing = dayParts.find((x) => x.questionId === a.questionId);
                        if (existing) {
                          existing.days = existing.days || {};
                          existing.days[a.dateColumn] = { value: a.answerValue, isIssue: a.isIssue };
                        } else {
                          dayParts.push({ questionId: a.questionId, questionText: a.questionText, answerType: a.answerType, spec: a.specification, days: { [a.dateColumn]: { value: a.answerValue, isIssue: a.isIssue } } });
                        }
                        return acc;
                      }, {});
                      return (
                        <div>
                          {Object.entries(grouped).map(([section, qs]) => (
                            <div key={section} style={{ marginBottom: "20px" }}>
                              <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e40af", background: "#dbeafe", padding: "6px 12px", borderRadius: "6px", marginBottom: "8px" }}>{section}</div>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                  <thead>
                                    <tr style={{ background: "#f8fafc" }}>
                                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "200px" }}>Question</th>
                                      {[...new Set(d.answers.map((a) => a.dateColumn))].sort((a, b) => a - b).map((day) => (
                                        <th key={day} style={{ padding: "8px 6px", textAlign: "center", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "32px" }}>{day}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {qs.map((q, qi) => (
                                      <tr key={q.questionId || qi} style={{ borderBottom: "1px solid #f1f5f9", background: qi % 2 === 0 ? "#fff" : "#fafafa" }}>
                                        <td style={{ padding: "7px 12px", fontWeight: 500, color: "#334155" }}>{q.questionText}{q.spec && <span style={{ color: "#94a3b8", fontSize: "11px", display: "block" }}>{q.spec}</span>}</td>
                                        {[...new Set(d.answers.map((a) => a.dateColumn))].sort((a, b) => a - b).map((day) => {
                                          const cell = q.days?.[day];
                                          return (
                                            <td key={day} style={{ padding: "7px 4px", textAlign: "center", background: cell?.isIssue ? "#fef2f2" : "transparent", color: cell?.isIssue ? "#dc2626" : "#0f172a" }}>
                                              {cell?.value ?? ""}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {!isTabular && (!d.answers || d.answers.length === 0) && (
                      <div style={{ color: "#94a3b8", textAlign: "center", padding: "32px", fontSize: "13px" }}>No answers recorded for this entry.</div>
                    )}
                  </div>
                );
              })()}
              {detailModal.data && detailModal.type === "checklist" && (() => {
                const d = detailModal.data;
                const statusColors = { completed: ["#f0fdf4","#16a34a"], partial: ["#fffbeb","#ca8a04"], pending: ["#f1f5f9","#64748b"], submitted: ["#eff6ff","#2563eb"] };
                const [sbg, stx] = statusColors[d.status] || ["#f1f5f9","#64748b"];
                return (
                  <div>
                    {/* Summary */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                      {[
                        { label: "Status", value: <span style={{ padding: "3px 10px", borderRadius: "20px", background: sbg, color: stx, fontWeight: 700, fontSize: "13px", textTransform: "capitalize" }}>{d.status}</span> },
                        { label: "Completion", value: `${d.completionPct || 0}%` },
                        { label: "Submitted By", value: d.submittedBy || "—" },
                        { label: "Submitted At", value: d.submittedAt ? new Date(d.submittedAt).toLocaleString() : "—" },
                        { label: "Frequency", value: d.frequency || "—" },
                      ].map((f) => (
                        <div key={f.label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{f.label}</div>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Q&A table */}
                    {d.answers && d.answers.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>#</th>
                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "240px" }}>Question</th>
                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Type</th>
                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Answer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.answers.map((a, idx) => {
                            const val = a.answerJson?.value ?? a.optionSelected ?? "—";
                            const isIssue = a.answerJson?.flagIssue || (typeof val === "string" && val.toLowerCase() === "no");
                            return (
                              <tr key={a.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: isIssue ? "#fef2f2" : (idx % 2 === 0 ? "#fff" : "#fafafa") }}>
                                <td style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: "10px 14px", color: "#334155", fontWeight: 500 }}>{a.questionText}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{a.inputType || a.answerType || "—"}</td>
                                <td style={{ padding: "10px 14px", fontWeight: 600, color: isIssue ? "#dc2626" : "#0f172a" }}>
                                  {isIssue && <span style={{ marginRight: "4px" }}>⚠</span>}
                                  {String(val !== null && val !== undefined ? val : "—")}
                                  {a.answerJson?.remark && <span style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 400 }}>{a.answerJson.remark}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {(!d.answers || d.answers.length === 0) && (
                      <div style={{ color: "#94a3b8", textAlign: "center", padding: "32px", fontSize: "13px" }}>No answers recorded for this submission.</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      <aside className="client-side-panel">
        <div className="client-side-header">
          <div className="client-avatar">CP</div>
          <div style={{ flex: 1 }}>
            <div className="client-side-title">Client Portal</div>
            <div className="client-side-sub">Manage companies</div>
          </div>
          {/* Notification bell */}
          <div style={{ position: "relative", marginLeft: "4px" }}>
            <button
              onClick={() => setBellOpen((o) => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Warnings & Alerts"
            >
              <span className={bellRinging ? "fm-bell-ringing" : ""} style={{ fontSize: "18px", display: "inline-block" }}>🔔</span>
              {warnOpenCount > 0 && (
                <span style={{ position: "absolute", top: "-2px", right: "-2px", background: "#dc2626", color: "#fff", borderRadius: "50%", fontSize: "9px", fontWeight: 800, width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                  {warnOpenCount > 99 ? "99+" : warnOpenCount}
                </span>
              )}
            </button>
            {/* Bell dropdown */}
            {bellOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: "300px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", zIndex: 9999, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>⚠️ Active Warnings</span>
                  <button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>View all →</button>
                </div>
                {recentAlerts.length === 0 && (
                  <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>No open warnings</div>
                )}
                {recentAlerts.map((a) => {
                  const sevColor = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a" }[a.severity] || "#475569";
                  const sevBg    = { critical: "#fee2e2", high: "#fff7ed",  medium: "#fefce8",  low: "#f0fdf4"  }[a.severity] || "#f8fafc";
                  return (
                    <div key={a.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                      onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ background: sevBg, color: sevColor, fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px", textTransform: "uppercase" }}>{a.severity}</span>
                        <span style={{ fontWeight: 600, fontSize: "12px", color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName || "Unknown asset"}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "No description"}</div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</div>
                    </div>
                  );
                })}
                {warnOpenCount > 5 && (
                  <div style={{ padding: "10px 16px", textAlign: "center", borderTop: "1px solid #f1f5f9" }}>
                    <button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }}
                      style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>
                      +{warnOpenCount - recentAlerts.length} more — View all
                    </button>
                  </div>
                )}
                {/* Sound toggle + settings footer */}
                <div style={{ borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>Alert sounds</span>
                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                      <button
                        className={`fm-alarm-gear${alarmSettingsOpen ? " fm-open" : ""}`}
                        onClick={() => setAlarmSettingsOpen((v) => !v)}
                        title="Alarm settings"
                      >⚙</button>
                      <button className={`fm-sound-toggle ${soundEnabled ? "fm-enabled" : "fm-muted"}`} onClick={toggleSound}>
                        {soundEnabled ? "🔊 On" : "🔇 Off"}
                      </button>
                    </div>
                  </div>
                  {alarmSettingsOpen && (
                    <div className="fm-alarm-settings">
                      <h4>Alarm Settings</h4>
                      {/* Volume */}
                      <div className="fm-alarm-vol-row">
                        <span>Volume</span>
                        <strong>{Math.round(alarmVolume * 100)}%</strong>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={alarmVolume}
                        onChange={(e) => updateAlarmVolume(parseFloat(e.target.value))}
                        className="fm-vol-slider"
                      />
                      {/* Per-severity toggles */}
                      <div className="fm-sev-section-label">Sound per severity</div>
                      {[
                        { key: "critical", label: "Critical", color: "#dc2626", bg: "#fee2e2" },
                        { key: "high",     label: "High",     color: "#ea580c", bg: "#fff7ed" },
                        { key: "medium",   label: "Medium",   color: "#d97706", bg: "#fefce8" },
                        { key: "low",      label: "Low",      color: "#16a34a", bg: "#f0fdf4" },
                        { key: "info",     label: "Info",     color: "#2563eb", bg: "#eff6ff" },
                      ].map(({ key, label, color, bg }) => {
                        const isOn = alarmSevConfig[key] !== false;
                        return (
                          <div key={key} className="fm-sev-row">
                            <span className="fm-sev-badge" style={{ background: bg, color }}>{label}</span>
                            <div className="fm-sev-actions">
                              <button className="fm-preview-btn" title={`Preview ${label} sound`} onClick={() => previewAlertSound(key)}>▶ Test</button>
                              <button className={`fm-sev-toggle ${isOn ? "on" : "off"}`} onClick={() => updateAlarmSevConfig(key, !isOn)}>
                                {isOn ? "ON" : "OFF"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <nav className="client-side-nav">
          <button className={nav === "dashboard" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("dashboard"); setShowAddForm(false); }}>Dashboard</button>
          <button className={nav === "companies" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("companies"); setShowAddForm(false); }}>Companies</button>
          <button className={nav === "departments" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("departments"); setShowAddForm(false); }}>Departments</button>
          <button className={nav === "assets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("assets"); setShowAddForm(false); }}>Assets</button>
          <button className={nav === "checklists" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("checklists"); setShowAddForm(false); }}>Checklists</button>
          <button className={nav === "logsheets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("logsheets"); setShowAddForm(false); }}>Logsheets</button>
        </nav>
        <div className="client-side-footer">
          <button className="client-side-item" disabled>Settings</button>
          <button className="client-side-item" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <div className="page client-main-area">

        {nav === "companies" && !showAddForm && adminCompanyId && (() => {
          const adminCompany = companies.find((c) => c.id === adminCompanyId);
          const userStats = {
            total: companyUsers.length,
            active: companyUsers.filter((u) => (u.status || "Active").toLowerCase() === "active").length,
            inactive: companyUsers.filter((u) => (u.status || "Active").toLowerCase() !== "active").length,
          };
          const term = userTableSearch.trim().toLowerCase();
          const filteredUsers = companyUsers.filter((u) =>
            !term || u.fullName?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || (u.designation || "").toLowerCase().includes(term)
          );
          const sortedUsers = [...filteredUsers].sort((a, b) => {
            let av = a[userSortField] || ""; let bv = b[userSortField] || "";
            if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();
            if (av < bv) return userSortDir === "asc" ? -1 : 1;
            if (av > bv) return userSortDir === "asc" ? 1 : -1;
            return 0;
          });
          const totalPages = Math.max(1, Math.ceil(sortedUsers.length / userTableEntries));
          const startIndex = userTablePage * userTableEntries;
          const pagedUsers = sortedUsers.slice(startIndex, startIndex + userTableEntries);
          const toggleUserSort = (f) => {
            if (userSortField === f) setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else { setUserSortField(f); setUserSortDir("asc"); }
            setUserTablePage(0);
          };
          const UserTH = ({ field, children, sortable = true }) => (
            <th onClick={sortable ? () => toggleUserSort(field) : undefined}
              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>
              {children}{sortable && <span style={{ color: userSortField === field ? "#7c3aed" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>{userSortField === field ? (userSortDir === "asc" ? "▲" : "▼") : "⇅"}</span>}
            </th>
          );
          return (
            <>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>
                    Users — {adminCompany?.companyName || "Company"}
                  </h1>
                  <p style={{ fontSize: "13px", color: "#94a3b8" }}>
                    Companies&nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;
                    <button onClick={() => setAdminCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontWeight: 500, fontSize: "13px", padding: 0 }}>{adminCompany?.companyName || "Company"}</button>
                    &nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;<span style={{ color: "#0f172a" }}>Users</span>
                  </p>
                </div>
                <button onClick={handleOpenAddUser}
                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: "600", fontSize: "14px", cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}>
                  + Add User
                </button>
              </div>

              {/* Stat Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
                {[
                  { label: "Total Users", value: userStats.total, sub: "All users", subColor: "#64748b", iconBg: "#ede9fe", iconColor: "#7c3aed", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                  { label: "Active Users", value: userStats.active, sub: "✓ Active", subColor: "#22c55e", iconBg: "#f0fdf4", iconColor: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
                  { label: "Inactive Users", value: userStats.inactive, sub: "⏸ Inactive", subColor: "#f59e0b", iconBg: "#fffbeb", iconColor: "#f59e0b", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: "500" }}>{s.label}</p>
                      <p style={{ fontSize: "34px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>
                      <p style={{ color: s.subColor, fontSize: "13px", marginTop: "10px", fontWeight: "500" }}>{s.sub}</p>
                    </div>
                    <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>
                  </div>
                ))}
              </div>

              {companyUsersError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "14px" }}>⚠️ {companyUsersError}</div>}

              {/* Users Table */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
                  <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>Users List</h2>
                </div>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>Show</span>
                    <select value={userTableEntries} onChange={(e) => { setUserTableEntries(Number(e.target.value)); setUserTablePage(0); }}
                      style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", background: "#fff" }}>
                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>entries</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>Search:</span>
                    <input value={userTableSearch} onChange={(e) => { setUserTableSearch(e.target.value); setUserTablePage(0); }}
                      style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", width: "200px", outline: "none" }} />
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        <UserTH field="sno" sortable={false}>S.No</UserTH>
                        <UserTH field="fullName">User</UserTH>
                        <UserTH field="email">Email</UserTH>
                        <UserTH field="phone">Phone</UserTH>
                        <UserTH field="designation">Designation</UserTH>
                        <UserTH field="role">Role</UserTH>
                        <UserTH field="status">Status</UserTH>
                        <UserTH field="action" sortable={false}>Action</UserTH>
                      </tr>
                    </thead>
                    <tbody>
                      {companyUsersLoading ? (
                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                      ) : pagedUsers.length === 0 ? (
                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No users yet. Click "+ Add User" to add the first admin.</td></tr>
                      ) : pagedUsers.map((u, idx) => {
                        const statusLower = (u.status || "Active").toLowerCase();
                        const initials = (u.fullName || "U").slice(0, 1).toUpperCase();
                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: "600" }}>{startIndex + idx + 1}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed", fontWeight: "700", fontSize: "15px", flexShrink: 0 }}>{initials}</div>
                                <span style={{ fontWeight: "600", color: "#0f172a" }}>{u.fullName}</span>
                              </div>
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                {u.email}
                              </div>
                            </td>
                            <td style={{ padding: "14px 16px", color: "#475569", fontSize: "13px" }}>{u.phone || "-"}</td>
                            <td style={{ padding: "14px 16px", color: "#475569", fontSize: "13px" }}>{u.designation || "-"}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: u.role === "admin" ? "#ede9fe" : u.role === "supervisor" ? "#fef3c7" : u.role === "technician" ? "#ecfeff" : "#f1f5f9", color: u.role === "admin" ? "#7c3aed" : u.role === "supervisor" ? "#d97706" : u.role === "technician" ? "#0891b2" : "#475569", textTransform: "capitalize" }}>
                                {u.role || "employee"}
                              </span>
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", background: statusLower === "active" ? "#f0fdf4" : "#fffbeb", color: statusLower === "active" ? "#16a34a" : "#d97706" }}>{u.status || "Active"}</span>
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", gap: "5px" }}>
                                <button title="Edit" onClick={() => handleOpenEditUser(u)} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef9c3", color: "#ca8a04", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button title="Delete" onClick={() => handleDeleteCompanyUser(u.id)} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fee2e2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    {sortedUsers.length === 0 ? "No entries" : `Showing ${startIndex + 1} to ${Math.min(startIndex + userTableEntries, sortedUsers.length)} of ${sortedUsers.length} entries`}
                  </span>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button onClick={() => setUserTablePage((p) => Math.max(0, p - 1))} disabled={userTablePage === 0}
                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: userTablePage === 0 ? "not-allowed" : "pointer", color: userTablePage === 0 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Previous</button>
                    <span style={{ padding: "6px 12px", background: "#2563eb", color: "#fff", borderRadius: "6px", fontSize: "13px", fontWeight: "600", minWidth: "34px", textAlign: "center" }}>{userTablePage + 1}</span>
                    <button onClick={() => setUserTablePage((p) => Math.min(totalPages - 1, p + 1))} disabled={userTablePage >= totalPages - 1}
                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: userTablePage >= totalPages - 1 ? "not-allowed" : "pointer", color: userTablePage >= totalPages - 1 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Next</button>
                  </div>
                </div>
              </div>

              {/* Add / Edit User Modal */}
              {showAddUserModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowAddUserModal(false)}>
                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "480px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>{editUserId ? "Edit User" : "Add User"}</h2>
                      <button onClick={() => setShowAddUserModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>✕</button>
                    </div>
                    {userFormError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px", fontSize: "13.5px" }}>⚠️ {userFormError}</div>}
                    <form onSubmit={handleSubmitUser}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Full Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>
                          <input name="fullName" value={userForm.fullName} onChange={handleUserFormChange} className="form-input" placeholder="Full Name" required style={{ width: "100%" }} />
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Email<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>
                          <input name="email" type="email" value={userForm.email} onChange={handleUserFormChange} className="form-input" placeholder="email@example.com" required style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Phone</label>
                          <input name="phone" value={userForm.phone} onChange={handleUserFormChange} className="form-input" placeholder="Phone number" style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Designation</label>
                          <input name="designation" value={userForm.designation} onChange={handleUserFormChange} className="form-input" placeholder="e.g. Manager" style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Role<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>
                          <select name="role" value={userForm.role} onChange={handleUserFormChange} className="form-select" style={{ width: "100%" }}>
                            <option value="admin">Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="technician">Technician</option>
                            <option value="cleaner">Cleaner</option>
                            <option value="security">Security</option>
                            <option value="driver">Driver</option>
                            <option value="fleet_operator">Fleet Operator</option>
                            <option value="employee">Employee</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Status</label>
                          <select name="status" value={userForm.status} onChange={handleUserFormChange} className="form-select" style={{ width: "100%" }}>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                            Username <span style={{ color: "#94a3b8", fontWeight: "400" }}>(for mobile login)</span>
                          </label>
                          <input name="username" value={userForm.username} onChange={handleUserFormChange} className="form-input" placeholder="e.g. john.doe" style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Password{!editUserId && <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>}{editUserId && <span style={{ color: "#94a3b8", fontWeight: "400", marginLeft: "4px" }}>(leave blank to keep)</span>}</label>
                          <input name="password" type="password" value={userForm.password} onChange={handleUserFormChange} className="form-input" placeholder={editUserId ? "Leave blank to keep" : "Min 8 characters"} style={{ width: "100%" }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
                        <button type="button" onClick={() => setShowAddUserModal(false)} className="btn-cancel">Cancel</button>
                        <button type="submit" className="btn-submit" disabled={userFormLoading}>{userFormLoading ? "Saving…" : (editUserId ? "Save Changes" : "Add User")}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ── Company Data Overview ── */}
              <div style={{ marginTop: "32px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Data Overview
                </h2>

                {overviewLoading ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>Loading overview…</div>
                ) : !companyOverview ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>No data available.</div>
                ) : (() => {
                  const ov = companyOverview;
                  const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
                  const freqLabel = { daily:"Daily", weekly:"Weekly", monthly:"Monthly", quarterly:"Quarterly", half_yearly:"Half-Yearly", yearly:"Yearly" };
                  return (
                    <>
                      {/* Stat cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>
                        {[
                          { label: "Assets", value: ov.assets?.length ?? 0, iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
                          { label: "Departments", value: ov.departments?.length ?? 0, iconBg: "#f0fdf4", iconColor: "#16a34a", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                          { label: "Logsheet Templates", value: ov.logsheets?.length ?? 0, iconBg: "#ede9fe", iconColor: "#7c3aed", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
                          { label: "Checklist Templates", value: ov.checklists?.length ?? 0, iconBg: "#fef3c7", iconColor: "#d97706", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
                        ].map((s) => (
                          <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "18px 20px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "6px", fontWeight: "500" }}>{s.label}</p>
                              <p style={{ fontSize: "30px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>
                            </div>
                            <div style={{ width: "44px", height: "44px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>
                          </div>
                        ))}
                      </div>

                      {/* Assets table */}
                      {ov.assets?.length > 0 && (
                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Assets ({ov.assets.length})</h3>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  {["#","Asset Name","Asset Type","Model","Department","Status"].map((h) => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ov.assets.map((a, i) => (
                                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>
                                    <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{a.asset_name || a.assetName}</td>
                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.asset_type || a.assetType || "-"}</td>
                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.asset_model || a.assetModel || "-"}</td>
                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.department_name || a.departmentName || "-"}</td>
                                    <td style={{ padding: "10px 16px" }}>
                                      <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: (a.status || "active").toLowerCase() === "active" ? "#f0fdf4" : "#f1f5f9", color: (a.status || "active").toLowerCase() === "active" ? "#16a34a" : "#64748b" }}>
                                        {a.status || "Active"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Logsheet templates table */}
                      {ov.logsheets?.length > 0 && (
                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Logsheet Templates ({ov.logsheets.length})</h3>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  {["#","Template Name","Asset","Frequency","Log Entries","Asset Type"].map((h) => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ov.logsheets.map((t, i) => {
                                  const freq = t.frequency || "daily";
                                  const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                                  return (
                                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>
                                      <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{t.template_name || t.templateName}</td>
                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.asset_name || t.assetName || "-"}</td>
                                      <td style={{ padding: "10px 16px" }}>
                                        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{freqLabel[freq] || freq}</span>
                                      </td>
                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.entryCount ?? t.entry_count ?? 0}</td>
                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.asset_type || t.assetType || "-"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Checklist templates table */}
                      {ov.checklists?.length > 0 && (
                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Checklist Templates ({ov.checklists.length})</h3>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  {["#","Template Name","Asset Type","Questions","Status"].map((h) => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ov.checklists.map((c, i) => (
                                  <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>
                                    <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{c.template_name || c.templateName}</td>
                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{c.asset_type || c.assetType || "-"}</td>
                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{c.questionCount ?? c.question_count ?? 0}</td>
                                    <td style={{ padding: "10px 16px" }}>
                                      <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: (c.status || "active").toLowerCase() === "active" ? "#f0fdf4" : "#f1f5f9", color: (c.status || "active").toLowerCase() === "active" ? "#16a34a" : "#64748b" }}>
                                        {c.status || "Active"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {ov.assets?.length === 0 && ov.logsheets?.length === 0 && ov.checklists?.length === 0 && (
                        <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "14px" }}>
                          This company has no assets, logsheet templates, or checklist templates yet.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

            </>
          );
        })()}

        {nav === "companies" && !showAddForm && !adminCompanyId && (() => {
          const ABtns = ({ bg, col, title, onClick, children }) => (
            <button title={title} onClick={onClick} style={{ width: "30px", height: "30px", borderRadius: "6px", background: bg, color: col, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{children}</button>
          );
          const SortIcon = ({ field }) => (
            <span style={{ color: sortField === field ? "#2563eb" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>
              {sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
            </span>
          );
          const TH = ({ field, children, sortable = true }) => (
            <th onClick={sortable ? () => toggleSort(field) : undefined}
              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>
              {children}{sortable && <SortIcon field={field} />}
            </th>
          );
          return (
            <>
              {/* ── Header ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
                <div>
                  <h1 style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>Company Management</h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>Manage your client companies and their configurations</p>
                </div>
                <button type="button" onClick={() => setShowAddForm(true)}
                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: "600", fontSize: "14px", cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}>
                  + Add Company
                </button>
              </div>

              {/* ── Stat Cards ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
                {[
                  { label: "Total Companies", value: companyStats.total, sub: "All registered companies", subColor: "#64748b", iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
                  { label: "Active Companies", value: companyStats.active, sub: "✓ Active", subColor: "#22c55e", iconBg: "#f0fdf4", iconColor: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
                  { label: "Total Employees", value: companyStats.totalEmployees, sub: "Across all companies", subColor: "#64748b", iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                  { label: "Inactive Companies", value: companyStats.inactive, sub: "⏸ Inactive", subColor: "#f59e0b", iconBg: "#fffbeb", iconColor: "#f59e0b", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: "500" }}>{s.label}</p>
                      <p style={{ fontSize: "34px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>
                      <p style={{ color: s.subColor, fontSize: "13px", marginTop: "10px", fontWeight: "500" }}>{s.sub}</p>
                    </div>
                    <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>
                  </div>
                ))}
              </div>

              {/* ── Companies Table Card ── */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
                  <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>Companies List</h2>
                </div>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>Show</span>
                    <select value={tableEntries} onChange={(e) => { setTableEntries(Number(e.target.value)); setTablePage(0); }}
                      style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", background: "#fff" }}>
                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>entries</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#64748b", fontSize: "14px" }}>Search:</span>
                    <input value={tableSearch} onChange={(e) => { setTableSearch(e.target.value); setTablePage(0); }}
                      style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", width: "200px", outline: "none" }} />
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        <TH field="sno" sortable={false}>S.No</TH>
                        <TH field="companyName">Company</TH>
                        <TH field="contact" sortable={false}>Contact</TH>
                        <TH field="city">Location</TH>
                        <TH field="modules" sortable={false}>Modules</TH>
                        <TH field="stats" sortable={false}>Stats</TH>
                        <TH field="status">Status</TH>
                        <TH field="actions" sortable={false}>Action</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCompanies.length === 0 ? (
                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                          {companyLoading ? "Loading companies…" : "No companies found."}
                        </td></tr>
                      ) : (
                        pagedCompanies.map((c, idx) => {
                          const companyDepts = departments.filter((d) => String(d.companyId) === String(c.id));
                          const employeeCount = Number(c.employeeCount) || 0;
                          const modules = [c.qsrModule && "Asset Mgmt", c.premealModule && "FM Checklist", c.deliveryModule && "Fleet", c.allowGuestBooking && "OJT Training"].filter(Boolean);
                          const statusLower = (c.status || "Active").toLowerCase();
                          return (
                            <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: "600" }}>{tablePages.startIndex + idx + 1}</td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338ca", fontWeight: "700", fontSize: "14px", flexShrink: 0 }}>
                                    {c.companyName?.slice(0, 2).toUpperCase() || "CO"}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: "600", color: "#0f172a", fontSize: "14px" }}>{c.companyName}</div>
                                    <div style={{ color: "#94a3b8", fontSize: "12px" }}>{c.companyCode}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    {c.description?.slice(0, 18) || "—"}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "13px" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.14 11.93A19.75 19.75 0 0 1 1.09 3.21a2 2 0 0 1 1.76-2.18h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.61 8.18a16 16 0 0 0 7.18 7.18l.82-.82a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                    {c.pincode || "-"}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                  {[c.city, c.state].filter(Boolean).join(", ") || "-"}
                                </div>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                  {modules.length === 0 ? (
                                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                                  ) : modules.map((m) => (
                                    <span key={m} style={{ background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "500" }}>{m}</span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#475569" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                    {employeeCount} Employees
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><line x1="12" y1="12" x2="5" y2="15"/><line x1="12" y1="12" x2="19" y2="15"/></svg>
                                    {companyDepts.length} Departments
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", background: statusLower === "active" ? "#f0fdf4" : "#fffbeb", color: statusLower === "active" ? "#16a34a" : "#d97706" }}>
                                  {c.status || "Active"}
                                </span>
                              </td>
                              <td style={{ padding: "14px 16px" }}>
                                <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                  <ABtns bg="#dbeafe" col="#2563eb" title="View Details" onClick={() => setViewCompanyId(c.id)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  </ABtns>
                                  <ABtns bg="#dbeafe" col="#2563eb" title="Departments" onClick={() => { setSelectedCompanyId(c.id); setNav("departments"); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><line x1="12" y1="12" x2="5" y2="15"/><line x1="12" y1="12" x2="19" y2="15"/></svg>
                                  </ABtns>
                                  <ABtns bg="#dcfce7" col="#16a34a" title="Checklists" onClick={() => { setSelectedCompanyId(c.id); setNav("checklists"); }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                  </ABtns>
                                  <ABtns bg="#f3e8ff" col="#7c3aed" title="Admin Users" onClick={() => openAdminView(c.id)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                  </ABtns>
                                  <ABtns bg="#fef9c3" col="#ca8a04" title="Edit" onClick={() => openEditCompany(c)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </ABtns>
                                  <ABtns bg="#fee2e2" col="#dc2626" title="Delete" onClick={() => handleDeleteCompany(c.id)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </ABtns>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    {tablePages.total === 0 ? "No entries" : `Showing ${tablePages.startIndex + 1} to ${Math.min(tablePages.startIndex + tableEntries, tablePages.total)} of ${tablePages.total} entries`}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={() => setTablePage((p) => Math.max(0, p - 1))} disabled={tablePage === 0}
                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: tablePage === 0 ? "not-allowed" : "pointer", color: tablePage === 0 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Previous</button>
                    <button onClick={() => setTablePage((p) => Math.min(tablePages.totalPages - 1, p + 1))} disabled={tablePage >= tablePages.totalPages - 1}
                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: tablePage >= tablePages.totalPages - 1 ? "not-allowed" : "pointer", color: tablePage >= tablePages.totalPages - 1 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Next</button>
                  </div>
                </div>
              </div>

              {/* ── View Company Modal ── */}
              {viewCompanyId && (() => {
                const vc = companies.find((c) => c.id === viewCompanyId);
                if (!vc) return null;
                return (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setViewCompanyId(null)}>
                    <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "580px", width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338ca", fontWeight: "700", fontSize: "16px" }}>{vc.companyName?.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>{vc.companyName}</h2>
                            <span style={{ fontSize: "12px", color: "#94a3b8" }}>{vc.companyCode}</span>
                          </div>
                        </div>
                        <button onClick={() => setViewCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>✕</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "14px" }}>
                        {[["Description", vc.description], ["City", vc.city], ["State", vc.state], ["Country", vc.country], ["Pincode", vc.pincode], ["GST Number", vc.gstNumber], ["PAN Number", vc.panNumber], ["CIN Number", vc.cinNumber], ["Billing Cycle", vc.billingCycle], ["Payment Terms", vc.paymentTermsDays ? `${vc.paymentTermsDays} days` : null], ["Max Employees", vc.maxEmployees || "Unlimited"], ["Status", vc.status || "Active"]].map(([label, val]) => (
                          <div key={label}>
                            <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "2px", fontWeight: "500" }}>{label}</div>
                            <div style={{ fontWeight: "600", color: "#0f172a" }}>{val || "—"}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: "16px" }}>
                        <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "6px", fontWeight: "500" }}>Modules</div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {[vc.qsrModule && "QSR / Asset Mgmt", vc.premealModule && "FM e Checklist", vc.deliveryModule && "Fleet Management", vc.allowGuestBooking && "OJT Training"].filter(Boolean).map((m) => (
                            <span key={m} style={{ background: "#eff6ff", color: "#2563eb", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Edit Company Modal ── */}
              {editCompanyId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setEditCompanyId(null)}>
                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>Edit Company</h2>
                      <button onClick={() => setEditCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>✕</button>
                    </div>
                    {editCompanyError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px" }}>⚠️ {editCompanyError}</div>}
                    <form onSubmit={handleUpdateCompany}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        <div className="form-group" style={{ gridColumn: "span 2" }}>
                          <label>Company Name</label>
                          <input name="companyName" value={editCompanyForm.companyName} onChange={handleEditCompanyChange} className="form-input" required />
                        </div>
                        <div className="form-group">
                          <label>Company Code</label>
                          <input name="companyCode" value={editCompanyForm.companyCode} onChange={handleEditCompanyChange} className="form-input" required />
                        </div>
                        <div className="form-group">
                          <label>Status</label>
                          <select name="status" value={editCompanyForm.status} onChange={handleEditCompanyChange} className="form-select">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>City</label>
                          <input name="city" value={editCompanyForm.city} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                        <div className="form-group">
                          <label>State</label>
                          <input name="state" value={editCompanyForm.state} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                        <div className="form-group">
                          <label>Country</label>
                          <input name="country" value={editCompanyForm.country} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                        <div className="form-group">
                          <label>Pincode</label>
                          <input name="pincode" value={editCompanyForm.pincode} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                        <div className="form-group">
                          <label>GST Number</label>
                          <input name="gstNumber" value={editCompanyForm.gstNumber} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                        <div className="form-group">
                          <label>Billing Cycle</label>
                          <select name="billingCycle" value={editCompanyForm.billingCycle} onChange={handleEditCompanyChange} className="form-select">
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Yearly">Yearly</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Max Employees</label>
                          <input type="number" name="maxEmployees" value={editCompanyForm.maxEmployees} onChange={handleEditCompanyChange} className="form-input" min="0" />
                        </div>
                        <div className="form-group" style={{ gridColumn: "span 2" }}>
                          <label>Description</label>
                          <input name="description" value={editCompanyForm.description} onChange={handleEditCompanyChange} className="form-input" />
                        </div>
                      </div>
                      <div style={{ marginTop: "16px" }}>
                        <label style={{ display: "block", color: "#475569", fontWeight: "600", fontSize: "13px", marginBottom: "10px" }}>Module Access</label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                          {[["qsrModule", "QSR / Asset Management"], ["premealModule", "FM e Checklist"], ["deliveryModule", "Fleet Management"], ["allowGuestBooking", "OJT Training"]].map(([key, label]) => (
                            <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#475569" }}>
                              <input type="checkbox" name={key} checked={!!editCompanyForm[key]} onChange={handleEditCompanyChange} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "24px" }}>
                        <button type="button" onClick={() => setEditCompanyId(null)} className="btn-cancel">Cancel</button>
                        <button type="submit" className="btn-submit" disabled={editCompanyLoading}>{editCompanyLoading ? "Saving…" : "Save Changes"}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {companyError && (
          <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
            ⚠️ {companyError}
          </div>
        )}

        {assetError && nav === "assets" && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "14px", border: "1px solid #fecaca" }}>
            ⚠️ {assetError}
          </div>
        )}


        {nav === "assets" && (() => {
          const assetTotalCount = assets.length;
          const assetActiveCount = assets.filter((a) => (a.status || "Active").toLowerCase() === "active").length;
          const assetInactiveCount = assetTotalCount - assetActiveCount;
          const assetTypesCount = assetTypes.length || 3;
          const sortedAssets = [...filteredAssets].sort((a, b) => {
            let av = a[assetSortField] || ""; let bv = b[assetSortField] || "";
            if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();
            if (av < bv) return assetSortDir === "asc" ? -1 : 1;
            if (av > bv) return assetSortDir === "asc" ? 1 : -1;
            return 0;
          });
          const assetTotalPages = Math.max(1, Math.ceil(sortedAssets.length / assetTableEntries));
          const assetStartIndex = assetTablePage * assetTableEntries;
          const pagedAssets = sortedAssets.slice(assetStartIndex, assetStartIndex + assetTableEntries);
          const toggleAssetSort = (f) => {
            if (assetSortField === f) setAssetSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else { setAssetSortField(f); setAssetSortDir("asc"); }
            setAssetTablePage(0);
          };
          const ATH = ({ field, children, sortable = true }) => (
            <th onClick={sortable ? () => toggleAssetSort(field) : undefined}
              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>
              {children}{sortable && <span style={{ color: assetSortField === field ? "#2563eb" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>{assetSortField === field ? (assetSortDir === "asc" ? "▲" : "▼") : "⇅"}</span>}
            </th>
          );
          return (
            <>
              {/* ── Sub-tab navigation ── */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
                {[
                  { k: "dashboard", label: "📊 Analytics Dashboard" },
                  { k: "manage",    label: "🗂 Manage Assets" },
                ].map(({ k, label }) => (
                  <button key={k} type="button" onClick={() => setAssetSubNav(k)}
                    style={{ padding: "10px 22px", background: "none", border: "none",
                      borderBottom: assetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                      marginBottom: "-2px", fontSize: "14px", fontWeight: 700,
                      color: assetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Dashboard sub-tab ── */}
              {assetSubNav === "dashboard" && (
                <AssetDashboard
                  token={token}
                  companyId={null}
                  assetList={assets}
                />
              )}

              {/* ── Manage sub-tab ── */}
              {assetSubNav === "manage" && (<>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Asset Management</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage assets across Soft, Technical, and Fleet categories.</p>
                </div>
                <button type="button"
                  onClick={() => { const defaultCompany = selectedCompanyId || companies[0]?.id || ""; setAssetForm({ ...emptyAsset, companyId: defaultCompany }); setEditingAssetId(null); setShowAssetModal(true); }}
                  disabled={!companies.length}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "none", background: companies.length ? "#2563eb" : "#94a3b8", color: "#fff", opacity: companies.length ? 1 : 0.6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Asset
                </button>
              </div>

              {/* Asset Type Master */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>Asset Type Master</p>
                    <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Create reusable asset types for consistent data.</p>
                  </div>
                  <span style={{ background: "#eff6ff", color: "#2563eb", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}>{assetTypes.length} types</span>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  <form onSubmit={handleCreateAssetType} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Type Code</label>
                      <input className="form-input" value={assetTypeDraft.code} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, code: e.target.value })} placeholder="e.g. kitchen" required />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Type Label</label>
                      <input className="form-input" value={assetTypeDraft.label} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, label: e.target.value })} placeholder="Kitchen Equipment" required />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Category (optional)</label>
                      <input className="form-input" value={assetTypeDraft.category} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, category: e.target.value })} placeholder="Grouping or module" />
                    </div>
                    <button type="submit" disabled={assetLoading}
                      style={{ height: "40px", background: assetLoading ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>
                      {assetLoading ? "Saving…" : "Add Type"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Assets List */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>Asset List</p>
                    <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{filteredAssets.length} assets</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select value={assetTypeFilter} onChange={(e) => setAssetTypeFilter(e.target.value)}
                      style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", background: "#fff", outline: "none" }}>
                      <option value="all">All Types</option>
                      {(assetTypes.length ? assetTypes : [{ code: "soft", label: "Soft" }, { code: "technical", label: "Technical" }, { code: "fleet", label: "Fleet" }]).map((t) => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                    <input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Search…"
                      style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "160px" }} />
                  </div>
                </div>
                {assetLoading ? (
                  <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading…</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        {["#", "Asset Name", "ID", "Type", "Company", "Department", "Location", "Status", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.length === 0 ? (
                        <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{assetLoading ? "Loading…" : "No assets found."}</td></tr>
                      ) : filteredAssets.map((a, i) => {
                        const typeLabel = assetTypeLabelMap[a.assetType] || assetTypeLabels[a.assetType] || a.assetType;
                        return (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", color: "#64748b" }}>{i + 1}</td>
                            <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{a.assetName}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontFamily: "monospace", fontSize: "12px" }}>{a.assetUniqueId || "—"}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: a.assetType === "technical" ? "#eff6ff" : a.assetType === "fleet" ? "#f3e8ff" : "#f0fdf4", color: a.assetType === "technical" ? "#2563eb" : a.assetType === "fleet" ? "#7c3aed" : "#16a34a" }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{a.companyName || "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{a.departmentName || "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "12.5px" }}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: (a.status || "Active").toLowerCase() === "active" ? "#f0fdf4" : "#f8fafc", color: (a.status || "Active").toLowerCase() === "active" ? "#16a34a" : "#94a3b8" }}>
                                {a.status || "Active"}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button title="Show QR Code" type="button" onClick={() => handleShowAssetQR(a.id, a.assetName)}
                                  style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                                </button>
                                <button title="Edit" type="button" onClick={() => handleEditAsset(a)}
                                  style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button title="Delete" type="button" onClick={() => handleDeleteAsset(a.id)}
                                  style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

            {showAssetModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }} onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }}>
              <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "780px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", marginBottom: "4px" }}>{editingAssetId ? "Edit Asset" : "Add Asset"}</h2>
                    <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Fill in details based on the selected asset category.</p>
                  </div>
                  <button onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>✕</button>
                </div>
                <form onSubmit={handleSubmitAsset}>
                  <div className="form-group">
                    <label>Company</label>
                    <select name="companyId" value={assetForm.companyId || ""} onChange={handleAssetChange} className="form-select" required>
                      <option value="" disabled>Select company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Department</label>
                    <select name="departmentId" value={assetForm.departmentId || ""} onChange={handleAssetChange} className="form-select" required>
                      <option value="" disabled>Select department</option>
                      {companyDepartmentOptions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {!companyDepartmentOptions.length && (
                      <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                        Add a department for this company first.
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    <div className="form-group">
                      <label>Asset Type</label>
                      <select name="assetType" value={assetForm.assetType} onChange={handleAssetChange} className="form-select" required>
                        <option value="" disabled>Select type</option>
                        {(assetTypes.length ? assetTypes : [
                          { code: "soft", label: "Soft Services" },
                          { code: "technical", label: "Technical" },
                          { code: "fleet", label: "Fleet" },
                        ]).map((t) => (
                          <option key={t.code} value={t.code}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Asset Name</label>
                      <input name="assetName" value={assetForm.assetName} onChange={handleAssetChange} className="form-input" required placeholder="e.g. Floor Cleaning - 3rd Floor" />
                    </div>
                    <div className="form-group">
                      <label>Asset Unique ID</label>
                      <input name="assetUniqueId" value={assetForm.assetUniqueId} onChange={handleAssetChange} className="form-input" placeholder="Auto or manual" />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <select name="status" value={assetForm.status} onChange={handleAssetChange} className="form-select">
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {assetForm.assetType !== "fleet" && (
                  <div className="form-section" style={{ marginBottom: "12px" }}>
                    <h3 style={{ marginBottom: "8px" }}>Location</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                      <div className="form-group"><label>Building</label><input name="building" value={assetForm.building} onChange={handleAssetChange} className="form-input" /></div>
                      <div className="form-group"><label>Floor</label><input name="floor" value={assetForm.floor} onChange={handleAssetChange} className="form-input" /></div>
                      <div className="form-group"><label>Room/Area</label><input name="room" value={assetForm.room} onChange={handleAssetChange} className="form-input" /></div>
                    </div>
                  </div>
                  )}

                  <div className="form-group">
                    <label>Asset Description</label>
                    <textarea name="description" value={assetForm.description} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Notes, instructions, etc." />
                  </div>

                  {assetForm.assetType === "soft" && (
                    <div className="form-section" style={{ marginBottom: "12px" }}>
                      <h3 style={{ marginBottom: "8px" }}>Soft Services</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                        <div className="form-group"><label>Service Area/Location</label><input name="serviceArea" value={assetForm.serviceArea} onChange={handleAssetChange} className="form-input" placeholder="Lobby, Pantry, etc." /></div>
                        <div className="form-group"><label>Frequency</label><select name="frequency" value={assetForm.frequency} onChange={handleAssetChange} className="form-select"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></div>
                        <div className="form-group"><label>Shift</label><select name="shift" value={assetForm.shift} onChange={handleAssetChange} className="form-select"><option>Morning</option><option>Evening</option><option>Night</option></select></div>
                        <div className="form-group"><label>Supervisor Assigned</label><input name="supervisor" value={assetForm.supervisor} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>No. of Staff Required</label><input type="number" name="staffRequired" value={assetForm.staffRequired} onChange={handleAssetChange} className="form-input" min="0" /></div>
                        <div className="form-group"><label>Special Instructions</label><input name="specialInstructions" value={assetForm.specialInstructions} onChange={handleAssetChange} className="form-input" /></div>
                      </div>
                    </div>
                  )}

                  {assetForm.assetType === "technical" && (
                    <div className="form-section" style={{ marginBottom: "12px" }}>
                      <h3 style={{ marginBottom: "8px" }}>Technical Asset</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                        <div className="form-group"><label>Machine Name</label><input name="machineName" value={assetForm.machineName} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Brand/Manufacturer</label><input name="brand" value={assetForm.brand} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Model Number</label><input name="modelNumber" value={assetForm.modelNumber} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Serial Number</label><input name="serialNumber" value={assetForm.serialNumber} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Installation Date</label><input type="date" name="installationDate" value={assetForm.installationDate} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Warranty Expiry</label><input type="date" name="warrantyExpiry" value={assetForm.warrantyExpiry} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Maintenance Frequency</label><input name="maintenanceFrequency" value={assetForm.maintenanceFrequency} onChange={handleAssetChange} className="form-input" placeholder="e.g. Monthly" /></div>
                        <div className="form-group"><label>Last Service Date</label><input type="date" name="lastServiceDate" value={assetForm.lastServiceDate} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Next Service Date</label><input type="date" name="nextServiceDate" value={assetForm.nextServiceDate} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Technician Assigned</label><input name="technician" value={assetForm.technician} onChange={handleAssetChange} className="form-input" /></div>
                      </div>
                    </div>
                  )}

                  {assetForm.assetType === "fleet" && (
                    <div className="form-section" style={{ marginBottom: "12px" }}>
                      <h3 style={{ marginBottom: "8px" }}>Fleet Asset</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                        <div className="form-group"><label>Vehicle Number</label><input name="vehicleNumber" value={assetForm.vehicleNumber} onChange={handleAssetChange} className="form-input" required /></div>
                        <div className="form-group"><label>Vehicle Type</label><input name="vehicleType" value={assetForm.vehicleType} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Fuel Type</label><input name="fuelType" value={assetForm.fuelType} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Driver Assigned</label><input name="driver" value={assetForm.driver} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>RC Number</label><input name="rcNumber" value={assetForm.rcNumber} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Insurance Expiry</label><input type="date" name="insuranceExpiry" value={assetForm.insuranceExpiry} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>PUC Expiry</label><input type="date" name="pucExpiry" value={assetForm.pucExpiry} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Service Due Date</label><input type="date" name="serviceDueDate" value={assetForm.serviceDueDate} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Purchase Date</label><input type="date" name="purchaseDate" value={assetForm.purchaseDate} onChange={handleAssetChange} className="form-input" /></div>
                        <div className="form-group"><label>Vendor</label><input name="vendor" value={assetForm.vendor} onChange={handleAssetChange} className="form-input" /></div>
                        <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input type="checkbox" name="dailyKmTracking" checked={assetForm.dailyKmTracking} onChange={handleAssetChange} />
                          <span>Daily KM Tracking</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-section" style={{ marginBottom: "12px" }}>
                    <h3 style={{ marginBottom: "8px" }}>Attachments & Tracking</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                      <div className="form-group"><label>Image URL</label><input name="imageUrl" value={assetForm.imageUrl} onChange={handleAssetChange} className="form-input" placeholder="Link to asset image" /></div>
                      <div className="form-group"><label>Checklist (name or ID)</label><input name="checklist" value={assetForm.checklist} onChange={handleAssetChange} className="form-input" placeholder="Attach checklist reference" /></div>
                      <div className="form-group"><label>QR Code</label><input name="qrCode" value={assetForm.qrCode} onChange={handleAssetChange} className="form-input" placeholder="QR code value (optional)" /></div>
                      <div className="form-group"><label>Document Links (one per line)</label><textarea name="documentLinks" value={assetForm.documentLinks} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Paste URLs or notes" /></div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                    <button type="button" onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }} style={{ padding: "9px 20px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>Cancel</button>
                    <button type="submit" disabled={assetLoading} style={{ padding: "9px 24px", borderRadius: "8px", border: "none", background: assetLoading ? "#93c5fd" : "#2563eb", color: "#fff", fontWeight: 600, cursor: assetLoading ? "default" : "pointer", fontSize: "14px" }}>{assetLoading ? "Saving…" : editingAssetId ? "Update Asset" : "Add Asset"}</button>
                  </div>
                </form>
              </div>
              </div>
            )}
            {assetQrModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
                <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "360px", padding: "32px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Asset QR Code</h3>
                  <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>{assetQrModal.assetName}</p>
                  {assetQrDataUrl ? (
                    <img src={assetQrDataUrl} alt="QR Code" style={{ width: "220px", height: "220px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                  ) : (
                    <p style={{ color: "#94a3b8" }}>Generating QR...</p>
                  )}
                  <p style={{ marginTop: "16px", fontSize: "11px", color: "#94a3b8" }}>Scan to view asset details and training on mobile</p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "center", flexWrap: "wrap" }}>
                    {assetQrDataUrl && (
                      <a href={assetQrDataUrl} download={`QR-${assetQrModal.assetName.replace(/[^a-zA-Z0-9]/g, "_")}-${assetQrModal.assetId}.png`} style={{ padding: "8px 18px", borderRadius: "8px", background: "#2563eb", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download QR
                      </a>
                    )}
                    {assetQrDataUrl && (
                      <button onClick={() => {
                        const w = window.open("", "_blank");
                        w.document.write(`<html><head><title>QR - ${assetQrModal.assetName}</title><style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#fff} h3{margin-bottom:8px;font-size:18px;color:#0f172a} p{margin:0 0 16px;color:#64748b;font-size:13px}</style></head><body><h3>${assetQrModal.assetName}</h3><p>Scan to open on mobile</p><img src="${assetQrDataUrl}" style="width:260px;height:260px"/></body></html>`);
                        w.document.close();
                        w.focus();
                        setTimeout(() => { w.print(); }, 400);
                      }} style={{ padding: "8px 18px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print QR
                      </button>
                    )}
                    <button onClick={() => { setAssetQrModal(null); setAssetQrDataUrl(""); }} style={{ padding: "8px 18px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Close</button>
                  </div>
                </div>
              </div>
            )}
            </>)} {/* end assetSubNav === "manage" */}
            </>
          );
        })()}

        {nav === "departments" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Departments</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create and manage departments across your companies.</p>
              </div>
            </div>

            {departmentError && (
              <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: "1px solid #fecaca", marginBottom: "14px" }}>
                {departmentError}
              </div>
            )}

            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
                <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Add Department</p>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <form onSubmit={handleCreateDepartment}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Company <span style={{ color: "#ef4444" }}>*</span></label>
                      <select name="companyId" value={departmentForm.companyId || selectedCompanyId || companies[0]?.id || ""} onChange={handleDepartmentChange}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }} required>
                        <option value="" disabled>Select company</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Department Name <span style={{ color: "#ef4444" }}>*</span></label>
                      <input name="name" value={departmentForm.name} onChange={handleDepartmentChange} placeholder="Housekeeping, HVAC, Pantry"
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none" }} required />
                    </div>
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
                    <input name="description" value={departmentForm.description} onChange={handleDepartmentChange} placeholder="Optional notes"
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none" }} />
                  </div>
                  <button type="submit" disabled={departmentLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: departmentLoading ? "not-allowed" : "pointer", border: "none", background: departmentLoading ? "#93c5fd" : "#2563eb", color: "#fff" }}>
                    {departmentLoading ? "Saving…" : "Add Department"}
                  </button>
                </form>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>All Departments</p>
                  <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{filteredDepartments.length} departments</p>
                </div>
                <input value={departmentSearch} onChange={(e) => setDepartmentSearch(e.target.value)} placeholder="Search…"
                  style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr>
                    {["#", "Department Name", "Company", "Description", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartments.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{departmentLoading ? "Loading…" : "No departments found"}</td></tr>
                  ) : filteredDepartments.map((d, i) => (
                    <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{d.name}</td>
                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.companyName || companies.find((c) => String(c.id) === String(d.companyId))?.companyName || "—"}</td>
                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.description || "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <button title="Delete" type="button" onClick={() => handleDeleteDepartment(d.id)}
                          style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {nav === "checklists" && (() => {
          const clCompanyId = checklistSelectedCompanyId || companies[0]?.id || null;
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setChecklistSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: checklistSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 700,
                    color: checklistSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Company selector */}
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 20px", marginBottom: "22px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>Company:</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button"
                  onClick={() => setChecklistSelectedCompanyId(null)}
                  style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: clCompanyId === (companies[0]?.id || null) && !checklistSelectedCompanyId ? "none" : (checklistSelectedCompanyId === null ? "none" : "1px solid #e2e8f0"), background: checklistSelectedCompanyId === null ? "#2563eb" : "#f8fafc", color: checklistSelectedCompanyId === null ? "#fff" : "#475569" }}>
                  All Companies
                </button>
                {companies.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => setChecklistSelectedCompanyId(c.id)}
                    style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: checklistSelectedCompanyId === c.id ? "none" : "1px solid #e2e8f0", background: checklistSelectedCompanyId === c.id ? "#2563eb" : "#f8fafc", color: checklistSelectedCompanyId === c.id ? "#fff" : "#475569" }}>
                    {c.companyName || c.name}
                  </button>
                ))}
              </div>
            </div>

            {checklistSubNav === "templates" && (
              <ChecklistTemplateModule
                token={token}
                companies={companies}
                assets={assets}
                companyId={checklistSelectedCompanyId || null}
                fetchTemplates={getChecklistTemplates}
                createTemplate={createChecklistTemplate}
                fetchTemplate={getChecklistTemplate}
                updateTemplate={updateChecklistTemplate}
                deleteTemplate={deleteChecklistTemplate}
                canBuild={true}
              />
            )}

            {checklistSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="checklists" companyId={checklistSelectedCompanyId || null} />
            )}
          </div>
          );
        })()}

        {nav === "logsheets" && (() => {
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setLogsheetSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: logsheetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 700,
                    color: logsheetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Company selector */}
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 20px", marginBottom: "22px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>Company:</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button"
                  onClick={() => setLogsheetSelectedCompanyId(null)}
                  style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: logsheetSelectedCompanyId === null ? "none" : "1px solid #e2e8f0", background: logsheetSelectedCompanyId === null ? "#2563eb" : "#f8fafc", color: logsheetSelectedCompanyId === null ? "#fff" : "#475569" }}>
                  All Companies
                </button>
                {companies.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => setLogsheetSelectedCompanyId(c.id)}
                    style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: logsheetSelectedCompanyId === c.id ? "none" : "1px solid #e2e8f0", background: logsheetSelectedCompanyId === c.id ? "#2563eb" : "#f8fafc", color: logsheetSelectedCompanyId === c.id ? "#fff" : "#475569" }}>
                    {c.companyName || c.name}
                  </button>
                ))}
              </div>
            </div>

            {logsheetSubNav === "templates" && (
              <LogsheetModule
                token={token}
                assets={assets}
                companies={companies}
                companyId={logsheetSelectedCompanyId || null}
                fetchTemplates={(tok, params) => getLogsheetTemplates(tok, params)}
                fetchTemplate={(tok, id) => getLogsheetTemplate(tok, id)}
                createTemplate={(tok, data) => createLogsheetTemplate(tok, data)}
                updateTemplate={(tok, id, data) => updateLogsheetTemplate(tok, id, data)}
                deleteTemplate={(tok, id) => deleteLogsheetTemplate(tok, id)}
                assignTemplate={(tok, templateId, assetId) => assignLogsheetTemplate(tok, templateId, assetId)}
                fetchEntries={(tok, templateId, params) => getLogsheetEntriesByTemplate(tok, templateId, params)}
                submitEntry={(tok, templateId, data) => submitLogsheetEntry(tok, templateId, data)}
                canBuild={true}
              />
            )}

            {logsheetSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="logsheets" companyId={logsheetSelectedCompanyId || null} />
            )}
          </div>
          );
        })()}

        {nav === "warnings" && (
          <WarningsPanel
            token={token}
            companyId={selectedCompanyId || companies[0]?.id || null}
            companies={companies.map((c) => ({ id: c.id, companyName: c.companyName || c.company || "(unnamed)" }))}
          />
        )}

        {/* ── Toast notifications (fixed overlay on every page) ── */}
        <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>
          {toasts.map((t) => {
            const bg  = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4", info: "#eff6ff" }[t.severity] || "#fff";
            const col = { critical: "#991b1b", high: "#9a3412", medium: "#854d0e", low: "#166534", info: "#1d4ed8" }[t.severity] || "#0f172a";
            const bdr = { critical: "#fca5a5", high: "#fdba74",  medium: "#fde68a", low: "#86efac", info: "#bfdbfe" }[t.severity] || "#e2e8f0";
            const icon  = { critical: "🚨", high: "⚠️", medium: "⚡", low: "🔔", info: "ℹ️" }[t.severity] || "⚠️";
            const label = { critical: "Critical Alert", high: "New Warning", medium: "New Alert", low: "Notification", info: "Info" }[t.severity] || "New Alert";
            return (
              <div key={t.id} className="fm-toast-enter" style={{ background: bg, border: `1px solid ${bdr}`, color: col, borderRadius: "10px", padding: "12px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: "13px", fontWeight: 600, maxWidth: "340px", pointerEvents: "auto", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: "2px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                  <div>{t.text}</div>
                  <button onClick={() => { setNav("warnings"); setShowAddForm(false); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}
                    style={{ marginTop: "6px", background: "none", border: "none", color: col, fontWeight: 700, fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View warnings →</button>
                </div>
              </div>
            );
          })}
        </div>

        {nav === "companies" && showAddForm && (
          <div style={{ background: "#f1f5f9", minHeight: "100%", padding: "0 0 32px 0" }}>
            {/* Page Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 16px 0" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", margin: 0, letterSpacing: "-0.3px" }}>Add Company</h2>
              <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 400 }}>
                Companies&nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;
                <span style={{ color: "#3b82f6", fontWeight: 500 }}>Add Company</span>
              </span>
            </div>

            <form onSubmit={handleCreateCompany}>
              {/* Basic Information */}
              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Basic Information</span>
                </div>
                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                      Company Code<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>
                    </label>
                    <input name="companyCode" value={companyForm.companyCode} onChange={handleCompanyChange} className="form-input" placeholder="e.g. ACME-001" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                      Company Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>
                    </label>
                    <input name="companyName" value={companyForm.companyName} onChange={handleCompanyChange} className="form-input" placeholder="Business Name" required style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Description</label>
                    <input name="description" value={companyForm.description} onChange={handleCompanyChange} className="form-input" placeholder="Short description" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Address Information</span>
                </div>
                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 24px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Address Line 1</label>
                    <input name="addressLine1" value={companyForm.addressLine1} onChange={handleCompanyChange} className="form-input" placeholder="Street Address" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Address Line 2</label>
                    <input name="addressLine2" value={companyForm.addressLine2} onChange={handleCompanyChange} className="form-input" placeholder="Apartment, Suite, etc." style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ padding: "0 20px 20px 20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px 24px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>City</label>
                    <input name="city" value={companyForm.city} onChange={handleCompanyChange} className="form-input" placeholder="City" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>State</label>
                    <input name="state" value={companyForm.state} onChange={handleCompanyChange} className="form-input" placeholder="State" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Country</label>
                    <input name="country" value={companyForm.country} onChange={handleCompanyChange} className="form-input" placeholder="India" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Pincode</label>
                    <input name="pincode" value={companyForm.pincode} onChange={handleCompanyChange} className="form-input" placeholder="Pincode" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Business Details */}
              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Business Details</span>
                </div>
                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>GST Number</label>
                    <input name="gstNumber" value={companyForm.gstNumber} onChange={handleCompanyChange} className="form-input" placeholder="e.g. 22AAAAA0000A1Z5" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>PAN Number</label>
                    <input name="panNumber" value={companyForm.panNumber} onChange={handleCompanyChange} className="form-input" placeholder="e.g. AAAAA0000A" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>CIN Number</label>
                    <input name="cinNumber" value={companyForm.cinNumber} onChange={handleCompanyChange} className="form-input" placeholder="Corporate Identity Number" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Status</label>
                    <select name="status" value={companyForm.status} onChange={handleCompanyChange} className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contract Details */}
              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Contract Details</span>
                </div>
                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Contract Start Date</label>
                    <input type="date" name="contractStartDate" value={companyForm.contractStartDate} onChange={handleCompanyChange} className="form-input" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Contract End Date</label>
                    <input type="date" name="contractEndDate" value={companyForm.contractEndDate} onChange={handleCompanyChange} className="form-input" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Billing Cycle</label>
                    <select name="billingCycle" value={companyForm.billingCycle} onChange={handleCompanyChange} className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>
                      <option>Monthly</option>
                      <option>Quarterly</option>
                      <option>Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Payment Terms (Days)</label>
                    <input type="number" name="paymentTermsDays" value={companyForm.paymentTermsDays} onChange={handleCompanyChange} className="form-input" min="0" placeholder="e.g. 30" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Max Employees</label>
                    <input type="number" name="maxEmployees" value={companyForm.maxEmployees} onChange={handleCompanyChange} className="form-input" placeholder="Leave empty for unlimited" style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Module Access */}
              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "20px", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Module Access</span>
                </div>
                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 24px" }}>
                  {[
                    { name: "qsrModule", label: "Asset Management" },
                    { name: "premealModule", label: "FM e Checklist" },
                    { name: "deliveryModule", label: "Fleet Management" },
                    { name: "allowGuestBooking", label: "OJT Training" },
                  ].map(({ name, label }) => (
                    <label key={name} style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: companyForm[name] ? "#eff6ff" : "#f8fafc", transition: "background 0.15s" }}>
                      <input
                        type="checkbox"
                        name={name}
                        checked={companyForm[name]}
                        onChange={handleCompanyChange}
                        style={{ width: "15px", height: "15px", accentColor: "#3b82f6", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: companyForm[name] ? "#1d4ed8" : "#475569" }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={{ padding: "9px 22px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={companyLoading}
                  style={{ padding: "9px 26px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "none", background: companyLoading ? "#93c5fd" : "#3b82f6", color: "#fff", cursor: companyLoading ? "default" : "pointer" }}
                >
                  {companyLoading ? "Saving…" : "Add Company"}
                </button>
              </div>
            </form>
          </div>
        )}

        {nav === "dashboard" && (() => {
          const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", yearly: "Yearly" };
          const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
          const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          return (
            <div>
              {/* Header */}
              <div style={{ marginBottom: "24px" }}>
                <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Client Portal Dashboard</h1>
                <p style={{ color: "#64748b", fontSize: "14px" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>

              {/* Quick stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
                {[
                  { label: "Total Companies", value: companies.length, sub: "Registered", iconBg: "#eff6ff", iconCol: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
                  { label: "Total Assets", value: assets.length, sub: "Across all companies", iconBg: "#f0fdf4", iconCol: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg> },
                  { label: "Logsheet Entries", value: recentEntries.length, sub: "Recent submissions", iconBg: "#ede9fe", iconCol: "#7c3aed", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                  { label: "Companies Active", value: companies.filter((c) => (c.status || "Active").toLowerCase() === "active").length, sub: "Active", iconBg: "#fef3c7", iconCol: "#d97706", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: 500 }}>{s.label}</p>
                      <p style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>
                      <p style={{ color: "#64748b", fontSize: "13px", marginTop: "10px", fontWeight: 500 }}>{s.sub}</p>
                    </div>
                    <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconCol, flexShrink: 0 }}>{s.icon}</div>
                  </div>
                ))}
              </div>

              {/* Recent Filled Checklists & Logsheets (tabbed) */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Recent Fill Submissions</h2>
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[{ key: "checklists", label: "Checklists" }, { key: "logsheets", label: "Logsheets" }].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setDashboardTab(tab.key)}
                        style={{
                          padding: "5px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none",
                          background: dashboardTab === tab.key ? "#7c3aed" : "#f1f5f9",
                          color: dashboardTab === tab.key ? "#fff" : "#64748b",
                        }}
                      >{tab.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  {dashboardTab === "logsheets" ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["#","Template","Asset","Company","Period","Frequency","Filled By","Submitted"].map((h) => (
                            <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recentEntriesLoading ? (
                          <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                        ) : recentEntries.length === 0 ? (
                          <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                            No logsheets filled yet.{" "}
                            <button onClick={() => setNav("logsheets")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Go to Logsheets →</button>
                          </td></tr>
                        ) : (logsheetShowAll ? recentEntries : recentEntries.slice(0, 5)).map((e, i) => {
                          const freq = e.frequency || "daily";
                          const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                          return (
                            <tr key={e.id} onClick={() => openDetail("logsheet", e.id)}
                              style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                              onMouseEnter={(ev) => (ev.currentTarget.style.background = "#f0f9ff")}
                              onMouseLeave={(ev) => (ev.currentTarget.style.background = "")}
                            >
                              <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                              <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{e.templateName}</td>
                              <td style={{ padding: "12px 16px", color: "#475569" }}>{e.assetName || "—"}</td>
                              <td style={{ padding: "12px 16px", color: "#475569" }}>{e.companyName || "—"}</td>
                              <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>{MONTH_NAMES[(e.month || 1) - 1]} {e.year}{e.shift ? ` · Shift ${e.shift}` : ""}</td>
                              <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{FREQ_LABELS[freq] || freq}</span></td>
                              <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{e.submittedBy || "—"}</td>
                              <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{e.submittedAt ? new Date(e.submittedAt).toLocaleString() : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["#","Template","Asset","Company","Status","Filled By","Submitted"].map((h) => (
                            <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recentChecklistsLoading ? (
                          <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                        ) : recentChecklists.length === 0 ? (
                          <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                            No checklists filled yet.{" "}
                            <button onClick={() => setNav("checklists")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Go to Checklists →</button>
                          </td></tr>
                        ) : (checklistShowAll ? recentChecklists : recentChecklists.slice(0, 5)).map((c, i) => {
                          const statusColors = { completed: ["#f0fdf4","#16a34a"], partial: ["#fffbeb","#ca8a04"], pending: ["#f1f5f9","#64748b"] };
                          const [sbg, stx] = statusColors[c.status] || ["#f1f5f9","#64748b"];
                          return (
                            <tr key={c.id} onClick={() => openDetail("checklist", c.id)}
                              style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                              onMouseEnter={(ev) => (ev.currentTarget.style.background = "#f0f9ff")}
                              onMouseLeave={(ev) => (ev.currentTarget.style.background = "")}
                            >
                              <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                              <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{c.templateName}</td>
                              <td style={{ padding: "12px 16px", color: "#475569" }}>{c.assetName || "—"}</td>
                              <td style={{ padding: "12px 16px", color: "#475569" }}>{c.companyName || "—"}</td>
                              <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: sbg, color: stx, textTransform: "capitalize" }}>{c.status || "submitted"}</span></td>
                              <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{c.submittedBy || "—"}</td>
                              <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* Load More */}
                {dashboardTab === "logsheets" && !logsheetShowAll && recentEntries.length > 5 && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                    <button onClick={() => setLogsheetShowAll(true)} style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                      Load More ({recentEntries.length - 5} more)
                    </button>
                  </div>
                )}
                {dashboardTab === "checklists" && !checklistShowAll && recentChecklists.length > 5 && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                    <button onClick={() => setChecklistShowAll(true)} style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                      Load More ({recentChecklists.length - 5} more)
                    </button>
                  </div>
                )}
              </div>

              {/* ── Logsheet Issues Report ── */}
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #fecaca", overflow: "hidden", marginTop: "24px" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #fecaca", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#991b1b", margin: 0 }}>Logsheet Issues Report</h2>
                    {issuesReport.summary && (
                      <span style={{ fontSize: "12px", color: "#dc2626", background: "#fee2e2", padding: "2px 10px", borderRadius: "20px", fontWeight: 700 }}>
                        {issuesReport.summary.total || 0} flagged readings
                      </span>
                    )}
                  </div>
                  {/* Summary badges */}
                  {issuesReport.summary && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {[
                        { label: "Critical", val: issuesReport.summary.critical, bg: "#fef2f2", col: "#dc2626" },
                        { label: "High",     val: issuesReport.summary.high,     bg: "#fff7ed", col: "#ea580c" },
                        { label: "Medium",   val: issuesReport.summary.medium,   bg: "#fffbeb", col: "#ca8a04" },
                        { label: "Low",      val: issuesReport.summary.low,      bg: "#f0fdf4", col: "#16a34a" },
                      ].map((s) => (
                        <span key={s.label} style={{ fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: s.bg, color: s.col }}>
                          {s.label}: {s.val || 0}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#fef2f2" }}>
                        {["#", "Parameter / Question", "Section", "Value", "Issue Reason", "Day", "Asset", "Template", "Period", "Priority", "Submitted By"].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#991b1b", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #fecaca", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {issuesReportLoading ? (
                        <tr><td colSpan="11" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading issues…</td></tr>
                      ) : issuesReport.issues.length === 0 ? (
                        <tr><td colSpan="11" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                          No issues detected. All logsheet readings are within normal range. ✓
                        </td></tr>
                      ) : issuesReport.issues.map((iss, i) => {
                        const priorityColors = { critical: ["#fef2f2","#dc2626"], high: ["#fff7ed","#ea580c"], medium: ["#fffbeb","#ca8a04"], low: ["#f0fdf4","#16a34a"] };
                        const [pbg, ptx] = priorityColors[iss.priority] || ["#f8fafc","#64748b"];
                        return (
                          <tr key={iss.id} style={{ borderBottom: "1px solid #fef2f2", background: i % 2 === 0 ? "#fff" : "#fffbfb" }}>
                            <td style={{ padding: "10px 12px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>{iss.questionText}</div>
                              {iss.specification && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{iss.specification}</div>}
                            </td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>{iss.sectionName || "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "2px 8px", borderRadius: "4px" }}>{iss.value ?? "—"}</span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px", maxWidth: "180px" }}>{iss.issueReason || "Out of range"}</td>
                            <td style={{ padding: "10px 12px", color: "#475569", fontWeight: 600 }}>Day {iss.day}</td>
                            <td style={{ padding: "10px 12px", color: "#475569" }}>{iss.assetName || "—"}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>{iss.templateName}</td>
                            <td style={{ padding: "10px 12px", color: "#475569", whiteSpace: "nowrap" }}>{MONTH_NAMES[(iss.month || 1) - 1]} {iss.year}{iss.shift ? ` · S${iss.shift}` : ""}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px", background: pbg, color: ptx, textTransform: "capitalize" }}>{iss.priority || "medium"}</span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>{iss.submittedBy || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {issuesReport.issues.length > 0 && (
                  <div style={{ padding: "10px 20px", borderTop: "1px solid #fecaca", fontSize: "12px", color: "#991b1b", background: "#fef2f2" }}>
                    Showing {issuesReport.issues.length} flagged readings. Red cells in the grid view (View → Logsheets) show the exact day and parameter.
                  </div>
                )}
              </div>

            </div>
          );
        })()}


      </div>
    </div>
  );
};

export default CompanyPortal;
