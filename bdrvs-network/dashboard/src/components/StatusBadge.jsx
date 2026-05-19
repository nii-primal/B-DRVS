/**
 * Renders a compliance status as a tight, uppercase, monospace badge.
 * Accepts the raw chaincode value: 'COMPLIANT', 'SOVEREIGNTY_VIOLATION',
 * or anything else (treated as pending/unknown).
 */
export default function StatusBadge({ status, compact = false }) {
  let cls = 'badge badge--pending';
  let label = 'Pending';

  if (status === 'COMPLIANT') {
    cls = 'badge badge--compliant';
    label = compact ? 'Compliant' : 'Compliant';
  } else if (status === 'SOVEREIGNTY_VIOLATION' || status === 'VIOLATION') {
    cls = 'badge badge--violation';
    label = compact ? 'Violation' : 'Sovereignty violation';
  }

  return (
    <span className={cls}>
      <span className="badge__dot" />
      {label}
    </span>
  );
}
