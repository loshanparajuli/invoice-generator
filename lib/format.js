const formatters = {
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }),
  NPR: new Intl.NumberFormat("en-US", { style: "currency", currency: "NPR", minimumFractionDigits: 2 }),
};

export function fmtMoney(n, currencyCode) {
  const v = Number(n);
  return formatters[currencyCode].format(Number.isFinite(v) ? v : 0);
}

const plainNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A currency-code-free number (e.g. "10,000.00") — used where the currency is
// already established elsewhere (the black Total Due box) and repeating it on
// every line item row would be noisy.
export function fmtNumber(n) {
  const v = Number(n);
  return plainNumber.format(Number.isFinite(v) ? v : 0);
}

// Calendar-date formatter (no timezone conversion — an ISO "YYYY-MM-DD" is
// anchored to UTC noon-equivalent so it never shifts a day depending on the
// reader's local clock).
export function fmtDate(isoStr) {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Team payday falls on Wednesdays. Given an issue date, roll forward to
// that date if it's already a Wednesday, otherwise the next one.
export function nextWednesdayISO(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  if (!y || !m || !d) return isoStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun ... 3=Wed ... 6=Sat
  const diff = (3 - day + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function addDaysISO(isoStr, days) {
  const [y, m, d] = isoStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function randomGenNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `INV-${year}-${rand}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const PACIFIC_TZ = "America/Los_Angeles";

// Offset (in minutes, e.g. -420 for PDT / -480 for PST) between UTC and
// America/Los_Angeles for a given "naive" instant (a Date built as if the
// wall-clock numbers were UTC). Correctly reflects DST for that date.
function pacificOffsetMinutes(naiveUTCms) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  dtf.formatToParts(new Date(naiveUTCms)).forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return (asUTC - naiveUTCms) / 60000;
}

// Converts a Pacific-time wall clock (date "YYYY-MM-DD" + time "HH:MM") into
// the real UTC instant (epoch ms) it represents, correctly handling DST.
export function pacificWallTimeToInstant(dateISO, timeHHMM) {
  if (!dateISO || !timeHHMM) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const offset1 = pacificOffsetMinutes(naive);
  const guess = naive - offset1 * 60000;
  const offset2 = pacificOffsetMinutes(guess);
  return naive - offset2 * 60000;
}

export function formatPacificDateTime(instantMs) {
  if (!instantMs) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(instantMs));
}

export function formatDurationMs(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
