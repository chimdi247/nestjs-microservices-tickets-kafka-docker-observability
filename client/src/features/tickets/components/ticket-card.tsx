'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TicketStatusBadge } from '@/features/events/components/status-badge';
import { useCancelTicket, usePayTicket } from '../hooks/use-tickets';
import { dateParts, formatDateTime, formatPrice, isPast } from '@/lib/format';
import type { MyTicket } from '@/types';

function minutesLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export function TicketCard({ ticket }: { ticket: MyTicket }) {
  const cancel = useCancelTicket();
  const pay = usePayTicket();
  const { month, day } = dateParts(ticket.eventDate);
  const upcoming = !isPast(ticket.eventDate);
  const pending = ticket.status === 'PENDING' && ticket.eventStatus === 'PUBLISHED';
  const left = minutesLeft(ticket.expiresAt);
  const expired = pending && left === 0;
  const cancellable = upcoming && (ticket.status === 'CONFIRMED' || pending);
  const dimmed = ticket.status === 'CANCELLED';

  function onCancel() {
    const refundNote =
      ticket.status === 'CONFIRMED' && ticket.totalPrice > 0
        ? ' You will be refunded.'
        : '';
    if (
      window.confirm(
        `Cancel ${ticket.quantity} ticket${ticket.quantity > 1 ? 's' : ''} for "${ticket.eventTitle}"?${refundNote}`,
      )
    ) {
      cancel.mutate(ticket.id);
    }
  }

  return (
    <article
      className={`flex overflow-hidden rounded-xl border bg-card ${dimmed ? 'opacity-60' : ''}`}
    >
      <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-primary px-2 text-primary-foreground">
        <span className="text-sm font-medium">{month}</span>
        <span className="text-3xl leading-none font-semibold tabular-nums">{day}</span>
      </div>

      <div aria-hidden className="relative w-0 border-l-2 border-dashed border-border">
        <span className="absolute -top-2.5 -left-2.25 size-4 rounded-full border bg-background" />
        <span className="absolute -bottom-2.5 -left-2.25 size-4 rounded-full border bg-background" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/events/${ticket.eventId}`}
              className="font-semibold hover:underline"
            >
              {ticket.eventTitle}
            </Link>
            <TicketStatusBadge status={ticket.status} />
            {ticket.eventStatus === 'CANCELLED' && ticket.status !== 'CANCELLED' && (
              <span className="text-xs text-red-700">Event cancelled</span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {formatDateTime(ticket.eventDate)} &middot; {ticket.eventLocation}
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ticket.quantity} ticket{ticket.quantity > 1 ? 's' : ''} &middot;{' '}
            {formatPrice(ticket.totalPrice)}
          </p>
          {pending && (
            <p className="mt-1 text-sm text-amber-800">
              {expired
                ? 'The payment window has closed. The seats are being released.'
                : left !== null
                  ? `Seats are held for ${left} more minute${left === 1 ? '' : 's'}.`
                  : 'Complete the payment to confirm your booking.'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {ticket.status === 'CONFIRMED' || ticket.status === 'CHECKED_IN' ? (
            <span className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm tracking-widest">
              {ticket.ticketCode}
            </span>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {pending && !expired && (
              <Button size="sm" disabled={pay.isPending} onClick={() => pay.mutate(ticket.id)}>
                {pay.isPending ? 'Opening...' : 'Pay now'}
              </Button>
            )}
            {cancellable && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={cancel.isPending}
              >
                {cancel.isPending
                  ? 'Cancelling...'
                  : pending
                    ? 'Cancel booking'
                    : 'Cancel ticket'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
