/**
 * RiskBadge - server-computed risk level of a supervisor location capture.
 * none -> Clear, medium -> Review, high -> High risk. Nothing for null/undefined
 * (or "-" when `placeholder` is set).
 */

import { Badge } from '../ui/Badge';
import { RISK_LABELS } from './captureConstants';

const RISK_VARIANTS = { none: 'success', medium: 'warning', high: 'error' };

export default function RiskBadge({ level, flags, placeholder = false, className }) {
  if (!level || !RISK_LABELS[level]) {
    return placeholder ? <span className="text-gray-400">-</span> : null;
  }
  const title = Array.isArray(flags) && flags.length
    ? flags.slice(0, 4).map((f) => f.message || f.code).join('\n')
    : undefined;
  return (
    <span title={title} className={className}>
      <Badge variant={RISK_VARIANTS[level]}>{RISK_LABELS[level]}</Badge>
    </span>
  );
}
