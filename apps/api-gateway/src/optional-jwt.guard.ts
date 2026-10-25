import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like AuthGuard('jwt') but anonymous requests are allowed through (req.user stays undefined).
 * Used on public routes that show a bit more to the owner (e.g. a DRAFT event).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  handleRequest(_err: any, user: any): any {
    return user || null;
  }
}
