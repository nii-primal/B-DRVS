import { format, formatDistanceToNow, parseISO } from 'date-fns';

/** Normalise any timestamp input into a Date, or null if invalid. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value > 1e12 ? value : value * 1000);
  try {
    return parseISO(value);
  } catch {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}

export function fmtDateTime(value) {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy · HH:mm:ss') : '—';
}

export function fmtRelative(value) {
  const d = toDate(value);
  if (!d) return '—';
  return formatDistanceToNow(d, { addSuffix: true });
}

export function fmtRtt(rtt) {
  if (rtt === null || rtt === undefined || isNaN(rtt)) return '—';
  return `${Number(rtt).toFixed(1)} ms`;
}

/** Truncate a long hex/base64 hash for compact display. */
export function shortHash(hash, head = 8, tail = 6) {
  if (!hash) return '—';
  const s = String(hash);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Coerce server identifier to a safe-looking string. */
export function safeId(id) {
  if (!id) return '—';
  return String(id);
}
