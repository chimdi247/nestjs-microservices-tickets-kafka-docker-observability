export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    path: string;
    method: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
    timestamp: string;
    path: string;
  };
}

export type Role = 'USER' | 'ORGANIZER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  capacity: number;
  /** price per ticket in cents */
  price: number;
  status: EventStatus;
  organizerId: string;
  /** seats already taken */
  ticketsSold: number;
  /** seats still available */
  availableTickets: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  title: string;
  description?: string;
  /** ISO 8601 */
  date?: string;
  location: string;
  capacity: number;
  /** cents */
  price: number;
}

export type TicketStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';

/** a ticket as shown to its owner (joined with its event) */
export interface MyTicket {
  id: string;
  ticketCode: string;
  quantity: number;
  totalPrice: number;
  status: TicketStatus;
  purchasedAt: string;
  checkedInAt: string | null;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventStatus: EventStatus;
  /** PENDING tickets only: the seats are released after this moment */
  expiresAt: string | null;
}

/** a ticket as shown to the organizer of the event */
export interface AttendeeTicket {
  id: string;
  ticketCode: string;
  quantity: number;
  totalPrice: number;
  status: TicketStatus;
  purchasedAt: string;
  checkedInAt: string | null;
  eventId: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
}

export interface PurchaseResult {
  message: string;
  ticket: {
    id: string;
    ticketCode: string;
    eventId: string;
    eventTitle: string;
    quantity: number;
    totalPrice: number;
    status: TicketStatus;
    purchasedAt: string;
  };
  /** set for paid events: redirect the browser here to pay with Stripe */
  checkoutUrl?: string;
}

export interface CheckInResult {
  message: string;
  ticket: {
    id: string;
    ticketCode: string;
    eventTitle: string;
    quantity: number;
    status: TicketStatus;
    checkedInAt: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: 'USER' | 'ORGANIZER';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
