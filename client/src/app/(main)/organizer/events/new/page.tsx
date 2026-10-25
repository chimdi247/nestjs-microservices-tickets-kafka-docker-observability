'use client';

import { RequireAuth } from '@/components/auth/require-auth';
import { EventForm } from '@/features/events/components/event-form';
import { useCreateEvent } from '@/features/events/hooks/use-events';

function NewEvent() {
  const create = useCreateEvent();
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">New event</h1>
      <EventForm
        submitLabel="Create event"
        pendingLabel="Creating..."
        isPending={create.isPending}
        cancelHref="/organizer"
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  );
}

export default function NewEventPage() {
  return (
    <RequireAuth roles={['ORGANIZER', 'ADMIN']}>
      <NewEvent />
    </RequireAuth>
  );
}
