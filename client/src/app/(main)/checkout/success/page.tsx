'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/state';
import { useTicket } from '@/features/tickets/hooks/use-tickets';
import { formatDateTime, formatPrice } from '@/lib/format';

function Result() {
  const ticketId = useSearchParams().get('ticket');
  const { data: ticket, isError, error } = useTicket(ticketId);

  if (!ticketId || isError) {
    return (
      <ErrorState
        title="We could not find this booking"
        message={error?.message ?? 'Open My tickets to see your bookings.'}
      />
    );
  }

  if (!ticket || ticket.status === 'PENDING') {
    return (
      <div className="mx-auto max-w-md rounded-xl border p-8 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Confirming your payment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This takes a few seconds. Please keep this page open.
        </p>
        <Link href="/tickets" className="mt-5 inline-block text-sm font-medium hover:underline">
          Check My tickets later
        </Link>
      </div>
    );
  }

  if (ticket.status === 'CANCELLED') {
    return (
      <ErrorState
        title="This booking was cancelled"
        message="If you were charged, the payment is refunded automatically within a few minutes."
      />
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border p-8">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="size-6" aria-hidden />
        <h1 className="text-xl font-semibold">Payment received</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {ticket.quantity} ticket{ticket.quantity > 1 ? 's' : ''} for{' '}
        <span className="font-medium text-foreground">{ticket.eventTitle}</span> &middot;{' '}
        {formatPrice(ticket.totalPrice)}
        <br />
        {formatDateTime(ticket.eventDate)} &middot; {ticket.eventLocation}
      </p>
      <p className="mt-4 text-sm">Show this code at the entrance:</p>
      <p className="mt-2 rounded-md bg-muted px-3 py-3 text-center font-mono text-xl tracking-widest">
        {ticket.ticketCode}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        A confirmation e-mail is on its way.
      </p>
      <Link href="/tickets" className={buttonVariants({ className: 'mt-5' })}>
        View my tickets
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Result />
      </Suspense>
    </RequireAuth>
  );
}
