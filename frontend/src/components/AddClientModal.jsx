import { useState } from "react";

const AddClientModal = ({ close, saveClient }) => {
  const [form, setForm] = useState({
    clientCode: "",
    clientName: "",
    legalName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    gst: "",
    pan: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submitForm = (e) => {
    e.preventDefault();
    saveClient(form);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Add Client</h2>

        <form onSubmit={submitForm}>
          <div className="grid">
            <input
              name="clientCode"
              placeholder="Client Code"
              onChange={handleChange}
              required
            />
            <input
              name="clientName"
              placeholder="Client Name"
              onChange={handleChange}
              required
            />
            <input
              name="legalName"
              placeholder="Legal Name"
              onChange={handleChange}
            />
            <input
              name="email"
              placeholder="Email"
              onChange={handleChange}
            />
            <input
              name="phone"
              placeholder="Phone"
              onChange={handleChange}
            />
            <input
              name="address"
              placeholder="Address"
              onChange={handleChange}
            />
            <input name="city" placeholder="City" onChange={handleChange} />
            <input name="state" placeholder="State" onChange={handleChange} />
            <input name="gst" placeholder="GST" onChange={handleChange} />
            <input name="pan" placeholder="PAN" onChange={handleChange} />
          </div>

          <div className="btns">
            <button type="button" className="cancel" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="save">
              Add Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientModal;