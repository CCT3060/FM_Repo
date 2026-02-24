import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { Building2, Users, LogOut } from "lucide-react";
import logo from "./images/image.png";
import ClientManagement from "./pages/ClientManagement";
import UserManagement from "./pages/UserManagement";
import CompanyPortal from "./pages/CompanyPortal";
import "./styles.css";
import {
  getClients, createClient, updateClient, deleteClient,
  getUsers, createUser, updateUser, deleteUser,
} from "./api";

const AdminShell = () => {
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
    () => clients.map((c) => ({ value: c.id, label: c.clientName })),
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
          <button className="logout-btn" onClick={() => navigate("/client")}>Client Portal</button>
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
  return (
    <Routes>
      <Route path="/client" element={<CompanyPortal />} />
      <Route path="/company" element={<Navigate to="/client" replace />} />
      <Route path="*" element={<AdminShell />} />
    </Routes>
  );
}

export default App;