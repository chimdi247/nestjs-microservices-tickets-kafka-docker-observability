'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageSpinner } from '@/components/state';
import {
  EventStatusBadge,
  TicketStatusBadge,
} from '@/features/events/components/status-badge';
import {
  useCancelEvent,
  useEvent,
  useEventAttendees,
  usePublishEvent,
} from '@/features/events/hooks/use-events';
import { useCheckIn } from '@/features/tickets/hooks/use-tickets';
import { formatDateTime, formatPrice } from '@/lib/format';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ManageEvent({ id }: { id: string }) {
  const event = useEvent(id);
  const attendees = useEventAttendees(id);
  const publish = usePublishEvent();
  const cancel = useCancelEvent();
  const checkIn = useCheckIn();

  if (event.isLoading) return <PageSpinner />;
  if (event.isError || !event.data) {
    return (
      <ErrorState
        title="Event not found"
        message={event.error?.message}
        onRetry={() => event.refetch()}
      />
    );
  }

  const e = event.data;
  const tickets = attendees.data ?? [];
  // revenue counts paid tickets only (not unpaid reservations, not cancelled/refunded ones)
  const live = tickets.filter(
    (t) => t.status === 'CONFIRMED' || t.status === 'CHECKED_IN',
  );
  const checkedIn = tickets
    .filter((t) => t.status === 'CHECKED_IN')
    .reduce((sum, t) => sum + t.quantity, 0);
  const revenue = live.reduce((sum, t) => sum + t.totalPrice, 0);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/organizer" className="text-sm text-muted-foreground hover:underline">
          Your events
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{e.title}</h1>
            <EventStatusBadge status={e.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/events/${e.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Public page
            </Link>
            {e.status !== 'CANCELLED' && (
              <Link
                href={`/organizer/events/${e.id}/edit`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Edit
              </Link>
            )}
            {e.status === 'DRAFT' && (
              <Button
                size="sm"
                disabled={publish.isPending}
                onClick={() => publish.mutate(e.id)}
              >
                {publish.isPending ? 'Publishing...' : 'Publish'}
              </Button>
            )}
            {e.status !== 'CANCELLED' && (
              <Button
                size="sm"
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancel this event? Every unused ticket will be cancelled and attendees notified.',
                    )
                  ) {
                    cancel.mutate(e.id);
                  }
                }}
              >
                Cancel event
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-muted-foreground">
          {formatDateTime(e.date)} &middot; {e.location} &middot; {formatPrice(e.price)} per ticket
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Seats sold" value={`${e.ticketsSold} / ${e.capacity}`} />
        <Stat label="Seats left" value={e.availableTickets} />
        <Stat label="Checked in" value={checkedIn} />
        <Stat label="Revenue" value={formatPrice(revenue) === 'Free' ? '$0.00' : formatPrice(revenue)} />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Attendees</h2>
        {attendees.isLoading ? (
          <PageSpinner />
        ) : attendees.isError ? (
          <ErrorState
            title="Could not load attendees"
            message={attendees.error.message}
            onRetry={() => attendees.refetch()}
          />
        ) : tickets.length === 0 ? (
          <EmptyState title="No bookings yet">
            {e.status === 'DRAFT'
              ? 'Publish the event so people can book tickets.'
              : 'Bookings appear here as soon as someone buys a ticket.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Attendee</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.attendeeName}</div>
                      <div className="text-muted-foreground">{t.attendeeEmail}</div>
                    </td>
                    <td className="px-4 py-3 font-mono tracking-wider">{t.ticketCode}</td>
                    <td className="px-4 py-3 tabular-nums">{t.quantity}</td>
                    <td className="px-4 py-3 tabular-nums">{formatPrice(t.totalPrice)}</td>
                    <td className="px-4 py-3">
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'CONFIRMED' && e.status === 'PUBLISHED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={checkIn.isPending}
                          onClick={() => checkIn.mutate(t.ticketCode)}
                        >
                          Check in
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ManageEventPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={['ORGANIZER', 'ADMIN']}>
      <ManageEvent id={id} />
    </RequireAuth>
  );
}
