import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseHealthProbe } from '../dist/index.js';

test('DatabaseHealthProbe returns ready when connection and schema checks pass', async () => {
  const probe = new DatabaseHealthProbe({
    async $queryRawUnsafe(query) {
      if (query === 'SELECT 1') {
        return [{ '?column?': 1 }];
      }

      if (query.includes("to_regclass('public.system_metadata')")) {
        return [{ table_name: 'system_metadata' }];
      }

      throw new Error(`Unexpected query: ${query}`);
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
    async $queryRawUnsafe(query) {
      if (query === 'SELECT 1') {
        return [{ '?column?': 1 }];
      }

      if (query.includes("to_regclass('public.system_metadata')")) {
        return [{ table_name: null }];
      }

      throw new Error(`Unexpected query: ${query}`);
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
    async $queryRawUnsafe() {
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
