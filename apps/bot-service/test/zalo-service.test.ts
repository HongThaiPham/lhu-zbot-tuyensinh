import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZaloService } from '../src/zalo/zalo.service';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';

function buildConfig(overrides: Partial<BotServiceConfig> = {}): BotServiceConfig {
  return {
    nodeEnv: 'test',
    databaseUrl: 'postgresql://localhost:5432/lhu_zbot?schema=public',
    redisUrl: 'redis://localhost:6379',
    botServiceRole: 'api',
    zaloUpdateMode: 'webhook',
    zaloBotToken: 'phase6-token',
    port: 3001,
    appEncryptionKey: 'development-only-app-encryption-key-not-for-production',
    sessionCookieName: 'lhu_admin_session',
    sessionTtlSeconds: 1200,
    adminOrigin: 'http://127.0.0.1:4100',
    sessionCookieSameSite: 'lax',
    loginRateLimitWindowSeconds: 300,
    loginRateLimitMaxAttempts: 5,
    trustProxy: false,
    zaloPollTimeoutSeconds: 30,
    zaloWebhookUrl: 'https://bot.example.com/webhooks/zalo',
    zaloWebhookSecretToken: 'phase6-test-secret',
    ...overrides,
  };
}

function buildService(overrides: {
  readonly config?: Partial<BotServiceConfig>;
  readonly adapter?: Partial<{
    getIdentity: () => Promise<unknown>;
    mapError: (error: unknown) => ZaloIntegrationError;
    createSafeErrorPayload: (error: unknown) => Readonly<Record<string, unknown>>;
    setWebhook: (input: { readonly url: string; readonly secretToken: string }) => Promise<unknown>;
    testWebhook: () => Promise<void>;
    deleteWebhook: () => Promise<unknown>;
    getWebhookInfo: () => Promise<unknown>;
  }>;
  readonly validator?: Partial<{ extractRawWebhookEvents: (payload: unknown) => readonly Readonly<Record<string, unknown>>[] }>;
  readonly normalizer?: Partial<{ normalize: (payload: Readonly<Record<string, unknown>>, source: 'polling' | 'webhook') => unknown }>;
  readonly processor?: Partial<{ process: (event: unknown) => Promise<void> }>;
} = {}) {
  const adapter = {
    getIdentity: async () => ({
      id: 'bot-1',
      accountName: 'bot.VDKyGxQvc',
      accountType: 'BASIC',
      canJoinGroups: false,
    }),
    mapError: (error: unknown) =>
      error instanceof ZaloIntegrationError
        ? error
        : new ZaloIntegrationError('mapped', { status: 'UPSTREAM_ERROR', retryable: false }),
    createSafeErrorPayload: () => ({}),
    setWebhook: async () => ({
      url: 'https://bot.example.com/webhooks/zalo',
      updatedAt: 1_749_638_250_568,
      isConfigured: true,
    }),
    testWebhook: async () => undefined,
    deleteWebhook: async () => ({
      url: '',
      updatedAt: 1_749_638_250_568,
      isConfigured: false,
    }),
    getWebhookInfo: async () => ({
      url: '',
      updatedAt: 1_749_638_250_568,
      isConfigured: false,
    }),
    ...overrides.adapter,
  };
  const validator = {
    extractRawWebhookEvents: (payload: unknown) =>
      payload && typeof payload === 'object' ? [payload as Record<string, unknown>] : [],
    ...overrides.validator,
  };
  const normalizer = {
    normalize: (payload: Readonly<Record<string, unknown>>, source: 'polling' | 'webhook') => ({
      source,
      eventName: String(payload.event_name ?? 'unknown'),
      supported: true,
    }),
    ...overrides.normalizer,
  };
  const processor = {
    process: async () => undefined,
    ...overrides.processor,
  };

  return new ZaloService(
    buildConfig(overrides.config),
    adapter as never,
    validator as never,
    normalizer as never,
    processor as never,
  );
}

test('raw transport response does not leak outside zalo service boundary', async () => {
  const service = buildService();
  const result = await service.testConnection();

  assert.deepEqual(result, {
    ok: true,
    status: 'CONNECTED',
    identity: {
      id: 'bot-1',
      accountName: 'bot.VDKyGxQvc',
      accountType: 'BASIC',
      canJoinGroups: false,
    },
  });
  assert.equal('transport' in result, false);
  assert.equal('access_token' in result, false);
});

test('service maps normalized errors to safe connection result', async () => {
  const service = buildService({
    adapter: {
      getIdentity: async () => {
        throw new ZaloIntegrationError('Rate limit', {
          status: 'RATE_LIMITED',
          retryable: true,
          statusCode: 429,
          retryAfterSeconds: 15,
        });
      },
    },
  });

  const result = await service.testConnection();
  assert.deepEqual(result, {
    ok: false,
    status: 'RATE_LIMITED',
    retryable: true,
    statusCode: 429,
    upstreamCode: undefined,
    retryAfterSeconds: 15,
  });
});

