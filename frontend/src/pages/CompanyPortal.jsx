import { useEffect, useMemo, useState } from "react";
import {
  login,
  getCompanies,
  createCompany,
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
} from "../api";
import ChecklistBuilder from "../components/ChecklistBuilder";

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
  const [nav, setNav] = useState("dashboard");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [assets, setAssets] = useState([]);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
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
          a.room?.toLowerCase().includes(term)
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
      const companyId = selectedCompanyId || companies[0]?.id;
      if (companyId) {
        loadAssets(token, companyId).catch(() => {});
        setAssetForm((prev) => ({ ...prev, companyId }));
      }
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
    if (token && (nav === "assets" || nav === "departments")) {
      const companyId = selectedCompanyId || companies[0]?.id;
      if (companyId) {
        loadDepartments(token, companyId).catch(() => {});
        setDepartmentForm((prev) => ({ ...prev, companyId }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav, selectedCompanyId, companies]);

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
      <aside className="client-side-panel">
        <div className="client-side-header">
          <div className="client-avatar">CP</div>
          <div>
            <div className="client-side-title">Client Portal</div>
            <div className="client-side-sub">Manage companies</div>
          </div>
        </div>
        <nav className="client-side-nav">
          <button className={nav === "dashboard" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("dashboard"); setShowAddForm(false); }}>Dashboard</button>
          <button className={nav === "companies" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("companies"); setShowAddForm(false); }}>Companies</button>
          <button className={nav === "departments" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("departments"); setShowAddForm(false); }}>Departments</button>
          <button className={nav === "assets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("assets"); setShowAddForm(false); }}>Assets</button>
          <button className={nav === "checklists" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("checklists"); setShowAddForm(false); }}>Checklists</button>
          <button className={nav === "logsheets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("logsheets"); setShowAddForm(false); }}>Logsheets</button>
          <button className="client-side-item" disabled>Contacts</button>
          <button className="client-side-item" disabled>Documents</button>
        </nav>
        <div className="client-side-footer">
          <button className="client-side-item" disabled>Settings</button>
          <button className="client-side-item" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <div className="page client-main-area">
        {nav === "companies" && !showAddForm && (
          <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1>Companies</h1>
              <p>View all companies and their status.</p>
            </div>
            <button className="pill-btn" type="button" onClick={() => setShowAddForm(true)}>+ Add Company</button>
          </div>
        )}

        {nav === "dashboard" && (
          <div className="page-header">
            <h1>Client Portal</h1>
            <p>Create companies, onboard their users and departments, and view company details.</p>
          </div>
        )}

        {companyError && (
          <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
            ⚠️ {companyError}
          </div>
        )}

        {assetError && nav === "assets" && (
          <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
            ⚠️ {assetError}
          </div>
        )}

        {nav === "companies" && !showAddForm && (
          <div className="card" style={{ padding: "16px" }}>
            <div className="company-list-toolbar">
              <div className="search-container" style={{ width: "100%" }}>
                <input
                  className="search-input"
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: "12px" }}
                />
              </div>
              <div className="company-filters">
                <button className={statusFilter === "all" ? "filter-chip active" : "filter-chip"} onClick={() => setStatusFilter("all")} type="button">All Companies</button>
                <button className={statusFilter === "active" ? "filter-chip active" : "filter-chip"} onClick={() => setStatusFilter("active")} type="button">Active</button>
                <button className={statusFilter === "pending" ? "filter-chip active" : "filter-chip"} onClick={() => setStatusFilter("pending")} type="button">Pending</button>
                <button className={statusFilter === "inactive" ? "filter-chip active" : "filter-chip"} onClick={() => setStatusFilter("inactive")} type="button">Inactive</button>
              </div>
            </div>

            <div className="company-card-list">
              {filteredCompanies.length === 0 ? (
                <div className="empty-state">{companyLoading ? "Loading…" : "No companies yet."}</div>
              ) : (
                filteredCompanies.map((c) => (
                  <div className="company-card" key={c.id}>
                    <div className="company-card-avatar">{c.companyName?.slice(0, 2).toUpperCase() || "CO"}</div>
                    <div className="company-card-body">
                      <div className="company-card-row">
                        <div className="company-card-name">{c.companyName}</div>
                        <span className={`status-pill ${(c.status || "Active").toLowerCase()}`}>{c.status || "Active"}</span>
                      </div>
                      <div className="company-card-sub">{c.description || "No description"}</div>
                    </div>
                    <button className="company-card-action" title="View" onClick={() => setSelectedCompanyId(c.id)}>›</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {nav === "assets" && (
          <>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1>Assets</h1>
                <p>Manage assets across Soft, Technical, and Fleet categories.</p>
              </div>
              <button
                className="pill-btn"
                type="button"
                onClick={() => {
                  const defaultCompany = selectedCompanyId || companies[0]?.id || "";
                  setAssetForm({ ...emptyAsset, companyId: defaultCompany });
                  setEditingAssetId(null);
                  setShowAssetModal(true);
                }}
                disabled={!companies.length}
              >
                + Add Asset
              </button>
            </div>

            <div className="card" style={{ padding: "12px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Asset Type Master</h3>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Create reusable asset types for consistent data.</p>
                </div>
                <div style={{ fontSize: "13px", color: "#94a3b8" }}>Total types: {assetTypes.length || 3}</div>
              </div>
              <form onSubmit={handleCreateAssetType} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", alignItems: "end" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Type Code</label>
                  <input className="form-input" value={assetTypeDraft.code} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, code: e.target.value })} placeholder="e.g. kitchen" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Type Label</label>
                  <input className="form-input" value={assetTypeDraft.label} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, label: e.target.value })} placeholder="Kitchen Equipment" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Category (optional)</label>
                  <input className="form-input" value={assetTypeDraft.category} onChange={(e) => setAssetTypeDraft({ ...assetTypeDraft, category: e.target.value })} placeholder="Grouping or module" />
                </div>
                <button type="submit" className="pill-btn" style={{ height: "40px" }} disabled={assetLoading}>
                  {assetLoading ? "Saving…" : "Add Type"}
                </button>
              </form>
            </div>

            <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
              <div className="company-list-toolbar" style={{ gap: "12px" }}>
                <div className="search-container" style={{ width: "100%" }}>
                  <input
                    className="search-input"
                    placeholder="Search assets..."
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    style={{ paddingLeft: "12px" }}
                  />
                </div>
                <div className="company-filters" style={{ flexWrap: "wrap" }}>
                  <button className={assetTypeFilter === "all" ? "filter-chip active" : "filter-chip"} onClick={() => setAssetTypeFilter("all")} type="button">All</button>
                  {(assetTypes.length ? assetTypes : [
                    { code: "soft", label: "Soft Services" },
                    { code: "technical", label: "Technical" },
                    { code: "fleet", label: "Fleet" },
                  ]).map((t) => (
                    <button key={t.code} className={assetTypeFilter === t.code ? "filter-chip active" : "filter-chip"} onClick={() => setAssetTypeFilter(t.code)} type="button">{t.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="asset-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "10px" }}>Asset Name</th>
                      <th style={{ padding: "10px" }}>Type</th>
                      <th style={{ padding: "10px" }}>Company</th>
                      <th style={{ padding: "10px" }}>Department</th>
                      <th style={{ padding: "10px" }}>Location</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px" }}>Created</th>
                      <th style={{ padding: "10px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.length === 0 ? (
                      <tr><td colSpan="7" style={{ padding: "12px", color: "#94a3b8" }}>{assetLoading ? "Loading…" : "No assets yet."}</td></tr>
                    ) : (
                      filteredAssets.map((a) => (
                        <tr key={a.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px" }}>{a.assetName}</td>
                          <td style={{ padding: "10px" }}>{assetTypeLabelMap[a.assetType] || assetTypeLabels[a.assetType] || a.assetType}</td>
                          <td style={{ padding: "10px" }}>{a.companyName || ""}</td>
                          <td style={{ padding: "10px" }}>{a.departmentName || "—"}</td>
                          <td style={{ padding: "10px" }}>{[a.building, a.floor, a.room].filter(Boolean).join(", ") || "—"}</td>
                          <td style={{ padding: "10px" }}><span className={`status-pill ${(a.status || "Active").toLowerCase()}`}>{a.status || "Active"}</span></td>
                          <td style={{ padding: "10px" }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</td>
                          <td style={{ padding: "10px", display: "flex", gap: "8px" }}>
                            <button className="pill-btn" type="button" onClick={() => handleEditAsset(a)} style={{ padding: "6px 10px" }}>Edit</button>
                            <button className="btn-cancel" type="button" onClick={() => handleDeleteAsset(a.id)} style={{ padding: "6px 10px" }}>Delete</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {showAssetModal && (
              <div className="card" style={{ padding: "20px", marginBottom: "16px" }}>
                <div className="page-header" style={{ marginBottom: "12px" }}>
                  <h3 style={{ marginBottom: "4px" }}>{editingAssetId ? "Edit Asset" : "Add Asset"}</h3>
                  <p style={{ margin: 0 }}>Fill in details based on the selected asset category.</p>
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

                  <div className="form-section" style={{ marginBottom: "12px" }}>
                    <h3 style={{ marginBottom: "8px" }}>Location</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                      <div className="form-group"><label>Building</label><input name="building" value={assetForm.building} onChange={handleAssetChange} className="form-input" /></div>
                      <div className="form-group"><label>Floor</label><input name="floor" value={assetForm.floor} onChange={handleAssetChange} className="form-input" /></div>
                      <div className="form-group"><label>Room/Area</label><input name="room" value={assetForm.room} onChange={handleAssetChange} className="form-input" /></div>
                    </div>
                  </div>

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

                  <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                    <button type="button" className="btn-cancel" onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }}>Cancel</button>
                    <button type="submit" className="btn-submit" disabled={assetLoading}>{assetLoading ? "Saving…" : editingAssetId ? "Update Asset" : "Add Asset"}</button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        {nav === "departments" && (
          <>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1>Departments</h1>
                <p>Create and manage company departments.</p>
              </div>
            </div>

            {departmentError && (
              <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
                ⚠️ {departmentError}
              </div>
            )}

            <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
              <form onSubmit={handleCreateDepartment}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label>Company</label>
                    <select
                      name="companyId"
                      value={departmentForm.companyId || selectedCompanyId || companies[0]?.id || ""}
                      onChange={handleDepartmentChange}
                      className="form-select"
                      required
                    >
                      <option value="" disabled>Select company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Department Name</label>
                    <input
                      name="name"
                      value={departmentForm.name}
                      onChange={handleDepartmentChange}
                      className="form-input"
                      placeholder="Housekeeping, HVAC, Pantry"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input
                    name="description"
                    value={departmentForm.description}
                    onChange={handleDepartmentChange}
                    className="form-input"
                    placeholder="Optional notes"
                  />
                </div>
                <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                  <button type="submit" className="btn-submit" disabled={departmentLoading}>
                    {departmentLoading ? "Saving…" : "Add Department"}
                  </button>
                </div>
              </form>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div className="company-list-toolbar" style={{ marginBottom: "12px" }}>
                <div className="search-container" style={{ width: "100%" }}>
                  <input
                    className="search-input"
                    placeholder="Search departments..."
                    value={departmentSearch}
                    onChange={(e) => setDepartmentSearch(e.target.value)}
                    style={{ paddingLeft: "12px" }}
                  />
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="asset-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "10px" }}>Department</th>
                      <th style={{ padding: "10px" }}>Company</th>
                      <th style={{ padding: "10px" }}>Description</th>
                      <th style={{ padding: "10px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepartments.length === 0 ? (
                      <tr><td colSpan="4" style={{ padding: "12px", color: "#94a3b8" }}>{departmentLoading ? "Loading…" : "No departments yet."}</td></tr>
                    ) : (
                      filteredDepartments.map((d) => (
                        <tr key={d.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px" }}>{d.name}</td>
                          <td style={{ padding: "10px" }}>{d.companyName || companies.find((c) => String(c.id) === String(d.companyId))?.companyName || ""}</td>
                          <td style={{ padding: "10px" }}>{d.description || "—"}</td>
                          <td style={{ padding: "10px", display: "flex", gap: "8px" }}>
                            <button className="btn-cancel" type="button" onClick={() => handleDeleteDepartment(d.id)} style={{ padding: "6px 10px" }}>Delete</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {nav === "checklists" && (
          <ChecklistBuilder token={token} assets={assets} users={portalUsers} />
        )}

        {nav === "logsheets" && (
          <>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1>Asset Logs</h1>
                <p>Quick notes per asset.</p>
              </div>
            </div>

            {logError && (
              <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
                ⚠️ {logError}
              </div>
            )}

            <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
              <form onSubmit={handleCreateLog}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
                  <div className="form-group">
                    <label>Asset</label>
                    <select name="assetId" value={logForm.assetId} onChange={handleLogChange} className="form-select" required>
                      <option value="" disabled>Select asset</option>
                      {assetOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.assetName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <input name="note" value={logForm.note} onChange={handleLogChange} className="form-input" placeholder="Enter a note" />
                  </div>
                </div>
                <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                  <button type="submit" className="btn-submit">Save Log</button>
                </div>
              </form>
            </div>

            <div className="card" style={{ padding: "16px" }}>
              <div className="page-header" style={{ marginBottom: "8px" }}>
                <h3 style={{ marginBottom: "4px" }}>Recent Logs</h3>
                <p style={{ margin: 0 }}>Latest entries for the selected asset.</p>
              </div>
              {logs.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No logs yet for this asset.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {logs.map((l) => (
                    <div key={l.id} style={{ border: "1px solid #e2e8f0", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{l.note}</div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}</div>
                      </div>
                      <button className="btn-cancel" type="button" onClick={() => handleDeleteLog(l.id)} style={{ padding: "6px 10px" }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {nav === "companies" && showAddForm && (
          <form onSubmit={handleCreateCompany} className="card" style={{ padding: "20px", marginBottom: "16px" }}>
            <div className="form-group">
              <label>Company Name</label>
              <input
                name="companyName"
                value={companyForm.companyName}
                onChange={handleCompanyChange}
                className="form-input"
                placeholder="Acme Foods Pvt Ltd"
              />
            </div>

            <div className="form-group">
              <label>Company Code (for login)</label>
              <input
                name="companyCode"
                value={companyForm.companyCode}
                onChange={handleCompanyChange}
                className="form-input"
                placeholder="Unique code e.g. ACME2024"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                name="description"
                value={companyForm.description}
                onChange={handleCompanyChange}
                className="form-input"
                placeholder="Short description"
              />
            </div>

            <div className="form-section" style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "12px" }}>Address Information</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label>Address Line 1</label>
                  <input name="addressLine1" value={companyForm.addressLine1} onChange={handleCompanyChange} className="form-input" placeholder="Street address" />
                </div>
                <div className="form-group">
                  <label>Address Line 2</label>
                  <input name="addressLine2" value={companyForm.addressLine2} onChange={handleCompanyChange} className="form-input" placeholder="Building, floor, etc." />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input name="city" value={companyForm.city} onChange={handleCompanyChange} className="form-input" placeholder="City" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input name="state" value={companyForm.state} onChange={handleCompanyChange} className="form-input" placeholder="State" />
                </div>
                <div className="form-group">
                  <label>Country</label>
                  <input name="country" value={companyForm.country} onChange={handleCompanyChange} className="form-input" placeholder="Country" />
                </div>
                <div className="form-group">
                  <label>Pincode</label>
                  <input name="pincode" value={companyForm.pincode} onChange={handleCompanyChange} className="form-input" placeholder="Postal code" />
                </div>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "12px" }}>Business Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label>GST Number</label>
                  <input name="gstNumber" value={companyForm.gstNumber} onChange={handleCompanyChange} className="form-input" placeholder="22AAAAA0000A1Z5" />
                </div>
                <div className="form-group">
                  <label>PAN Number</label>
                  <input name="panNumber" value={companyForm.panNumber} onChange={handleCompanyChange} className="form-input" placeholder="AAAAA0000A" />
                </div>
                <div className="form-group">
                  <label>CIN Number</label>
                  <input name="cinNumber" value={companyForm.cinNumber} onChange={handleCompanyChange} className="form-input" placeholder="Corporate Identity Number" />
                </div>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "12px" }}>Contract Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label>Contract Start Date</label>
                  <input type="date" name="contractStartDate" value={companyForm.contractStartDate} onChange={handleCompanyChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label>Contract End Date</label>
                  <input type="date" name="contractEndDate" value={companyForm.contractEndDate} onChange={handleCompanyChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label>Billing Cycle</label>
                  <select name="billingCycle" value={companyForm.billingCycle} onChange={handleCompanyChange} className="form-select">
                    <option>Monthly</option>
                    <option>Quarterly</option>
                    <option>Yearly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Payment Terms (Days)</label>
                  <input type="number" name="paymentTermsDays" value={companyForm.paymentTermsDays} onChange={handleCompanyChange} className="form-input" min="0" />
                </div>
                <div className="form-group">
                  <label>Max Employees</label>
                  <input type="number" name="maxEmployees" value={companyForm.maxEmployees} onChange={handleCompanyChange} className="form-input" placeholder="Leave empty for unlimited" />
                </div>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "12px" }}>Module Access</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" name="qsrModule" checked={companyForm.qsrModule} onChange={handleCompanyChange} />
                  <span>Asset Management</span>
                </label>
                <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" name="premealModule" checked={companyForm.premealModule} onChange={handleCompanyChange} />
                  <span>FM e Checklist</span>
                </label>
                <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" name="deliveryModule" checked={companyForm.deliveryModule} onChange={handleCompanyChange} />
                  <span>Fleet Management</span>
                </label>
                <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" name="allowGuestBooking" checked={companyForm.allowGuestBooking} onChange={handleCompanyChange} />
                  <span>OJT Training</span>
                </label>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="btn-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-submit" disabled={companyLoading}>
                {companyLoading ? "Saving…" : "Add Company"}
              </button>
            </div>
          </form>
        )}

        {nav === "dashboard" && (
          <div className="card" style={{ padding: "20px" }}>
            <p style={{ color: "#64748b" }}>Select Companies from the left menu to view and add companies.</p>
          </div>
        )}

        {nav === "companies" && !showAddForm && (
          <div className="card" style={{ padding: "16px", marginTop: "16px" }}>
            <div className="page-header" style={{ marginBottom: "12px" }}>
              <h3 style={{ marginBottom: "4px" }}>Company Details</h3>
              <p style={{ margin: 0 }}>View the full profile for the selected company.</p>
            </div>
            {!selectedCompany ? (
              <p style={{ color: "#94a3b8" }}>Select a company to view details.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", fontSize: "14px" }}>
                <div><strong>Company</strong><div>{selectedCompany.companyName}</div></div>
                <div><strong>Company Code</strong><div>{selectedCompany.companyCode || "—"}</div></div>
                <div><strong>Address</strong><div>{selectedCompany.addressLine1 || "—"}</div><div>{selectedCompany.addressLine2}</div><div>{[selectedCompany.city, selectedCompany.state, selectedCompany.country].filter(Boolean).join(", ")}</div><div>{selectedCompany.pincode}</div></div>
                <div><strong>GST</strong><div>{selectedCompany.gstNumber || "—"}</div></div>
                <div><strong>PAN</strong><div>{selectedCompany.panNumber || "—"}</div></div>
                <div><strong>CIN</strong><div>{selectedCompany.cinNumber || "—"}</div></div>
                <div><strong>Billing Cycle</strong><div>{selectedCompany.billingCycle || "—"}</div></div>
                <div><strong>Payment Terms</strong><div>{selectedCompany.paymentTermsDays ? `${selectedCompany.paymentTermsDays} days` : "—"}</div></div>
                <div><strong>Max Employees</strong><div>{selectedCompany.maxEmployees || "Unlimited"}</div></div>
                <div><strong>Modules</strong><div>{[selectedCompany.qsrModule && "Asset Management", selectedCompany.premealModule && "FM e Checklist", selectedCompany.deliveryModule && "Fleet Management", selectedCompany.allowGuestBooking && "OJT Training"].filter(Boolean).join(", ") || "None"}</div></div>
                <div><strong>Status</strong><div>{selectedCompany.status || "Active"}</div></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyPortal;
