import { Module } from '@nestjs/common';
import { loadBotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_HTTP_CLIENT } from './zalo.constants';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloService } from './zalo.service';
import { OfficialZaloHttpClient } from './http/zalo-http.client';
import { ZaloUpdateValidator } from './zalo-update.validator';
import { ZaloUpdateNormalizer } from './zalo-update.normalizer';
import { ZaloInboundEventProcessor } from './zalo-inbound-event.processor';
import { ZaloPollingWorker } from './zalo-polling.worker';
import { ZaloWebhookController } from './zalo-webhook.controller';

@Module({
  controllers: [ZaloWebhookController],
  providers: [
    {
      provide: ZALO_CONFIG,
      useFactory: () => loadBotServiceConfig(process.env),
    },
    {
      provide: ZALO_HTTP_CLIENT,
      useClass: OfficialZaloHttpClient,
    },
    ZaloAdapter,
    ZaloService,
    ZaloUpdateValidator,
    ZaloUpdateNormalizer,
    ZaloInboundEventProcessor,
    ZaloPollingWorker,
  ],
  exports: [ZaloService],
})
export class ZaloModule {}
