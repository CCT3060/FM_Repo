import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY         = "fm_alert_sound_enabled";
const STORAGE_VOLUME      = "fm_alert_volume";
const STORAGE_SEV_CONFIG  = "fm_alert_severity_config";

/**
 * Alarm sound patterns per severity level.
 * Each step: { f: frequency (Hz), d: duration (s), type: OscillatorType }
 *
 * Severity map (aliases accepted):
 *   critical           – rapid alternating square-wave alarm (6 pulses)
 *   warning | high     – 3-beep descending sawtooth
 *   medium             – 2-beep soft sawtooth
 *   info               – rising 2-tone sine (friendly notification)
 *   low                – single soft sine beep
 */
const PATTERNS = {
  critical: [
    { f: 1100, d: 0.12, type: "square" },
    { f: 700,  d: 0.12, type: "square" },
    { f: 1100, d: 0.12, type: "square" },
    { f: 700,  d: 0.12, type: "square" },
    { f: 1100, d: 0.12, type: "square" },
    { f: 700,  d: 0.12, type: "square" },
  ],
  warning: [
    { f: 960, d: 0.18, type: "sawtooth" },
    { f: 720, d: 0.18, type: "sawtooth" },
    { f: 960, d: 0.18, type: "sawtooth" },
  ],
  high: [
    { f: 960, d: 0.18, type: "sawtooth" },
    { f: 720, d: 0.18, type: "sawtooth" },
    { f: 960, d: 0.18, type: "sawtooth" },
  ],
  medium: [
    { f: 600, d: 0.22, type: "sawtooth" },
    { f: 480, d: 0.22, type: "sawtooth" },
  ],
  info: [
    { f: 520, d: 0.15, type: "sine" },
    { f: 660, d: 0.20, type: "sine" },
  ],
  low: [
    { f: 400, d: 0.28, type: "sine" },
  ],
};

/**
 * useAlertSound
 *
 * Reusable hook providing a modular alert sound system for any dashboard
 * component. Uses a single shared AudioContext instance (never recreated
 * per-call) and throttles rapid-fire events to prevent overlapping sounds.
 *
 * Returns:
 *   play(severity)                  – play the alarm (respects all settings)
 *   preview(severity)               – force-play for test button (no throttle / no enabled check)
 *   enabled                         – master on/off (localStorage)
 *   toggle()                        – flip master on/off
 *   volume                          – 0–1 gain multiplier (localStorage)
 *   updateVolume(v)                 – set volume and persist
 *   severityConfig                  – { critical, high, warning, medium, low, info } booleans
 *   updateSeverityConfig(sev, bool) – enable / disable one severity and persist
 *
 * Supported severity values:
 *   "critical", "warning", "high", "medium", "info", "low"
 */
export function useAlertSound() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== "false"
  );

  const [volume, setVolumeState] = useState(() => {
    const v = parseFloat(localStorage.getItem(STORAGE_VOLUME));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
  });

  const [severityConfig, setSeverityConfigState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SEV_CONFIG) || "{}");
    } catch {
      return {};
    }
  });

  /** Shared AudioContext — lazily created, never closed mid-session. */
  const ctxRef = useRef(null);
  /** Active oscillators from the last play() call. */
  const activeRef = useRef([]);
  /** Timestamp of last play() call — used for 500 ms throttle. */
  const lastPlayTs = useRef(0);

  // Keep a ref to volume so preview/play closures always see the latest value
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const sevConfigRef = useRef(severityConfig);
  useEffect(() => { sevConfigRef.current = severityConfig; }, [severityConfig]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const stopCurrent = useCallback(() => {
    activeRef.current.forEach((osc) => {
      try { osc.stop(); } catch (_) {}
    });
    activeRef.current = [];
  }, []);

  /** Internal: synthesise and play steps array at given volume multiplier. */
  const _synthesise = useCallback((key, volMultiplier) => {
    stopCurrent();
    const ctx   = getCtx();
    const steps = PATTERNS[key] || PATTERNS.high;
    const base  = key === "critical" ? 0.65 : 0.45;
    const vol   = base * Math.max(0, Math.min(1, volMultiplier));

    let t = ctx.currentTime;
    const newOscs = [];
    steps.forEach(({ f, d, type }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d);
      osc.start(t);
      osc.stop(t + d + 0.01);
      newOscs.push(osc);
      t += d + 0.05;
    });
    activeRef.current = newOscs;
  }, [getCtx, stopCurrent]);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Play an alert sound.
   * Respects master toggle, per-severity toggle, volume, and 500 ms throttle.
   */
  const play = useCallback((severity = "high") => {
    if (!enabled) return;
    const key = String(severity).toLowerCase();
    // Per-severity check (defaults to enabled if not explicitly set)
    if (sevConfigRef.current[key] === false) return;

    const now = Date.now();
    if (now - lastPlayTs.current < 500) return;
    lastPlayTs.current = now;

    try {
      _synthesise(key, volumeRef.current);
    } catch (_) {}
  }, [enabled, _synthesise]);

  /**
   * Force-play for preview buttons — no throttle, no enabled/severity checks.
   */
  const preview = useCallback((severity = "high") => {
    const key = String(severity).toLowerCase();
    try {
      _synthesise(key, volumeRef.current);
    } catch (_) {}
  }, [_synthesise]);

  /** Toggle master alert sound on / off. */
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  /** Set volume (0–1) and persist. */
  const updateVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    localStorage.setItem(STORAGE_VOLUME, String(clamped));
    setVolumeState(clamped);
  }, []);

  /**
   * Enable or disable sound for a specific severity level.
   * @param {"critical"|"high"|"warning"|"medium"|"low"|"info"} sev
   * @param {boolean} val
   */
  const updateSeverityConfig = useCallback((sev, val) => {
    setSeverityConfigState((prev) => {
      const next = { ...prev, [String(sev).toLowerCase()]: Boolean(val) };
      localStorage.setItem(STORAGE_SEV_CONFIG, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      try { ctxRef.current?.close(); } catch (_) {}
    },
    []
  );

  return {
    play,
    preview,
    enabled,
    toggle,
    volume,
    updateVolume,
    severityConfig,
    updateSeverityConfig,
  };
}
