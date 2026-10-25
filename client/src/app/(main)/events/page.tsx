'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EventCard } from '@/features/events/components/event-card';
import { useEvents } from '@/features/events/hooks/use-events';
import { EmptyState, ErrorState, EventGridSkeleton } from '@/components/state';

export default function EventsPage() {
  const { data, isLoading, isError, error, refetch } = useEvents();
  const [query, setQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((e) => {
      if (onlyAvailable && e.availableTickets <= 0) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, query, onlyAvailable]);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Events</h1>
      <p className="mt-2 text-muted-foreground">
        Every published event that has not started yet, soonest first.
      </p>

      <div className="mt-6 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search events"
            placeholder="Search by title or location"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          Hide sold-out events
        </label>
      </div>

      {isLoading ? (
        <EventGridSkeleton />
      ) : isError ? (
        <ErrorState
          title="Could not load events"
          message={error.message}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title={query || onlyAvailable ? 'No events match' : 'No events yet'}>
          {query || onlyAvailable
            ? 'Try a different search or show sold-out events too.'
            : 'Published events show up here. Check back soon.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
