'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/auth/require-auth';
import { TicketCard } from '@/features/tickets/components/ticket-card';
import { useMyTickets } from '@/features/tickets/hooks/use-tickets';
import { EmptyState, ErrorState, PageSpinner } from '@/components/state';
import { buttonVariants } from '@/components/ui/button';
import { isPast } from '@/lib/format';
import type { MyTicket } from '@/types';

function MyTickets() {
  const { data, isLoading, isError, error, refetch } = useMyTickets();

  if (isLoading) return <PageSpinner />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load your tickets"
        message={error.message}
        onRetry={() => refetch()}
      />
    );
  }

  const tickets = data ?? [];
  const isActive = (t: MyTicket) =>
    (t.status === 'CONFIRMED' || t.status === 'PENDING') &&
    t.eventStatus !== 'CANCELLED' &&
    !isPast(t.eventDate);

  const upcoming = tickets
    .filter(isActive)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  const past = tickets.filter((t) => !isActive(t));

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No tickets yet"
        action={
          <Link href="/events" className={buttonVariants()}>
            Browse events
          </Link>
        }
      >
        When you book an event, your tickets and codes appear here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-lg font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing coming up.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Past and cancelled</h2>
          <div className="space-y-3">
            {past.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function MyTicketsPage() {
  return (
    <RequireAuth>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">My tickets</h1>
      <MyTickets />
    </RequireAuth>
  );
}
