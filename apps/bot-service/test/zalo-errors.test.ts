import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ZaloApiRequestError,
  createSafeLogPayload,
  mapHttpError,
  sanitizeZaloUrl,
} from '../src/zalo/zalo.errors';

test('token-bearing zalo url is redacted', () => {
  const token = 'abc-super-secret-token';
  const rawUrl = `https://bot-api.zapps.me/bot${token}/getMe`;
  const redacted = sanitizeZaloUrl(rawUrl, token);

  assert.equal(redacted, 'https://bot-api.zapps.me/bot[REDACTED]/getMe');
  assert.equal(redacted.includes(token), false);
});

test('authentication failures map to AUTHENTICATION_FAILED', () => {
  const mapped = mapHttpError({
    response: {
      status: 401,
      data: {
        error_code: 401,
      },
    },
  });

  assert.equal(mapped.status, 'AUTHENTICATION_FAILED');
  assert.equal(mapped.retryable, false);
});

test('rate limit failures map to RATE_LIMITED', () => {
  const mapped = mapHttpError({
    response: {
      status: 429,
      data: {
        error_code: 429,
      },
      headers: {
        'retry-after': '12',
      },
    },
  });

  assert.equal(mapped.status, 'RATE_LIMITED');
  assert.equal(mapped.retryable, true);
  assert.equal(mapped.retryAfterSeconds, 12);
});

test('network failures map to NETWORK_ERROR', () => {
  const mapped = mapHttpError({
    code: 'ECONNREFUSED',
    message: 'connect ECONNREFUSED',
  });

  assert.equal(mapped.status, 'NETWORK_ERROR');
  assert.equal(mapped.retryable, true);
});

test('client timeout failures map to NETWORK_ERROR', () => {
  const mapped = mapHttpError(
    new ZaloApiRequestError('timeout', {
      category: 'timeout',
      requestUrl: 'https://bot-api.zapps.me/bot[REDACTED]/getMe',
    }),
  );

  assert.equal(mapped.status, 'NETWORK_ERROR');
  assert.equal(mapped.retryable, true);
});

test('safe log payload redacts request url token', () => {
  const token = 'phase4-token';
  const payload = createSafeLogPayload(
    {
      name: 'AxiosError',
      code: 'ERR_BAD_REQUEST',
      config: {
        url: `https://bot-api.zapps.me/bot${token}/getMe`,
      },
      response: {
        status: 400,
        data: {
          error_code: 400,
        },
      },
    },
    token,
  );

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(token), false);
  assert.match(serialized, /bot\[REDACTED\]/);
});
