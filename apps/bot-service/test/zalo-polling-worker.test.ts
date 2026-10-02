import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotServiceConfig } from '@lhu/config';
import { ZaloPollingWorker } from '../src/zalo/zalo-polling.worker';
import { ZaloUpdateValidator } from '../src/zalo/zalo-update.validator';
import { ZaloUpdateNormalizer } from '../src/zalo/zalo-update.normalizer';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';

function buildConfig(overrides: Partial<BotServiceConfig> = {}): BotServiceConfig {
  return {
    nodeEnv: 'test',
    databaseUrl: 'postgresql://localhost:5432/lhu_zbot?schema=public',
    redisUrl: 'redis://localhost:6379',
    botServiceRole: 'worker',
    zaloUpdateMode: 'polling',
    zaloBotToken: 'phase5-token',
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
    ...overrides,
  };
}

function createWorker(options: {
  config?: Partial<BotServiceConfig>;
  getUpdates: (input: { timeoutSeconds: number; signal?: AbortSignal }) => Promise<unknown>;
  process?: () => Promise<void>;
}) {
  const adapter = {
    getUpdates: options.getUpdates,
    mapError: (error: unknown) =>
      error instanceof ZaloIntegrationError
        ? error
        : new ZaloIntegrationError('network', {
            status: 'NETWORK_ERROR',
            retryable: true,
          }),
  };

  const processor = {
    process: options.process ?? (async () => undefined),
  };

  return new ZaloPollingWorker(
    buildConfig(options.config),
    adapter as never,
    new ZaloUpdateValidator(),
    new ZaloUpdateNormalizer(),
    processor as never,
  );
}

test('polling starts only for worker + polling mode', async () => {
  let called = 0;
  const worker = createWorker({
    config: { botServiceRole: 'api' },
    getUpdates: async () => {
      called += 1;
      return { ok: true, result: null };
    },
  });

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await worker.onApplicationShutdown();

  assert.equal(called, 0);
});

test('polling does not start in webhook mode', async () => {
  let called = 0;
  const worker = createWorker({
    config: { zaloUpdateMode: 'webhook' },
    getUpdates: async () => {
      called += 1;
      return { ok: true, result: null };
    },
  });

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await worker.onApplicationShutdown();

  assert.equal(called, 0);
});

test('polling loop is sequential with no overlapping getUpdates calls', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let callCount = 0;
  let processedCount = 0;

  const worker = createWorker({
    getUpdates: async () => {
      callCount += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {
        ok: true,
        result: {
          event_name: 'message.text.received',
          message: { msg_id: `msg-${callCount}` },
        },
      };
    },
    process: async () => {
      processedCount += 1;
      if (processedCount >= 3) {
        (worker as unknown as { isRunning: boolean }).isRunning = false;
      }
    },
  });

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 60));
  await worker.onApplicationShutdown();

  assert.ok(callCount >= 3);
  assert.equal(maxInFlight, 1);
});

test('retry backoff increases and resets after success', async () => {
  const delays: number[] = [];
  let calls = 0;

  const worker = createWorker({
    getUpdates: async () => {
      calls += 1;
      if (calls <= 2) {
        throw new ZaloIntegrationError('timeout', {
          status: 'NETWORK_ERROR',
          retryable: true,
        });
      }

      if (calls === 3) {
        return { ok: true, result: null };
      }

      throw new ZaloIntegrationError('timeout-again', {
        status: 'NETWORK_ERROR',
        retryable: true,
      });
    },
  });

  (worker as unknown as { sleep: (ms: number) => Promise<void>; isRunning: boolean }).sleep = async (ms: number) => {
    delays.push(ms);
    if (delays.length >= 3) {
      (worker as unknown as { isRunning: boolean }).isRunning = false;
    }
  };

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await worker.onApplicationShutdown();

  assert.deepEqual(delays.slice(0, 3), [1000, 2000, 1000]);
});

test('shutdown aborts in-flight long poll and no new poll starts', async () => {
  let calls = 0;
  let aborted = false;

  const worker = createWorker({
    getUpdates: async ({ signal }) => {
      calls += 1;
      await new Promise<void>((resolve, reject) => {
        if (!signal) {
          reject(new Error('missing signal'));
          return;
        }

        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });

      return { ok: true, result: null };
    },
  });

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await worker.onApplicationShutdown();

  assert.equal(aborted, true);
  assert.equal(calls, 1);
});

test('non-retryable auth failures stop polling without retry scheduling', async () => {
  let calls = 0;
  let sleepCalled = false;
  const worker = createWorker({
    getUpdates: async () => {
      calls += 1;
      throw new ZaloIntegrationError('auth', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
        statusCode: 401,
      });
    },
  });

  (worker as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async () => {
    sleepCalled = true;
  };

  await worker.onApplicationBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await worker.onApplicationShutdown();

  assert.equal(calls, 1);
  assert.equal(sleepCalled, false);
});
