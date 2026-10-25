'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { usePurchaseTickets } from '../hooks/use-tickets';
import { formatPrice, isPast } from '@/lib/format';
import type { Event, PurchaseResult } from '@/types';

const MAX_PER_ORDER = 10;

export function PurchasePanel({ event }: { event: Event }) {
  const hydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const purchase = usePurchaseTickets();
  const [quantity, setQuantity] = useState(1);
  const [booked, setBooked] = useState<PurchaseResult | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const started = isPast(event.date);
  const soldOut = event.availableTickets <= 0;
  const maxQty = Math.max(1, Math.min(MAX_PER_ORDER, event.availableTickets));
  const qty = Math.min(quantity, maxQty);
  const total = event.price * qty;

  let blocked: string | null = null;
  if (event.status === 'CANCELLED') blocked = 'This event has been cancelled.';
  else if (event.status === 'DRAFT') blocked = 'This event is not published yet.';
  else if (started) blocked = 'This event has already started.';
  else if (soldOut) blocked = 'This event is sold out.';

  if (booked) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="size-5" aria-hidden />
          <h2 className="font-semibold">You are booked in</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {booked.ticket.quantity} ticket{booked.ticket.quantity > 1 ? 's' : ''} for{' '}
          {formatPrice(booked.ticket.totalPrice)}. Show this code at the entrance:
        </p>
        <p className="mt-3 rounded-md bg-muted px-3 py-3 text-center font-mono text-xl tracking-widest">
          {booked.ticket.ticketCode}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/tickets" className={buttonVariants()}>
            View my tickets
          </Link>
          <Button variant="outline" onClick={() => { setBooked(null); setQuantity(1); }}>
            Book more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Tickets</h2>
        <span className="text-xl font-semibold tabular-nums">
          {formatPrice(event.price)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {event.availableTickets} of {event.capacity} seats left
      </p>

      {blocked ? (
        <p className="mt-5 rounded-md bg-muted px-3 py-3 text-sm">{blocked}</p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-medium">Quantity</span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Fewer tickets"
                disabled={qty <= 1}
                onClick={() => setQuantity(qty - 1)}
              >
                <Minus />
              </Button>
              <span className="w-6 text-center font-medium tabular-nums" aria-live="polite">
                {qty}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="More tickets"
                disabled={qty >= maxQty}
                onClick={() => setQuantity(qty + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatPrice(total)}</span>
          </div>

          {!hydrated ? (
            <div className="mt-5 h-10" />
          ) : isAuthenticated ? (
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={purchase.isPending || redirecting}
              onClick={() =>
                purchase.mutate(
                  { eventId: event.id, quantity: qty },
                  {
                    onSuccess: (result) => {
                      if (result.checkoutUrl) {
                        // paid event: the seats are held, finish the payment on Stripe
                        setRedirecting(true);
                        window.location.assign(result.checkoutUrl);
                      } else {
                        setBooked(result);
                      }
                    },
                  },
                )
              }
            >
              {redirecting
                ? 'Redirecting to payment...'
                : purchase.isPending
                  ? 'Booking...'
                  : event.price > 0
                    ? `Pay ${formatPrice(total)}`
                    : `Book ${qty} ticket${qty > 1 ? 's' : ''}`}
            </Button>
          ) : (
            <Link
              href={`/login?redirect=${encodeURIComponent(`/events/${event.id}`)}`}
              className={buttonVariants({ size: 'lg', className: 'mt-5 w-full' })}
            >
              Sign in to book
            </Link>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Up to {MAX_PER_ORDER} tickets per order.{' '}
            {event.price > 0
              ? 'You pay securely with Stripe; the seats are held while you pay. Cancel before the event starts for a full refund.'
              : 'You can cancel before the event starts.'}
          </p>
        </>
      )}
    </div>
  );
}
