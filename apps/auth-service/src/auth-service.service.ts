import { DatabaseService, users } from '@app/database';
import { KAFKA_SERVICE, KAFKA_TOPICS } from '@app/kafka';
import {
  ConflictException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientKafka } from '@nestjs/microservices';
import { eq, sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { bizMetrics, withSpan } from '@app/observability';

@Injectable()
export class AuthServiceService implements OnModuleInit {
  constructor(
    @Inject(KAFKA_SERVICE) private readonly kafkClient: ClientKafka,
    private readonly dbService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    // connect to kafka when module initializes
    await this.kafkClient.connect();
  }

  getHello(): string {
    return 'Hello World!';
  }

  register(email: string, password: string, name: string, role?: string) {
    return withSpan('auth.register', {}, async () => {
      const result = await this.registerImpl(email, password, name, role);
      bizMetrics.usersRegistered.add(1);
      return result;
    });
  }

  login(email: string, password: string) {
    return withSpan('auth.login', {}, async (span) => {
      try {
        const result = await this.loginImpl(email, password);
        span.setAttribute('enduser.id', result.user.id);
        bizMetrics.userLogins.add(1, { outcome: 'success' });
        return result;
      } catch (err) {
        if (err instanceof UnauthorizedException) {
          bizMetrics.userLogins.add(1, { outcome: 'failure' });
        }
        throw err;
      }
    });
  }

  private async registerImpl(
    rawEmail: string,
    password: string,
    name: string,
    role?: string,
  ) {
    // emails are unique case-insensitively (see users_email_unique in 01-schema.sql)
    const email = rawEmail.trim().toLowerCase();

    // check if user exists
    const exitingUser = await this.dbService.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (exitingUser.length > 0) {
      throw new ConflictException('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ADMIN can never be self-assigned; anything else falls back to USER
    const safeRole = role === 'ORGANIZER' ? 'ORGANIZER' : 'USER';

    // create user (the unique index is the real guard against concurrent sign-ups)
    let user: typeof users.$inferSelect;
    try {
      [user] = await this.dbService.db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          name: name.trim(),
          role: safeRole,
        })
        .returning();
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('User already exists');
      }
      throw err;
    }

    // send user registered event
    this.kafkClient.emit(KAFKA_TOPICS.USER_REGISTERED, {
      userId: user.id,
      email: user.email,
      name: user.name,
      timestamp: new Date().toISOString(),
    });

    return {
      message: 'User registered successfully',
      userId: user.id,
      role: user.role,
    };
  }

  private async loginImpl(rawEmail: string, password: string) {
    const email = rawEmail.trim().toLowerCase();
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.kafkClient.emit(KAFKA_TOPICS.USER_LOGIN, {
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getProfile(userId: string) {
    const [user] = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
