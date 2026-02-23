import { useMemo, useState } from "react";
import ClientManagement from "./pages/ClientManagement";
import UserManagement from "./pages/UserManagement";
import logo from "./assets/catalyst-logo.svg";
import "./styles.css";

const emptyClient = {
  clientName: "",
  email: "",
  phone: "",
  state: "",
  pincode: "",
  gst: "",
  company: "",
  address: "",
  status: "Active",
};

const emptyUser = {
  fullName: "",
  email: "",
  phone: "",
  role: "",
  clientId: "",
  status: "Active",
};

function App() {
  const [activeTab, setActiveTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.clientName })),
    [clients]
  );

  const addClient = (payload) => {
    const next = { ...payload, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}` };
    setClients((prev) => [...prev, next]);
    return next;
  };

  const addUser = (payload) => {
    setUsers((prev) => [...prev, { ...payload, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}` }]);
  };

  const resetClientForm = () => ({ ...emptyClient });
  const resetUserForm = () => ({ ...emptyUser });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-spacer" />
        <img src={logo} alt="Catalyst" className="brand-logo" />
      </header>

      <div className="app-body">
        <aside className="side-panel">
          <button
            className={activeTab === "clients" ? "side-btn active" : "side-btn"}
            onClick={() => setActiveTab("clients")}
          >
            Clients
          </button>
          <button
            className={activeTab === "users" ? "side-btn active" : "side-btn"}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
        </aside>

        <main className="page">
          {activeTab === "clients" ? (
            <ClientManagement
              clients={clients}
              onAddClient={addClient}
              resetClientForm={resetClientForm}
            />
          ) : (
            <UserManagement
              clients={clients}
              users={users}
              onAddUser={addUser}
              resetUserForm={resetUserForm}
              clientOptions={clientOptions}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;