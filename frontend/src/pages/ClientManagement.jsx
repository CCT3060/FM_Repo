import { useMemo, useState } from "react";
import {
  Search, Plus, Building2, CheckCircle2, XCircle,
  Mail, Phone, MapPin, Edit, Trash2, X,
} from "lucide-react";

const emptyClient = {
  clientName: "", email: "", phone: "", state: "",
  pincode: "", gst: "", company: "", address: "", status: "Active",
};

const ClientManagement = ({ clients, onAddClient, onEditClient, onDeleteClient }) => {
  const [form, setForm] = useState(emptyClient);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = Add mode, id = Edit mode
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === "Active").length;
    const inactive = clients.filter((c) => c.status === "Inactive").length;
    return { total: clients.length, active, inactive };
  }, [clients]);

  const getDisplayName = (client) => {
    const name = client?.clientName?.trim();
    return name || "Unnamed Client";
  };

  const filteredClients = useMemo(() => {
    const term = search.toLowerCase();
    return clients.filter((c) => {
      if (!term) return true;
      const label = getDisplayName(c).toLowerCase();
      return (
        label.includes(term) ||
        c.email?.toLowerCase().includes(term)
      );
    });
  }, [clients, search]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyClient);
    setApiError(null);
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const openEdit = (c) => {
    const resolvedName = (c.clientName || c.client_name || c.company || c.company_name || "").trim();
    setEditingId(c.id);
    setForm({
      clientName: resolvedName,
      email: c.email || "",
      phone: c.phone || "",
      state: c.state || c.state_name || "",
      pincode: c.pincode || "",
      gst: c.gst || c.gst_number || "",
      company: c.company || c.company_name || "",
      address: c.address || "",
      status: c.status || "Active",
    });
    setApiError(null);
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setApiError(null);
    setFieldErrors({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!form.clientName.trim()) errors.clientName = "Client name is required.";
    if (!form.email.trim()) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "Enter a valid email address.";
    }
    if (form.phone && !/^\d{10,15}$/.test(form.phone.replace(/[\s\-+()]/g, ""))) {
      errors.phone = "Enter a valid phone number (10–15 digits).";
    }
    if (form.pincode && !/^\d{4,10}$/.test(form.pincode)) {
      errors.pincode = "Enter a valid pincode.";
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      if (editingId) {
        await onEditClient(editingId, form);
      } else {
        await onAddClient(form);
      }
      closeModal();
    } catch (err) {
      setApiError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete "${getDisplayName(c)}"? This will also remove all linked users.`)) return;
    try {
      await onDeleteClient(c.id);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Clients Management</h1>
        <p>Manage all client companies in the system</p>
      </div>

      <div className="toolbar">
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input
            className="search-input"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="add-btn" onClick={openAdd}>
          <Plus size={18} />
          Add Client
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Total Clients</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-icon blue"><Building2 size={24} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Active Clients</span>
            <span className="stat-value">{stats.active}</span>
          </div>
          <div className="stat-icon green"><CheckCircle2 size={24} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Inactive Clients</span>
            <span className="stat-value">{stats.inactive}</span>
          </div>
          <div className="stat-icon gray"><XCircle size={24} /></div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Contact Info</th>
              <th>Address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "32px" }}>
                  No clients found.
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar gray"><Building2 size={18} /></div>
                      <span className="user-name-text">{getDisplayName(c)}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div className="icon-text"><Mail size={14} />{c.email || "N/A"}</div>
                      <div className="icon-text"><Phone size={14} />{c.phone || "N/A"}</div>
                    </div>
                  </td>
                  <td>
                    <div className="icon-text">
                      <MapPin size={14} style={{ flexShrink: 0 }} />
                      <span style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.address || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge status-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="action-btn" title="Edit" onClick={() => openEdit(c)}>
                        <Edit size={18} />
                      </button>
                      <button className="action-btn delete" title="Delete" onClick={() => handleDelete(c)}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingId ? "Edit Client" : "Add New Client"}</h2>
              <button className="close-btn" onClick={closeModal}><X size={24} /></button>
            </div>

            {apiError && (
              <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>
                ⚠️ {apiError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Client Name <span style={{ color: "#ef4444" }}>*</span></label>
                <input name="clientName" placeholder="Acme Corporation" value={form.clientName}
                  onChange={handleChange} className={`form-input${fieldErrors.clientName ? " input-error" : ""}`} />
                {fieldErrors.clientName && <span className="field-error">{fieldErrors.clientName}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Email Address <span style={{ color: "#ef4444" }}>*</span></label>
                  <input name="email" type="email" placeholder="contact@acme.com" value={form.email}
                    onChange={handleChange} className={`form-input${fieldErrors.email ? " input-error" : ""}`} />
                  {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input name="phone" placeholder="+1 (555) 123-4567" value={form.phone}
                    onChange={handleChange} className={`form-input${fieldErrors.phone ? " input-error" : ""}`} />
                  {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Company Name</label>
                  <input name="company" placeholder="Acme Ltd." value={form.company}
                    onChange={handleChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label>GST Number</label>
                  <input name="gst" placeholder="22AAAAA0000A1Z5" value={form.gst}
                    onChange={handleChange} className="form-input" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>State</label>
                  <input name="state" placeholder="Maharashtra" value={form.state}
                    onChange={handleChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label>Pincode</label>
                  <input name="pincode" placeholder="400001" value={form.pincode}
                    onChange={handleChange} className={`form-input${fieldErrors.pincode ? " input-error" : ""}`} />
                  {fieldErrors.pincode && <span className="field-error">{fieldErrors.pincode}</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input name="address" placeholder="123 Business St, Suite 100" value={form.address}
                  onChange={handleChange} className="form-input" />
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
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientManagement;