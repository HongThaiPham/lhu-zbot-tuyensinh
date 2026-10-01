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

function buildGetMeResultFixture() {
  return {
    id: 123,
    name: 'LHU Admissions Bot',
    username: 'lhu_bot',
    avatar: 'https://example.com/avatar.png',
    nonPortableField: 'ignored',
  } as const;
}

test('http client receives validated token', async () => {
  let receivedToken = '';
  const config = buildConfig({ zaloBotToken: 'token-from-config' });
  const client = buildClient(async (token: string) => {
    receivedToken = token;
    return { ok: true, result: { id: 'bot-1' } };
  });

  const adapter = new ZaloAdapter(config, client);
  const identity = await adapter.getIdentity();

  assert.equal(receivedToken, 'token-from-config');
  assert.equal(identity.id, 'bot-1');
});

test('successful getMe maps to internal identity dto', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({ ok: true, result: buildGetMeResultFixture() })),
  );

  const identity = await adapter.getIdentity();

  assert.deepEqual(identity, {
    id: '123',
    displayName: 'LHU Admissions Bot',
    username: 'lhu_bot',
    avatar: 'https://example.com/avatar.png',
  });
});

test('malformed successful response with missing id maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        username: 'missing-id',
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
      result: buildGetMeResultFixture(),
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

test('envelope with missing bot id maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildClient(async () => ({
      ok: true,
      result: {
        username: 'missing-id',
      },
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
      result: buildGetMeResultFixture(),
      request_id: 'upstream-request-id',
    })),
  );

  const identity = await adapter.getIdentity();
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes('request_id'), false);
  assert.equal(serialized.includes('ok'), false);
  assert.equal(serialized.includes('nonPortableField'), false);
});

test('missing token fails safely without sdk call', async () => {
  let called = false;
  const adapter = new ZaloAdapter(
    buildConfig({ zaloBotToken: '' }),
    buildClient(async () => {
      called = true;
      return { ok: true, result: { id: 'bot-1' } };
    }),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'AUTHENTICATION_FAILED');
    return true;
  });
  assert.equal(called, false);
});
