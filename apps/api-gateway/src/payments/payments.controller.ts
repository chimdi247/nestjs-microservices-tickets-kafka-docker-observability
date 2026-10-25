import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { HttpService } from '@nestjs/axios';
import { SkipThrottle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { SERVICES_PORTS } from '@app/common';

/**
 * Public endpoint for Stripe webhooks (configure https://<gateway>/payments/webhook in Stripe,
 * or `stripe listen --forward-to localhost:3000/payments/webhook` locally).
 * The gateway does not interpret the event: it forwards the RAW body and the signature header
 * untouched, because Stripe signs the exact bytes. Authenticity is verified in the payments-service.
 */
@Controller('payments')
export class PaymentsController {
  private readonly paymentsUrl =
    process.env.PAYMENTS_SERVICE_URL ||
    `http://localhost:${SERVICES_PORTS.PAYEMENTS_SERVICE}`;

  constructor(private readonly httpService: HttpService) {}

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or body');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.paymentsUrl}/webhook`, req.rawBody, {
          headers: {
            'content-type': 'application/json',
            'stripe-signature': signature,
          },
          // send the bytes exactly as received
          transformRequest: [(data: unknown) => data],
        }),
      );
      return response.data;
    } catch (error) {
      const err = error as {
        response?: { data: string | object; status: number };
      };
      if (err.response) {
        throw new HttpException(err.response.data, err.response.status);
      }
      throw new HttpException('Payment service is unavailable', 503);
    }
  }
}
