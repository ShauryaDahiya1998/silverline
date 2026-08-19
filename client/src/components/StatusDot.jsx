import { STATUS_COLORS } from '../utils/helpStatus';

// Small status indicator shared by every Help ongoing/history table, the
// Help history detail page, and the "Help status" legend on Home (helper/
// beneficiary) and Admin Home — every stage renders as a colored dot except
// Deleted, which renders as a red X instead, so a deleted help item reads
// unambiguously at a glance rather than blending in with the dots
// (STATUS_COLORS still has a Deleted entry too, used for the sizing/
// layout parity below and any spot that still wants the raw color).
export default function StatusDot({ label, className = 'w-3 h-3' }) {
  if (label === 'Deleted') {
    return (
      <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} fill="none" stroke={STATUS_COLORS['Deleted']} strokeWidth="3.5" strokeLinecap="round">
        <line x1="5" y1="5" x2="19" y2="19" />
        <line x1="19" y1="5" x2="5" y2="19" />
      </svg>
    );
  }
  return <span className={`${className} rounded-full flex-shrink-0 inline-block`} style={{ backgroundColor: STATUS_COLORS[label] }} />;
}
