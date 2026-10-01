import assert from 'node:assert/strict';
import test from 'node:test';
import { ZaloService } from '../src/zalo/zalo.service';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';

test('raw sdk response does not leak outside zalo service boundary', async () => {
  const rawResponse = {
    id: 'bot-1',
    transport: 'sdk-internal',
    access_token: 'must-not-leak',
  };

  const service = new ZaloService({
    getIdentity: async () => ({
      id: String((rawResponse as { id: string }).id),
      displayName: 'LHU Bot',
    }),
    mapError: () => {
      throw new Error('should not run');
    },
    createSafeErrorPayload: () => ({}),
  } as never);

  const result = await service.testConnection();

  assert.deepEqual(result, {
    ok: true,
    status: 'CONNECTED',
    identity: {
      id: 'bot-1',
      displayName: 'LHU Bot',
    },
  });
  assert.equal('transport' in result, false);
  assert.equal('access_token' in result, false);
});

test('service maps normalized errors to safe connection result', async () => {
  const service = new ZaloService({
    getIdentity: async () => {
      throw new ZaloIntegrationError('Rate limit', {
        status: 'RATE_LIMITED',
        retryable: true,
        statusCode: 429,
        retryAfterSeconds: 15,
      });
    },
    mapError: () => {
      throw new Error('should not run');
    },
    createSafeErrorPayload: () => ({}),
  } as never);

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

  const service = new ZaloService({
    getIdentity: async () => {
      throw {
        name: 'AxiosError',
        response: {
          status: 401,
        },
        config: {
          url: `https://bot-api.zapps.me/bot${token}/getMe`,
        },
      };
    },
    mapError: () =>
      new ZaloIntegrationError('auth', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
        statusCode: 401,
      }),
    createSafeErrorPayload: () => ({
      requestUrl: 'https://bot-api.zapps.me/bot[REDACTED]/getMe',
    }),
  } as never);

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
