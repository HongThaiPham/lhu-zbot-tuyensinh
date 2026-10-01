import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';
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

function buildAuthService(
  overrides: Partial<Record<string, unknown>> = {},
  configOverrides: Partial<{
    loginRateLimitWindowSeconds: number;
    loginRateLimitMaxAttempts: number;
  }> = {},
) {
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
    {
      nodeEnv: 'test',
      databaseUrl: process.env.DATABASE_URL as string,
      redisUrl: process.env.REDIS_URL as string,
      botServiceRole: 'api',
      zaloUpdateMode: 'polling',
      port: 3001,
      appEncryptionKey: 'development-only-app-encryption-key-not-for-production',
      sessionCookieName: 'lhu_admin_session',
      sessionTtlSeconds: 1200,
      adminOrigin: 'http://127.0.0.1:4100',
      sessionCookieSameSite: 'lax',
      loginRateLimitWindowSeconds: 300,
      loginRateLimitMaxAttempts: 5,
      trustProxy: false,
      ...configOverrides,
    },
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

async function assertRejectsWithStatus(run: () => Promise<unknown>, expectedStatus: number): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    if (!(error instanceof HttpException)) {
      return false;
    }

    assert.equal(error.getStatus(), expectedStatus);
    return true;
  });
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

test('login keeps IP failure bucket across successful logins and still reaches 429', async () => {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      normalizedEmail: string;
      passwordHash: string;
      status: UserStatus;
      roles: Array<{ role: { name: 'ADMIN' } }>;
    }
  >();

  const { passwordService, authService } = buildAuthService(
    {
      user: {
        findUnique: async ({ where }: { where: { normalizedEmail: string } }) => users.get(where.normalizedEmail) ?? null,
        update: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
      },
      session: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'session-1', ...data }),
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => null,
        update: async () => ({ id: 'session-1' }),
      },
    },
    { loginRateLimitMaxAttempts: 3 },
  );

  const attackerPassword = 'AttackerStrongPass!123';
  users.set('attacker@example.com', {
    id: 'attacker-1',
    email: 'attacker@example.com',
    normalizedEmail: 'attacker@example.com',
    passwordHash: await passwordService.hashPassword(attackerPassword),
    status: 'ACTIVE',
    roles: [{ role: { name: 'ADMIN' } }],
  });

  const victimEmail = 'victim@example.com';
  const sharedIp = '203.0.113.20';

  await assertRejectsWithStatus(
    () => authService.login(victimEmail, 'wrong-password', { ipAddress: sharedIp }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login(victimEmail, 'wrong-password', { ipAddress: sharedIp }),
    HttpStatus.UNAUTHORIZED,
  );

  await authService.login('attacker@example.com', attackerPassword, { ipAddress: sharedIp });

  await assertRejectsWithStatus(
    () => authService.login(victimEmail, 'wrong-password', { ipAddress: sharedIp }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login(victimEmail, 'wrong-password', { ipAddress: sharedIp }),
    HttpStatus.TOO_MANY_REQUESTS,
  );
});

test('successful login clears identity failure bucket without depending on shared IP history', async () => {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      normalizedEmail: string;
      passwordHash: string;
      status: UserStatus;
      roles: Array<{ role: { name: 'ADMIN' } }>;
    }
  >();

  const { passwordService, authService } = buildAuthService(
    {
      user: {
        findUnique: async ({ where }: { where: { normalizedEmail: string } }) => users.get(where.normalizedEmail) ?? null,
        update: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
      },
      session: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'session-2', ...data }),
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => null,
        update: async () => ({ id: 'session-2' }),
      },
    },
    { loginRateLimitMaxAttempts: 3 },
  );

  const adminPassword = 'AdminStrongPass!123';
  users.set('admin@example.com', {
    id: 'admin-1',
    email: 'admin@example.com',
    normalizedEmail: 'admin@example.com',
    passwordHash: await passwordService.hashPassword(adminPassword),
    status: 'ACTIVE',
    roles: [{ role: { name: 'ADMIN' } }],
  });

  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.11' }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.12' }),
    HttpStatus.UNAUTHORIZED,
  );

  await authService.login('admin@example.com', adminPassword, { ipAddress: '198.51.100.13' });

  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.14' }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.15' }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.16' }),
    HttpStatus.UNAUTHORIZED,
  );
  await assertRejectsWithStatus(
    () => authService.login('admin@example.com', 'wrong-password', { ipAddress: '198.51.100.17' }),
    HttpStatus.TOO_MANY_REQUESTS,
  );
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

test('authenticateSession throttles lastUsedAt writes to avoid per-request updates', async () => {
  const now = Date.now();
  const touchCalls: string[] = [];
  let sessionLastUsedAt = new Date(now - 60_000);
  let token = '';
  const { authService, sessionService } = buildAuthService({
    session: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const tokenHash = sessionService.hashToken(token);
        if (where.tokenHash !== tokenHash) {
          return null;
        }

        return {
          id: 's-touch',
          tokenHash,
          revokedAt: null,
          expiresAt: new Date(now + 60_000),
          lastUsedAt: sessionLastUsedAt,
          user: { id: 'u1', email: 'admin@example.com', status: 'ACTIVE', roles: [] },
        };
      },
      update: async ({ where }: { where: { id: string } }) => {
        touchCalls.push(where.id);
        sessionLastUsedAt = new Date();
        return { id: where.id };
      },
    },
  });
  token = sessionService.createToken();

  await authService.authenticateSession(token);
  await authService.authenticateSession(token);
  assert.equal(touchCalls.length, 0);
});

test('authenticateSession updates lastUsedAt when previous use is stale', async () => {
  const now = Date.now();
  const touchCalls: string[] = [];
  let sessionLastUsedAt = new Date(now - 6 * 60_000);
  let token = '';
  const { authService, sessionService } = buildAuthService({
    session: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const tokenHash = sessionService.hashToken(token);
        if (where.tokenHash !== tokenHash) {
          return null;
        }

        return {
          id: 's-touch-stale',
          tokenHash,
          revokedAt: null,
          expiresAt: new Date(now + 60_000),
          lastUsedAt: sessionLastUsedAt,
          user: { id: 'u1', email: 'admin@example.com', status: 'ACTIVE', roles: [] },
        };
      },
      update: async ({ where }: { where: { id: string } }) => {
        touchCalls.push(where.id);
        sessionLastUsedAt = new Date();
        return { id: where.id };
      },
    },
  });
  token = sessionService.createToken();

  await authService.authenticateSession(token);
  await authService.authenticateSession(token);
  assert.deepEqual(touchCalls, ['s-touch-stale']);
});

test('client IP resolution uses framework-resolved req.ip before socket remoteAddress', () => {
  const { authService } = buildAuthService();

  assert.equal(authService.getClientIp('203.0.113.99', '127.0.0.1'), '203.0.113.99');
  assert.equal(authService.getClientIp(undefined, '127.0.0.1'), '127.0.0.1');
});
