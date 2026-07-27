/**
 * Phase 4 + Task 2 — Location-based, shift-window-scoped site score engine.
 *
 * Option B: locations with no shift assigned fall back to full-day assumption.
 * Past frozen snapshots are never recalculated.
 */
import pool from '../db.js';

function expectedSlots(frequency, hourlyInterval, startTime, endTime) {
  const freq = (frequency || 'Daily').toLowerCase();
  if (freq !== 'hourly') return 1;
  const interval = Math.max(0.25, Number(hourlyInterval) || 1);
  if (startTime && endTime) {
    const [sh, sm = 0] = String(startTime).split(':').map(Number);
    const [eh, em = 0] = String(endTime).split(':').map(Number);
    const startMins = sh * 60 + (sm || 0);
    const endMins   = eh * 60 + (em || 0);
    if (endMins <= startMins) {
      // Overnight shift: total window = (1440 - startMins) + endMins
      const totalMins = (1440 - startMins) + endMins;
      return Math.max(1, Math.floor(totalMins / (interval * 60)));
    }
    return Math.max(1, Math.floor((endMins - startMins) / (interval * 60)));
  }
  return Math.max(1, Math.floor(1440 / (interval * 60)));
}

function expectedSlotsForPair(pair, shiftMap) {
  const shiftIds = Array.isArray(pair.shiftIds) ? pair.shiftIds.map(Number).filter(Boolean) : [];
  if (shiftIds.length === 0) return expectedSlots(pair.frequency, pair.hourlyInterval, null, null);
  const total = shiftIds.reduce((sum, sid) => {
    const s = shiftMap[sid];
    return s ? sum + expectedSlots(pair.frequency, pair.hourlyInterval, s.startTime, s.endTime) : sum;
  }, 0);
  return total || 1;
}

async function fetchShifts(companyId) {
  const [rows] = await pool.query(
    `SELECT id, start_time AS "startTime", end_time AS "endTime" FROM shifts WHERE company_id = ? AND status = 'active'`,
    [companyId]
  ).catch(() => [[]]);
  return Object.fromEntries(rows.map(s => [Number(s.id), s]));
}

const SHIFT_WINDOW_FILTER = `
  AND (
    -- New submissions with explicit shift_id: match directly to the location's assigned shifts
    (cs.shift_id IS NOT NULL AND cs.shift_id::bigint = ANY(ARRAY(SELECT jsonb_array_elements_text(l.shift_ids))::bigint[]))
    OR
    -- Legacy submissions without shift_id: fall back to time-window filter
    (cs.shift_id IS NULL AND (
      l.shift_ids IS NULL OR l.shift_ids = '[]'::jsonb
      OR EXISTS (
        SELECT 1 FROM shifts sw
        WHERE sw.id::bigint = ANY(ARRAY(SELECT jsonb_array_elements_text(l.shift_ids))::bigint[])
          AND sw.status = 'active'
          AND (
            -- Normal shift (same day): end > start
            (sw.end_time::time > sw.start_time::time
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60 + EXTRACT(MINUTE FROM cs.submitted_at))
                  >= (EXTRACT(HOUR FROM sw.start_time::time)*60 + EXTRACT(MINUTE FROM sw.start_time::time))
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60 + EXTRACT(MINUTE FROM cs.submitted_at))
                  <  (EXTRACT(HOUR FROM sw.end_time::time)*60 + EXTRACT(MINUTE FROM sw.end_time::time)))
            OR
            -- Overnight shift (crosses midnight): end <= start
            (sw.end_time::time <= sw.start_time::time
              AND (
                (EXTRACT(HOUR FROM cs.submitted_at)*60 + EXTRACT(MINUTE FROM cs.submitted_at))
                  >= (EXTRACT(HOUR FROM sw.start_time::time)*60 + EXTRACT(MINUTE FROM sw.start_time::time))
                OR
                (EXTRACT(HOUR FROM cs.submitted_at)*60 + EXTRACT(MINUTE FROM cs.submitted_at))
                  <  (EXTRACT(HOUR FROM sw.end_time::time)*60 + EXTRACT(MINUTE FROM sw.end_time::time))
              ))
          )
      )
    ))
  )`;

const LOC_PAIRS_SQL = (cid1, cid2) => pool.query(`
  SELECT l.id AS "locationId", ct.id AS "templateId",
         COALESCE(l.frequency, ct.frequency, 'Daily') AS frequency,
         COALESCE(l.hourly_interval, ct.hourly_interval, 1) AS "hourlyInterval",
         COALESCE(l.shift_ids, '[]'::jsonb) AS "shiftIds",
         LEAST(l.created_at, ct.created_at)::date::text AS "createdDate"
  FROM locations l
  JOIN checklist_templates ct ON ct.id = l.checklist_id
  WHERE l.company_id = ? AND COALESCE(ct.status,'active') != 'inactive'
  UNION
  SELECT ct.location_id, ct.id,
         COALESCE(l.frequency, ct.frequency, 'Daily'),
         COALESCE(l.hourly_interval, ct.hourly_interval, 1),
         COALESCE(l.shift_ids, '[]'::jsonb),
         LEAST(l.created_at, ct.created_at)::date::text
  FROM checklist_templates ct
  JOIN locations l ON l.id = ct.location_id
  WHERE ct.company_id = ? AND COALESCE(ct.status,'active') != 'inactive'
    AND ct.location_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM locations l2 WHERE l2.company_id = l.company_id AND l2.checklist_id = ct.id AND l2.id = l.id)
`, [cid1, cid2]);

