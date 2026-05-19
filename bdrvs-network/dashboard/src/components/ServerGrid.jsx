import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import { fmtRelative, fmtRtt, safeId } from '../utils/format.js';

export default function ServerGrid({ servers = [] }) {
  if (!servers.length) {
    return (
      <div className="empty-state">
        <h3>No servers registered</h3>
        <p>Register a health server via POST /api/register or the Register tab to begin monitoring.</p>
      </div>
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Server ID</th>
          <th>Status</th>
          <th>Last IP</th>
          <th>RTT</th>
          <th>Last check-in</th>
          <th>{/* actions */}</th>
        </tr>
      </thead>
      <tbody>
        {servers.map((s) => (
          <tr key={s.serverID}>
            <td className="col-id">
              <Link to={`/servers/${encodeURIComponent(s.serverID)}`}>{safeId(s.serverID)}</Link>
            </td>
            <td>
              <StatusBadge status={s.status} compact />
            </td>
            <td className="col-mono">{s.ipAddress || '—'}</td>
            <td className="col-mono">{fmtRtt(s.rtt)}</td>
            <td>{fmtRelative(s.timestamp)}</td>
            <td className="row-actions">
              <Link
                to={`/servers/${encodeURIComponent(s.serverID)}`}
                className="btn btn--ghost btn--small"
              >
                Inspect
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
