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

    if (typeof envelope.result === 'object' && !Array.isArray(envelope.result)) {
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

    const envelope = payload as Record<string, unknown>;
    if (envelope.ok !== true) {
      throw new ZaloIntegrationError('Zalo webhook payload must have ok=true', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const result = envelope.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new ZaloIntegrationError('Zalo webhook payload result must be an object', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const eventName = (result as Record<string, unknown>).event_name;
    if (typeof eventName !== 'string' || eventName.trim().length === 0) {
      throw new ZaloIntegrationError('Zalo webhook payload result.event_name is required', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return [Object.freeze({ ...(result as Record<string, unknown>) })];
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
