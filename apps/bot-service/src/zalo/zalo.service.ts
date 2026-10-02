import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
    const normalizedUrl = this.validateWebhookUrl(url);
    const webhookSecretToken = this.validateWebhookSecretToken(this.config.zaloWebhookSecretToken);
    try {
      const webhook = await this.zaloAdapter.setWebhook({
        url: normalizedUrl,
        secretToken: webhookSecretToken,
      });
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

  private validateWebhookUrl(url: string): string {
    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('Invalid webhook URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Invalid webhook URL');
    }

    if (this.config.nodeEnv === 'production' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook URL must use HTTPS in production');
    }

    return parsed.toString();
  }

  public async deleteWebhook(): Promise<ZaloWebhookMutationResult> {
    try {
      const webhook = await this.zaloAdapter.deleteWebhook();
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

  public async processWebhookPayload(
    payload: unknown,
    secretTokenHeader: string | undefined,
  ): Promise<ZaloWebhookInboundResult> {
    if (this.config.zaloUpdateMode !== 'webhook') {
      this.logger.log('zalo webhook ignored (ZALO_UPDATE_MODE=polling)');
      return {
        accepted: false,
        mode: 'polling',
        processed: 0,
      };
    }

    try {
      this.verifyWebhookSecretToken(secretTokenHeader);
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
      if (error instanceof UnauthorizedException) {
        throw error;
      }

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

  private validateWebhookSecretToken(secretToken: string): string {
    const normalized = secretToken.trim();
    if (normalized.length < 8 || normalized.length > 256) {
      throw new BadRequestException('Webhook secret token must be 8-256 characters');
    }

    return normalized;
  }

  private verifyWebhookSecretToken(secretTokenHeader: string | undefined): void {
    const expectedSecret = this.config.zaloWebhookSecretToken.trim();
    if (expectedSecret.length < 8 || expectedSecret.length > 256 || !secretTokenHeader) {
      throw new UnauthorizedException('Invalid webhook secret token');
    }

    if (!this.constantTimeEquals(expectedSecret, secretTokenHeader.trim())) {
      throw new UnauthorizedException('Invalid webhook secret token');
    }
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
