import { Inject, Injectable } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_CONNECTION_TIMEOUT_MS, ZALO_SDK_FACTORY } from './zalo.constants';
import { ZaloIntegrationError, createSafeLogPayload, mapSdkError, sanitizeZaloUrl } from './zalo.errors';
import type { ZaloSdkClient, ZaloSdkFactory } from './sdk/zalo-sdk.types';
import type { ZaloBotIdentity } from './zalo.types';

@Injectable()
export class ZaloAdapter {
  private readonly token: string;
  private readonly sdkClient: ZaloSdkClient | null;

  public constructor(
    @Inject(ZALO_CONFIG) private readonly config: BotServiceConfig,
    @Inject(ZALO_SDK_FACTORY) private readonly sdkFactory: ZaloSdkFactory,
  ) {
    this.token = this.config.zaloBotToken.trim();
    this.sdkClient = this.token.length > 0 ? this.sdkFactory.create(this.token) : null;
  }

  public hasConfiguredToken(): boolean {
    return this.token.length > 0;
  }

  public sanitizeUrl(rawUrl: string): string {
    return sanitizeZaloUrl(rawUrl, this.token);
  }

  public async getIdentity(): Promise<ZaloBotIdentity> {
    if (!this.sdkClient) {
      throw new ZaloIntegrationError('Zalo token is not configured', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
      });
    }

    const response = await this.withTimeout(this.sdkClient.getMe());
    return this.normalizeIdentity(response);
  }

  public createSafeErrorPayload(error: unknown): Readonly<Record<string, unknown>> {
    return createSafeLogPayload(error, this.token);
  }

  public mapError(error: unknown): ZaloIntegrationError {
    return mapSdkError(error);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              new ZaloIntegrationError('Zalo getMe timeout', {
                status: 'NETWORK_ERROR',
                retryable: true,
              }),
            );
          }, ZALO_CONNECTION_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private normalizeIdentity(response: unknown): ZaloBotIdentity {
    const payload = this.toRecord(response);
    const id = payload.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new ZaloIntegrationError('Zalo getMe returned invalid identity payload', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const identity: ZaloBotIdentity = {
      id: String(id),
    };

    if (typeof payload.name === 'string' && payload.name.trim().length > 0) {
      identity.displayName = payload.name.trim();
    }

    if (typeof payload.username === 'string' && payload.username.trim().length > 0) {
      identity.username = payload.username.trim();
    }

    if (typeof payload.avatar === 'string' && payload.avatar.trim().length > 0) {
      identity.avatar = payload.avatar.trim();
    }

    return identity;
  }

  private toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object') {
      throw new ZaloIntegrationError('Zalo getMe returned invalid payload type', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return input as Record<string, unknown>;
  }
}