test('service log output excludes token values', async () => {
  const token = 'sensitive-zalo-token';
  const logs: string[] = [];
  const debugLogs: string[] = [];
  const service = buildService({
    adapter: {
      getIdentity: async () => {
        throw new Error('boom');
      },
      mapError: () =>
        new ZaloIntegrationError('auth', {
          status: 'AUTHENTICATION_FAILED',
          retryable: false,
          statusCode: 401,
        }),
      createSafeErrorPayload: () => ({
        requestUrl: 'https://bot-api.zaloplatforms.com/bot[REDACTED]/getMe',
      }),
    },
  });

  (
    service as unknown as {
      logger: {
        warn: (message: string) => void;
        debug: (message: string) => void;
      };
    }
  ).logger = {
    warn: (message: string) => {
      logs.push(message);
    },
    debug: (message: string) => {
      debugLogs.push(message);
    },
  };

  const result = await service.testConnection();
  assert.equal(result.ok, false);

  const mergedLogs = `${logs.join('\n')}\n${debugLogs.join('\n')}`;
  assert.equal(mergedLogs.includes(token), false);
  assert.match(mergedLogs, /\[REDACTED\]/);
});

test('processWebhookPayload uses shared pipeline in webhook mode', async () => {
  const events: unknown[] = [];
  const service = buildService({
    validator: {
      extractRawWebhookEvents: () => [{ event_name: 'message.text.received' }],
    },
    normalizer: {
      normalize: () => ({
        source: 'webhook',
        eventName: 'message.text.received',
        supported: true,
      }),
    },
    processor: {
      process: async (event: unknown) => {
        events.push(event);
      },
    },
  });

  const result = await service.processWebhookPayload(
    { ok: true, result: { event_name: 'message.text.received' } },
    'phase6-test-secret',
  );
  assert.deepEqual(result, { accepted: true, mode: 'webhook', processed: 1 });
  assert.equal(events.length, 1);
});

test('processWebhookPayload is gated off in polling mode', async () => {
  const service = buildService({ config: { zaloUpdateMode: 'polling' } });
  const result = await service.processWebhookPayload(
    { ok: true, result: { event_name: 'message.text.received' } },
    undefined,
  );
  assert.deepEqual(result, { accepted: false, mode: 'polling', processed: 0 });
});

test('setWebhook accepts https in production', async () => {
  let receivedUrl = '';
  let receivedSecret = '';
  const service = buildService({
    config: { nodeEnv: 'production' },
    adapter: {
      setWebhook: async (input: { readonly url: string; readonly secretToken: string }) => {
        receivedUrl = input.url;
        receivedSecret = input.secretToken;
        return {
          url: input.url,
          updatedAt: 1_749_638_250_568,
          isConfigured: true,
        };
      },
    },
  });

  const result = await service.setWebhook('https://bot.example.com/webhooks/zalo');
  assert.equal(result.ok, true);
  assert.equal(result.webhook?.updatedAt, 1_749_638_250_568);
  assert.equal(receivedUrl, 'https://bot.example.com/webhooks/zalo');
  assert.equal(receivedSecret, 'phase6-test-secret');
});

test('setWebhook rejects http in production', async () => {
  const service = buildService({
    config: { nodeEnv: 'production' },
  });

  await assert.rejects(
    async () => service.setWebhook('http://bot.example.com/webhooks/zalo'),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      return true;
    },
  );
});

test('setWebhook rejects invalid url', async () => {
  const service = buildService();

  await assert.rejects(
    async () => service.setWebhook('not-a-valid-url'),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      return true;
    },
  );
});

test('setWebhook allows http in development mode', async () => {
  let receivedUrl = '';
  const service = buildService({
    config: { nodeEnv: 'development' },
    adapter: {
      setWebhook: async (input: { readonly url: string; readonly secretToken: string }) => {
        receivedUrl = input.url;
        return {
          url: input.url,
          updatedAt: 1_749_638_250_568,
          isConfigured: true,
        };
      },
    },
  });

  const result = await service.setWebhook('http://127.0.0.1:3001/webhooks/zalo');
  assert.equal(result.ok, true);
  assert.equal(receivedUrl, 'http://127.0.0.1:3001/webhooks/zalo');
});

test('processWebhookPayload rejects missing webhook secret header in webhook mode', async () => {
  let processed = false;
  const service = buildService({
    processor: {
      process: async () => {
        processed = true;
      },
    },
  });

  await assert.rejects(
    async () =>
      service.processWebhookPayload(
        { ok: true, result: { event_name: 'message.text.received' } },
        undefined,
      ),
    UnauthorizedException,
  );
  assert.equal(processed, false);
});

test('processWebhookPayload rejects wrong webhook secret header in webhook mode', async () => {
  let normalized = false;
  let processed = false;
  const service = buildService({
    normalizer: {
      normalize: () => {
        normalized = true;
        return { source: 'webhook', eventName: 'message.text.received', supported: true };
      },
    },
    processor: {
      process: async () => {
        processed = true;
      },
    },
  });

  await assert.rejects(
    async () =>
      service.processWebhookPayload(
        { ok: true, result: { event_name: 'message.text.received' } },
        'wrong-secret',
      ),
    UnauthorizedException,
  );
  assert.equal(normalized, false);
  assert.equal(processed, false);
});
