import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { dateParts, formatPrice } from '@/lib/format';
import type { Event } from '@/types';

/** An event rendered as a ticket stub: date block, perforated tear line, details. */
export function EventCard({ event }: { event: Event }) {
  const { month, day, time } = dateParts(event.date);
  const soldOut = event.availableTickets <= 0;
  const fewLeft = !soldOut && event.availableTickets <= Math.max(5, event.capacity * 0.1);

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex min-h-40 overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-primary px-2 text-primary-foreground">
        <span className="text-sm font-medium">{month}</span>
        <span className="text-4xl leading-none font-semibold tabular-nums">{day}</span>
        <span className="mt-2 text-xs opacity-80">{time}</span>
      </div>

      {/* perforation */}
      <div aria-hidden className="relative w-0 border-l-2 border-dashed border-border">
        <span className="absolute -top-2.5 -left-2.25 size-4 rounded-full border bg-background" />
        <span className="absolute -bottom-2.5 -left-2.25 size-4 rounded-full border bg-background" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold group-hover:underline">
            {event.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold tabular-nums">
            {formatPrice(event.price)}
          </span>
          {event.status === 'CANCELLED' ? (
            <Badge tone="danger">Cancelled</Badge>
          ) : event.status === 'DRAFT' ? (
            <Badge tone="warning">Draft</Badge>
          ) : soldOut ? (
            <Badge tone="danger">Sold out</Badge>
          ) : (
            <Badge tone={fewLeft ? 'warning' : 'neutral'}>
              {event.availableTickets} left
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
