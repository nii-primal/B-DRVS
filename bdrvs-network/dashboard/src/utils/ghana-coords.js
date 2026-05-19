/**
 * Ghana city coordinates and IP-range fallback.
 *
 * For a prototype we use a deterministic mapping: known Ghanaian AFRINIC
 * prefixes resolve to Accra coordinates; unknown / foreign IPs are looked
 * up via a free public service (see geolocation.js).
 *
 * In production this would be replaced by a server-side enrichment step or
 * a bundled MaxMind GeoLite2 database, as discussed in Chapter 1.
 */

export const GHANA_CENTER = { lat: 7.95, lng: -1.05 };

export const GHANA_CITIES = {
  ACCRA: { lat: 5.6037, lng: -0.187, label: 'Accra' },
  KUMASI: { lat: 6.6885, lng: -1.6244, label: 'Kumasi' },
  TAMALE: { lat: 9.4034, lng: -0.8424, label: 'Tamale' },
  TAKORADI: { lat: 4.8845, lng: -1.7554, label: 'Sekondi-Takoradi' },
  CAPE_COAST: { lat: 5.1053, lng: -1.2466, label: 'Cape Coast' },
  TARKWA: { lat: 5.3006, lng: -1.9926, label: 'Tarkwa' },
};

/**
 * Indicative coordinate for a Ghanaian IP. The smart contract already
 * confirmed residency by the time we plot it, so any point inside Ghana
 * is acceptable for visual purposes. Accra is the safe default because
 * the major data centres are there.
 */
export function ghanaCoordForIp(_ip) {
  // A future enhancement could vary by AS owner. For the prototype, Accra.
  return GHANA_CITIES.ACCRA;
}
