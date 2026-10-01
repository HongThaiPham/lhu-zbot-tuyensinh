import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { BotServiceConfig } from '@lhu/config';
import { ZALO_CONFIG, ZALO_POLL_BACKOFF_MAX_MS, ZALO_POLL_BACKOFF_MIN_MS } from './zalo.constants';
import { ZaloAdapter } from './zalo.adapter';
import { createSafeLogPayload, ZaloIntegrationError } from './zalo.errors';
import { ZaloInboundEventProcessor } from './zalo-inbound-event.processor';
import { ZaloUpdateNormalizer } from './zalo-update.normalizer';
import { ZaloUpdateValidator } from './zalo-update.validator';

@Injectable()
export class ZaloPollingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ZaloPollingWorker.name);
  private isRunning = false;
  private loopPromise: Promise<void> | null = null;
  private backoffMs = ZALO_POLL_BACKOFF_MIN_MS;
  private activePollController: AbortController | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeSleep: (() => void) | null = null;

  public constructor(
    @Inject(ZALO_CONFIG) private readonly config: BotServiceConfig,
    private readonly zaloAdapter: ZaloAdapter,
    private readonly updateValidator: ZaloUpdateValidator,
    private readonly updateNormalizer: ZaloUpdateNormalizer,
    private readonly inboundEventProcessor: ZaloInboundEventProcessor,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (this.config.botServiceRole !== 'worker') {
      return;
    }

    if (this.config.zaloUpdateMode !== 'polling') {
      this.logger.log('zalo polling disabled (ZALO_UPDATE_MODE=webhook)');
      return;
    }

    this.isRunning = true;
    this.loopPromise = this.runLoop();
    this.logger.log(`zalo polling started timeoutSeconds=${this.config.zaloPollTimeoutSeconds}`);
  }

  public async onApplicationShutdown(): Promise<void> {
    this.isRunning = false;
    this.activePollController?.abort();
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.wakeSleep?.();
    this.wakeSleep = null;
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      this.activePollController = new AbortController();
      try {
        const response = await this.zaloAdapter.getUpdates({
          timeoutSeconds: this.config.zaloPollTimeoutSeconds,
          signal: this.activePollController.signal,
        });
        const rawEvents = this.updateValidator.extractRawEvents(response);

        for (const rawEvent of rawEvents) {
          const event = this.updateNormalizer.normalize(rawEvent, 'polling');
          await this.inboundEventProcessor.process(event);
        }

        this.backoffMs = ZALO_POLL_BACKOFF_MIN_MS;
        continue;
      } catch (error) {
        if (!this.isRunning) {
          break;
        }

        const mappedError =
          error instanceof ZaloIntegrationError ? error : this.zaloAdapter.mapError(error);
        const safePayload =
          error instanceof ZaloIntegrationError
            ? {
                status: mappedError.status,
                retryable: mappedError.retryable,
                statusCode: mappedError.statusCode,
                upstreamCode: mappedError.upstreamCode,
                retryAfterSeconds: mappedError.retryAfterSeconds,
              }
            : createSafeLogPayload(error, this.config.zaloBotToken);

        if (!mappedError.retryable) {
          this.logger.error(
            `zalo polling non-retryable error status=${mappedError.status} code=${mappedError.statusCode ?? 'n/a'}; if a webhook is active, remove it or switch to ZALO_UPDATE_MODE=webhook`,
          );
        } else {
          this.logger.warn(
            `zalo polling retryable error status=${mappedError.status} code=${mappedError.statusCode ?? 'n/a'} backoffMs=${this.backoffMs}`,
          );
        }
        this.logger.debug(JSON.stringify(safePayload));

        const delayMs = this.nextDelay(mappedError);
        await this.sleep(delayMs);
      } finally {
        this.activePollController = null;
      }
    }

    this.logger.log('zalo polling stopped');
  }

  private nextDelay(error: ZaloIntegrationError): number {
    const retryAfterDelayMs =
      typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0
        ? error.retryAfterSeconds * 1_000
        : undefined;

    const delayMs = retryAfterDelayMs ?? this.backoffMs;
    if (error.retryable) {
      this.backoffMs = Math.min(this.backoffMs * 2, ZALO_POLL_BACKOFF_MAX_MS);
    } else {
      this.backoffMs = ZALO_POLL_BACKOFF_MAX_MS;
    }

    return Math.min(delayMs, ZALO_POLL_BACKOFF_MAX_MS);
  }

  private async sleep(delayMs: number): Promise<void> {
    if (!this.isRunning || delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.wakeSleep = resolve;
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.wakeSleep = null;
        resolve();
      }, delayMs);
    });
  }
}
