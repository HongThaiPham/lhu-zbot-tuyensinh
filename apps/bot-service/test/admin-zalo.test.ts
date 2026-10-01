import assert from 'node:assert/strict';
import test from 'node:test';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLE_METADATA_KEY } from '../src/auth/constants';
import { AdminZaloController } from '../src/admin/admin-zalo.controller';
import { AdminZaloService } from '../src/admin/admin-zalo.service';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { CsrfOriginGuard } from '../src/auth/csrf-origin.guard';
import { ForbiddenException } from '@nestjs/common';
import { REQUEST_USER_KEY } from '../src/auth/constants';

test('admin zalo controller requires auth, rbac and csrf guards', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, AdminZaloController) as Array<new () => unknown>;
  const guardNames = guards.map((guard) => guard.name);
  assert.deepEqual(guardNames, [SessionAuthGuard.name, RolesGuard.name, CsrfOriginGuard.name]);
});

test('admin zalo test-connection route requires ADMIN role', () => {
  const roles = Reflect.getMetadata(
    ROLE_METADATA_KEY,
    AdminZaloController.prototype.testConnection,
  ) as string[] | undefined;
  assert.deepEqual(roles, ['ADMIN']);
});

test('admin zalo service audits connection test action and returns safe result', async () => {
  const auditCalls: Array<{ action: string; entityType: string; actorUserId?: string | null }> = [];
  const service = new AdminZaloService(
    {
      client: {
        auditLog: {
          create: async () => ({ id: 'audit-1' }),
        },
      },
    } as never,
    {
      record: async (_client: unknown, input: { action: string; entityType: string; actorUserId?: string | null }) => {
        auditCalls.push(input);
        return { id: 'audit-1' };
      },
    } as never,
    {
      testConnection: async () => ({
        ok: false,
        status: 'NETWORK_ERROR',
        retryable: true,
        statusCode: undefined,
        retryAfterSeconds: undefined,
        upstreamCode: undefined,
      }),
    } as never,
  );

  const result = await service.testConnection('admin-1');

  assert.deepEqual(result, {
    ok: false,
    status: 'NETWORK_ERROR',
    retryable: true,
    statusCode: undefined,
    retryAfterSeconds: undefined,
    upstreamCode: undefined,
  });
  assert.deepEqual(auditCalls, [
    {
      actorUserId: 'admin-1',
      action: 'ADMIN_ZALO_TEST_CONNECTION',
      entityType: 'zalo_connection',
      metadata: {
        ok: false,
        status: 'NETWORK_ERROR',
      },
    },
  ]);
});

test('non-admin user is rejected by roles guard for admin zalo endpoint', () => {
  const guard = new RolesGuard({
    getAllAndOverride: () => ['ADMIN'],
  } as never);

  const context = {
    getHandler: () => AdminZaloController.prototype.testConnection,
    getClass: () => AdminZaloController,
    switchToHttp: () => ({
      getRequest: () => ({
        [REQUEST_USER_KEY]: {
          id: 'viewer-1',
          email: 'viewer@example.com',
          status: 'ACTIVE',
          roles: ['VIEWER'],
          sessionId: 'session-1',
        },
      }),
    }),
  };

  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
});
