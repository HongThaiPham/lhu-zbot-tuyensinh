import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseHealthProbe } from '../dist/index.js';

function toSqlString(query) {
  return typeof query === 'string' ? query : query.sql;
}

test('DatabaseHealthProbe returns ready when connection and schema checks pass', async () => {
  const probe = new DatabaseHealthProbe({
    async $queryRaw(query) {
      const sql = toSqlString(query);

      if (sql === 'SELECT 1') {
        return [{ '?column?': 1 }];
      }

      if (sql.includes("to_regclass('public.system_metadata')")) {
        return [{ table_name: 'system_metadata' }];
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const result = await probe.checkReadiness();
  assert.equal(result.ready, true);
  assert.deepEqual(result.details, {
    connectionReady: true,
    schemaReady: true,
  });
});

test('DatabaseHealthProbe reports schema_not_migrated when schema check fails', async () => {
  const probe = new DatabaseHealthProbe({
    async $queryRaw(query) {
      const sql = toSqlString(query);

      if (sql === 'SELECT 1') {
        return [{ '?column?': 1 }];
      }

      if (sql.includes("to_regclass('public.system_metadata')")) {
        return [{ table_name: null }];
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const result = await probe.checkReadiness();
  assert.equal(result.ready, false);
  assert.deepEqual(result.details, {
    connectionReady: true,
    schemaReady: false,
    reason: 'schema_not_migrated',
  });
});

test('DatabaseHealthProbe reports connection_failed when query throws', async () => {
  const probe = new DatabaseHealthProbe({
    async $queryRaw() {
      throw new Error('database unreachable');
    },
  });

  const result = await probe.checkReadiness();
  assert.equal(result.ready, false);
  assert.deepEqual(result.details, {
    connectionReady: false,
    schemaReady: false,
    reason: 'connection_failed',
  });
});
