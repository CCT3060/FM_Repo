import { useMemo, useState } from "react";

const ClientManagement = ({ clients, onAddClient, resetClientForm }) => {
  const [form, setForm] = useState(resetClientForm());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === "Active").length;
    const inactive = clients.filter((c) => c.status === "Inactive").length;
    return {
      total: clients.length,
      active,
      inactive,
    };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const term = search.toLowerCase();
    return clients.filter((c) => {
      const matchesSearch = term
        ? c.clientName?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.company?.toLowerCase().includes(term)
        : true;
      const matchesStatus =
        statusFilter === "all" ? true : c.status === (statusFilter === "active" ? "Active" : "Inactive");
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = { ...form };
    onAddClient(next);
    setForm(resetClientForm());
  };

  return (
    <div className="client-page">
      <div className="page-title-block">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Clients</h1>
        </div>
      </div>

      <div className="stat-grid">
        <button
          type="button"
          className={statusFilter === "all" ? "stat-card active" : "stat-card"}
          onClick={() => setStatusFilter("all")}
        >
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Clients</div>
        </button>
        <button
          type="button"
          className={statusFilter === "active" ? "stat-card active" : "stat-card"}
          onClick={() => setStatusFilter("active")}
        >
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active Clients</div>
        </button>
        <button
          type="button"
          className={statusFilter === "inactive" ? "stat-card active" : "stat-card"}
          onClick={() => setStatusFilter("inactive")}
        >
          <div className="stat-value">{stats.inactive}</div>
          <div className="stat-label">Inactive Clients</div>
        </button>
      </div>

      <div className="client-grid">
        <div className="stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Search</span>
            </div>
            <div className="card-body">
              <input
                className="input"
                placeholder="Type a name, email, or company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Clients</span>
              <span className="card-meta">{filteredClients.length} result(s)</span>
            </div>
            <div className="list">
              {filteredClients.length === 0 ? (
                <div className="empty">No clients yet. Add your first client.</div>
              ) : (
                filteredClients.map((c) => (
                  <div className="list-row" key={c.id}>
                    <div>
                      <div className="list-primary">{c.clientName}</div>
                      <div className="list-secondary">{c.company || "—"}</div>
                    </div>
                    <div className="list-tertiary">{c.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card form-card">
          <div className="card-header">
            <span className="card-title">Add Client</span>
          </div>
          <form className="card-body" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Client Name</span>
                <input
                  name="clientName"
                  placeholder="Client name"
                  value={form.clientName}
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
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={handleChange}
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
                <span>State Name</span>
                <input
                  name="state"
                  placeholder="State"
                  value={form.state}
                  onChange={handleChange}
                  className="input"
                />
              </label>
              <label className="field">
                <span>GST Number</span>
                <input
                  name="gst"
                  placeholder="22AAAAA0000A1Z5"
                  value={form.gst}
                  onChange={handleChange}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Pincode</span>
                <input
                  name="pincode"
                  placeholder="560001"
                  value={form.pincode}
                  onChange={handleChange}
                  className="input"
                />
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
              <label className="field">
                <span>Company Name</span>
                <input
                  name="company"
                  placeholder="Company name"
                  value={form.company}
                  onChange={handleChange}
                  className="input"
                />
              </label>
              <label className="field span-2">
                <span>Address</span>
                <textarea
                  name="address"
                  placeholder="Street, city, and country"
                  value={form.address}
                  onChange={handleChange}
                  className="input textarea"
                  rows={3}
                />
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

export default ClientManagement;