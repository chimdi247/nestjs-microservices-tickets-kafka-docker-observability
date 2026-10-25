'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Calendar, MapPin, Users } from 'lucide-react';
import { useEvent } from '@/features/events/hooks/use-events';
import { EventStatusBadge } from '@/features/events/components/status-badge';
import { PurchasePanel } from '@/features/tickets/components/purchase-panel';
import { ErrorState, PageSpinner } from '@/components/state';
import { buttonVariants } from '@/components/ui/button';
import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { formatDateTime } from '@/lib/format';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const hydrated = useAuthHydrated();
  const user = useAuthStore((s) => s.user);

  if (isLoading) return <PageSpinner />;
  if (isError || !event) {
    return (
      <ErrorState
        title="Event not found"
        message={error?.message ?? 'This event does not exist or is not public.'}
        onRetry={() => refetch()}
      />
    );
  }

  const canManage =
    hydrated && !!user && (user.id === event.organizerId || user.role === 'ADMIN');

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <Link href="/events" className="text-sm text-muted-foreground hover:underline">
          All events
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
          {event.status !== 'PUBLISHED' && <EventStatusBadge status={event.status} />}
        </div>

        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" aria-hidden />
            {formatDateTime(event.date)}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            {event.location}
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {event.ticketsSold} going &middot; {event.capacity} seats in total
          </li>
        </ul>

        {event.description && (
          <div className="mt-8 max-w-prose whitespace-pre-line leading-7">
            {event.description}
          </div>
        )}

        {canManage && (
          <Link
            href={`/organizer/events/${event.id}`}
            className={buttonVariants({ variant: 'outline', className: 'mt-8' })}
          >
            Manage this event
          </Link>
        )}
      </div>

      <aside>
        <PurchasePanel event={event} />
      </aside>
    </div>
  );
}
