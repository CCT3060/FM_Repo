/**
 * SearchableSelect — a lightweight combobox that replaces plain <select>.
 *
 * Props:
 *  value       – current value (string | number | "")
 *  onChange    – (value: string) => void
 *  options     – [{ value, label }]
 *  placeholder – text shown when nothing selected
 *  disabled    – boolean
 *  required    – boolean (adds red asterisk to label if used via FSearchableSelect)
 *  style       – container div style override
 *  inputStyle  – override on the input element
 */

import { useEffect, useRef, useState } from "react";

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  disabled = false,
  style = {},
  inputStyle = {},
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));
  const filtered = options.filter(
    (o) =>
      !search ||
      String(o.label)
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (opt) => {
    onChange(String(opt.value));
    setOpen(false);
    setSearch("");
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = containerRef.current?.querySelectorAll("[data-opt]");
      if (items?.[0]) items[0].focus();
    }
  };

  const handleItemKeyDown = (e, opt, idx) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(opt); }
    if (e.key === "Escape") { setOpen(false); setSearch(""); inputRef.current?.focus(); }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = containerRef.current?.querySelectorAll("[data-opt]");
      if (items?.[idx + 1]) items[idx + 1].focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const items = containerRef.current?.querySelectorAll("[data-opt]");
      if (idx === 0) inputRef.current?.focus();
      else if (items?.[idx - 1]) items[idx - 1].focus();
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      {/* Trigger input */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          readOnly={!open}
          value={open ? search : (selected?.label ?? "")}
          placeholder={placeholder}
          disabled={disabled}
          onClick={() => { if (!disabled) { setOpen(true); setSearch(""); setTimeout(() => inputRef.current?.select(), 0); } }}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onKeyDown={handleInputKeyDown}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 32px 8px 11px",
            border: "1px solid #e2e8f0",
            borderRadius: "7px",
            fontSize: "13.5px",
            background: disabled ? "#f8fafc" : "#fff",
            cursor: disabled ? "not-allowed" : "pointer",
            outline: "none",
            color: open && !search && !selected ? "#94a3b8" : "#0f172a",
            ...inputStyle,
          }}
          autoComplete="off"
        />
        {/* Chevron */}
        <span
          onClick={() => { if (!disabled) { setOpen((v) => !v); setSearch(""); } }}
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
            transition: "transform 0.15s",
            pointerEvents: "none",
            color: "#94a3b8",
            fontSize: "10px",
          }}
        >
          ▼
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: "13px", color: "#94a3b8" }}>No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.value}
                data-opt
                tabIndex={0}
                role="option"
                aria-selected={String(opt.value) === String(value)}
                onClick={() => handleSelect(opt)}
                onKeyDown={(e) => handleItemKeyDown(e, opt, idx)}
                style={{
                  padding: "9px 14px",
                  fontSize: "13.5px",
                  cursor: "pointer",
                  background: String(opt.value) === String(value) ? "#eff6ff" : "transparent",
                  color: String(opt.value) === String(value) ? "#2563eb" : "#0f172a",
                  fontWeight: String(opt.value) === String(value) ? 600 : 400,
                  borderBottom: idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
                onMouseEnter={(e) => { if (String(opt.value) !== String(value)) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = String(opt.value) === String(value) ? "#eff6ff" : "transparent"; }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FSearchableSelect — labelled wrapper matching FSelect styling in CompanyEmployeePortal
 */
export function FSearchableSelect({ label, required, options, value, onChange, placeholder, disabled, style = {} }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder || `Select ${label}…`}
        disabled={disabled}
      />
    </div>
  );
}
