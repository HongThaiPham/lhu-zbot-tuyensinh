import { Injectable } from '@nestjs/common';
import { ZALO_API_BASE_URL, ZALO_CONNECTION_TIMEOUT_MS } from '../zalo.constants';
import { ZaloApiRequestError, sanitizeZaloUrl } from '../zalo.errors';
import type { ZaloHttpClient } from './zalo-http.types';

interface ZaloApiEnvelope {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error_code?: string | number;
}

@Injectable()
export class OfficialZaloHttpClient implements ZaloHttpClient {
  public async getMe(token: string): Promise<unknown> {
    return this.callApi(token, 'getMe');
  }

  private async callApi(token: string, method: string): Promise<ZaloApiEnvelope> {
    const url = `${ZALO_API_BASE_URL}/bot${token}/${method}`;
    const requestUrl = sanitizeZaloUrl(url, token);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZALO_CONNECTION_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorEnvelope = await this.extractErrorEnvelope(response);
        throw new ZaloApiRequestError('Zalo API returned HTTP error', {
          category: 'http_error',
          requestUrl,
          statusCode: response.status,
          upstreamCode: errorEnvelope.error_code,
          retryAfterSeconds: this.extractRetryAfterSeconds(response.headers),
        });
      }

      const payload = await this.parseEnvelope(response, requestUrl);
      if (payload.ok !== true) {
        throw new ZaloApiRequestError('Zalo API returned unsuccessful response', {
          category: 'api_error',
          requestUrl,
          statusCode: response.status,
          upstreamCode: payload.error_code,
          retryAfterSeconds: this.extractRetryAfterSeconds(response.headers),
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ZaloApiRequestError) {
        throw error;
      }

      const errorName =
        error instanceof Error
          ? error.name
          : typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
            ? error.name
            : undefined;
      if (errorName === 'AbortError' || errorName === 'TimeoutError') {
        throw new ZaloApiRequestError('Zalo API timeout', {
          category: 'timeout',
          requestUrl,
        });
      }

      throw new ZaloApiRequestError('Zalo API network error', {
        category: 'network_error',
        requestUrl,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseEnvelope(response: Response, requestUrl: string): Promise<ZaloApiEnvelope> {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ZaloApiRequestError('Zalo API returned non-JSON response', {
        category: 'invalid_response',
        requestUrl,
        statusCode: response.status,
        retryAfterSeconds: this.extractRetryAfterSeconds(response.headers),
      });
    }

    if (!data || typeof data !== 'object') {
      throw new ZaloApiRequestError('Zalo API returned invalid response payload', {
        category: 'invalid_response',
        requestUrl,
        statusCode: response.status,
        retryAfterSeconds: this.extractRetryAfterSeconds(response.headers),
      });
    }

    const envelope = data as Record<string, unknown>;
    if (typeof envelope.ok !== 'boolean') {
      throw new ZaloApiRequestError('Zalo API response is missing ok flag', {
        category: 'invalid_response',
        requestUrl,
        statusCode: response.status,
        retryAfterSeconds: this.extractRetryAfterSeconds(response.headers),
      });
    }

    const parsedEnvelope: ZaloApiEnvelope = {
      ok: envelope.ok,
      ...(envelope.result !== undefined ? { result: envelope.result } : {}),
      ...(
        typeof envelope.error_code === 'string' || typeof envelope.error_code === 'number'
          ? { error_code: envelope.error_code }
          : {}
      ),
    };

    return parsedEnvelope;
  }

  private async extractErrorEnvelope(response: Response): Promise<Partial<ZaloApiEnvelope>> {
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return {};
      }

      const envelope = data as Record<string, unknown>;
      if (typeof envelope.error_code === 'string' || typeof envelope.error_code === 'number') {
        return { error_code: envelope.error_code };
      }
      return {};
    } catch {
      return {};
    }
  }

  private extractRetryAfterSeconds(headers: Headers): number | undefined {
    const value = headers.get('retry-after');
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }
}
