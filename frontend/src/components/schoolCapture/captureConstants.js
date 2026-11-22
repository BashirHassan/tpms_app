export const NIGERIAN_PHONE = /^(\+?234|0)[789]\d{9}$/;

export const STATUS_META = {
  not_started: { label: 'Not started', className: 'bg-gray-100 text-gray-700 ring-gray-200' },
  not_required: { label: 'Not needed', className: 'bg-gray-50 text-gray-500 ring-gray-200' },
  pending: { label: 'Pending review', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  approved: { label: 'Approved', className: 'bg-green-50 text-green-700 ring-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export function errorMessage(err, fallback) {
  return err?.response?.data?.message || fallback;
}

export const RISK_LABELS = { none: 'Clear', medium: 'Review', high: 'High risk' };
export const riskLabel = (level) => RISK_LABELS[level] || '';
