export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface EventResponse {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  capacity: number;
  /** price per ticket, in cents */
  price: number;
  status: string;
  organizerId: string;
  /** seats already taken (CONFIRMED + CHECKED_IN + PENDING tickets) */
  ticketsSold: number;
  /** capacity - ticketsSold */
  availableTickets: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketResponse {
  id: string;
  ticketCode: string;
  quantity: number;
  totalPrice: number;
  status: string;
  purchasedAt: string;
  checkedInAt: string | null;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
}
