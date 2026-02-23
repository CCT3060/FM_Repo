import { useMemo, useState } from "react";

const UserManagement = ({ clients, users, onAddUser, resetUserForm, clientOptions }) => {
  const [form, setForm] = useState(resetUserForm());
  const [search, setSearch] = useState("");

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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddUser(form);
    setForm(resetUserForm());
  };

  return (
    <div className="client-page">
      <div className="page-title-block">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Users</h1>
        </div>
        <div className="capsule">Total Users: {users.length}</div>
      </div>

      <div className="client-grid">
        <div className="stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Search</span>
              <span className="card-meta">Active clients: {clients.length}</span>
            </div>
            <div className="card-body">
              <input
                className="input"
                placeholder="Find a user by name, email, or role"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Users</span>
              <span className="card-meta">{filteredUsers.length} result(s)</span>
            </div>
            <div className="list">
              {filteredUsers.length === 0 ? (
                <div className="empty">No users yet. Add your first user.</div>
              ) : (
                filteredUsers.map((u) => (
                  <div className="list-row" key={u.id}>
                    <div>
                      <div className="list-primary">{u.fullName}</div>
                      <div className="list-secondary">{u.role || ""}</div>
                    </div>
                    <div className="list-tertiary">{u.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card form-card">
          <div className="card-header">
            <span className="card-title">Add User</span>
          </div>
          <form className="card-body" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Full Name</span>
                <input
                  name="fullName"
                  placeholder="User name"
                  value={form.fullName}
                  onChange={handleChange}
                  required
                  className="input"
                />
              </label>
              <label className="field">
                <span>Email Address</span>
                <input
                  name="email"
                  type="email"
                  placeholder="user@company.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="input"
                />
              </label>
              <label className="field">
                <span>Phone Number</span>
                <input
                  name="phone"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={handleChange}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Role</span>
                <input
                  name="role"
                  placeholder="Admin / Manager / Viewer"
                  value={form.role}
                  onChange={handleChange}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Select Client</span>
                <select
                  name="clientId"
                  value={form.clientId}
                  onChange={handleChange}
                  className="input select"
                  required
                >
                  <option value="">Choose a client</option>
                  {clientOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="input select"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-btn">
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
