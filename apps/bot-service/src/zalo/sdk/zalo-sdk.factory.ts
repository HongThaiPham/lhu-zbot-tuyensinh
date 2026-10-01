import { Injectable } from '@nestjs/common';
import ZaloBot from 'node-zalo-bot';
import type { ZaloSdkClient, ZaloSdkFactory } from './zalo-sdk.types';

@Injectable()
export class NodeZaloSdkFactory implements ZaloSdkFactory {
  public create(token: string): ZaloSdkClient {
    return new ZaloBot(token, { polling: false });
  }
}
