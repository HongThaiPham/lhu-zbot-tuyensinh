import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG } from './zalo.constants';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloInboundEventProcessor } from './zalo-inbound-event.processor';
import { ZaloIntegrationError, toFailureResult } from './zalo.errors';
import type {
  ZaloConnectionTestResult,
  ZaloWebhookInboundResult,
  ZaloWebhookInfoResult,
  ZaloWebhookMutationResult,
} from './zalo.types';
import { ZaloUpdateNormalizer } from './zalo-update.normalizer';
import { ZaloUpdateValidator } from './zalo-update.validator';

@Injectable()
export class ZaloService {
  private readonly logger = new Logger(ZaloService.name);

  public constructor(
    @Inject(ZALO_CONFIG) private readonly config: BotServiceConfig,
    private readonly zaloAdapter: ZaloAdapter,
    private readonly updateValidator: ZaloUpdateValidator,
    private readonly updateNormalizer: ZaloUpdateNormalizer,
    private readonly inboundEventProcessor: ZaloInboundEventProcessor,
  ) {}

  public async testConnection(): Promise<ZaloConnectionTestResult> {
    try {
      const identity = await this.zaloAdapter.getIdentity();
      return {
        ok: true,
        status: 'CONNECTED',
        identity,
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);

      this.logger.warn(
        `Zalo connection test failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));

      return toFailureResult(normalizedError);
    }
  }

  public async setWebhook(url: string): Promise<ZaloWebhookMutationResult> {
    try {
      await this.zaloAdapter.setWebhook(url);
      return {
        ok: true,
        status: 'SUCCESS',
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);
      this.logger.warn(
        `Zalo setWebhook failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));
      return toFailureResult(normalizedError);
    }
  }

  public async testWebhook(): Promise<ZaloWebhookMutationResult> {
    try {
      await this.zaloAdapter.testWebhook();
      return {
        ok: true,
        status: 'SUCCESS',
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);
      this.logger.warn(
        `Zalo testWebhook failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));
      return toFailureResult(normalizedError);
    }
  }

  public async deleteWebhook(): Promise<ZaloWebhookMutationResult> {
    try {
      await this.zaloAdapter.deleteWebhook();
      return {
        ok: true,
        status: 'SUCCESS',
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);
      this.logger.warn(
        `Zalo deleteWebhook failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));
      return toFailureResult(normalizedError);
    }
  }

  public async getWebhookInfo(): Promise<ZaloWebhookInfoResult> {
    try {
      const webhook = await this.zaloAdapter.getWebhookInfo();
      return {
        ok: true,
        status: 'SUCCESS',
        webhook,
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);
      this.logger.warn(
        `Zalo getWebhookInfo failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));
      return toFailureResult(normalizedError);
    }
  }

  public async processWebhookPayload(payload: unknown): Promise<ZaloWebhookInboundResult> {
    if (this.config.zaloUpdateMode !== 'webhook') {
      this.logger.log('zalo webhook ignored (ZALO_UPDATE_MODE=polling)');
      return {
        accepted: false,
        mode: 'polling',
        processed: 0,
      };
    }

    try {
      const rawEvents = this.updateValidator.extractRawWebhookEvents(payload);
      for (const rawEvent of rawEvents) {
        const event = this.updateNormalizer.normalize(rawEvent, 'webhook');
        await this.inboundEventProcessor.process(event);
      }

      return {
        accepted: true,
        mode: 'webhook',
        processed: rawEvents.length,
      };
    } catch (error) {
      const normalizedError =
        error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
      const safePayload = this.zaloAdapter.createSafeErrorPayload(error);
      this.logger.warn(
        `Zalo webhook processing failed status=${normalizedError.status} code=${normalizedError.statusCode ?? 'n/a'} retryable=${normalizedError.retryable}`,
      );
      this.logger.debug(JSON.stringify(safePayload));
      throw normalizedError;
    }
  }
}
