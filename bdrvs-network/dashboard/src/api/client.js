import axios from 'axios';

/**
 * REST Gateway API Client
 *
 * Wraps the eight endpoints exposed by the B-DRVS REST gateway
 * (gateway/server.js on port 3000) so the rest of the dashboard
 * stays decoupled from HTTP transport details.
 *
 * In development requests are proxied by Vite (see vite.config.js).
 * In production, point VITE_API_BASE_URL at the gateway origin.
 */

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const http = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Light response normaliser — every helper returns response data only.
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      const msg =
        err.response.data?.error ||
        err.response.data?.message ||
        `Gateway error ${err.response.status}`;
      return Promise.reject(new Error(msg));
    }
    if (err.request) {
      return Promise.reject(new Error('Gateway unreachable. Is the REST API running on port 3000?'));
    }
    return Promise.reject(err);
  },
);

// ----- Health / config ----------------------------------------------------

export const getHealth = () => http.get('/health').then((r) => r.data);

export const getConfig = () => http.get('/config').then((r) => r.data);

// ----- Server registration & lifecycle ------------------------------------

export const registerServer = (payload) =>
  http.post('/register', payload).then((r) => r.data);

export const submitCheckin = (payload) =>
  http.post('/checkin', payload).then((r) => r.data);

// ----- Read endpoints -----------------------------------------------------

export const getStatus = (serverID) =>
  http.get(`/status/${encodeURIComponent(serverID)}`).then((r) => r.data);

export const getHistory = (serverID) =>
  http.get(`/history/${encodeURIComponent(serverID)}`).then((r) => r.data);

export const getStats = (serverID) =>
  http.get(`/stats/${encodeURIComponent(serverID)}`).then((r) => r.data);

export const getViolations = () => http.get('/violations').then((r) => r.data);

/**
 * Optional endpoint — list every registered server.
 * If your gateway doesn't yet expose GET /api/servers, the dashboard falls
 * back to deriving the list from the violations endpoint plus locally
 * remembered IDs. See README for the recommended gateway patch.
 */
export const listServers = () =>
  http
    .get('/servers')
    .then((r) => r.data)
    .catch(() => null);

export default http;
