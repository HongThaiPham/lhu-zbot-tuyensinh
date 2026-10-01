import { Injectable, Logger } from '@nestjs/common';
import type { ZaloInboundEvent } from './zalo.types';

@Injectable()
export class ZaloInboundEventProcessor {
  private readonly logger = new Logger(ZaloInboundEventProcessor.name);

  public async process(event: ZaloInboundEvent): Promise<void> {
    this.logger.log(
      `received_zalo_event source=${event.source} eventName=${event.eventName} supported=${event.supported} messageId=${event.messageId ?? 'n/a'} chatType=${event.chatType ?? 'n/a'}`,
    );
  }
}
