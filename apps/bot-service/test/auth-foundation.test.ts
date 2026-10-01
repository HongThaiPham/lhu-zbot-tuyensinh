import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../src/auth/password.service';
import { SessionService } from '../src/auth/session.service';
import { LoginAbuseService } from '../src/auth/login-abuse.service';
import { AuthService } from '../src/auth/auth.service';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/lhu_zbot?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.BOT_SERVICE_ROLE = process.env.BOT_SERVICE_ROLE || 'api';
process.env.ZALO_UPDATE_MODE = process.env.ZALO_UPDATE_MODE || 'polling';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || 'development-only-app-encryption-key-not-for-production';
process.env.SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'lhu_admin_session';
process.env.SESSION_TTL_SECONDS = process.env.SESSION_TTL_SECONDS || '1200';
process.env.ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'http://127.0.0.1:4100';

function buildAuthService(overrides: Partial<Record<string, unknown>> = {}) {
  const passwordService = new PasswordService();
  const loginAbuseService = new LoginAbuseService();

  const prismaClient = {
    user: {
      findUnique: async () => null,
      update: async () => ({ id: 'u1' }),
    },
    session: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => null,
      update: async () => ({ id: 's1' }),
    },
    ...overrides,
  };

  const prisma = { client: prismaClient };
  const sessionService = new SessionService(prisma as never);
  const authService = new AuthService(
    prisma as never,
    passwordService,
    sessionService,
    loginAbuseService,
  );

  return {
    authService,
    passwordService,
    sessionService,
    loginAbuseService,
  };
}

test('password hashing never stores plaintext and verifies valid credentials', async () => {
  const passwordService = new PasswordService();
  const plain = 'StrongPassword!123';
  const hash = await passwordService.hashPassword(plain);

  assert.notEqual(hash, plain);
  assert.equal(await passwordService.verifyPassword(hash, plain), true);
  assert.equal(await passwordService.verifyPassword(hash, 'WrongPassword!123'), false);
});

test('session creation persists token hash instead of raw token', async () => {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    client: {
      session: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'session-1', ...data };
        },
      },
    },
  };

  const service = new SessionService(prisma as never);
  const token = service.createToken();
  await service.createSession('user-1', token, 3600);

  assert.equal(created.length, 1);
  assert.notEqual(created[0].tokenHash, token);
});

test('login rejects invalid credentials with generic unauthorized response', async () => {
  const { authService } = buildAuthService();

  await assert.rejects(
    () => authService.login('missing@example.com', 'wrong-password', { ipAddress: '127.0.0.1' }),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Invalid credentials/);
      return true;
    },
  );
});

test('login abuse limiter blocks repeated failures in bounded window', () => {
  const limiter = new LoginAbuseService();
  const key = 'ip:127.0.0.1';
  const now = Date.now();

  limiter.recordFailure(key, 60, 3, now);
  limiter.recordFailure(key, 60, 3, now + 1);
  limiter.recordFailure(key, 60, 3, now + 2);

  assert.throws(() => limiter.checkAllowed(key, now + 3));
});

test('authenticateSession rejects unknown, revoked and expired sessions', async () => {
  const { authService, sessionService } = buildAuthService({
    session: {
      findUnique: async () => null,
      update: async () => ({ id: 's1' }),
    },
  });

  await assert.rejects(() => authService.authenticateSession('token'));

  const revokedToken = sessionService.createToken();
  const revokedHash = sessionService.hashToken(revokedToken);

  const revokedAuth = buildAuthService({
    session: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash !== revokedHash) {
          return null;
        }

        return {
          id: 's2',
          tokenHash: revokedHash,
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: 'u1', email: 'admin@example.com', status: 'ACTIVE', roles: [] },
        };
      },
      update: async () => ({ id: 's2' }),
    },
  }).authService;

  await assert.rejects(() => revokedAuth.authenticateSession(revokedToken));

  const expiredToken = sessionService.createToken();
  const expiredHash = sessionService.hashToken(expiredToken);
  const expiredAuth = buildAuthService({
    session: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash !== expiredHash) {
          return null;
        }

        return {
          id: 's3',
          tokenHash: expiredHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
          user: { id: 'u1', email: 'admin@example.com', status: 'ACTIVE', roles: [] },
        };
      },
      update: async () => ({ id: 's3' }),
    },
  }).authService;

  await assert.rejects(() => expiredAuth.authenticateSession(expiredToken));
});
