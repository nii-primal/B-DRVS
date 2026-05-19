import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { getStatus, getHistory, getStats, getConfig } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import LatencyChart from '../components/LatencyChart.jsx';
import ComplianceTimeline from '../components/ComplianceTimeline.jsx';
import EvidenceExport from '../components/EvidenceExport.jsx';
import { fmtDateTime, fmtRelative, fmtRtt, shortHash } from '../utils/format.js';

export default function ServerDetail() {
  const { id } = useParams();
  const [server, setServer] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [s, h, st, cfg] = await Promise.all([
          getStatus(id).catch(() => null),
          getHistory(id).catch(() => null),
          getStats(id).catch(() => null),
          getConfig().catch(() => null),
        ]);
        if (cancelled) return;
        setServer(s ? { serverID: id, ...s } : { serverID: id });
        const hArr = h?.history || (Array.isArray(h) ? h : []);
        setHistory(hArr);
        setStats(st);
        setConfig(cfg);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const poll = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [id]);

  const threshold = config?.rttThreshold ?? config?.RTT_THRESHOLD ?? 50;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/" className="eyebrow" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={12} />
            Overview
          </Link>
          <h1 style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '1.5rem' }}>{id}</h1>
        </div>
        <div className="page-head__meta">
          <StatusBadge status={server?.status} />
          <EvidenceExport server={server} history={history} stats={stats} />
        </div>
      </div>

      {loading && <div className="loading-rule" style={{ marginBottom: '1.5rem' }} />}
      {error && <div className="error-box">{error}</div>}

      <div className="detail-summary" style={{ marginBottom: '2rem' }}>
        <div>
          <div className="eyebrow">Latest IP</div>
          <strong>{server?.ipAddress || '—'}</strong>
        </div>
        <div>
          <div className="eyebrow">Latest RTT</div>
          <strong>{fmtRtt(server?.rtt)}</strong>
        </div>
        <div>
          <div className="eyebrow">Last check-in</div>
          <strong>{fmtRelative(server?.timestamp)}</strong>
        </div>
        <div>
          <div className="eyebrow">Total check-ins</div>
          <strong>{stats?.totalCheckins ?? history.length}</strong>
        </div>
        <div>
          <div className="eyebrow">Compliance rate</div>
          <strong>
            {stats?.complianceRate != null
              ? `${Number(stats.complianceRate).toFixed(1)} %`
              : history.length
                ? `${(
                    (history.filter((h) => h.status === 'COMPLIANT').length /
                      history.length) *
                    100
                  ).toFixed(1)} %`
                : '—'}
          </strong>
        </div>
        <div>
          <div className="eyebrow">Violations recorded</div>
          <strong style={{ color: '#ce1126' }}>
            {stats?.violationCount ?? history.filter((h) => h.status !== 'COMPLIANT').length}
          </strong>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Round-Trip Time trend</span>
            <span className="eyebrow">Threshold {threshold} ms</span>
          </div>
          <div className="panel__body">
            <LatencyChart history={history} threshold={threshold} />
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Compliance timeline</span>
            <span className="eyebrow">Hourly</span>
          </div>
          <div className="panel__body">
            <ComplianceTimeline history={history} />
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '2rem' }}>
        <div className="panel__head">
          <span className="panel__title">Audit trail</span>
          <span className="eyebrow">{history.length} records</span>
        </div>
        <div className="panel__body dense">
          {history.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>IP</th>
                  <th>RTT</th>
                  <th>Payload hash</th>
                </tr>
              </thead>
              <tbody>
                {[...history]
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map((h, idx) => (
                    <tr key={`${h.timestamp}-${idx}`}>
                      <td className="col-mono">{fmtDateTime(h.timestamp)}</td>
                      <td>
                        <StatusBadge status={h.status} compact />
                      </td>
                      <td className="col-mono">{h.ipAddress || '—'}</td>
                      <td className="col-mono">{fmtRtt(h.rtt)}</td>
                      <td className="col-mono" title={h.payloadHash}>
                        {shortHash(h.payloadHash, 10, 8)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <h3>No check-in records</h3>
              <p>The probing agent has not yet submitted any check-ins for this server.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
