import { Module } from '@nestjs/common';
import { loadBotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_SDK_FACTORY } from './zalo.constants';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloService } from './zalo.service';
import { NodeZaloSdkFactory } from './sdk/zalo-sdk.factory';

@Module({
  providers: [
    {
      provide: ZALO_CONFIG,
      useFactory: () => loadBotServiceConfig(process.env),
    },
    {
      provide: ZALO_SDK_FACTORY,
      useClass: NodeZaloSdkFactory,
    },
    ZaloAdapter,
    ZaloService,
  ],
  exports: [ZaloService],
})
export class ZaloModule {}
