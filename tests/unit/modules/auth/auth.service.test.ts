import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '@modules/auth/auth.service';
import { BadRequestError, UnauthorizedError } from '@shared/utils/errors';

vi.mock('@core/database/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    cart: {
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@core/redis/client', () => ({
  default: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('@core/queue/bull', () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => Buffer.from('token')),
  },
}));

import prisma from '@core/database/prisma';
import redis from '@core/redis/client';
import { emailQueue } from '@core/queue/bull';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-32charslongenough';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32charslongenough';
  });

  describe('register', () => {
    it('should throw if email already exists', async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.register({
          email: 'test@test.com',
          password: '123456',
          firstName: 'John',
          lastName: 'Doe',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should create user, cart, and enqueue verification email', async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce(null);
      (bcrypt.hash as any).mockResolvedValueOnce('hashed');
      const mockUser = {
        id: 'user-id',
        email: 'test@test.com',
        firstName: 'John',
        lastName: 'Doe',
      };
      (prisma.user.create as any).mockResolvedValueOnce(mockUser);
      (prisma.cart.create as any).mockResolvedValueOnce({});
      (redis.setex as any).mockResolvedValueOnce('OK');
      (emailQueue.add as any).mockResolvedValueOnce({});

      const result = await service.register({
        email: 'test@test.com',
        password: '123456',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.user).toMatchObject({ email: 'test@test.com' });
      expect(result.message).toContain('check your email');
      expect(emailQueue.add).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({ to: 'test@test.com' })
      );
    });
  });

  describe('login', () => {
    it('should throw if user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce(null);
      await expect(service.login('notfound@test.com', 'pass')).rejects.toThrow(UnauthorizedError);
    });

    it('should throw if password incorrect', async () => {
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        email: 'test@test.com',
        password: 'hash',
      });
      (bcrypt.compare as any).mockResolvedValueOnce(false);
      await expect(service.login('test@test.com', 'wrong')).rejects.toThrow(UnauthorizedError);
    });

    it('should return tokens if 2FA not enabled', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        role: 'USER',
        isVerified: true,
        is2FAEnabled: false,
        firstName: 'Test',
        lastName: 'User',
      };
      (prisma.user.findUnique as any).mockResolvedValueOnce(user);
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      vi.spyOn(service, 'generateTokens').mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          is2FAEnabled: user.is2FAEnabled,
        },
      });

      const result = await service.login('test@test.com', 'pass');
      expect(result).toHaveProperty('accessToken');
    });

    it('should return requires2FA if 2FA enabled', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        isVerified: true,
        is2FAEnabled: true,
      };
      (prisma.user.findUnique as any).mockResolvedValueOnce(user);
      (bcrypt.compare as any).mockResolvedValueOnce(true);

      const result = await service.login('test@test.com', 'pass');
      expect(result).toEqual({
        requires2FA: true,
        userId: '1',
        message: '2FA required',
      });
    });
  });
});