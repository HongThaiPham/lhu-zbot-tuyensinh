import { Inject, Injectable } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_CONNECTION_TIMEOUT_MS, ZALO_HTTP_CLIENT } from './zalo.constants';
import { ZaloIntegrationError, createSafeLogPayload, mapHttpError, sanitizeZaloUrl } from './zalo.errors';
import type { ZaloHttpClient } from './http/zalo-http.types';
import type { ZaloBotIdentity, ZaloWebhookInfo } from './zalo.types';

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
    this.ensureToken();
    const response = await this.withTimeout(this.zaloHttpClient.getMe(this.token));
    return this.normalizeIdentity(response);
  }

  public async getUpdates(options: {
    readonly timeoutSeconds: number;
    readonly signal?: AbortSignal;
  }): Promise<unknown> {
    this.ensureToken();
    return this.zaloHttpClient.getUpdates(this.token, options);
  }

  public async setWebhook(input: { readonly url: string; readonly secretToken: string }): Promise<ZaloWebhookInfo> {
    this.ensureToken();
    const response = await this.zaloHttpClient.setWebhook(this.token, {
      url: input.url,
      secret_token: input.secretToken,
    });
    return this.normalizeWebhookInfo(response, 'setWebhook');
  }

  public async testWebhook(): Promise<void> {
    this.ensureToken();
    await this.zaloHttpClient.testWebhook(this.token);
  }

  public async deleteWebhook(): Promise<ZaloWebhookInfo> {
    this.ensureToken();
    const response = await this.zaloHttpClient.deleteWebhook(this.token);
    return this.normalizeWebhookInfo(response, 'deleteWebhook');
  }

  public async getWebhookInfo(): Promise<ZaloWebhookInfo> {
    this.ensureToken();
    const response = await this.zaloHttpClient.getWebhookInfo(this.token);
    return this.normalizeWebhookInfo(response, 'getWebhookInfo');
  }

  public createSafeErrorPayload(error: unknown): Readonly<Record<string, unknown>> {
    return createSafeLogPayload(error, this.token);
  }

  public mapError(error: unknown): ZaloIntegrationError {
    return mapHttpError(error);
  }

  private ensureToken(): void {
    if (!this.hasConfiguredToken()) {
      throw new ZaloIntegrationError('Zalo token is not configured', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
      });
    }
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
    const envelope = this.toRecord(response, 'Zalo getMe returned invalid payload type');
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

  private normalizeWebhookInfo(
    response: unknown,
    operation: 'setWebhook' | 'deleteWebhook' | 'getWebhookInfo',
  ): ZaloWebhookInfo {
    const envelope = this.toRecord(response, `Zalo ${operation} returned invalid payload type`);
    if (envelope.ok !== true) {
      throw new ZaloIntegrationError(`Zalo ${operation} returned unsuccessful response envelope`, {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const result = envelope.result;
    const payload = this.toRecord(result, `Zalo ${operation} returned invalid result payload`);
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (typeof payload.url !== 'string') {
      throw new ZaloIntegrationError(`Zalo ${operation} returned invalid webhook URL`, {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    const updatedAt = payload.updated_at;
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
      throw new ZaloIntegrationError(`Zalo ${operation} returned invalid webhook updated_at`, {
        status: 'INVALID_RESPONSE',
        retryable: false,
      });
    }

    return {
      url,
      updatedAt,
      isConfigured: url.length > 0,
    };
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