const STANDALONE_SQL = (cid1, cid2) => pool.query(`
  SELECT id AS "templateId", COALESCE(frequency,'Daily') AS frequency,
         COALESCE(hourly_interval,1) AS "hourlyInterval",
         start_time AS "startTime", end_time AS "endTime",
         created_at::date::text AS "createdDate"
  FROM checklist_templates
  WHERE company_id = ? AND COALESCE(status,'active') != 'inactive'
    AND (location_id IS NULL OR location_id = 0)
    AND id NOT IN (SELECT DISTINCT checklist_id FROM locations WHERE company_id = ? AND checklist_id IS NOT NULL)
`, [cid1, cid2]);

export async function computeSiteScore(companyId, targetDate) {
  try {
    const shiftMap = await fetchShifts(companyId);
    const [locPairs] = await LOC_PAIRS_SQL(companyId, companyId);
    const [standalone] = await STANDALONE_SQL(companyId, companyId);

    const [locSubs] = await pool.query(`
      SELECT cs.location_id AS "locationId", cs.template_id AS "templateId", COUNT(*) AS count
      FROM checklist_submissions cs
      JOIN checklist_templates ct ON ct.id = cs.template_id
      JOIN locations l ON l.id = cs.location_id
      WHERE ct.company_id = ?
        AND (
          cs.submitted_at::date = ?::date
          OR (
            cs.submitted_at::date = (?::date + INTERVAL '1 day')::date
            AND EXISTS (
              SELECT 1 FROM shifts sw_n
              WHERE sw_n.id::bigint = ANY(ARRAY(SELECT jsonb_array_elements_text(l.shift_ids))::bigint[])
                AND sw_n.status = 'active' AND sw_n.end_time::time <= sw_n.start_time::time
                AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                    < (EXTRACT(HOUR FROM sw_n.end_time::time)*60+EXTRACT(MINUTE FROM sw_n.end_time::time))
            )
          )
        )
        AND cs.location_id IS NOT NULL AND cs.status NOT IN ('rejected')
        AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
        AND COALESCE(ct.status,'active') != 'inactive'
        ${SHIFT_WINDOW_FILTER}
      GROUP BY cs.location_id, cs.template_id`, [companyId, targetDate, targetDate]);

    const [standaloneSubs] = await pool.query(`
      SELECT cs.template_id AS "templateId", COUNT(*) AS count
      FROM checklist_submissions cs
      JOIN checklist_templates ct ON ct.id = cs.template_id
      WHERE ct.company_id = ? AND cs.submitted_at::date = ?::date
        AND cs.location_id IS NULL AND cs.status NOT IN ('rejected')
        AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
        AND COALESCE(ct.status,'active') != 'inactive'
        AND (LOWER(COALESCE(ct.frequency,'daily')) != 'hourly' OR ct.start_time IS NULL OR ct.end_time IS NULL OR
             ((EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at)) >= (EXTRACT(HOUR FROM ct.start_time::time)*60+EXTRACT(MINUTE FROM ct.start_time::time))
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at)) < (EXTRACT(HOUR FROM ct.end_time::time)*60+EXTRACT(MINUTE FROM ct.end_time::time))))
      GROUP BY cs.template_id`, [companyId, targetDate]);

    const locSubMap = {};
    for (const r of locSubs) locSubMap[`${r.locationId}_${r.templateId}`] = Number(r.count) || 0;
    const standaloneSubMap = {};
    for (const r of standaloneSubs) standaloneSubMap[r.templateId] = Number(r.count) || 0;

    let totalExpected = 0, filledSlots = 0;
    const breakdown = [];

    for (const pair of locPairs) {
      if (pair.createdDate && pair.createdDate > targetDate) continue;
      const exp = expectedSlotsForPair(pair, shiftMap);
      if (exp <= 0) continue;
      totalExpected += exp;
      const actual = locSubMap[`${pair.locationId}_${pair.templateId}`] || 0;
      const filled = Math.min(actual, exp);
      filledSlots += filled;
      breakdown.push({ locationId: Number(pair.locationId), templateId: Number(pair.templateId), expectedSlots: exp, filledSlots: filled });
    }
    for (const t of standalone) {
      if (t.createdDate && t.createdDate > targetDate) continue;
      const exp = expectedSlots(t.frequency, t.hourlyInterval, t.startTime, t.endTime);
      if (exp <= 0) continue;
      totalExpected += exp;
      const actual = standaloneSubMap[t.templateId] || 0;
      const filled = Math.min(actual, exp);
      filledSlots += filled;
      breakdown.push({ templateId: Number(t.templateId), expectedSlots: exp, filledSlots: filled });
    }

    const siteScorePct = totalExpected > 0 ? Math.round((filledSlots / totalExpected) * 100) : 0;
    return { totalExpected, filledSlots, pendingSlots: Math.max(0, totalExpected - filledSlots), siteScorePct, breakdown };
  } catch (err) {
    console.error(`[computeSiteScore] Error for company ${companyId} on ${targetDate}:`, err.message);
    return { totalExpected: 0, filledSlots: 0, pendingSlots: 0, siteScorePct: 0, breakdown: [] };
  }
}

