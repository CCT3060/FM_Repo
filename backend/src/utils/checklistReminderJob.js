/**
 * checklistReminderJob.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Background job that monitors checklist templates with notification timers set.
 * Runs every 5 minutes and handles Hourly, Custom, Weekly, and Monthly frequencies.
 *
 *   Hourly  — sends reminder X minutes before each hourly window deadline
 *   Custom  — same as Hourly but per each selected custom hour
 *   Weekly  — sends reminder at a specific HH:MM on the scheduled week days
 *   Monthly — sends reminder at a specific HH:MM on the scheduled day of month
 *
 * Env vars:
 *   CHECKLIST_REMINDER_INTERVAL_MS – how often the job runs (default: 5 min)
 */

import pool from "../db.js";
import { createNotification, sendExpoPush } from "./notificationsHelper.js";
import { sendFCMPush } from "./firebaseService.js";

const RUN_INTERVAL_MS = Number(
  process.env.CHECKLIST_REMINDER_INTERVAL_MS || 5 * 60 * 1000
);

// Ensure the reminder-log table exists on startup
async function ensureReminderLogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checklist_reminder_log (
        id            BIGSERIAL PRIMARY KEY,
        template_id   BIGINT NOT NULL,
        window_start  TIMESTAMPTZ NOT NULL,
        sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        location_id   BIGINT NULL,
        UNIQUE (template_id, window_start, location_id)
      )
    `);
    // Add location_id column if this table already exists without it
    await pool.query(`ALTER TABLE checklist_reminder_log ADD COLUMN IF NOT EXISTS location_id BIGINT NULL`).catch(() => {});
    // Recreate unique constraint to include location_id if needed
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'checklist_reminder_log_template_id_window_start_location_id_key'
        ) THEN
          ALTER TABLE checklist_reminder_log DROP CONSTRAINT IF EXISTS checklist_reminder_log_template_id_window_start_key;
          ALTER TABLE checklist_reminder_log ADD CONSTRAINT checklist_reminder_log_template_id_window_start_location_id_key
            UNIQUE (template_id, window_start, location_id);
        END IF;
      END $$
    `).catch(() => {});
  } catch (err) {
    console.warn("[ChecklistReminder] Could not create reminder log table:", err.message);
  }
}

