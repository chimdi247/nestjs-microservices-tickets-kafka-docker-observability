'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCheckIn } from '@/features/tickets/hooks/use-tickets';
import { formatDateTime } from '@/lib/format';

function CheckIn() {
  const [code, setCode] = useState('');
  const checkIn = useCheckIn();

  return (
    <div className="max-w-md">
      <Link href="/organizer" className="text-sm text-muted-foreground hover:underline">
        Your events
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Check in guests</h1>
      <p className="mt-2 text-muted-foreground">
        Enter the ticket code a guest shows at the entrance. Only tickets for your own
        events can be checked in.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          const value = code.trim();
          if (!value) return;
          checkIn.mutate(value, { onSuccess: () => setCode('') });
        }}
      >
        <Input
          aria-label="Ticket code"
          placeholder="e.g. 9F3A1C7B20DE"
          className="font-mono tracking-widest uppercase"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={checkIn.isPending || !code.trim()}>
          {checkIn.isPending ? 'Checking...' : 'Check in'}
        </Button>
      </form>

      {checkIn.isSuccess && checkIn.data && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{checkIn.data.ticket.eventTitle}</p>
          <p className="mt-1">
            {checkIn.data.ticket.quantity} guest
            {checkIn.data.ticket.quantity > 1 ? 's' : ''} checked in at{' '}
            {formatDateTime(checkIn.data.ticket.checkedInAt)}.
          </p>
        </div>
      )}
      {checkIn.isError && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {checkIn.error.message}
        </div>
      )}
    </div>
  );
}

export default function CheckInPage() {
  return (
    <RequireAuth roles={['ORGANIZER', 'ADMIN']}>
      <CheckIn />
    </RequireAuth>
  );
}
