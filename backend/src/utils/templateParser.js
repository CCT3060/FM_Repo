/**
 * templateParser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses Excel (.xlsx) and CSV files into structured template data.
 * Supports checklist and logsheet template formats.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { read, utils } from "xlsx";

/* ── Answer-type normalisation maps ──────────────────────────────────────── */
const CHECKLIST_TYPE_MAP = {
  "yes/no": "yes_no", yes_no: "yes_no", yesno: "yes_no", boolean: "yes_no",
  text: "text", string: "text", char: "text",
  remark: "remark", remarks: "remark", note: "remark",
  number: "number", numeric: "number", float: "number",
  integer: "number", int: "number", reading: "number", decimal: "number",
  dropdown: "dropdown", select: "dropdown", singleselect: "dropdown", single_select: "dropdown",
  multiselect: "multi_select", multi_select: "multi_select", "multi select": "multi_select",
  photo: "photo", image: "photo", photo_upload: "photo", photoupload: "photo",
  signature: "signature", sign: "signature",
  "ok/notok": "ok_not_ok", ok_not_ok: "ok_not_ok", oknotok: "ok_not_ok",
};

const LOGSHEET_TYPE_MAP = {
  "yes/no": "yes_no", yes_no: "yes_no", yesno: "yes_no", boolean: "yes_no",
  text: "text", string: "text", char: "text",
  number: "number", numeric: "number", float: "number",
  integer: "number", int: "number", reading: "number", decimal: "number",
};

const VALID_CHECKLIST_TYPES = ["yes_no", "text", "number", "dropdown", "photo", "signature", "ok_not_ok", "remark"];
const VALID_LOGSHEET_TYPES  = ["yes_no", "text", "number"];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const normaliseKey = (s) => String(s || "").toLowerCase().replace(/[\s_\-/]/g, "");

/** Convert various yes/no/true/false values to boolean */
const toBool = (v, def = true) => {
  if (v === undefined || v === null || v === "") return def;
  const s = normaliseKey(v);
  if (["yes", "true", "1", "y", "required", "mandatory"].includes(s)) return true;
  if (["no", "false", "0", "n", "optional", "notrequired"].includes(s)) return false;
  return def;
};

/** Convert to finite number or undefined */
const toNum = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/* ── Robust CSV parser (handles quoted fields, CRLF, embedded commas) ────── */
function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let inQuote = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

/* ── Convert buffer → [{col:val}, …] ────────────────────────────────────── */
function bufferToRowObjects(buffer, mimetype, originalname) {
  const ext = (originalname || "").split(".").pop().toLowerCase();
  let rawRows;

  if (ext === "csv" || (mimetype || "").includes("csv")) {
    rawRows = parseCSV(buffer.toString("utf8"));
  } else {
    const wb = read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = utils.sheet_to_json(ws, { header: 1, defval: "" });
  }

  if (!rawRows || rawRows.length < 2) return { headers: [], data: [] };

  const headers = rawRows[0].map((h) => String(h || "").trim()).filter(Boolean);
  if (!headers.length) return { headers: [], data: [] };

  const data = rawRows
    .slice(1)
    .filter((r) => r.some((c) => c !== "" && c !== null && c !== undefined))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ""; });
      return obj;
    });

  return { headers, data };
}

/* ── Column-alias lookup ─────────────────────────────────────────────────── */
const findCol = (row, aliases) => {
  for (const alias of aliases) {
    const needle = normaliseKey(alias);
    const key = Object.keys(row).find((k) => normaliseKey(k) === needle);
    if (key !== undefined && row[key] !== "") return row[key];
  }
  // Partial match fallback
  for (const alias of aliases) {
    const needle = normaliseKey(alias);
    const key = Object.keys(row).find((k) => normaliseKey(k).includes(needle) || needle.includes(normaliseKey(k)));
    if (key !== undefined && row[key] !== "") return row[key];
  }
  return "";
};

