import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { Building2, Users, LogOut } from "lucide-react";
import logo from "./images/image.png";
import ClientManagement from "./pages/ClientManagement";
import UserManagement from "./pages/UserManagement";
import CompanyPortal from "./pages/CompanyPortal";
import CompanyLogin from "./pages/CompanyLogin";
import CompanyEmployeePortal from "./pages/CompanyEmployeePortal";
import AssetScanPage from "./pages/AssetScanPage";
import SubmissionsPage from "./pages/SubmissionsPage";
import "./styles.css";
import {
  getClients, createClient, updateClient, deleteClient,
  getUsers, createUser, updateUser, deleteUser,
} from "./api";

const ROOT_AUTH_KEY = "root_portal_auth";
const ROOT_CREDENTIALS = {
  username: "rootadmin",
  password: "Root@12345",
};

const RootLogin = ({ onLogin }) => {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      form.username.trim() === ROOT_CREDENTIALS.username &&
      form.password === ROOT_CREDENTIALS.password
    ) {
      onLogin();
      return;
    }
    setError("Invalid username or password");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "20px" }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: "420px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "28px" }}>
        <div style={{ textAlign: "center", marginBottom: "18px" }}>
          <img src={logo} alt="Catalyst" style={{ height: "44px", objectFit: "contain", marginBottom: "10px" }} />
          <h2 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>Root Portal Login</h2>
        </div>
        {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px", marginBottom: "12px", fontSize: "13px" }}>{error}</div>}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", color: "#475569", fontWeight: 600 }}>Username</label>
          <input
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            className="form-input"
            placeholder="Enter username"
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", color: "#475569", fontWeight: 600 }}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            className="form-input"
            placeholder="Enter password"
          />
        </div>
        <button type="submit" className="btn-submit" style={{ width: "100%" }}>Login</button>
      </form>
    </div>
  );
};

const AdminShell = ({ onSignOut }) => {
  const [activeTab, setActiveTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getClients(), getUsers()])
      .then(([c, u]) => {
        setClients(c);
        setUsers(u);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: c.clientName?.trim() || "Unnamed Client",
      })),
    [clients]
  );

  const handleAddClient = async (data) => {
    const created = await createClient(data);
    setClients((prev) => [created, ...prev]);
  };

  const handleEditClient = async (id, data) => {
    const updated = await updateClient(id, data);
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleDeleteClient = async (id) => {
    await deleteClient(id);
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddUser = async (data) => {
    const created = await createUser(data);
    setUsers((prev) => [created, ...prev]);
  };

  const handleEditUser = async (id, data) => {
    const updated = await updateUser(id, data);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  };

  const handleDeleteUser = async (id) => {
    await deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <div className="brand-section" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          <img src={logo} alt="Catalyst" className="brand-logo" />
        </div>

        <div style={{ padding: "8px 16px 4px", fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Root Portal
        </div>

        <nav className="side-nav">
          <button
            className={activeTab === "clients" ? "side-btn active" : "side-btn"}
            onClick={() => setActiveTab("clients")}
          >
            <Building2 size={20} />
            <span>Clients</span>
          </button>
          <button
            className={activeTab === "users" ? "side-btn active" : "side-btn"}
            onClick={() => setActiveTab("users")}
          >
            <Users size={20} />
            <span>Users</span>
          </button>
        </nav>

        <div className="user-profile-section">
          <div className="user-avatar">RA</div>
          <div className="user-info">
            <p className="user-name">Root Admin</p>
            <p className="user-email">admin@root.com</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginLeft: "auto" }}>
            <button className="logout-btn" onClick={() => navigate("/client")}>Client Portal</button>
            <button className="logout-btn" onClick={onSignOut} style={{ background: "#fee2e2", color: "#b91c1c" }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className="page">
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#f87171" }}>
            ⚠️ {error}
          </div>
        ) : activeTab === "clients" ? (
          <ClientManagement
            clients={clients}
            onAddClient={handleAddClient}
            onEditClient={handleEditClient}
            onDeleteClient={handleDeleteClient}
          />
        ) : (
          <UserManagement
            clients={clients}
            users={users}
            clientOptions={clientOptions}
            onAddUser={handleAddUser}
            onEditUser={handleEditUser}
            onDeleteUser={handleDeleteUser}
          />
        )}
      </main>
    </div>
  );
};

function App() {
  const [isRootAuthed, setIsRootAuthed] = useState(() => localStorage.getItem(ROOT_AUTH_KEY) === "1");

  const handleRootLogin = () => {
    localStorage.setItem(ROOT_AUTH_KEY, "1");
    setIsRootAuthed(true);
  };

  const handleRootSignOut = () => {
    localStorage.removeItem(ROOT_AUTH_KEY);
    setIsRootAuthed(false);
  };

  return (
    <Routes>
      <Route path="/root-login" element={isRootAuthed ? <Navigate to="/" replace /> : <RootLogin onLogin={handleRootLogin} />} />
      <Route path="/client" element={<CompanyPortal />} />
      <Route path="/company" element={<CompanyLogin />} />
      <Route path="/company/portal/*" element={<CompanyEmployeePortal />} />
      <Route path="/company/submissions" element={<SubmissionsPage />} />
      <Route path="/asset-scan/:assetId" element={<AssetScanPage />} />
      <Route path="*" element={isRootAuthed ? <AdminShell onSignOut={handleRootSignOut} /> : <Navigate to="/root-login" replace />} />
    </Routes>
  );
}

export default App;