export async function computeSiteScoreRange(companyId, dates) {
  if (!dates.length) return [];
  const startDate = dates[0], endDate = dates[dates.length - 1];
  try {
    const shiftMap = await fetchShifts(companyId);
    const [locPairs] = await LOC_PAIRS_SQL(companyId, companyId);
    const [standalone] = await STANDALONE_SQL(companyId, companyId);

    const [locSubs] = await pool.query(`
      SELECT cs.location_id AS "locationId", cs.template_id AS "templateId",
             CASE
               WHEN EXISTS (
                 SELECT 1 FROM shifts sw_n
                 WHERE sw_n.id::bigint = ANY(ARRAY(SELECT jsonb_array_elements_text(l.shift_ids))::bigint[])
                   AND sw_n.status = 'active' AND sw_n.end_time::time <= sw_n.start_time::time
                   AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                       < (EXTRACT(HOUR FROM sw_n.end_time::time)*60+EXTRACT(MINUTE FROM sw_n.end_time::time))
               )
               THEN (cs.submitted_at::date - INTERVAL '1 day')::date::text
               ELSE cs.submitted_at::date::text
             END AS date,
             COUNT(*) AS count
      FROM checklist_submissions cs
      JOIN checklist_templates ct ON ct.id = cs.template_id
      JOIN locations l ON l.id = cs.location_id
      WHERE ct.company_id = ? AND cs.submitted_at::date BETWEEN ?::date AND (?::date + INTERVAL '1 day')::date
        AND cs.location_id IS NOT NULL AND cs.status NOT IN ('rejected')
        AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
        AND COALESCE(ct.status,'active') != 'inactive'
        ${SHIFT_WINDOW_FILTER}
      GROUP BY cs.location_id, cs.template_id, date`, [companyId, startDate, endDate]);

    const [standaloneSubs] = await pool.query(`
      SELECT cs.template_id AS "templateId", cs.submitted_at::date::text AS date, COUNT(*) AS count
      FROM checklist_submissions cs
      JOIN checklist_templates ct ON ct.id = cs.template_id
      WHERE ct.company_id = ? AND cs.submitted_at::date BETWEEN ?::date AND ?::date
        AND cs.location_id IS NULL AND cs.status NOT IN ('rejected')
        AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
        AND COALESCE(ct.status,'active') != 'inactive'
        AND (LOWER(COALESCE(ct.frequency,'daily')) != 'hourly' OR ct.start_time IS NULL OR ct.end_time IS NULL OR
             ((EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at)) >= (EXTRACT(HOUR FROM ct.start_time::time)*60+EXTRACT(MINUTE FROM ct.start_time::time))
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at)) < (EXTRACT(HOUR FROM ct.end_time::time)*60+EXTRACT(MINUTE FROM ct.end_time::time))))
      GROUP BY cs.template_id, cs.submitted_at::date`, [companyId, startDate, endDate]);

    const locSubMap = {};
    for (const r of locSubs) {
      if (!locSubMap[r.date]) locSubMap[r.date] = {};
      locSubMap[r.date][`${r.locationId}_${r.templateId}`] = Number(r.count) || 0;
    }
    const standaloneSubMap = {};
    for (const r of standaloneSubs) {
      if (!standaloneSubMap[r.date]) standaloneSubMap[r.date] = {};
      standaloneSubMap[r.date][r.templateId] = Number(r.count) || 0;
    }

    return dates.map(dateStr => {
      let totalSlots = 0, filled = 0;
      for (const pair of locPairs) {
        if (pair.createdDate && pair.createdDate > dateStr) continue;
        const exp = expectedSlotsForPair(pair, shiftMap);
        if (exp <= 0) continue;
        totalSlots += exp;
        const actual = (locSubMap[dateStr] || {})[`${pair.locationId}_${pair.templateId}`] || 0;
        filled += Math.min(actual, exp);
      }
      for (const t of standalone) {
        if (t.createdDate && t.createdDate > dateStr) continue;
        const exp = expectedSlots(t.frequency, t.hourlyInterval, t.startTime, t.endTime);
        if (exp <= 0) continue;
        totalSlots += exp;
        const actual = (standaloneSubMap[dateStr] || {})[t.templateId] || 0;
        filled += Math.min(actual, exp);
      }
      return { date: dateStr, totalSlots, filledSlots: filled,
        siteScore: totalSlots > 0 ? Math.round((filled / totalSlots) * 1000) / 10 : 0 };
    });
  } catch (err) {
    console.error(`[computeSiteScoreRange] Error for company ${companyId}:`, err.message);
    return dates.map(d => ({ date: d, totalSlots: 0, filledSlots: 0, siteScore: 0 }));
  }
}