'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  cancelEvent,
  createEvent,
  fetchEvent,
  fetchEvents,
  fetchEventTickets,
  fetchMyEvents,
  publishEvent,
  updateEvent,
} from '../api/events';
import type { EventInput } from '@/types';

export const eventKeys = {
  all: ['events'] as const,
  list: ['events', 'list'] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  mine: ['events', 'mine'] as const,
  attendees: (id: string) => ['events', 'attendees', id] as const,
};

export function useEvents() {
  return useQuery({ queryKey: eventKeys.list, queryFn: fetchEvents });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => fetchEvent(id),
    enabled: !!id,
  });
}

export function useMyEvents() {
  return useQuery({ queryKey: eventKeys.mine, queryFn: fetchMyEvents });
}

export function useEventAttendees(id: string) {
  return useQuery({
    queryKey: eventKeys.attendees(id),
    queryFn: () => fetchEventTickets(id),
    enabled: !!id,
  });
}

/** seats, attendee lists and the "my tickets" page all depend on the same rows */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: eventKeys.all });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };
}

export function useCreateEvent() {
  const router = useRouter();
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (input: EventInput) => createEvent(input),
    onSuccess: (event) => {
      refresh();
      toast.success('Event created', {
        description: 'It is a draft until you publish it.',
      });
      router.push(`/organizer/events/${event.id}`);
    },
    onError: (error: Error) =>
      toast.error('Could not create the event', { description: error.message }),
  });
}

export function useUpdateEvent(id: string) {
  const router = useRouter();
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (input: Partial<EventInput>) => updateEvent(id, input),
    onSuccess: () => {
      refresh();
      toast.success('Event updated');
      router.push(`/organizer/events/${id}`);
    },
    onError: (error: Error) =>
      toast.error('Could not update the event', { description: error.message }),
  });
}

export function usePublishEvent() {
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (id: string) => publishEvent(id),
    onSuccess: () => {
      refresh();
      toast.success('Event published', {
        description: 'Anyone can book tickets now.',
      });
    },
    onError: (error: Error) =>
      toast.error('Could not publish the event', { description: error.message }),
  });
}

export function useCancelEvent() {
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (id: string) => cancelEvent(id),
    onSuccess: () => {
      refresh();
      toast.success('Event cancelled', {
        description: 'All unused tickets were cancelled and attendees notified.',
      });
    },
    onError: (error: Error) =>
      toast.error('Could not cancel the event', { description: error.message }),
  });
}
