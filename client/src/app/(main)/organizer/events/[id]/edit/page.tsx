'use client';

import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { ErrorState, PageSpinner } from '@/components/state';
import { EventForm } from '@/features/events/components/event-form';
import { useEvent, useUpdateEvent } from '@/features/events/hooks/use-events';

function EditEvent({ id }: { id: string }) {
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const update = useUpdateEvent(id);

  if (isLoading) return <PageSpinner />;
  if (isError || !event) {
    return (
      <ErrorState
        title="Event not found"
        message={error?.message}
        onRetry={() => refetch()}
      />
    );
  }

  if (event.status === 'CANCELLED') {
    return (
      <ErrorState
        title="This event is cancelled"
        message="Cancelled events cannot be edited."
      />
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Edit event</h1>
      <EventForm
        // remount when fresh data arrives so the form shows the saved values
        key={event.updatedAt}
        event={event}
        submitLabel="Save changes"
        pendingLabel="Saving..."
        isPending={update.isPending}
        cancelHref={`/organizer/events/${id}`}
        onSubmit={(input) => update.mutate(input)}
      />
    </div>
  );
}

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={['ORGANIZER', 'ADMIN']}>
      <EditEvent id={id} />
    </RequireAuth>
  );
}
