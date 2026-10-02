import assert from 'node:assert/strict';
import test from 'node:test';
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLE_METADATA_KEY, REQUEST_USER_KEY } from '../src/auth/constants';
import { CsrfOriginGuard } from '../src/auth/csrf-origin.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { AdminZaloController } from '../src/admin/admin-zalo.controller';
import { AdminZaloService } from '../src/admin/admin-zalo.service';

test('admin zalo controller requires auth, rbac and csrf guards', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, AdminZaloController) as Array<new () => unknown>;
  const guardNames = guards.map((guard) => guard.name);
  assert.deepEqual(guardNames, [SessionAuthGuard.name, RolesGuard.name, CsrfOriginGuard.name]);
});

test('admin zalo routes require ADMIN role', () => {
  const methods = [
    'testConnection',
    'getWebhookInfo',
    'setWebhook',
    'testWebhook',
    'deleteWebhook',
  ] as const;
  for (const method of methods) {
    const roles = Reflect.getMetadata(
      ROLE_METADATA_KEY,
      AdminZaloController.prototype[method],
    ) as string[] | undefined;
    assert.deepEqual(roles, ['ADMIN']);
  }
});

test('admin zalo service audits all webhook operations with safe metadata', async () => {
  const auditCalls: Array<{
    action: string;
    entityType: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }> = [];
  const service = new AdminZaloService(
    {
      client: {
        auditLog: {
          create: async () => ({ id: 'audit-1' }),
        },
      },
    } as never,
    {
      record: async (_client: unknown, input: {
        action: string;
        entityType: string;
        actorUserId?: string | null;
        metadata?: Record<string, unknown>;
      }) => {
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
      getWebhookInfo: async () => ({
        ok: true,
        status: 'SUCCESS',
        webhook: {
          isConfigured: true,
          url: 'https://bot.example.com/webhooks/zalo',
        },
      }),
      setWebhook: async () => ({
        ok: true,
        status: 'SUCCESS',
      }),
      testWebhook: async () => ({
        ok: true,
        status: 'SUCCESS',
      }),
      deleteWebhook: async () => ({
        ok: true,
        status: 'SUCCESS',
      }),
    } as never,
  );

  const connection = await service.testConnection('admin-1');
  const info = await service.getWebhookInfo('admin-1');
  const setResult = await service.setWebhook({
    actorUserId: 'admin-1',
    url: 'https://bot.example.com/webhooks/zalo',
  });
  const testResult = await service.testWebhook('admin-1');
  const deleteResult = await service.deleteWebhook('admin-1');

  assert.equal(connection.ok, false);
  assert.equal(info.webhook.isConfigured, true);
  assert.equal(setResult.ok, true);
  assert.equal(testResult.ok, true);
  assert.equal(deleteResult.ok, true);
  assert.equal(auditCalls.length, 5);
  assert.deepEqual(auditCalls.map((call) => call.action), [
    'ADMIN_ZALO_TEST_CONNECTION',
    'ADMIN_ZALO_GET_WEBHOOK_INFO',
    'ADMIN_ZALO_SET_WEBHOOK',
    'ADMIN_ZALO_TEST_WEBHOOK',
    'ADMIN_ZALO_DELETE_WEBHOOK',
  ]);
  assert.equal(JSON.stringify(auditCalls).includes('phase6-token'), false);
});

test('non-admin user is rejected by roles guard for admin zalo endpoint', () => {
  const guard = new RolesGuard({
    getAllAndOverride: () => ['ADMIN'],
  } as never);

  const context = {
    getHandler: () => AdminZaloController.prototype.getWebhookInfo,
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
