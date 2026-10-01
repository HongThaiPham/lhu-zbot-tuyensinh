import { Inject, Injectable } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_CONNECTION_TIMEOUT_MS, ZALO_HTTP_CLIENT } from './zalo.constants';
import { ZaloIntegrationError, createSafeLogPayload, mapHttpError, sanitizeZaloUrl } from './zalo.errors';
import type { ZaloHttpClient } from './http/zalo-http.types';
import type { ZaloBotIdentity } from './zalo.types';

@Injectable()
export class ZaloAdapter {
  private readonly token: string;

  public constructor(
    @Inject(ZALO_CONFIG) private readonly config: BotServiceConfig,
    @Inject(ZALO_HTTP_CLIENT) private readonly zaloHttpClient: ZaloHttpClient,
  ) {
    this.token = this.config.zaloBotToken.trim();
  }

  public hasConfiguredToken(): boolean {
    return this.token.length > 0;
  }

  public sanitizeUrl(rawUrl: string): string {
    return sanitizeZaloUrl(rawUrl, this.token);
  }

  public async getIdentity(): Promise<ZaloBotIdentity> {
    if (!this.hasConfiguredToken()) {
      throw new ZaloIntegrationError('Zalo token is not configured', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
      });
    }

    const response = await this.withTimeout(this.zaloHttpClient.getMe(this.token));
    return this.normalizeIdentity(response);
  }

  public createSafeErrorPayload(error: unknown): Readonly<Record<string, unknown>> {
    return createSafeLogPayload(error, this.token);
  }

  public mapError(error: unknown): ZaloIntegrationError {
    return mapHttpError(error);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

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
    const envelope = this.toRecord(response);
    if (envelope.ok !== true) {
      throw new ZaloIntegrationError('Zalo getMe returned unsuccessful response envelope', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const result = envelope.result;
    if (!result || typeof result !== 'object') {
      throw new ZaloIntegrationError('Zalo getMe response envelope missing result payload', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const payload = result as Record<string, unknown>;
    const id = payload.id;
    const accountName = payload.account_name;
    const accountType = payload.account_type;
    const canJoinGroups = payload.can_join_groups;
    if (
      typeof id !== 'string'
      || typeof accountName !== 'string'
      || typeof accountType !== 'string'
      || typeof canJoinGroups !== 'boolean'
    ) {
      throw new ZaloIntegrationError('Zalo getMe returned invalid identity payload', {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return {
      id: id.trim(),
      accountName: accountName.trim(),
      accountType: accountType.trim(),
      canJoinGroups,
    };
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
