import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID('4', { message: 'Ticket ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Ticket ID is required' })
  ticketId: string;
}
