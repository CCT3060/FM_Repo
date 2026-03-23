import { useMemo, useState } from "react";
import {
  Search, Plus, User, UserCheck, UserX,
  Mail, Building2, Edit, Trash2, X,
} from "lucide-react";

const emptyUser = { fullName: "", email: "", phone: "", role: "", clientId: "", status: "Active", password: "", confirmPassword: "" };

const UserManagement = ({ clients, users, clientOptions, onAddUser, onEditUser, onDeleteUser }) => {
  const [form, setForm] = useState(emptyUser);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.status === "Active").length;
    const inactive = users.filter((u) => u.status === "Inactive").length;
    return { total: users.length, active, inactive };
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
    );
  }, [users, search]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyUser);
    setApiError(null);
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingId(u.id);
    setForm({
      fullName: u.fullName || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "",
      clientId: String(u.clientId || ""),
      status: u.status || "Active",
      password: "",
      confirmPassword: "",
    });
    setApiError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setApiError(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setApiError(null);
    try {
      if (!editingId && (!form.password || form.password.length === 0)) {
        throw new Error("Password is required");
      }
      if (form.password !== form.confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const payload = { ...form, clientId: Number(form.clientId) };
      if (!payload.password) {
        delete payload.password;
      }
      delete payload.confirmPassword;

      if (editingId) {
        await onEditUser(editingId, payload);
      } else {
        await onAddUser(payload);
      }
      closeModal();
    } catch (err) {
      setApiError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.fullName}"?`)) return;
    try {
      await onDeleteUser(u.id);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (index) => {
    const colors = ["purple", "blue", "gray"];
    return colors[index % colors.length];
  };

  const getClientName = (clientId) => {
    const client = clients.find((c) => String(c.id) === String(clientId));
    if (!client) return "Unknown Client";
    return client.company?.trim() || client.clientName || "Unknown Client";
  };

  return (
    <div>
      <div className="page-header">
        <h1>Users Management</h1>
        <p>Manage users for all client companies</p>
      </div>

      <div className="toolbar">
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input
            className="search-input"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="add-btn" onClick={openAdd}>
          <Plus size={18} />
          Add User
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Total Users</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-icon purple"><User size={24} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Active Users</span>
            <span className="stat-value">{stats.active}</span>
          </div>
          <div className="stat-icon green"><UserCheck size={24} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Inactive Users</span>
            <span className="stat-value">{stats.inactive}</span>
          </div>
          <div className="stat-icon gray"><UserX size={24} /></div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>User Name</th>
              <th>Email</th>
              <th>Client Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "32px" }}>
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, index) => {
                const rowKey = u.id ?? `${u.email || "user"}-${index}`;
                return (
                  <tr key={rowKey}>
                    <td>
                      <div className="user-cell">
                        <div className={`avatar ${getAvatarColor(index)}`}>{getInitials(u.fullName)}</div>
                        <span className="user-name-text">{u.fullName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="icon-text"><Mail size={16} />{u.email}</div>
                    </td>
                    <td>
                      <div className="icon-text">
                        <Building2 size={16} />
                        {u.clientName || getClientName(u.clientId)}
                      </div>
                    </td>
                    <td>
                      <span className="badge role">{u.role || "User"}</span>
                    </td>
                    <td>
                      <span className={`badge status-${(u.status || "active").toLowerCase()}`}>{u.status || "Active"}</span>                    </td>
                    <td>
                      <div className="actions">
                        <button className="action-btn" title="Edit" onClick={() => openEdit(u)}>
                          <Edit size={18} />
                        </button>
                        <button className="action-btn delete" title="Delete" onClick={() => handleDelete(u)}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingId ? "Edit User" : "Add New User"}</h2>
              <button className="close-btn" onClick={closeModal}><X size={24} /></button>
            </div>

            {apiError && (
              <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
                ⚠️ {apiError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name</label>
                <input name="fullName" placeholder="John Doe" value={form.fullName}
                  onChange={handleChange} required className="form-input" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input name="email" type="email" placeholder="john@example.com" value={form.email}
                    onChange={handleChange} required className="form-input" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input name="phone" placeholder="+91 98765 43210" value={form.phone}
                    onChange={handleChange} className="form-input" />
                </div>
              </div>
              <div className="form-group">
                <label>Role</label>
                <input name="role" placeholder="Admin / Manager / User" value={form.role}
                  onChange={handleChange} className="form-input" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Password</label>
                  <input name="password" type="password" placeholder="At least 8 chars & a number" value={form.password}
                    onChange={handleChange} className="form-input" required={!editingId} />
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <input name="confirmPassword" type="password" placeholder="Re-enter password" value={form.confirmPassword}
                    onChange={handleChange} className="form-input" required={!editingId} />
                </div>
              </div>
              <div className="form-group">
                <label>Client Company</label>
                <select name="clientId" value={form.clientId} onChange={handleChange}
                  className="form-select" required>
                  <option value="">Select a client</option>
                  {clientOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="form-select">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
