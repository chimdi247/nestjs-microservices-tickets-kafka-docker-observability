'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EventCard } from '@/features/events/components/event-card';
import { useEvents } from '@/features/events/hooks/use-events';
import { useMyTickets } from '@/features/tickets/hooks/use-tickets';
import { EmptyState, ErrorState, EventGridSkeleton } from '@/components/state';
import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { isPast } from '@/lib/format';

export default function HomePage() {
  const hydrated = useAuthHydrated();
  const storedUser = useAuthStore((s) => s.user);
  const user = hydrated ? storedUser : null;
  const canOrganize = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  const events = useEvents();
  const tickets = useMyTickets();

  const upcomingTickets = (tickets.data ?? []).filter(
    (t) =>
      (t.status === 'CONFIRMED' || t.status === 'PENDING') && !isPast(t.eventDate),
  );

  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Book your next event'}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          {user
            ? upcomingTickets.length > 0
              ? `You have ${upcomingTickets.length} upcoming booking${upcomingTickets.length > 1 ? 's' : ''}.`
              : 'Pick something to go to. Seats are held the moment you book.'
            : 'Browse upcoming events, book tickets in a few clicks and keep every ticket code in one place.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/events" className={buttonVariants({ size: 'lg' })}>
            Browse events
          </Link>
          {user ? (
            <>
              <Link
                href="/tickets"
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
              >
                My tickets
              </Link>
              {canOrganize && (
                <Link
                  href="/organizer/events/new"
                  className={buttonVariants({ size: 'lg', variant: 'outline' })}
                >
                  Create an event
                </Link>
              )}
            </>
          ) : (
            hydrated && (
              <Link
                href="/register"
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
              >
                Create an account
              </Link>
            )
          )}
        </div>
      </section>

      <section aria-labelledby="upcoming-heading">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="upcoming-heading" className="text-xl font-semibold">
            Upcoming events
          </h2>
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            See all <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {events.isLoading ? (
          <EventGridSkeleton />
        ) : events.isError ? (
          <ErrorState
            title="Could not load events"
            message={events.error.message}
            onRetry={() => events.refetch()}
          />
        ) : events.data && events.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.data.slice(0, 6).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No events yet"
            action={
              canOrganize ? (
                <Link href="/organizer/events/new" className={buttonVariants()}>
                  Create the first event
                </Link>
              ) : undefined
            }
          >
            Published events show up here. Check back soon.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