async function runChecklistReminderJob() {
  try {
    // Clean up log entries older than 3 days to prevent table bloat
    await pool.query(
      `DELETE FROM checklist_reminder_log WHERE sent_at < NOW() - INTERVAL '3 days'`
    ).catch(() => {});

    const now = new Date();

    // ── 1. Hourly + Custom templates (use notification_timer in minutes) ─────
    const [periodicTemplates] = await pool.query(
      `SELECT ct.id, ct.company_id AS "companyId", ct.template_name AS "templateName",
              ct.frequency AS "frequency",
              ct.hourly_interval AS "hourlyInterval",
              ct.notification_timer AS "notificationTimer",
              ct.start_time AS "startTime",
              ct.end_time AS "endTime",
              COALESCE(ct.custom_hours::text, '[]') AS "customHoursRaw"
       FROM checklist_templates ct
       WHERE ct.frequency IN ('Hourly', 'Custom')
         AND ct.status = 'active'
         AND ct.is_active = 1
         AND ct.notification_timer IS NOT NULL
         AND ct.notification_timer > 0`
    ).catch(() => [[]]);

    for (const tpl of (periodicTemplates || [])) {
      try {
        if (tpl.frequency === 'Hourly') {
          await processHourlyTemplate(tpl, now);
        } else if (tpl.frequency === 'Custom') {
          await processCustomTemplate(tpl, now);
        }
      } catch (err) {
        console.error(`[ChecklistReminder] Error processing template ${tpl.id}:`, err.message);
      }
    }

    // ── 2. Weekly + Monthly templates (use notification_time HH:MM) ──────────
    const [timedTemplates] = await pool.query(
      `SELECT ct.id, ct.company_id AS "companyId", ct.template_name AS "templateName",
              ct.frequency AS "frequency",
              ct.notification_time AS "notificationTime",
              ct.week_days AS "weekDaysRaw",
              ct.monthly_day AS "monthlyDay",
              ct.start_time AS "startTime",
              ct.end_time AS "endTime"
       FROM checklist_templates ct
       WHERE ct.frequency IN ('Weekly', 'Monthly')
         AND ct.status = 'active'
         AND ct.is_active = 1
         AND ct.notification_time IS NOT NULL`
    ).catch(() => [[]]);

    for (const tpl of (timedTemplates || [])) {
      try {
        if (tpl.frequency === 'Weekly') {
          await processWeeklyTemplate(tpl, now);
        } else if (tpl.frequency === 'Monthly') {
          await processMonthlyTemplate(tpl, now);
        }
      } catch (err) {
        console.error(`[ChecklistReminder] Error processing template ${tpl.id}:`, err.message);
      }
    }

    // ── 3. Phase 4: Location-based reminders (new model) ─────────────────────
    // Reads notification_timer from locations.notification_timer, shift windows from shifts table
    const [locationReminders] = await pool.query(
      `SELECT l.id AS "locationId", l.company_id AS "companyId", l.name AS "locationName",
              l.frequency, l.hourly_interval AS "hourlyInterval",
              l.notification_timer AS "notificationTimer",
              l.checklist_id AS "templateId",
              ct.template_name AS "templateName",
              COALESCE(l.shift_ids, '[]'::jsonb) AS "shiftIdsRaw"
       FROM locations l
       JOIN checklist_templates ct ON ct.id = l.checklist_id
       WHERE l.notification_timer IS NOT NULL AND l.notification_timer > 0
         AND l.checklist_id IS NOT NULL
         AND LOWER(COALESCE(l.status, 'active')) = 'active'
         AND COALESCE(ct.status, 'active') != 'inactive'`
    ).catch(() => [[]]);

    for (const locTpl of (locationReminders || [])) {
      try {
        await processLocationReminder(locTpl, now);
      } catch (err) {
        console.error(`[ChecklistReminder] Error processing location ${locTpl.locationId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[ChecklistReminder] Job error:", err.message);
  }
}

// ── Location-based reminder (new Phase 2+ model) ─────────────────────────────
// Uses location.frequency + location.shift_ids (→ shifts.start_time/end_time)
// to generate slot windows, then fires reminder X min before slot deadline.
async function processLocationReminder(locTpl, now) {
  const { locationId, companyId, locationName, frequency, hourlyInterval, notificationTimer, templateId, templateName, shiftIdsRaw } = locTpl;

  if (!frequency) return;
  const freq = frequency.toLowerCase();
  if (!['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'custom'].includes(freq)) return;

  const reminderMinutes = Number(notificationTimer);
  if (!reminderMinutes || reminderMinutes <= 0) return;

  // Get assigned shift(s) time windows
  const shiftIds = Array.isArray(shiftIdsRaw) ? shiftIdsRaw.map(Number).filter(Boolean)
    : (typeof shiftIdsRaw === 'string' ? JSON.parse(shiftIdsRaw || '[]').map(Number).filter(Boolean) : []);

  let timeWindows = []; // [{ startMins, endMins, label }]

  if (shiftIds.length > 0) {
    const ph = shiftIds.map(() => '?').join(',');
    const [shifts] = await pool.query(
      `SELECT id, name, start_time AS "startTime", end_time AS "endTime"
       FROM shifts WHERE id IN (${ph}) AND status = 'active'`,
      shiftIds
    ).catch(() => [[]]);

    for (const s of (shifts || [])) {
      const [ssh, ssm = 0] = s.startTime.split(':').map(Number);
      const [seh, sem = 0] = s.endTime.split(':').map(Number);
      timeWindows.push({
        startMins: ssh * 60 + ssm,
        endMins: seh * 60 + sem,
        label: `${s.startTime}–${s.endTime} (${s.name})`,
      });
    }
  } else {
    // No shifts: full-day window (0:00 – 23:59)
    timeWindows = [{ startMins: 0, endMins: 1440, label: 'all day' }];
  }

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (freq === 'hourly') {
    const interval = Math.max(1, Number(hourlyInterval) || 1);

    for (const win of timeWindows) {
      // Generate each slot within this shift window
      for (let slotStart = win.startMins; slotStart < win.endMins; slotStart += interval * 60) {
        const slotEnd = Math.min(slotStart + interval * 60, win.endMins);

        // Phase 1: X min before slot END (pre-deadline reminder)
        const minsUntilEnd = slotEnd - nowMins;
        if (minsUntilEnd > 0 && minsUntilEnd <= reminderMinutes) {
          const slotStartDate = new Date(todayMidnight.getTime() + slotStart * 60 * 1000);
          const slotEndDate = new Date(todayMidnight.getTime() + slotEnd * 60 * 1000);
          const slotLabel = `${_fmtMins(slotStart)} – ${_fmtMins(slotEnd)}`;
          const pushBody = `"${templateName}" at ${locationName} is due in ${Math.ceil(minsUntilEnd)} min (${slotLabel}). Fill it now!`;
          const inAppMessage = `Checklist "${templateName}" at ${locationName} not submitted for slot ${slotLabel}.`;
          await sendLocationReminderIfNeeded({ locationId, templateId, companyId, templateName, locationName,
            windowStart: slotStartDate, windowEnd: slotEndDate, windowLabel: slotLabel, pushBody, inAppMessage });
        }

        // Phase 2: just-ended slot admin notification
        const minsAfterEnd = nowMins - slotEnd;
        if (minsAfterEnd >= 0 && minsAfterEnd <= (RUN_INTERVAL_MS / 60000) + 1) {
          const slotStartDate = new Date(todayMidnight.getTime() + slotStart * 60 * 1000);
          const slotEndDate = new Date(todayMidnight.getTime() + slotEnd * 60 * 1000);
          const slotLabel = `${_fmtMins(slotStart)} – ${_fmtMins(slotEnd)}`;
          await sendLocationPostSlotNotif({ locationId, templateId, companyId, templateName, locationName,
            windowStart: slotStartDate, windowEnd: slotEndDate, windowLabel: slotLabel });
        }
      }
    }
  } else {
    // Daily/Weekly/Monthly/Quarterly/Custom: one slot per shift window per day
    for (const win of timeWindows) {
      const slotStartDate = new Date(todayMidnight.getTime() + win.startMins * 60 * 1000);
      const slotEndDate = new Date(todayMidnight.getTime() + win.endMins * 60 * 1000);
      const slotLabel = shiftIds.length > 0 ? win.label : 'today';

      // Fire reminder X min before shift window END
      const minsUntilEnd = win.endMins - nowMins;
      if (minsUntilEnd > 0 && minsUntilEnd <= reminderMinutes) {
        const pushBody = `"${templateName}" at ${locationName} is due before ${_fmtMins(win.endMins)}. Fill it now!`;
        const inAppMessage = `Checklist "${templateName}" at ${locationName} not submitted for ${slotLabel}.`;
        await sendLocationReminderIfNeeded({ locationId, templateId, companyId, templateName, locationName,
          windowStart: slotStartDate, windowEnd: slotEndDate, windowLabel: slotLabel, pushBody, inAppMessage });
      }

      // Post-slot admin notification
      const minsAfterEnd = nowMins - win.endMins;
      if (minsAfterEnd >= 0 && minsAfterEnd <= (RUN_INTERVAL_MS / 60000) + 1) {
        await sendLocationPostSlotNotif({ locationId, templateId, companyId, templateName, locationName,
          windowStart: slotStartDate, windowEnd: slotEndDate, windowLabel: slotLabel });
      }
    }
  }
}

function _fmtMins(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

async function sendLocationReminderIfNeeded({ locationId, templateId, companyId, templateName, locationName,
  windowStart, windowEnd, windowLabel, pushBody, inAppMessage }) {
  // Dedup: (template_id, window_start, location_id)
  const [[alreadySent]] = await pool.query(
    `SELECT id FROM checklist_reminder_log WHERE template_id = ? AND window_start = ? AND location_id IS NOT DISTINCT FROM ?`,
    [templateId, windowStart.toISOString(), locationId]
  ).catch(() => [[]]);
  if (alreadySent) return;

  // Check if submission exists for this location+template in this window
  const [[submission]] = await pool.query(
    `SELECT id FROM checklist_submissions
     WHERE template_id = ? AND location_id = ? AND submitted_at >= ? AND submitted_at < ? LIMIT 1`,
    [templateId, locationId, windowStart.toISOString(), windowEnd.toISOString()]
  ).catch(() => [[]]);
  if (submission) return;

  // Mark as notified
  await pool.query(
    `INSERT INTO checklist_reminder_log (template_id, window_start, location_id)
     VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    [templateId, windowStart.toISOString(), locationId]
  ).catch(() => {});

  // Get employees assigned to this template (or all employees for this company with access)
  const [assignedUsers] = await pool.query(
    `SELECT cu.id, cu.full_name AS "fullName", cu.fcm_token AS "fcmToken", cu.push_token AS "pushToken"
     FROM template_user_assignments tua
     JOIN company_users cu ON cu.id = tua.assigned_to
     WHERE tua.template_id = ? AND tua.template_type = 'checklist' AND cu.status = 'Active'`,
    [templateId]
  ).catch(() => [[]]);

async function getManagersToNotify(companyId) {
  try {
    const [users] = await pool.query(
      `SELECT cu.id, cu.fcm_token AS "fcmToken", cu.push_token AS "pushToken", cu.role,
              cr.is_technical_supervisor AS "isTechSupervisor",
              rp.permissions
       FROM company_users cu
       LEFT JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role AND cr.is_active = TRUE
       LEFT JOIN role_permissions rp ON rp.company_id = cu.company_id AND rp.role = cu.role
       WHERE cu.company_id = ? AND cu.status = 'Active'`,
      [companyId]
    );

    return (users || []).filter((u) => {
      if (u.role === 'admin' || u.role === 'supervisor' || u.role === 'catalyst_admin') return true;
      if (u.isTechSupervisor) return true;
      if (u.permissions) {
        const p = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
        if (p?.notifications?.v || p?.notifications?.r || p?.notifications?.read) return true;
        if (p?.checklists?.assign_checklists || p?.checklists?.fill_checklists) return true;
      }
      return false;
    });
  } catch (err) {
    console.error("[ChecklistReminder] getManagersToNotify error:", err.message);
    return [];
  }
}

  // Also notify admins, supervisors, and users with notification/checklist permissions
  const managers = await getManagersToNotify(companyId);

  const pushTitle = `Checklist Reminder 🔔`;
  const inAppTitle = "Checklist Reminder";

  for (const user of [...(assignedUsers || []), ...(managers || [])]) {
    // Primary: Expo push (works without Firebase Admin credentials)
    if (user.pushToken) {
      await sendExpoPush(user.pushToken, pushTitle, pushBody, {
        type: 'checklist_reminder', templateId: String(templateId), locationId: String(locationId),
      }).catch(() => {});
    }
    // Secondary: direct FCM (only fires if Firebase Admin SDK is configured)
    if (user.fcmToken) {
      await sendFCMPush(user.fcmToken, pushTitle, pushBody, {
        type: 'checklist_reminder', templateId: String(templateId), locationId: String(locationId),
      }).catch(() => {});
    }
    await createNotification({
      companyId, recipientId: user.id, flagId: null,
      type: 'checklist_reminder', title: inAppTitle, message: inAppMessage,
    }).catch(() => {});
  }

  if ((assignedUsers || []).length > 0 || (managers || []).length > 0) {
    console.log(`[ChecklistReminder] Location reminder sent — location ${locationId} ("${locationName}"), template ${templateId} — ${windowLabel}`);
  }
}

async function sendLocationPostSlotNotif({ locationId, templateId, companyId, templateName, locationName,
  windowStart, windowEnd, windowLabel }) {
  // Use windowEnd as dedup key for post-slot
  const [[alreadySent]] = await pool.query(
    `SELECT id FROM checklist_reminder_log WHERE template_id = ? AND window_start = ? AND location_id IS NOT DISTINCT FROM ?`,
    [templateId, windowEnd.toISOString(), locationId]
  ).catch(() => [[]]);
  if (alreadySent) return;

  const [[submission]] = await pool.query(
    `SELECT id FROM checklist_submissions
     WHERE template_id = ? AND location_id = ? AND submitted_at >= ? AND submitted_at < ? LIMIT 1`,
    [templateId, locationId, windowStart.toISOString(), windowEnd.toISOString()]
  ).catch(() => [[]]);
  if (submission) return;

  await pool.query(
    `INSERT INTO checklist_reminder_log (template_id, window_start, location_id)
     VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    [templateId, windowEnd.toISOString(), locationId]
  ).catch(() => {});

  const inAppTitle = "Checklist Not Submitted";
  const inAppMessage = `"${templateName}" at ${locationName} was not submitted for ${windowLabel}.`;

  const admins = await getManagersToNotify(companyId);

  for (const admin of admins) {
    await createNotification({
      companyId, recipientId: admin.id, flagId: null,
      type: 'checklist_reminder', title: inAppTitle, message: inAppMessage,
    }).catch(() => {});
  }
}

// ── Hourly: reminder X min BEFORE each slot's deadline + post-slot admin notif ─
async function processHourlyTemplate(tpl, now) {
  const { id: templateId, companyId, templateName, hourlyInterval, notificationTimer, startTime, endTime } = tpl;

  const interval = Number(hourlyInterval) || 1;
  const reminderMinutes = Number(notificationTimer);

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const elapsedHours = (now - todayMidnight) / (1000 * 60 * 60);
  const windowIndex = Math.floor(elapsedHours / interval);
  const windowStartHour = windowIndex * interval;
  const windowStart = new Date(todayMidnight);
  windowStart.setHours(windowStartHour, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setHours(windowStart.getHours() + interval, 0, 0, 0);

  // ── Determine boundaries ──────────────────────────────────────────────────
  if (startTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const boundary = new Date(todayMidnight);
    boundary.setHours(sh, sm, 0, 0);
    if (now < boundary) return; // Before template's active start
  }

  // Allow slightly past endTime so we can still fire the post-slot Phase 2
  let afterEndTime = false;
  if (endTime) {
    const [eh, em] = endTime.split(":").map(Number);
    const endBoundary = new Date(todayMidnight);
    endBoundary.setHours(eh, em, 0, 0);
    if (now > endBoundary) afterEndTime = true;
    // If far past end time (more than job interval + 2 min), skip entirely
    if (now > new Date(endBoundary.getTime() + RUN_INTERVAL_MS + 2 * 60 * 1000)) return;
  }

  // ── Phase 1: Pre-deadline FCM push + in-app — X min BEFORE slot END ──────
  if (!afterEndTime) {
    const minutesUntilEnd = (windowEnd - now) / (1000 * 60);
    if (minutesUntilEnd <= reminderMinutes && now < windowEnd) {
      const windowLabel = `${String(windowStart.getHours()).padStart(2, "0")}:00–${String(windowEnd.getHours()).padStart(2, "0")}:00`;
      const pushBody = `"${templateName}" has not been submitted yet. Deadline in ${Math.ceil(minutesUntilEnd)} min (${windowLabel}). Please fill it in now!`;
      const inAppMessage = `The checklist "${templateName}" has not been submitted for the ${windowLabel} window.`;
      await sendReminderIfNeeded({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel, pushBody, inAppMessage });
    }
  }

  // ── Phase 2: Post-slot in-app notification for admins — after slot ends ───
  // "justEnded" window = the one that just ended (its end = current windowStart)
  const justEndedWindowEnd = windowStart; // current window's start = previous window's end
  const justEndedWindowStartHour = windowStartHour - interval;
  if (justEndedWindowStartHour >= 0) {
    const justEndedWindowStart = new Date(todayMidnight);
    justEndedWindowStart.setHours(justEndedWindowStartHour, 0, 0, 0);

    // Verify the just-ended window was within the template's active start time
    let isValidWindow = true;
    if (startTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const startBoundary = new Date(todayMidnight);
      startBoundary.setHours(sh, sm, 0, 0);
      if (justEndedWindowStart < startBoundary) isValidWindow = false;
    }

    const msAfterEnd = now - justEndedWindowEnd;
    if (isValidWindow && msAfterEnd >= 0 && msAfterEnd <= RUN_INTERVAL_MS + 60000) {
      const prevLabel = `${String(justEndedWindowStart.getHours()).padStart(2, "0")}:00–${String(justEndedWindowEnd.getHours()).padStart(2, "0")}:00`;
      await sendPostSlotAdminNotif({ templateId, companyId, templateName,
        windowStart: justEndedWindowStart, windowEnd: justEndedWindowEnd, windowLabel: prevLabel });
    }
  }
}

// ── Post-slot: admin-only in-app notification after a slot ends ──────────────
async function sendPostSlotAdminNotif({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel }) {
  // Use windowEnd as the dedup key (distinct from Phase 1 which uses windowStart)
  const [[alreadySent]] = await pool.query(
    `SELECT id FROM checklist_reminder_log WHERE template_id = ? AND window_start = ?`,
    [templateId, windowEnd.toISOString()]
  ).catch(() => [[]]);
  if (alreadySent) return;

  // Skip if submission exists in this window
  const [[submission]] = await pool.query(
    `SELECT id FROM checklist_submissions
     WHERE template_id = ? AND submitted_at >= ? AND submitted_at < ? LIMIT 1`,
    [templateId, windowStart.toISOString(), windowEnd.toISOString()]
  ).catch(() => [[]]);
  if (submission) return;

  // Mark post-slot as notified
  await pool.query(
    `INSERT INTO checklist_reminder_log (template_id, window_start) VALUES (?, ?) ON CONFLICT (template_id, window_start) DO NOTHING`,
    [templateId, windowEnd.toISOString()]
  ).catch(() => {});

  const inAppTitle = "Checklist Not Submitted";
  const inAppMessage = `The checklist "${templateName}" was not submitted for the ${windowLabel} window.`;

  // Notify admins and managers (post-slot is an audit notification in the portal)
  const admins = await getManagersToNotify(companyId);

  for (const admin of admins) {
    await createNotification({
      companyId, recipientId: admin.id, flagId: null,
      type: "checklist_reminder", title: inAppTitle, message: inAppMessage,
    }).catch(() => {});
  }

  if (admins.length > 0) {
    console.log(`[ChecklistReminder] Post-slot admin notification — template ${templateId} ("${templateName}") — ${windowLabel}`);
  }
}

// ── Custom: reminder X min BEFORE each custom hour's deadline ────────────────
async function processCustomTemplate(tpl, now) {
  const { id: templateId, companyId, templateName, notificationTimer, customHoursRaw } = tpl;

  let customHours = [];
  try { customHours = JSON.parse(customHoursRaw || '[]'); } catch { customHours = []; }
  if (customHours.length === 0) return;

  const reminderMinutes = Number(notificationTimer);
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  for (const h of customHours) {
    const windowStart = new Date(todayMidnight);
    windowStart.setHours(h, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setHours(h + 1, 0, 0, 0);

    // Phase 1: X min BEFORE window END (not after start)
    const minutesUntilEnd = (windowEnd - now) / (1000 * 60);
    if (minutesUntilEnd <= reminderMinutes && now < windowEnd) {
      const windowLabel = `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`;
      const pushBody = `"${templateName}" has not been submitted yet. Deadline in ${Math.ceil(minutesUntilEnd)} min (${windowLabel}). Please fill it in now!`;
      const inAppMessage = `The checklist "${templateName}" has not been submitted for the ${windowLabel} window.`;
      await sendReminderIfNeeded({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel, pushBody, inAppMessage });
    }

    // Phase 2: Post-slot admin notification (just after window ends)
    const msAfterEnd = now - windowEnd;
    if (msAfterEnd >= 0 && msAfterEnd <= RUN_INTERVAL_MS + 60000) {
      const windowLabel = `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`;
      await sendPostSlotAdminNotif({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel });
    }
  }
}

// ── Weekly: reminder at HH:MM on selected days ───────────────────────────────
async function processWeeklyTemplate(tpl, now) {
  const { id: templateId, companyId, templateName, notificationTime, weekDaysRaw } = tpl;
  if (!notificationTime) return;

  let weekDays = [];
  try { weekDays = typeof weekDaysRaw === 'string' ? JSON.parse(weekDaysRaw) : (weekDaysRaw || []); } catch { weekDays = []; }

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = DAY_NAMES[now.getDay()];

  // If weekDays specified, check if today is one of them
  if (weekDays.length > 0 && !weekDays.includes(todayName)) return;

  const [rh, rm] = notificationTime.split(":").map(Number);
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  // The "window" is today's date — we check if today's submission exists
  const windowStart = new Date(todayMidnight);
  const windowEnd = new Date(todayMidnight);
  windowEnd.setDate(windowEnd.getDate() + 1);

  // Scheduled reminder time today
  const reminderTime = new Date(todayMidnight);
  reminderTime.setHours(rh, rm, 0, 0);

  // Only fire within a 5-minute window after the scheduled time
  const msSinceReminder = now - reminderTime;
  if (msSinceReminder < 0 || msSinceReminder > RUN_INTERVAL_MS) return;

  const windowLabel = `today (${todayName}, ${notificationTime})`;
  const pushBody = `"${templateName}" has not been submitted today. Please fill it in now.`;
  const inAppMessage = `The checklist "${templateName}" has not been submitted today.`;

  await sendReminderIfNeeded({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel, pushBody, inAppMessage });
}

// ── Monthly: reminder at HH:MM on scheduled day of month ────────────────────
async function processMonthlyTemplate(tpl, now) {
  const { id: templateId, companyId, templateName, notificationTime, monthlyDay } = tpl;
  if (!notificationTime || !monthlyDay) return;

  const scheduledDay = Number(monthlyDay);
  if (now.getDate() !== scheduledDay) return;

  const [rh, rm] = notificationTime.split(":").map(Number);
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  // The "window" is the current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

  // Scheduled reminder time today
  const reminderTime = new Date(todayMidnight);
  reminderTime.setHours(rh, rm, 0, 0);

  const msSinceReminder = now - reminderTime;
  if (msSinceReminder < 0 || msSinceReminder > RUN_INTERVAL_MS) return;

  const windowLabel = `this month (day ${scheduledDay}, at ${notificationTime})`;
  const pushBody = `"${templateName}" has not been submitted this month. Please fill it in now.`;
  const inAppMessage = `The checklist "${templateName}" has not been submitted this month.`;

  await sendReminderIfNeeded({ templateId, companyId, templateName, windowStart: monthStart, windowEnd: monthEnd, windowLabel, pushBody, inAppMessage });
}

// ── Shared: check log, check submission, send push + in-app ─────────────────
async function sendReminderIfNeeded({ templateId, companyId, templateName, windowStart, windowEnd, windowLabel, pushBody, inAppMessage }) {
  // Check dedup log
  const [[alreadySent]] = await pool.query(
    `SELECT id FROM checklist_reminder_log WHERE template_id = ? AND window_start = ?`,
    [templateId, windowStart.toISOString()]
  ).catch(() => [[]]);
  if (alreadySent) return;

  // Check if submission exists in the window
  const [[submission]] = await pool.query(
    `SELECT id FROM checklist_submissions
     WHERE template_id = ? AND submitted_at >= ? AND submitted_at < ? LIMIT 1`,
    [templateId, windowStart.toISOString(), windowEnd.toISOString()]
  ).catch(() => [[]]);
  if (submission) return;

  // Mark as notified
  await pool.query(
    `INSERT INTO checklist_reminder_log (template_id, window_start) VALUES (?, ?) ON CONFLICT (template_id, window_start) DO NOTHING`,
    [templateId, windowStart.toISOString()]
  ).catch(() => {});

  // Find assigned users
  const [assignedUsers] = await pool.query(
    `SELECT cu.id, cu.full_name AS "fullName", cu.fcm_token AS "fcmToken", cu.push_token AS "pushToken"
     FROM template_user_assignments tua
     JOIN company_users cu ON cu.id = tua.assigned_to
     WHERE tua.template_id = ? AND tua.template_type = 'checklist' AND cu.status = 'Active'`,
    [templateId]
  ).catch(() => [[]]);

  const pushTitle = "Checklist Reminder 🔔";
  const inAppTitle = "Checklist Not Submitted";

  for (const user of (assignedUsers || [])) {
    // Primary: Expo push (works without Firebase Admin credentials)
    if (user.pushToken) {
      await sendExpoPush(user.pushToken, pushTitle, pushBody, {
        type: "checklist_reminder",
        templateId: String(templateId),
      }).catch(() => {});
    }
    // Secondary: direct FCM
    if (user.fcmToken) {
      await sendFCMPush(user.fcmToken, pushTitle, pushBody, {
        type: "checklist_reminder",
        templateId: String(templateId),
      }).catch(() => {});
    }
    await createNotification({
      companyId, recipientId: user.id, flagId: null,
      type: "checklist_reminder", title: inAppTitle, message: inAppMessage,
    }).catch(() => {});
  }

  // Notify company admins and managers
  const admins = await getManagersToNotify(companyId);

  for (const admin of admins) {
    await createNotification({
      companyId, recipientId: admin.id, flagId: null,
      type: "checklist_reminder", title: inAppTitle, message: inAppMessage,
    }).catch(() => {});
  }

  if ((assignedUsers || []).length > 0 || admins.length > 0) {
    console.log(
      `[ChecklistReminder] Sent reminder for template ${templateId} ("${templateName}") — ${windowLabel}, ` +
      `${(assignedUsers || []).length} user(s), ${admins.length} admin(s)/manager(s) notified.`
    );
  }
}

export function startChecklistReminderJob() {
  ensureReminderLogTable().then(() => {
    console.log(
      `[ChecklistReminder] Job started — checks every ${RUN_INTERVAL_MS / 1000}s`
    );
    runChecklistReminderJob();
    setInterval(runChecklistReminderJob, RUN_INTERVAL_MS);
  });
}
