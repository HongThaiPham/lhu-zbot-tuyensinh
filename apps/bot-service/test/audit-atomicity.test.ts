import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminUsersService } from '../src/admin/admin-users.service';

test('admin user status mutation and audit run in one transaction callback', async () => {
  let updateCalled = false;
  let auditCalled = false;

  const prisma = {
    client: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        await callback({
          user: {
            update: async () => {
              updateCalled = true;
              return {
                id: 'target-1',
                email: 'target@example.com',
                status: 'INACTIVE',
              };
            },
          },
        }),
    },
  };

  const auditService = {
    record: async () => {
      auditCalled = true;
      return { id: 'audit-1' };
    },
  };

  const service = new AdminUsersService(prisma as never, auditService as never);
  const result = await service.setUserStatus({
    actorUserId: 'actor-1',
    targetUserId: 'target-1',
    active: false,
  });

  assert.equal(updateCalled, true);
  assert.equal(auditCalled, true);
  assert.equal(result.status, 'INACTIVE');
});

test('admin user status mutation fails when audit write fails in transaction', async () => {
  const prisma = {
    client: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        await callback({
          user: {
            update: async () => ({
              id: 'target-1',
              email: 'target@example.com',
              status: 'INACTIVE',
            }),
          },
        }),
    },
  };

  const auditService = {
    record: async () => {
      throw new Error('audit failure');
    },
  };

  const service = new AdminUsersService(prisma as never, auditService as never);

  await assert.rejects(
    () =>
      service.setUserStatus({
        actorUserId: 'actor-1',
        targetUserId: 'target-1',
        active: false,
      }),
    /audit failure/,
  );
});
