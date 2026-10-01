import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotServiceConfig } from '@lhu/config';
import { ZaloAdapter } from '../src/zalo/zalo.adapter';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';
import type { ZaloSdkFactory } from '../src/zalo/sdk/zalo-sdk.types';

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

function buildFactory(getMeImpl: () => Promise<unknown>): ZaloSdkFactory {
  return {
    create: () => ({
      getMe: getMeImpl,
    }),
  };
}

test('factory receives validated token', async () => {
  let receivedToken = '';
  const config = buildConfig({ zaloBotToken: 'token-from-config' });
  const factory: ZaloSdkFactory = {
    create: (token: string) => {
      receivedToken = token;
      return {
        getMe: async () => ({ id: 'bot-1' }),
      };
    },
  };

  const adapter = new ZaloAdapter(config, factory);
  const identity = await adapter.getIdentity();

  assert.equal(receivedToken, 'token-from-config');
  assert.equal(identity.id, 'bot-1');
});

test('successful getMe maps to internal identity dto', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildFactory(async () => ({
      id: 123,
      name: 'LHU Admissions Bot',
      username: 'lhu_bot',
      avatar: 'https://example.com/avatar.png',
      nonPortableField: 'ignored',
    })),
  );

  const identity = await adapter.getIdentity();

  assert.deepEqual(identity, {
    id: '123',
    displayName: 'LHU Admissions Bot',
    username: 'lhu_bot',
    avatar: 'https://example.com/avatar.png',
  });
});

test('malformed successful response maps to INVALID_RESPONSE', async () => {
  const adapter = new ZaloAdapter(
    buildConfig(),
    buildFactory(async () => ({
      username: 'missing-id',
    })),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('missing token fails safely without sdk call', async () => {
  let called = false;
  const adapter = new ZaloAdapter(
    buildConfig({ zaloBotToken: '' }),
    buildFactory(async () => {
      called = true;
      return { id: 'bot-1' };
    }),
  );

  await assert.rejects(() => adapter.getIdentity(), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'AUTHENTICATION_FAILED');
    return true;
  });
  assert.equal(called, false);
});
