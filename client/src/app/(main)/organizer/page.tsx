'use client';

import Link from 'next/link';
import { Plus, ScanLine } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageSpinner } from '@/components/state';
import { EventStatusBadge } from '@/features/events/components/status-badge';
import {
  useCancelEvent,
  useMyEvents,
  usePublishEvent,
} from '@/features/events/hooks/use-events';
import { formatDateTime, formatPrice } from '@/lib/format';

function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useMyEvents();
  const publish = usePublishEvent();
  const cancel = useCancelEvent();

  if (isLoading) return <PageSpinner />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load your events"
        message={error.message}
        onRetry={() => refetch()}
      />
    );
  }

  const events = data ?? [];
  if (events.length === 0) {
    return (
      <EmptyState
        title="You have not created an event yet"
        action={
          <Link href="/organizer/events/new" className={buttonVariants()}>
            Create an event
          </Link>
        }
      >
        New events start as drafts. Publish one when you are ready to sell tickets.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y rounded-xl border">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/organizer/events/${e.id}`}
                className="font-semibold hover:underline"
              >
                {e.title}
              </Link>
              <EventStatusBadge status={e.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(e.date)} &middot; {e.location}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.ticketsSold} / {e.capacity} sold &middot; {formatPrice(e.price)} per ticket
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/organizer/events/${e.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Manage
            </Link>
            {e.status === 'DRAFT' && (
              <Button
                size="sm"
                disabled={publish.isPending}
                onClick={() => publish.mutate(e.id)}
              >
                Publish
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
                      `Cancel "${e.title}"? Every unused ticket will be cancelled and attendees notified.`,
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
        </li>
      ))}
    </ul>
  );
}

export default function OrganizerPage() {
  return (
    <RequireAuth roles={['ORGANIZER', 'ADMIN']}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Your events</h1>
        <div className="flex gap-2">
          <Link
            href="/organizer/check-in"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ScanLine /> Check in guests
          </Link>
          <Link href="/organizer/events/new" className={buttonVariants()}>
            <Plus /> New event
          </Link>
        </div>
      </div>
      <Dashboard />
    </RequireAuth>
  );
}
