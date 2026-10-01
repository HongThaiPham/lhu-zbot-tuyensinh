import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotServiceConfig } from '@lhu/config';
import { ZaloAdapter } from '../src/zalo/zalo.adapter';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';
import type { ZaloHttpClient } from '../src/zalo/http/zalo-http.types';

function buildConfig(overrides: Partial<BotServiceConfig> = {}): BotServiceConfig {
  return {
    nodeEnv: 'test',
    databaseUrl: 'postgresql://localhost:5432/lhu_zbot?schema=public',
    redisUrl: 'redis://localhost:6379',
    botServiceRole: 'api',
    zaloUpdateMode: 'polling',
    zaloBotToken: 'phase4-test-token',
    port: 3001,
    appEncryptionKey: 'development-only-app-encryption-key-not-for-production',
    sessionCookieName: 'lhu_admin_session',
    sessionTtlSeconds: 1200,
    adminOrigin: 'http://127.0.0.1:4100',
    sessionCookieSameSite: 'lax',
    loginRateLimitWindowSeconds: 300,
    loginRateLimitMaxAttempts: 5,
    trustProxy: false,
    ...overrides,
  };
}

function buildClient(getMeImpl: (token?: string) => Promise<unknown>): ZaloHttpClient {
  return {
    getMe: getMeImpl,
  };
}

function buildOfficialResultFixture() {
  return {
    id: '1459232241454765289',
    account_name: 'bot.VDKyGxQvc',
    account_type: 'BASIC',
    can_join_groups: false,
    nonPortableField: 'ignored',
  } as const;
}

test('http client receives validated token', async () => {
  let receivedToken = '';
  const config = buildConfig({ zaloBotToken: 'token-from-config' });
  const client = buildClient(async (token: string) => {
    receivedToken = token;
    return { ok: true, result: buildOfficialResultFixture() };
  });

  const adapter = new ZaloAdapter(config, client);
  const identity = await adapter.getIdentity();

  assert.equal(receivedToken, 'token-from-config');
  assert.equal(identity.id, '1459232241454765289');
});

test('official getMe response maps to internal identity dto', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({ ok: true, result: buildOfficialResultFixture() })),
  );

  const identity = await adapter.getIdentity();

  assert.deepEqual(identity, {
    id: '1459232241454765289',
    accountName: 'bot.VDKyGxQvc',
    accountType: 'BASIC',
    canJoinGroups: false,
  });
});

test('missing id maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        account_name: 'bot.VDKyGxQvc',
        account_type: 'BASIC',
        can_join_groups: false,
      },
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('missing account_name maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        id: '1459232241454765289',
        account_type: 'BASIC',
        can_join_groups: false,
      },
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('missing account_type maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        id: '1459232241454765289',
        account_name: 'bot.VDKyGxQvc',
        can_join_groups: false,
      },
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('missing can_join_groups maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        id: '1459232241454765289',
        account_name: 'bot.VDKyGxQvc',
        account_type: 'BASIC',
      },
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('wrong field types map to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        id: 123,
        account_name: true,
        account_type: false,
        can_join_groups: 'no',
      },
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('response without ok=true maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      result: buildOfficialResultFixture(),
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('malformed envelope with missing result maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('unexpected ok=false envelope maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: false,
      error_code: 401,
      description: 'invalid token',
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('raw upstream envelope fields do not leak beyond normalized identity', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: buildOfficialResultFixture(),
      request_id: 'upstream-request-id',
    })),
  );

  const identity = await adapter.getIdentity();
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes('request_id'), false);
  assert.equal(serialized.includes('ok'), false);
  assert.equal(serialized.includes('nonPortableField'), false);
  assert.equal(serialized.includes('account_name'), false);
  assert.equal(serialized.includes('account_type'), false);
  assert.equal(serialized.includes('can_join_groups'), false);
});

test('missing token fails safely without http call', async () => {
  let called = false;
  const adapter = new ZaloAdapter(
    buildConfig({ zaloBotToken: '' }),
    buildClient(async () => {
      called = true;
      return { ok: true, result: buildOfficialResultFixture() };
    }),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'AUTHENTICATION_FAILED');
    return true;
  });
  assert.equal(called, false);
});
