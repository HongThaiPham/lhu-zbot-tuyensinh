import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ZaloIntegrationError } from '../src/zalo/zalo.errors';
import { ZaloWebhookController } from '../src/zalo/zalo-webhook.controller';

test('webhook controller requires application/json content type', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => ({ accepted: true, mode: 'webhook', processed: 1 }),
  } as never);

  await assert.rejects(
    async () => controller.receive({}, 'text/plain', undefined),
    UnsupportedMediaTypeException,
  );
});

test('webhook controller rejects oversized payloads', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => ({ accepted: true, mode: 'webhook', processed: 1 }),
  } as never);

  await assert.rejects(
    async () => controller.receive({}, 'application/json', String(300 * 1024)),
    PayloadTooLargeException,
  );
});

test('webhook controller maps invalid payload processing errors to 400', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => {
      throw new ZaloIntegrationError('invalid', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    },
  } as never);

  await assert.rejects(
    async () => controller.receive({}, 'application/json', '100'),
    BadRequestException,
  );
});

test('webhook controller acknowledges processor failure safely', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => {
      throw new Error('processor failure');
    },
  } as never);

  const response = await controller.receive({}, 'application/json', '100');
  assert.deepEqual(response, {
    accepted: false,
    mode: 'webhook',
    processed: 0,
  });
});
