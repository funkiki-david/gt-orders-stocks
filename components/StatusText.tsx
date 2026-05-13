import type { FulfillmentStatus, PaymentStatus } from '@/lib/types';

type StatusTextProps = {
  kind: 'fulfillment' | 'payment';
  value?: FulfillmentStatus | PaymentStatus | string | null;
};

function statusColor(kind: StatusTextProps['kind'], value?: string | null) {
  if (kind === 'fulfillment') {
    if (value === 'Billed Closed') return 'text-green-700';
    if (value === 'Cancelled') return 'text-red-700';
    return 'text-yellow-700';
  }

  if (value === 'Paid') return 'text-green-700';
  if (value === 'No Charge') return 'text-red-700';

  return 'text-yellow-700';
}

export function StatusText({ kind, value }: StatusTextProps) {
  const displayValue = value || '—';

  return <span className={`font-semibold ${statusColor(kind, displayValue)}`}>{displayValue}</span>;
}
