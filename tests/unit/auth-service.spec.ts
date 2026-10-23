import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { bizMetrics } from '@app/observability';
import { KAFKA_TOPICS } from '@app/kafka';
import * as bcrypt from 'bcrypt';
import { AuthServiceService } from '../../apps/auth-service/src/auth-service.service';
import { createDbMock } from './helpers/db-mock';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

function build(results: Parameters<typeof createDbMock>[0]) {
  const { db } = createDbMock(results);
  const kafka = { emit: jest.fn(), connect: jest.fn() };
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  const service = new AuthServiceService(kafka as never, { db } as never, jwt as never);
  return { service, kafka, jwt };
}

describe('AuthServiceService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('register', () => {
    it('rejects an already registered e-mail', async () => {
      const { service, kafka } = build({ select: [[{ id: 'u1' }]] });
      await expect(service.register('a@b.com', 'secret1', 'A')).rejects.toBeInstanceOf(ConflictException);
      expect(kafka.emit).not.toHaveBeenCalled();
    });

    it('stores a bcrypt hash (never the plain password) and emits user.registered', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
      const { service, kafka } = build({
        select: [[]],
        insert: [[{ id: 'u1', email: 'a@b.com', name: 'A' }]],
      });
      const counter = jest.spyOn(bizMetrics.usersRegistered, 'add');

      const res = await service.register('a@b.com', 'secret1', 'A');

      expect(bcrypt.hash).toHaveBeenCalledWith('secret1', 10);
      expect(res).toEqual({ message: 'User registered successfully', userId: 'u1' });
      expect(kafka.emit).toHaveBeenCalledWith(
        KAFKA_TOPICS.USER_REGISTERED,
        expect.objectContaining({ userId: 'u1', email: 'a@b.com' }),
      );
      expect(counter).toHaveBeenCalledWith(1);
    });
  });

  describe('login', () => {
    it('fails for an unknown user and counts a failed login', async () => {
      const { service, jwt } = build({ select: [[]] });
      const logins = jest.spyOn(bizMetrics.userLogins, 'add');

      await expect(service.login('x@y.com', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(logins).toHaveBeenCalledWith(1, { outcome: 'failure' });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('fails for a wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const { service } = build({ select: [[{ id: 'u1', email: 'a@b.com', password: 'h', role: 'USER' }]] });
      await expect(service.login('a@b.com', 'nope')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a JWT and the user profile on success', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const { service, jwt, kafka } = build({
        select: [[{ id: 'u1', email: 'a@b.com', name: 'A', password: 'h', role: 'ADMIN' }]],
      });
      const logins = jest.spyOn(bizMetrics.userLogins, 'add');

      const res = await service.login('a@b.com', 'right');

      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com' });
      expect(res.access_token).toBe('signed.jwt.token');
      expect(res.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A', role: 'ADMIN' });
      expect(kafka.emit).toHaveBeenCalledWith(KAFKA_TOPICS.USER_LOGIN, expect.any(Object));
      expect(logins).toHaveBeenCalledWith(1, { outcome: 'success' });
    });
  });
});
