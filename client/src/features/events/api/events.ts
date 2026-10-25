import { http } from '@/lib/api-client';
import type { AttendeeTicket, Event, EventInput } from '@/types';

export const fetchEvents = () => http.get<Event[]>('/events');
export const fetchEvent = (id: string) => http.get<Event>(`/events/${id}`);
export const fetchMyEvents = () => http.get<Event[]>('/events/my-events');
export const fetchEventTickets = (id: string) =>
  http.get<AttendeeTicket[]>(`/tickets/event/${id}`);

export const createEvent = (input: EventInput) =>
  http.post<Event>('/events', input);
export const updateEvent = (id: string, input: Partial<EventInput>) =>
  http.put<Event>(`/events/${id}`, input);
export const publishEvent = (id: string) =>
  http.post<Event>(`/events/${id}/publish`);
export const cancelEvent = (id: string) =>
  http.post<Event>(`/events/${id}/cancel`);
