import assert from 'node:assert/strict';
import test from 'node:test';
import { OfficialZaloHttpClient } from '../src/zalo/http/zalo-http.client';
import { ZaloApiRequestError } from '../src/zalo/zalo.errors';

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test('getMe calls official endpoint with token in path', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledMethod = '';
  let calledAccept = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledMethod = init?.method ?? '';
    calledAccept = typeof init?.headers === 'object' && init.headers
      ? String((init.headers as Record<string, string>).Accept ?? '')
      : '';
    return new Response(
      JSON.stringify({
        ok: true,
        result: { id: 'bot-1' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const response = await client.getMe('phase4-token');
  assert.deepEqual(response, { ok: true, result: { id: 'bot-1' } });
  assert.equal(calledUrl, 'https://bot-api.zapps.me/botphase4-token/getMe');
  assert.equal(calledMethod, 'GET');
  assert.equal(calledAccept, 'application/json');
});

test('getMe maps unsuccessful envelope to API error metadata', async () => {
  const client = new OfficialZaloHttpClient();

  globalThis.fetch = (async (): Promise<Response> =>
    new Response(
      JSON.stringify({
        ok: false,
        error_code: 401,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  await assert.rejects(
    async () => client.getMe('phase4-token'),
    (error: unknown) => {
      assert.ok(error instanceof ZaloApiRequestError);
      assert.equal(error.category, 'api_error');
      assert.equal(error.statusCode, 200);
      assert.equal(error.upstreamCode, 401);
      assert.equal(error.requestUrl, 'https://bot-api.zapps.me/bot[REDACTED]/getMe');
      return true;
    },
  );
});

test('getMe maps non-json non-2xx response to http_error category', async () => {
  const client = new OfficialZaloHttpClient();

  globalThis.fetch = (async (): Promise<Response> =>
    new Response('not json', { status: 502, headers: { 'retry-after': '9' } })) as typeof fetch;

  await assert.rejects(
    async () => client.getMe('phase4-token'),
    (error: unknown) => {
      assert.ok(error instanceof ZaloApiRequestError);
      assert.equal(error.category, 'http_error');
      assert.equal(error.statusCode, 502);
      assert.equal(error.retryAfterSeconds, 9);
      return true;
    },
  );
});

test('getMe maps malformed json envelope on 2xx to invalid_response category', async () => {
  const client = new OfficialZaloHttpClient();

  globalThis.fetch = (async (): Promise<Response> =>
    new Response('not json', { status: 200 })) as typeof fetch;

  await assert.rejects(
    async () => client.getMe('phase4-token'),
    (error: unknown) => {
      assert.ok(error instanceof ZaloApiRequestError);
      assert.equal(error.category, 'invalid_response');
      assert.equal(error.statusCode, 200);
      assert.equal(error.retryAfterSeconds, undefined);
      return true;
    },
  );
});
