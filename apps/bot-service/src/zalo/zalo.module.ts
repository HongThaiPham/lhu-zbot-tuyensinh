import { Module } from '@nestjs/common';
import { loadBotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_HTTP_CLIENT } from './zalo.constants';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloService } from './zalo.service';
import { OfficialZaloHttpClient } from './http/zalo-http.client';

@Module({
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
  ],
  exports: [ZaloService],
})
export class ZaloModule {}
