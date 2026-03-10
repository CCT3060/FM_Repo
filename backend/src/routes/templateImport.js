/**
 * templateImport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes for uploading and parsing checklist/logsheet templates from XLSX/CSV.
 *
 *   POST /api/template-import/checklist/parse  → parse + preview (no DB write)
 *   POST /api/template-import/logsheet/parse   → parse + preview (no DB write)
 *
 * Auth: requireAuth (main-platform JWT — same as templateChecklists / templateLogs)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router }    from "express";
import multer        from "multer";
import OpenAI        from "openai";
import { requireAuth } from "../middleware/auth.js";
import { parseChecklistBuffer, parseLogsheetBuffer } from "../utils/templateParser.js";

const router = Router();
router.use(requireAuth);

/* ── Multer: memory storage, 5 MB cap, XLSX/CSV only ─────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || "").split(".").pop().toLowerCase();
    const allowedMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "application/octet-stream", // some browsers/OS report xlsx this way
    ];
    if (allowedMime.includes(file.mimetype) || ["xlsx", "xls", "csv"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Only .xlsx and .csv files are allowed (got: ${file.mimetype})`), false);
    }
  },
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/template-import/checklist/parse
   Parses uploaded file → returns structured preview (NO DB save).
   Frontend calls this first, shows preview, then POSTs to
   /api/checklist-templates to actually create the template.
════════════════════════════════════════════════════════════════ */
router.post("/checklist/parse", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded. Send file as multipart/form-data field named 'file'." });
  }
  try {
    const result = parseChecklistBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json(result);
  } catch (err) {
    return res.status(422).json({ success: false, error: `Parse error: ${err.message}` });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/template-import/logsheet/parse
════════════════════════════════════════════════════════════════ */
router.post("/logsheet/parse", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded. Send file as multipart/form-data field named 'file'." });
  }
  try {
    const result = parseLogsheetBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json(result);
  } catch (err) {
    return res.status(422).json({ success: false, error: `Parse error: ${err.message}` });
  }
});

/* ── Multer: image upload, 10 MB cap, jpg/png/webp ──────────────────────── */
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files (jpg, png, webp) are allowed (got: ${file.mimetype})`), false);
    }
  },
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/template-import/image/parse
   Accepts an image of a logsheet or checklist form.
   Uses GPT-4o Vision to extract structure and returns the same
   JSON shape as the XLSX parse endpoints.

   Body fields:
     file  — image file (jpg/png/webp)
     type  — "logsheet" | "checklist"  (default: logsheet)
════════════════════════════════════════════════════════════════ */
router.post("/image/parse", uploadImage.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded. Send image as multipart/form-data field named 'file'." });
  }

  const templateType = (req.body.type || "logsheet").toLowerCase();
  const base64Image  = req.file.buffer.toString("base64");
  const mimeType     = req.file.mimetype;

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your-openai-api-key-here") {
    return res.status(503).json({ success: false, error: "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env." });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  /* ── Build type-specific prompt ─────────────────────────────────────── */
  const logsheetPrompt = `You are an expert at reading facility management logsheet forms.
Analyze this logsheet image and extract its structure as JSON.

Return ONLY valid JSON with no markdown, no explanation. Use this exact schema:
{
  "templateName": "<name of the logsheet>",
  "frequency": "<Daily|Weekly|Monthly>",
  "layoutType": "standard",
  "sections": [
    {
      "sectionName": "<section heading>",
      "fields": [
        {
          "fieldName": "<parameter or label>",
          "fieldType": "<number|text|yes_no|ok_not_ok|dropdown>",
          "unit": "<unit if present, else null>",
          "expectedMin": null,
          "expectedMax": null,
          "notes": "<any notes visible in the form, else null>"
        }
      ]
    }
  ]
}

Rules:
- fieldType must be one of: number, text, yes_no, ok_not_ok, dropdown
- If values are numeric readings (temperatures, pressures, rpm, etc.), use "number"
- If values are Yes/No tick boxes, use "yes_no"
- If values are OK/Not OK checkboxes, use "ok_not_ok"
- If there is a list of choices, use "dropdown"
- Otherwise use "text"
- Extract ALL visible rows and columns
- If frequency cannot be determined, default to "Daily"`;

  const checklistPrompt = `You are an expert at reading facility management inspection checklists.
Analyze this checklist image and extract its structure as JSON.

Return ONLY valid JSON with no markdown, no explanation. Use this exact schema:
{
  "templateName": "<name of the checklist>",
  "frequency": "<Daily|Weekly|Monthly>",
  "sections": [
    {
      "sectionName": "<section heading>",
      "items": [
        {
          "questionText": "<inspection item or question>",
          "inputType": "<yes_no|ok_not_ok|text|number|photo>",
          "isRequired": true
        }
      ]
    }
  ]
}

Rules:
- inputType must be one of: yes_no, ok_not_ok, text, number, photo
- If items have tick/check boxes use "yes_no"
- If items have OK/Fail/Not OK boxes use "ok_not_ok"
- If items expect numeric readings use "number"
- Otherwise use "text"
- Extract ALL visible checklist items`;

  try {
    const systemPrompt = templateType === "checklist" ? checklistPrompt : logsheetPrompt;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" } },
          ],
        },
      ],
      max_tokens: 4000,
    });

    const raw = completion.choices[0]?.message?.content || "";

    /* Strip any accidental markdown code fences */
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (_) {
      return res.status(422).json({ success: false, error: "AI returned invalid JSON. Try a clearer image.", rawResponse: raw });
    }

    /* Normalise to match the same envelope used by XLSX parse endpoints */
    return res.json({ success: true, type: templateType, data: parsed, source: "image" });
  } catch (err) {
    next(err);
  }
});

/* ── Multer/generic error handler ────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: "File too large. Maximum allowed size is 5 MB." });
  }
  return res.status(400).json({ success: false, error: err.message || "Upload error" });
});

export default router;
