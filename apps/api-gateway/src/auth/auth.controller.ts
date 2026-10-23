import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from '@app/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_REGISTER_LIMIT ?? 3),
      ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    },
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_LOGIN_LIMIT ?? 5),
      ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    },
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @SkipThrottle()
  getProfile(@Headers('authorization') authorization: string) {
    return this.authService.getProfile(authorization);
  }
}
