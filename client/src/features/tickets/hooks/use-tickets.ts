'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  cancelTicket,
  checkInTicket,
  fetchMyTickets,
  fetchTicket,
  payForTicket,
  purchaseTickets,
} from '../api/tickets';
import { eventKeys } from '@/features/events/hooks/use-events';
import { useAuthStore } from '@/stores/auth-store';

export const ticketKeys = {
  mine: ['tickets', 'mine'] as const,
};

export function useMyTickets() {
  const enabled = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ticketKeys.mine,
    queryFn: fetchMyTickets,
    enabled,
  });
}

/** one ticket; while it is still PENDING it is re-read every 2 s (the Stripe webhook confirms it) */
export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => fetchTicket(id as string),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' ? 2000 : false,
  });
}

/** (re)starts the Stripe payment of a booking and sends the browser to Stripe */
export function usePayTicket() {
  return useMutation({
    mutationFn: (id: string) => payForTicket(id),
    onSuccess: ({ checkoutUrl }) => {
      window.location.assign(checkoutUrl);
    },
    onError: (error: Error) =>
      toast.error('Could not start the payment', { description: error.message }),
  });
}

function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    // seats left, my tickets and the organizer's attendee list all change together
    queryClient.invalidateQueries({ queryKey: eventKeys.all });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };
}

export function usePurchaseTickets() {
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: ({ eventId, quantity }: { eventId: string; quantity: number }) =>
      purchaseTickets(eventId, quantity),
    onSuccess: () => refresh(),
    onError: (error: Error) => {
      toast.error('Booking failed', { description: error.message });
      // somebody else may have taken the last seats: show the real numbers again
      refresh();
    },
  });
}

export function useCancelTicket() {
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (id: string) => cancelTicket(id),
    onSuccess: () => {
      refresh();
      toast.success('Ticket cancelled', {
        description: 'The seats are available again.',
      });
    },
    onError: (error: Error) =>
      toast.error('Could not cancel the ticket', { description: error.message }),
  });
}

export function useCheckIn() {
  const refresh = useRefreshAll();

  return useMutation({
    mutationFn: (ticketCode: string) => checkInTicket(ticketCode),
    onSuccess: (result) => {
      refresh();
      toast.success('Checked in', {
        description: `${result.ticket.eventTitle} - ${result.ticket.quantity} guest(s)`,
      });
    },
    onError: (error: Error) =>
      toast.error('Check-in failed', { description: error.message }),
  });
}
