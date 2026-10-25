'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { eventFormSchema, type EventFormData } from '../types';
import { centsToDollars, dollarsToCents, toDateTimeLocal } from '@/lib/format';
import type { Event, EventInput } from '@/types';

interface EventFormProps {
  event?: Event;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  cancelHref: string;
  onSubmit: (input: EventInput) => void;
}

export function EventForm({
  event,
  submitLabel,
  pendingLabel,
  isPending,
  cancelHref,
  onSubmit,
}: EventFormProps) {
  const initialDate = event ? toDateTimeLocal(event.date) : '';

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      date: initialDate,
      location: event?.location ?? '',
      capacity: event ? String(event.capacity) : '100',
      price: event ? centsToDollars(event.price) : '0',
    },
  });

  function submit(data: EventFormData) {
    const dateChanged = data.date !== initialDate;

    // a NEW event (or a moved date) must lie in the future
    if (dateChanged && new Date(data.date).getTime() <= Date.now()) {
      form.setError('date', { message: 'The date must be in the future' });
      return;
    }
    if (event && event.ticketsSold > Number(data.capacity)) {
      form.setError('capacity', {
        message: `${event.ticketsSold} tickets are already sold`,
      });
      return;
    }

    if (dollarsToCents(data.price) > 0 && dollarsToCents(data.price) < 50) {
      form.setError('price', {
        message: 'Paid tickets must cost at least $0.50 (use 0 for a free event)',
      });
      return;
    }

    const input: EventInput = {
      title: data.title.trim(),
      description: data.description.trim(),
      location: data.location.trim(),
      capacity: Number(data.capacity),
      price: dollarsToCents(data.price),
    };
    if (!event || dateChanged) {
      input.date = new Date(data.date).toISOString();
    }
    onSubmit(input);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Jazz night at the harbor" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="What can guests expect?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date and time</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Venue, city" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input type="number" min={1} step={1} inputMode="numeric" {...field} />
                </FormControl>
                <FormDescription>Total number of seats.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ticket price (USD)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} step="0.01" inputMode="decimal" {...field} />
                </FormControl>
                <FormDescription>Use 0 for a free event.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
          <Link
            href={cancelHref}
            className="text-sm font-medium text-muted-foreground hover:underline"
          >
            Discard
          </Link>
        </div>
      </form>
    </Form>
  );
}