/* ═══════════════════════════════════════════════════════════════════════════
   CHECKLIST PARSER
═══════════════════════════════════════════════════════════════════════════ */
export function parseChecklistBuffer(buffer, mimetype, originalname) {
  const { headers, data } = bufferToRowObjects(buffer, mimetype, originalname);

  const errors   = [];
  const warnings = [];

  /* ── File-level validation ── */
  if (!headers.length) {
    return { success: false, errors: ["File has no headers / could not be read"], warnings, questions: [], preview: [] };
  }
  if (!data.length) {
    return { success: false, errors: ["File contains no data rows"], warnings, questions: [], preview: [] };
  }

  const lnHeaders = headers.map(normaliseKey);
  const hasQuestion = lnHeaders.some((h) =>
    ["question", "questiontext", "question_text", "title", "item", "field"].some((a) => h.includes(normaliseKey(a)))
  );
  if (!hasQuestion) {
    errors.push(
      'Missing required column: "Question" (also accepted: "Question Text", "Title", "Item"). ' +
      `Found: ${headers.slice(0, 8).join(", ")}`
    );
    return { success: false, errors, warnings, questions: [], preview: [] };
  }

  /* ── Row-level parsing ── */
  const questions = [];
  const rowErrors = [];

  for (let i = 0; i < data.length; i++) {
    const row    = data[i];
    const rowNum = i + 2; // 1-indexed + header offset

    const questionText = findCol(row, [
      "question", "question text", "questiontext", "question_text",
      "title", "item", "field", "field name", "fieldname",
    ]);
    if (!questionText) {
      rowErrors.push(`Row ${rowNum}: Missing question text — row skipped`);
      continue;
    }

    /* Answer type */
    const rawType  = findCol(row, ["answer type", "answertype", "answer_type", "input type", "inputtype", "type", "field type"]);
    const typeKey  = normaliseKey(rawType);
    const inputType = CHECKLIST_TYPE_MAP[typeKey] ||
      Object.entries(CHECKLIST_TYPE_MAP).find(([k]) => typeKey.includes(k) || k.includes(typeKey))?.[1] ||
      "yes_no";
    if (rawType && !VALID_CHECKLIST_TYPES.includes(inputType)) {
      warnings.push(`Row ${rowNum}: Unknown answer type "${rawType}", defaulting to yes_no`);
    }

    /* Metadata */
    const isRequired = toBool(findCol(row, ["required", "is required", "isrequired", "mandatory"]), true);
    const section    = findCol(row, ["section", "category", "group", "section name"]) || "General";
    const orderIdx   = toNum(findCol(row, ["order", "order index", "orderindex", "seq", "sequence", "#", "no"]));

    /* Options (for dropdown) */
    const optionsRaw = findCol(row, ["options", "choices", "values", "dropdown options"]);
    const options    = optionsRaw
      ? optionsRaw.split(/[;|]/).map((o) => o.trim()).filter(Boolean)
      : [];

    /* Flag rule */
    const flagOn     = findCol(row, ["flag rule", "flagrule", "flag_rule", "flag if", "flagif", "flag condition", "flag on"]);
    const flagReason = findCol(row, ["flag reason", "flagreason", "reason", "description", "flag message", "alert message"]);
    const woRequired = toBool(findCol(row, ["work order", "workorder", "wo required", "worequired", "auto work order"]), false);
    const sevRaw     = findCol(row, ["severity", "priority", "alert severity"]).toLowerCase();
    const severity   = ["low", "medium", "high", "critical"].includes(sevRaw) ? sevRaw : "medium";

    let flagRule = null;
    if (flagOn) {
      const triggerVal = flagOn.toLowerCase().includes("no") ? "no"
        : flagOn.toLowerCase().includes("yes") ? "yes"
        : flagOn.toLowerCase().includes("fail") ? "Fail"
        : flagOn;
      flagRule = {
        enabled:      true,
        operator:     "eq",
        triggerValue: triggerVal,
        severity,
        label:        flagReason || `Flag when "${triggerVal}"`,
        autoCreateWo: woRequired,
        clientVisible: true,
      };
    }

    // For number types, check min/max rules from dedicated columns or parse from flag rule text
    const minVal = toNum(findCol(row, ["min value", "minvalue", "min", "minimum", "min_value"]));
    const maxVal = toNum(findCol(row, ["max value", "maxvalue", "max", "maximum", "max_value"]));
    if (inputType === "number" && (minVal !== undefined || maxVal !== undefined)) {
      flagRule = {
        ...(flagRule || {}),
        enabled:  true,
        operator: minVal !== undefined && maxVal !== undefined ? "between" : (minVal !== undefined ? "lt" : "gt"),
        ...(minVal !== undefined ? { value1: minVal } : {}),
        ...(maxVal !== undefined ? { value2: maxVal } : {}),
        severity,
        label: flagReason || `Out of range (${minVal ?? ""}–${maxVal ?? ""})`,
        autoCreateWo: woRequired,
      };
    }

    questions.push({
      questionText,
      inputType,
      isRequired,
      section,
      orderIndex: orderIdx !== undefined ? orderIdx : i,
      options,
      flagRule,
      _rowNum: rowNum,
    });
  }

  /* ── Abort if too many errors ── */
  if (rowErrors.length > 0 && questions.length === 0) {
    return { success: false, errors: [...errors, ...rowErrors.slice(0, 20)], warnings, questions: [], preview: [] };
  }

  /* ── Group by section for preview ── */
  const sectionMap = {};
  for (const q of questions) {
    if (!sectionMap[q.section]) sectionMap[q.section] = [];
    sectionMap[q.section].push(q);
  }
  const preview = Object.entries(sectionMap).map(([name, qs]) => ({ name, questions: qs }));

  return {
    success:  rowErrors.length === 0,
    errors:   rowErrors.slice(0, 20),
    warnings: warnings.slice(0, 20),
    questions,
    preview,
    stats: {
      total:          questions.length,
      sections:       Object.keys(sectionMap).length,
      withFlagRules:  questions.filter((q) => q.flagRule).length,
      withOptions:    questions.filter((q) => q.options?.length > 0).length,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOGSHEET PARSER
═══════════════════════════════════════════════════════════════════════════ */
export function parseLogsheetBuffer(buffer, mimetype, originalname) {
  const { headers, data } = bufferToRowObjects(buffer, mimetype, originalname);

  const errors   = [];
  const warnings = [];

  /* ── File-level validation ── */
  if (!headers.length) {
    return { success: false, errors: ["File has no headers / could not be read"], warnings, sections: [], preview: [] };
  }
  if (!data.length) {
    return { success: false, errors: ["File contains no data rows"], warnings, sections: [], preview: [] };
  }

  const lnHeaders = headers.map(normaliseKey);
  const hasField = lnHeaders.some((h) =>
    ["field", "question", "param", "name", "item"].some((a) => h.includes(a))
  );
  if (!hasField) {
    errors.push(
      'Missing required column: "Field Name" (also accepted: "Question", "Parameter", "Item"). ' +
      `Found: ${headers.slice(0, 8).join(", ")}`
    );
    return { success: false, errors, warnings, sections: [], preview: [] };
  }

  /* ── Row-level parsing ── */
  const rowErrors  = [];
  const sectionMap = {}; // { sectionName: [question, ...] }

  for (let i = 0; i < data.length; i++) {
    const row    = data[i];
    const rowNum = i + 2;

    const questionText = findCol(row, [
      "field name", "fieldname", "field_name",
      "question", "questiontext", "question text",
      "parameter", "param", "name", "item",
    ]);
    if (!questionText) { rowErrors.push(`Row ${rowNum}: Missing field name — row skipped`); continue; }

    /* Field type */
    const rawType  = findCol(row, ["field type", "fieldtype", "answer type", "answertype", "type", "data type", "datatype", "input type"]);
    const typeKey  = normaliseKey(rawType);
    const answerType = LOGSHEET_TYPE_MAP[typeKey] ||
      Object.entries(LOGSHEET_TYPE_MAP).find(([k]) => typeKey.includes(k) || k.includes(typeKey))?.[1] ||
      "number";
    if (rawType && !VALID_LOGSHEET_TYPES.includes(answerType)) {
      warnings.push(`Row ${rowNum}: Unknown field type "${rawType}", defaulting to number`);
    }

    /* Metadata */
    const section       = findCol(row, ["section", "group", "category", "section name"]) || "General";
    const unit          = findCol(row, ["unit", "units", "uom", "measure", "measurement"]);
    const isRequired    = toBool(findCol(row, ["required", "isrequired", "mandatory"]), true);
    const minVal        = toNum(findCol(row, ["min value", "minvalue", "min", "minimum", "min_value"]));
    const maxVal        = toNum(findCol(row, ["max value", "maxvalue", "max", "maximum", "max_value"]));
    const order         = toNum(findCol(row, ["order", "orderindex", "order index", "seq", "sequence", "#"]));
    const specification = findCol(row, ["specification", "spec", "description", "note", "notes"]);

    const rule = (minVal !== undefined || maxVal !== undefined)
      ? { ...(minVal !== undefined ? { minValue: minVal } : {}), ...(maxVal !== undefined ? { maxValue: maxVal } : {}) }
      : null;

    /* Build specification string combining unit + description */
    let specStr = "";
    if (unit)          specStr = unit;
    if (specification) specStr = specStr ? `${specStr} — ${specification}` : specification;

    if (!sectionMap[section]) sectionMap[section] = [];
    sectionMap[section].push({
      questionText,
      answerType,
      specification: specStr || undefined,
      unit: unit || undefined,
      mandatory: isRequired,
      priority: "medium",
      rule:     rule || undefined,
      order:    order !== undefined ? order : i,
      _rowNum:  rowNum,
    });
  }

  if (rowErrors.length > 0 && Object.keys(sectionMap).length === 0) {
    return { success: false, errors: [...errors, ...rowErrors.slice(0, 20)], warnings, sections: [], preview: [] };
  }

  /* ── Build sections array ── */
  const sections = Object.entries(sectionMap).map(([name, questions], idx) => ({
    name,
    order: idx,
    questions: questions
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ _rowNum: _r, ...q }, qi) => ({ ...q, order: q.order !== undefined ? q.order : qi })),
  }));

  const totalFields = sections.reduce((s, sec) => s + sec.questions.length, 0);

  return {
    success:  rowErrors.length === 0,
    errors:   rowErrors.slice(0, 20),
    warnings: warnings.slice(0, 20),
    sections,
    preview:  sections,
    stats: {
      total:      totalFields,
      sections:   sections.length,
      withRules:  sections.reduce((s, sec) => s + sec.questions.filter((q) => q.rule).length, 0),
    },
  };
}
