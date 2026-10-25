import { Badge } from '@/components/ui/badge';
import type { EventStatus, TicketStatus } from '@/types';

const EVENT_TONE = {
  DRAFT: { tone: 'warning', label: 'Draft' },
  PUBLISHED: { tone: 'success', label: 'Published' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
} as const;

const TICKET_TONE = {
  PENDING: { tone: 'warning', label: 'Awaiting payment' },
  CONFIRMED: { tone: 'success', label: 'Confirmed' },
  CHECKED_IN: { tone: 'info', label: 'Checked in' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
} as const;

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { tone, label } = EVENT_TONE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { tone, label } = TICKET_TONE[status];
  return <Badge tone={tone}>{label}</Badge>;
}
