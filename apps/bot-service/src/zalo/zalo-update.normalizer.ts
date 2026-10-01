import { Injectable } from '@nestjs/common';
import { SUPPORTED_ZALO_EVENT_NAMES, type ZaloInboundEvent } from './zalo.types';

const SUPPORTED_NAMES = new Set<string>(SUPPORTED_ZALO_EVENT_NAMES);

@Injectable()
export class ZaloUpdateNormalizer {
  public normalize(rawEvent: Readonly<Record<string, unknown>>, source: 'polling' | 'webhook'): ZaloInboundEvent {
    const eventName = typeof rawEvent.event_name === 'string' ? rawEvent.event_name : 'unknown';
    const message = this.toRecord(rawEvent.message);
    const sender = this.toRecord(rawEvent.sender);
    const recipient = this.toRecord(rawEvent.recipient);

    return {
      source,
      eventName,
      supported: SUPPORTED_NAMES.has(eventName),
      messageId: this.toString(message?.msg_id) ?? this.toString(message?.message_id),
      chatType: this.toString(message?.chat_type) ?? this.toString(rawEvent.chat_type),
      senderId: this.toString(sender?.id) ?? this.toString(message?.from_id),
      recipientId: this.toString(recipient?.id) ?? this.toString(message?.to_id),
      timestamp: this.toNumber(message?.time) ?? this.toNumber(rawEvent.timestamp),
    };
  }

  private toRecord(input: unknown): Record<string, unknown> | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    return input as Record<string, unknown>;
  }

  private toString(input: unknown): string | undefined {
    return typeof input === 'string' && input.trim().length > 0 ? input.trim() : undefined;
  }

  private toNumber(input: unknown): number | undefined {
    return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
  }
}
