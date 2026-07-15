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
  isMulti = false,
  disabled = false,
  style = {},
  inputStyle = {},
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedValues = isMulti
    ? (Array.isArray(value)
        ? value.map((v) => String(v))
        : (value == null || value === "" || String(value).toLowerCase() === "all")
          ? []
          : String(value).split(",").map((v) => v.trim()).filter(Boolean))
    : [];

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
    if (!isMulti) {
      onChange(String(opt.value));
      setOpen(false);
      setSearch("");
      return;
    }

    const optVal = String(opt.value);
    if (optVal.toLowerCase() === "all") {
      onChange([]);
      return;
    }
    const next = selectedValues.includes(optVal)
      ? selectedValues.filter((v) => v !== optVal)
      : [...selectedValues, optVal];
    onChange(next);
  };

  const selectedLabel = isMulti
    ? (() => {
        if (!selectedValues.length) {
          const allOpt = options.find((o) => String(o.value).toLowerCase() === "all");
          return allOpt?.label || placeholder;
        }
        const selectedOptions = options.filter((o) => selectedValues.includes(String(o.value)));
        if (selectedOptions.length <= 2) return selectedOptions.map((o) => o.label).join(", ");
        return `${selectedOptions.length} selected`;
      })()
    : (selected?.label ?? "");

  // Calculate whether dropdown should open upward
  const openDropdown = () => {
    if (disabled) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 260);
    }
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.select(), 0);
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
          value={open ? search : selectedLabel}
          placeholder={placeholder}
          disabled={disabled}
          onClick={() => { if (!disabled) { openDropdown(); } }}
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
            color: open && !search && !selectedLabel ? "#94a3b8" : "#0f172a",
            ...inputStyle,
          }}
          autoComplete="off"
        />
        {/* Chevron */}
        <span
          onClick={() => { if (!disabled) { if (open) { setOpen(false); setSearch(""); } else { openDropdown(); } } }}
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
            ...(dropUp
              ? { bottom: "calc(100% + 4px)", top: "auto" }
              : { top: "calc(100% + 4px)", bottom: "auto" }),
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
                aria-selected={isMulti ? selectedValues.includes(String(opt.value)) : String(opt.value) === String(value)}
                onClick={() => handleSelect(opt)}
                onKeyDown={(e) => handleItemKeyDown(e, opt, idx)}
                style={{
                  padding: "9px 14px",
                  fontSize: "13.5px",
                  cursor: "pointer",
                  background: (isMulti
                    ? (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value)))
                    : String(opt.value) === String(value)) ? "#eff6ff" : "transparent",
                  color: (isMulti
                    ? (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value)))
                    : String(opt.value) === String(value)) ? "#2563eb" : "#0f172a",
                  fontWeight: (isMulti
                    ? (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value)))
                    : String(opt.value) === String(value)) ? 600 : 400,
                  borderBottom: idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: isMulti ? "8px" : "0",
                }}
                onMouseEnter={(e) => {
                  const isSelected = isMulti
                    ? (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value)))
                    : String(opt.value) === String(value);
                  if (!isSelected) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  const isSelected = isMulti
                    ? (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value)))
                    : String(opt.value) === String(value);
                  e.currentTarget.style.background = isSelected ? "#eff6ff" : "transparent";
                }}
              >
                {isMulti && (
                  <span style={{ width: "14px", height: "14px", borderRadius: "3px", border: "1.5px solid #94a3b8", display: "inline-flex", alignItems: "center", justifyContent: "center", background: (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value))) ? "#2563eb" : "#fff", borderColor: (String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value))) ? "#2563eb" : "#94a3b8" }}>
                    {(String(opt.value).toLowerCase() === "all" ? selectedValues.length === 0 : selectedValues.includes(String(opt.value))) && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </span>
                )}
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
