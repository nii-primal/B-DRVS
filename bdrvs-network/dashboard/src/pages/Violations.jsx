import { useMemo } from 'react';
import usePolling from '../hooks/usePolling.js';
import { getViolations } from '../api/client.js';
import ViolationsList from '../components/ViolationsList.jsx';
import { fmtRelative } from '../utils/format.js';

export default function Violations() {
  const { data, error, loading, lastUpdated } = usePolling(getViolations, []);

  const violations = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.violations || [];
  }, [data]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Immutable ledger · Filtered</span>
          <h1 style={{ marginTop: '0.5rem' }}>Sovereignty violations</h1>
        </div>
        <div className="page-head__meta">
          <span>
            <span className="eyebrow">Records</span>&nbsp;&nbsp;
            <span className="mono">{violations.length}</span>
          </span>
          <span>
            <span className="eyebrow">Refreshed</span>&nbsp;&nbsp;
            <span className="mono">{fmtRelative(lastUpdated)}</span>
          </span>
        </div>
      </div>

      {loading && <div className="loading-rule" style={{ marginBottom: '1.5rem' }} />}
      {error && <div className="error-box">{error.message || String(error)}</div>}

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">All recorded violations</span>
          <span className="eyebrow">Ordered by timestamp</span>
        </div>
        <div className="panel__body dense">
          <ViolationsList violations={violations} />
        </div>
      </section>

      <p
        style={{
          marginTop: '1.5rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--ink-3)',
          lineHeight: 1.6,
        }}
      >
        Every record above was committed to the bdrvschannel ledger after dual endorsement by
        MoHMSP and NITAMSP peers. Records cannot be edited, removed, or back-dated and may
        be exported as evidence via the server detail page.
      </p>
    </>
  );
}
