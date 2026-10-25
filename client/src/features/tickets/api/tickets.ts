import { http } from '@/lib/api-client';
import type { CheckInResult, MyTicket, PurchaseResult } from '@/types';

export const purchaseTickets = (eventId: string, quantity: number) =>
  http.post<PurchaseResult>('/tickets/purchase', { eventId, quantity });
export const fetchMyTickets = () => http.get<MyTicket[]>('/tickets/my-tickets');
export const fetchTicket = (id: string) => http.get<MyTicket>(`/tickets/${id}`);
export const payForTicket = (id: string) =>
  http.post<{ checkoutUrl: string }>(`/tickets/${id}/pay`);
export const cancelTicket = (id: string) =>
  http.post<{ message: string }>(`/tickets/${id}/cancel`);
export const checkInTicket = (ticketCode: string) =>
  http.post<CheckInResult>('/tickets/check-in', { ticketCode });
