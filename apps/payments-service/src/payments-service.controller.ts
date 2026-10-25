import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CreateCheckoutDto } from '@app/common';
import { PaymentsServiceService } from './payments-service.service';

@Controller()
export class PaymentsServiceController {
  constructor(private readonly paymentsService: PaymentsServiceService) {}

  /** called by the tickets-service for a PENDING ticket; returns the hosted Stripe Checkout URL */
  @Post('checkout')
  @HttpCode(200)
  createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.paymentsService.createCheckout(dto.ticketId, userId);
  }

  /** Stripe -> api-gateway -> here. The signature is verified against the RAW request body. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or body');
    }
    await this.paymentsService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
