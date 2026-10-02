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
  let calledContentType = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledMethod = init?.method ?? '';
    calledAccept = typeof init?.headers === 'object' && init.headers
      ? String((init.headers as Record<string, string>).Accept ?? '')
      : '';
    calledContentType = typeof init?.headers === 'object' && init.headers
      ? String((init.headers as Record<string, string>)['Content-Type'] ?? '')
      : '';
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          id: '1459232241454765289',
          account_name: 'bot.VDKyGxQvc',
          account_type: 'BASIC',
          can_join_groups: false,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const response = await client.getMe('phase4-token');
  assert.deepEqual(response, {
    ok: true,
    result: {
      id: '1459232241454765289',
      account_name: 'bot.VDKyGxQvc',
      account_type: 'BASIC',
      can_join_groups: false,
    },
  });
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase4-token/getMe');
  assert.equal(calledMethod, 'POST');
  assert.equal(calledAccept, 'application/json');
  assert.equal(calledContentType, 'application/json');
  assert.equal(calledBody, '{}');
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
      assert.equal(error.requestUrl, 'https://bot-api.zaloplatforms.com/bot[REDACTED]/getMe');
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

test('getUpdates calls official endpoint with timeout payload', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledMethod = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledMethod = init?.method ?? '';
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(
      JSON.stringify({
        ok: true,
        result: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const response = await client.getUpdates('phase5-token', { timeoutSeconds: 30 });
  assert.deepEqual(response, { ok: true, result: [] });
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase5-token/getUpdates');
  assert.equal(calledMethod, 'POST');
  assert.equal(calledBody, JSON.stringify({ timeout: 30 }));
});

test('getUpdates abort signal cancellation maps to timeout without token leak', async () => {
  const client = new OfficialZaloHttpClient();
  const controller = new AbortController();

  globalThis.fetch = (async (): Promise<Response> => {
    controller.abort();
    throw new DOMException('aborted', 'AbortError');
  }) as typeof fetch;

  await assert.rejects(
    async () =>
      client.getUpdates('phase5-token', {
        timeoutSeconds: 30,
        signal: controller.signal,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ZaloApiRequestError);
      assert.equal(error.category, 'timeout');
      assert.equal(error.requestUrl, 'https://bot-api.zaloplatforms.com/bot[REDACTED]/getUpdates');
      return true;
    },
  );
});

test('getUpdates local timeout cancellation maps to timeout without token leak', async () => {
  const client = new OfficialZaloHttpClient();
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = ((handler: Parameters<typeof setTimeout>[0], _timeout?: number, ...args: unknown[]) => {
    const callback = typeof handler === 'function' ? handler : () => undefined;
    callback(...args);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const signal = init?.signal;
    if (signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }

    return await new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    await assert.rejects(
      async () => client.getUpdates('phase5-token', { timeoutSeconds: 30 }),
      (error: unknown) => {
        assert.ok(error instanceof ZaloApiRequestError);
        assert.equal(error.category, 'timeout');
        assert.equal(error.requestUrl, 'https://bot-api.zaloplatforms.com/bot[REDACTED]/getUpdates');
        return true;
      },
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('setWebhook calls official endpoint with url and secret_token payload', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledMethod = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledMethod = init?.method ?? '';
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const response = await client.setWebhook('phase6-token', {
    url: 'https://bot.example.com/webhooks/zalo',
    secret_token: 'phase6-webhook-secret',
  });
  assert.deepEqual(response, { ok: true, result: true });
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase6-token/setWebhook');
  assert.equal(calledMethod, 'POST');
  assert.equal(calledBody, JSON.stringify({
    url: 'https://bot.example.com/webhooks/zalo',
    secret_token: 'phase6-webhook-secret',
  }));
});

test('testWebhook calls official endpoint with empty json body', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await client.testWebhook('phase6-token');
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase6-token/testWebhook');
  assert.equal(calledBody, '{}');
});

test('deleteWebhook calls official endpoint with empty json body', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await client.deleteWebhook('phase6-token');
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase6-token/deleteWebhook');
  assert.equal(calledBody, '{}');
});

test('getWebhookInfo calls official endpoint with empty json body', async () => {
  const client = new OfficialZaloHttpClient();
  let calledUrl = '';
  let calledBody = '';

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    calledUrl = typeof input === 'string' ? input : input.toString();
    calledBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const response = await client.getWebhookInfo('phase6-token');
  assert.deepEqual(response, { ok: true });
  assert.equal(calledUrl, 'https://bot-api.zaloplatforms.com/botphase6-token/getWebhookInfo');
  assert.equal(calledBody, '{}');
});

test('webhook methods sanitize token in errors', async () => {
  const client = new OfficialZaloHttpClient();

  globalThis.fetch = (async (): Promise<Response> =>
    new Response('not json', { status: 502 })) as typeof fetch;

  await assert.rejects(
    async () =>
      client.setWebhook('phase6-secret-token', {
        url: 'https://bot.example.com/webhooks/zalo',
        secret_token: 'phase6-webhook-secret',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ZaloApiRequestError);
      assert.equal(error.requestUrl, 'https://bot-api.zaloplatforms.com/bot[REDACTED]/setWebhook');
      return true;
    },
  );
});
