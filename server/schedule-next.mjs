// server/schedule-next.mjs — Phase 3 S4: compute a task's next fire time (ms, UTC) from the SHARED desktop
// schedule model { mode, everyMinutes, time, weekday }. Timezone-aware: daily/weekly fire at a local wall-clock
// HH:MM in the task's IANA `tz`, because the server runs in UTC while the user picked a local time on desktop.
// Pure + unit-tested (incl. DST). No deps beyond Intl (full ICU ships with Node 18+).

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Wall-clock components of `ts` (UTC ms) as observed in IANA `tz`.
function partsInTz(ts, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
  const p = {}; for (const part of fmt.formatToParts(ts)) p[part.type] = part.value;
  return { y: +p.year, mo: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second, wd: WD[p.weekday] };
}
// tz offset (ms) at instant ts:  offset = (wall-clock-as-if-UTC) - ts.
function offsetMs(ts, tz) {
  const c = partsInTz(ts, tz);
  return Date.UTC(c.y, c.mo - 1, c.d, c.hh, c.mm, c.ss) - ts;
}
// Convert a desired wall-clock in `tz` to the real UTC instant (ms). Recompute offset at the guess for DST.
function zonedTimeToUtc(y, mo, d, hh, mm, tz) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
  return guess - offsetMs(guess, tz);
}
function parseHHMM(time) {
  const m = String(time == null ? "09:00" : time).match(/^(\d{1,2}):(\d{2})$/);
  let hh = m ? +m[1] : 9, mm = m ? +m[2] : 0;
  if (!(hh >= 0 && hh <= 23)) hh = 9;
  if (!(mm >= 0 && mm <= 59)) mm = 0;
  return [hh, mm];
}

// Returns the next fire time in ms (UTC), or 0 for "off"/manual (never auto-fires).
export function computeNextRunAt(schedule, fromTs = Date.now(), tz = "UTC") {
  const sc = schedule || {};
  const mode = sc.mode || "off";
  if (mode === "off") return 0;
  if (mode === "interval") {
    const mins = Math.max(1, Math.floor(Number(sc.everyMinutes) || 60));
    return fromTs + mins * 60000;
  }
  if (!tz) tz = "UTC";
  const [hh, mm] = parseHHMM(sc.time);
  if (mode === "daily") {
    const c = partsInTz(fromTs, tz);
    let cand = zonedTimeToUtc(c.y, c.mo, c.d, hh, mm, tz);
    let guard = 0;
    while (cand <= fromTs && guard++ < 4) { const n = partsInTz(cand + 24 * 3600000, tz); cand = zonedTimeToUtc(n.y, n.mo, n.d, hh, mm, tz); }
    return cand;
  }
  if (mode === "weekly") {
    const targetWd = Math.min(6, Math.max(0, Math.floor(Number(sc.weekday == null ? 1 : sc.weekday))));
    let probe = fromTs;
    for (let i = 0; i < 8; i++) {
      const c = partsInTz(probe, tz);
      if (c.wd === targetWd) { const cand = zonedTimeToUtc(c.y, c.mo, c.d, hh, mm, tz); if (cand > fromTs) return cand; }
      probe += 24 * 3600000;
    }
    return fromTs + 7 * 24 * 3600000; // unreachable safety net
  }
  return 0;
}

// Coerce arbitrary input into a valid schedule { mode, everyMinutes?, time?, weekday? }.
export function sanitizeSchedule(sc) {
  const s = sc || {};
  const mode = ["off", "interval", "daily", "weekly"].includes(s.mode) ? s.mode : "off";
  const out = { mode };
  if (mode === "interval") out.everyMinutes = Math.max(1, Math.floor(Number(s.everyMinutes) || 60));
  if (mode === "daily" || mode === "weekly") out.time = /^(\d{1,2}):(\d{2})$/.test(String(s.time || "")) ? String(s.time) : "09:00";
  if (mode === "weekly") out.weekday = Math.min(6, Math.max(0, Math.floor(Number(s.weekday == null ? 1 : s.weekday))));
  return out;
}

// Is a non-off schedule? (UI/scheduler "enabled" derives from this.)
export function isActiveSchedule(schedule) {
  const m = (schedule && schedule.mode) || "off";
  return m === "interval" || m === "daily" || m === "weekly";
}
