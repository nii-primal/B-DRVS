import { useEffect, useState, useMemo } from 'react';
import { listServers, getViolations, getStatus, getConfig } from '../api/client.js';
import usePolling from '../hooks/usePolling.js';
import ComplianceMap from '../components/ComplianceMap.jsx';
import ServerGrid from '../components/ServerGrid.jsx';
import ViolationsList from '../components/ViolationsList.jsx';
import { fmtRelative } from '../utils/format.js';

/**
 * Overview page.
 *
 * Strategy for assembling the server list:
 *  1. Prefer GET /api/servers if the gateway exposes it.
 *  2. Otherwise derive distinct server IDs from /api/violations and
 *     locally remembered registrations.
 *  3. For each known server fetch its latest status via /api/status/:id.
 */
export default function Dashboard() {
  const [serverList, setServerList] = useState([]);
  const [config, setConfig] = useState(null);

  const { data: violationsResp, lastUpdated } = usePolling(getViolations, []);

  // Resolve config once
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  // Resolve the server list whenever violations refresh
  useEffect(() => {
    let cancelled = false;

    async function load() {
      let ids = [];
      const reg = await listServers();
      if (reg && Array.isArray(reg.servers)) {
        ids = reg.servers.map((s) => s.serverID || s.id || s);
      } else if (reg && Array.isArray(reg)) {
        ids = reg.map((s) => s.serverID || s.id || s);
      }

      // Augment with violation server IDs
      const v = violationsResp?.violations || violationsResp || [];
      v.forEach((row) => {
        if (row.serverID && !ids.includes(row.serverID)) ids.push(row.serverID);
      });

      // Augment with locally remembered registrations
      try {
        const local = JSON.parse(localStorage.getItem('bdrvs.knownServers') || '[]');
        local.forEach((id) => {
          if (id && !ids.includes(id)) ids.push(id);
        });
      } catch {
        /* ignore */
      }

      // Hydrate each ID with its latest status
      const records = await Promise.all(
        ids.map((id) =>
          getStatus(id)
            .then((s) => ({ serverID: id, ...s }))
            .catch(() => ({ serverID: id, status: 'PENDING' })),
        ),
      );

      if (!cancelled) setServerList(records);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [violationsResp]);

  const violations = useMemo(
    () => violationsResp?.violations || (Array.isArray(violationsResp) ? violationsResp : []),
    [violationsResp],
  );

  const stats = useMemo(() => {
    const total = serverList.length;
    const compliant = serverList.filter((s) => s.status === 'COMPLIANT').length;
    const inViolation = serverList.filter(
      (s) => s.status === 'SOVEREIGNTY_VIOLATION' || s.status === 'VIOLATION',
    ).length;
    return { total, compliant, inViolation, violationsTotal: violations.length };
  }, [serverList, violations]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Tier 3 · Regulator console</span>
          <h1 style={{ marginTop: '0.5rem' }}>Sovereignty Overview</h1>
        </div>
        <div className="page-head__meta">
          <span>
            <span className="eyebrow">Channel</span>&nbsp;&nbsp;<span className="mono">bdrvschannel</span>
          </span>
          <span>
            <span className="eyebrow">RTT threshold</span>&nbsp;&nbsp;
            <span className="mono">{config?.rttThreshold ?? config?.RTT_THRESHOLD ?? 50} ms</span>
          </span>
          <span>
            <span className="eyebrow">Refreshed</span>&nbsp;&nbsp;
            <span className="mono">{fmtRelative(lastUpdated)}</span>
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Servers monitored</span>
          <span className="stat-card__value">{stats.total}</span>
          <span className="stat-card__sub">across all peers</span>
        </div>
        <div className="stat-card stat-card--compliant">
          <span className="stat-card__label">Compliant</span>
          <span className="stat-card__value">{stats.compliant}</span>
          <span className="stat-card__sub">last check-in within range</span>
        </div>
        <div className="stat-card stat-card--violation">
          <span className="stat-card__label">In violation</span>
          <span className="stat-card__value">{stats.inViolation}</span>
          <span className="stat-card__sub">latest record flagged</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Total violation events</span>
          <span className="stat-card__value">{stats.violationsTotal}</span>
          <span className="stat-card__sub">on the immutable ledger</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Compliance map</span>
            <span className="eyebrow">Real-time</span>
          </div>
          <div className="panel__body dense">
            <ComplianceMap servers={serverList} />
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Recent violations</span>
            <span className="eyebrow">Newest first</span>
          </div>
          <div className="panel__body dense">
            <ViolationsList violations={violations} compact />
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '2rem' }}>
        <div className="panel__head">
          <span className="panel__title">Monitored servers</span>
          <span className="eyebrow">{serverList.length} total</span>
        </div>
        <div className="panel__body dense">
          <ServerGrid servers={serverList} />
        </div>
      </section>
    </>
  );
}
