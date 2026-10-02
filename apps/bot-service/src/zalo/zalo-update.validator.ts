import { Injectable } from '@nestjs/common';
import { ZaloIntegrationError } from './zalo.errors';

@Injectable()
export class ZaloUpdateValidator {
  public extractRawEvents(response: unknown): readonly Readonly<Record<string, unknown>>[] {
    const envelope = this.toRecord(response, 'Zalo getUpdates returned invalid payload type');
    if (envelope.ok !== true) {
      throw new ZaloIntegrationError('Zalo getUpdates returned unsuccessful response envelope', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    if (envelope.result === undefined || envelope.result === null) {
      return [];
    }

    if (Array.isArray(envelope.result)) {
      return envelope.result
        .filter((event): event is Readonly<Record<string, unknown>> => !!event && typeof event === 'object')
        .map((event) => Object.freeze({ ...event }));
    }

    if (typeof envelope.result === 'object') {
      return [Object.freeze({ ...(envelope.result as Record<string, unknown>) })];
    }

    throw new ZaloIntegrationError('Zalo getUpdates result has invalid shape', {
      status: 'INVALID_RESPONSE',
      retryable: false,
    });
  }

  public extractRawWebhookEvents(payload: unknown): readonly Readonly<Record<string, unknown>>[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ZaloIntegrationError('Zalo webhook payload must be a JSON object', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return [Object.freeze({ ...(payload as Record<string, unknown>) })];
  }

  private toRecord(input: unknown, message: string): Record<string, unknown> {
    if (!input || typeof input !== 'object') {
      throw new ZaloIntegrationError(message, {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return input as Record<string, unknown>;
  }
}
