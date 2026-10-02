import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  UnauthorizedException,
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
    async () => controller.receive({}, 'application/json', 'phase6-test-secret'),
    BadRequestException,
  );
});

test('webhook controller rejects missing/invalid webhook secret', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => {
      throw new UnauthorizedException('Invalid webhook secret token');
    },
  } as never);

  await assert.rejects(
    async () => controller.receive({}, 'application/json', undefined),
    UnauthorizedException,
  );
});

test('webhook controller acknowledges processor failure safely', async () => {
  const controller = new ZaloWebhookController({
    processWebhookPayload: async () => {
      throw new Error('processor failure');
    },
  } as never);

  const response = await controller.receive({}, 'application/json', 'phase6-test-secret');
  assert.deepEqual(response, {
    accepted: false,
    mode: 'webhook',
    processed: 0,
  });
});
