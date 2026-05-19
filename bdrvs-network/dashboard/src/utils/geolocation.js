import { ghanaCoordForIp, GHANA_CENTER } from './ghana-coords.js';

/**
 * IP → geographic coordinate resolution.
 *
 * Strategy:
 *  - If the record's status is COMPLIANT, the smart contract has already
 *    verified the IP belongs to a Ghanaian AFRINIC range. Plot it in
 *    Accra (the major data-centre cluster) without a network call.
 *  - For SOVEREIGNTY_VIOLATION records we want to show *where the data
 *    actually went* — India, Frankfurt, etc. We look these up via
 *    ip-api.com which is free for ≤45 req/min without an API key.
 *  - Results are cached in memory (and sessionStorage when available)
 *    to keep us comfortably under the rate limit during a session.
 *
 * If lookup fails the record falls back to the centre of Ghana so the
 * dashboard never breaks on a network hiccup.
 */

const memCache = new Map();

function loadStored() {
  try {
    const raw = sessionStorage.getItem('bdrvs.geoip');
    if (raw) {
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([k, v]) => memCache.set(k, v));
    }
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    const obj = Object.fromEntries(memCache.entries());
    sessionStorage.setItem('bdrvs.geoip', JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

loadStored();

export async function geolocate(ip, status) {
  if (!ip) return { ...GHANA_CENTER, label: 'Unknown' };

  if (status === 'COMPLIANT') {
    const coord = ghanaCoordForIp(ip);
    return { ...coord, label: `${coord.label}, Ghana` };
  }

  if (memCache.has(ip)) return memCache.get(ip);

  try {
    const res = await fetch(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,lat,lon`,
    );
    const data = await res.json();
    if (data.status === 'success') {
      const result = {
        lat: data.lat,
        lng: data.lon,
        label: [data.city, data.country].filter(Boolean).join(', ') || 'Unknown',
      };
      memCache.set(ip, result);
      persist();
      return result;
    }
  } catch {
    /* network failure — fall through */
  }

  const fallback = { ...GHANA_CENTER, label: 'Unresolved' };
  memCache.set(ip, fallback);
  return fallback;
}
