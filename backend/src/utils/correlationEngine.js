/**
 * correlationEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Cross-asset correlation detection.
 *
 * When multiple assets in the SAME BUILDING/FLOOR trigger similar
 * flags within a time window, a site-level flag is raised.
 *
 * Correlation patterns detected:
 *   - simultaneous_high_temp      2+ assets, temp-related, critical/high
 *   - voltage_fluctuation         2+ electrical assets flagged
 *   - pressure_drop               2+ pressure-related flags
 *   - multi_asset_critical        3+ critical flags in same location
 *   - system_outage_pattern       5+ flags in 1 hour in same location
 *
 * Main exports:
 *   runCorrelationCheck(companyId, windowMinutes, conn)
 *   → { events: CorrelationEvent[] }
 */

import pool from "../db.js";

const CORRELATION_WINDOW_MINUTES = 60;   // how far back to look
const MIN_ASSETS_FOR_CORRELATION  = 2;   // minimum assets needed

// Pattern classifiers based on flag description keywords
const PATTERN_RULES = [
  {
    type: "simultaneous_high_temp",
    severity: "high",
    keywords: ["temp", "temperature", "overheat", "thermal", "hot"],
    minAssets: 2,
  },
  {
    type: "voltage_fluctuation",
    severity: "high",
    keywords: ["voltage", "volt", "electrical", "power", "current", "trip"],
    minAssets: 2,
  },
  {
    type: "pressure_drop",
    severity: "high",
    keywords: ["pressure", "psi", "bar", "pneumatic", "hydraulic"],
    minAssets: 2,
  },
  {
    type: "multi_asset_critical",
    severity: "critical",
    keywords: [], // match all critical flags
    minAssets: 3,
    severityFilter: "critical",
  },
  {
    type: "system_outage_pattern",
    severity: "critical",
    keywords: [],
    minAssets: 5,
    windowOverride: 60, // must occur within 1 hour
  },
];

function flagMatchesPattern(flag, pattern) {
  if (pattern.severityFilter && flag.severity !== pattern.severityFilter) return false;
  if (!pattern.keywords.length) return true;
  const haystack = (flag.description || "").toLowerCase();
  return pattern.keywords.some((kw) => haystack.includes(kw));
}

function locationKey(building, floor) {
  return `${(building || "").trim()}::${(floor || "").trim()}`.toLowerCase();
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Scan recent flags and detect cross-asset correlation patterns.
 * Called by cron job every N minutes.
 *
 * @param {number} companyId
 * @param {number} [windowMins]
 * @param {object} [conn]
 * @returns {Promise<{ events: Array, newEventsCount: number }>}
 */
export async function runCorrelationCheck(companyId, windowMins = CORRELATION_WINDOW_MINUTES, conn = pool) {
  try {
    // Load recent open flags with location info
    const [recentFlags] = await conn.query(
      `SELECT f.id, f.asset_id AS assetId, f.severity, f.description,
              f.created_at AS createdAt,
              a.building, a.floor, a.asset_name AS assetName, a.asset_type AS assetType
       FROM flags f
       JOIN assets a ON a.id = f.asset_id
       WHERE f.company_id = ?
         AND f.status IN ('open','in_progress')
         AND f.created_at >= NOW() - INTERVAL ? MINUTE
       ORDER BY f.created_at DESC`,
      [companyId, windowMins]
    );

    if (recentFlags.length < MIN_ASSETS_FOR_CORRELATION) {
      return { events: [], newEventsCount: 0 };
    }

    const newEvents = [];

    for (const pattern of PATTERN_RULES) {
      // Group matching flags by location
      const byLocation = {};
      for (const flag of recentFlags) {
        if (!flagMatchesPattern(flag, pattern)) continue;
        const key = locationKey(flag.building, flag.floor);
        if (!key.replace(/::/g, "").trim()) continue; // skip flags with no location
        if (!byLocation[key]) byLocation[key] = { flags: [], building: flag.building, floor: flag.floor };
        byLocation[key].flags.push(flag);
      }

      for (const [locKey, { flags, building, floor }] of Object.entries(byLocation)) {
        const minAssets = pattern.minAssets || MIN_ASSETS_FOR_CORRELATION;
        // Count unique assets
        const uniqueAssets = [...new Set(flags.map((f) => f.assetId))];
        if (uniqueAssets.length < minAssets) continue;

        // Check if we already logged this correlation recently
        const [[existing]] = await conn.query(
          `SELECT id FROM asset_correlation_events
           WHERE company_id = ?
             AND location_key = ?
             AND pattern_type = ?
             AND status = 'open'
             AND detected_at >= NOW() - INTERVAL ? MINUTE`,
          [companyId, locKey, pattern.type, windowMins]
        );
        if (existing) continue; // already detected

        const assetIds = uniqueAssets;
        const flagIds  = flags.map((f) => f.id);

        // Create a site-level flag
        let siteFlagId = null;
        try {
          const [result] = await conn.query(
            `INSERT INTO flags
               (company_id, asset_id, source, severity, status, description, trend_flag, pattern_type,
                client_visible, created_at)
             SELECT company_id, id, 'system', ?, 'open', ?, 1, ?, 0, NOW()
             FROM assets WHERE id = ? LIMIT 1`,
            [
              pattern.severity,
              `[SITE ALERT] ${pattern.type.replace(/_/g, " ")} detected at ${building || "unknown"} ${floor ? "Floor " + floor : ""}. ${uniqueAssets.length} assets affected.`,
              pattern.type,
              assetIds[0],
            ]
          );
          siteFlagId = result.insertId;
        } catch (err) {
          console.error("[CorrelationEngine] site flag creation error:", err.message);
        }

        // Log the correlation event
        const [evtResult] = await conn.query(
          `INSERT INTO asset_correlation_events
             (company_id, location_key, building, floor, pattern_type,
              asset_ids_json, flag_ids_json, site_flag_id, asset_count, severity, detected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            companyId, locKey, building || null, floor || null, pattern.type,
            JSON.stringify(assetIds), JSON.stringify(flagIds),
            siteFlagId, assetIds.length, pattern.severity,
          ]
        );

        newEvents.push({
          id:          evtResult.insertId,
          patternType: pattern.type,
          severity:    pattern.severity,
          location:    `${building || "?"} ${floor ? "/ Floor " + floor : ""}`,
          assetCount:  assetIds.length,
          siteFlagId,
        });
      }
    }

    return { events: newEvents, newEventsCount: newEvents.length };
  } catch (err) {
    console.error("[CorrelationEngine] runCorrelationCheck error:", err.message);
    return { events: [], newEventsCount: 0, error: err.message };
  }
}

/**
 * Get recent correlation events for dashboard.
 */
export async function getCorrelationEvents(companyId, limit = 20, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, pattern_type AS patternType, building, floor,
            asset_count AS assetCount, severity, status, detected_at AS detectedAt,
            site_flag_id AS siteFlagId
     FROM asset_correlation_events
     WHERE company_id = ?
     ORDER BY detected_at DESC
     LIMIT ?`,
    [companyId, limit]
  );
  return rows;
}
