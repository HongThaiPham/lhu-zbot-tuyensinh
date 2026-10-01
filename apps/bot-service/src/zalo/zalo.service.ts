import { Injectable, Logger } from '@nestjs/common';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloIntegrationError, toFailureResult } from './zalo.errors';
import type { ZaloConnectionTestResult } from './zalo.types';

@Injectable()
export class ZaloService {
  private readonly logger = new Logger(ZaloService.name);

  public constructor(private readonly zaloAdapter: ZaloAdapter) {}

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
}
