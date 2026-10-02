import assert from 'node:assert/strict';
import test from 'node:test';
import { ZaloUpdateValidator } from '../src/zalo/zalo-update.validator';
import { ZaloUpdateNormalizer } from '../src/zalo/zalo-update.normalizer';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';

const validator = new ZaloUpdateValidator();
const normalizer = new ZaloUpdateNormalizer();

test('validator accepts empty polling result', () => {
  const events = validator.extractRawEvents({ ok: true, result: null });
  assert.deepEqual(events, []);
});

test('validator accepts single event object result', () => {
  const events = validator.extractRawEvents({
    ok: true,
    result: {
      event_name: 'message.text.received',
      message: {
        msg_id: 'm-1',
      },
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.event_name, 'message.text.received');
});

test('validator rejects array polling result payload', () => {
  assert.throws(() => validator.extractRawEvents({ ok: true, result: [{ event_name: 'message.text.received' }] }), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('validator rejects malformed envelope', () => {
  assert.throws(() => validator.extractRawEvents('invalid-payload'), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('webhook validator accepts object payload', () => {
  const events = validator.extractRawWebhookEvents({
    ok: true,
    result: {
      event_name: 'message.text.received',
      message: { msg_id: 'm-1' },
    },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event_name, 'message.text.received');
});

test('webhook validator rejects invalid payload type', () => {
  assert.throws(() => validator.extractRawWebhookEvents('invalid-payload'), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('webhook validator rejects array payload', () => {
  assert.throws(() => validator.extractRawWebhookEvents([{ event_name: 'message.text.received' }]), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('webhook validator rejects payload without ok=true envelope', () => {
  assert.throws(() => validator.extractRawWebhookEvents({ ok: false, result: {} }), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('webhook validator rejects payload without result.event_name', () => {
  assert.throws(() => validator.extractRawWebhookEvents({ ok: true, result: {} }), (error: unknown) => {
    assert.ok(error instanceof ZaloIntegrationError);
    assert.equal(error.status, 'INVALID_RESPONSE');
    return true;
  });
});

test('normalizer maps documented message.text.received fields', () => {
  const normalized = normalizer.normalize(
    {
      event_name: 'message.text.received',
      message: {
        msg_id: 'msg-123',
        chat_type: 'user',
        from_id: 'user-01',
        to_id: 'bot-01',
        time: 1_727_286_400,
        text: 'sensitive-content-must-not-leak',
      },
      sender: {
        id: 'user-override',
      },
    },
    'polling',
  );

  assert.deepEqual(normalized, {
    source: 'polling',
    eventName: 'message.text.received',
    supported: true,
    messageId: 'msg-123',
    chatType: 'user',
    senderId: 'user-override',
    recipientId: 'bot-01',
    timestamp: 1_727_286_400,
  });

  const serialized = JSON.stringify(normalized);
  assert.equal(serialized.includes('"text":'), false);
  assert.equal(serialized.includes('sensitive-content-must-not-leak'), false);
});

test('normalizer keeps unknown event safe and non-crashing', () => {
  const normalized = normalizer.normalize(
    {
      event_name: 'future.event.type',
      message: {
        message_id: 'legacy-id',
      },
      extra_field: 'should-not-leak',
    },
    'polling',
  );

  assert.deepEqual(normalized, {
    source: 'polling',
    eventName: 'future.event.type',
    supported: false,
    messageId: 'legacy-id',
    chatType: undefined,
    senderId: undefined,
    recipientId: undefined,
    timestamp: undefined,
  });

  test('normalizer keeps message.unsupported.received as supported event even without message body', () => {
    const normalized = normalizer.normalize(
      {
        event_name: 'message.unsupported.received',
      },
      'webhook',
    );

    assert.deepEqual(normalized, {
      source: 'webhook',
      eventName: 'message.unsupported.received',
      supported: true,
      messageId: undefined,
      chatType: undefined,
      senderId: undefined,
      recipientId: undefined,
      timestamp: undefined,
    });
  });

  const serialized = JSON.stringify(normalized);
  assert.equal(serialized.includes('extra_field'), false);
});
