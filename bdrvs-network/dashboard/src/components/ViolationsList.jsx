import { Link } from 'react-router-dom';
import { fmtDateTime, fmtRtt, shortHash } from '../utils/format.js';

export default function ViolationsList({ violations = [], compact = false }) {
  if (!violations.length) {
    return (
      <div className="empty-state">
        <h3>No violations recorded</h3>
        <p>The blockchain has no sovereignty violation entries on this channel.</p>
      </div>
    );
  }

  const rows = compact ? violations.slice(0, 8) : violations;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Server</th>
          <th>Foreign IP</th>
          <th>RTT</th>
          {!compact && <th>Payload hash</th>}
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v, i) => (
          <tr key={`${v.serverID}-${v.timestamp}-${i}`}>
            <td className="col-mono">{fmtDateTime(v.timestamp)}</td>
            <td className="col-id">
              <Link to={`/servers/${encodeURIComponent(v.serverID)}`}>{v.serverID}</Link>
            </td>
            <td className="col-mono" style={{ color: '#ce1126' }}>
              {v.ipAddress || '—'}
            </td>
            <td className="col-mono">{fmtRtt(v.rtt)}</td>
            {!compact && (
              <td className="col-mono" title={v.payloadHash}>
                {shortHash(v.payloadHash)}
              </td>
            )}
            <td>{v.reason || 'IP outside Ghana AFRINIC range'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
