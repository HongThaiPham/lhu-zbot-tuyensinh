import type { ZaloConnectionFailureResult } from './zalo.types';

type ZaloRequestErrorCategory =
  | 'api_error'
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'invalid_response';

export class ZaloIntegrationError extends Error {
  public readonly status: ZaloConnectionFailureResult['status'];
  public readonly retryable: boolean;
  public readonly statusCode?: number;
  public readonly upstreamCode?: string | number;
  public readonly retryAfterSeconds?: number;

  public constructor(
    message: string,
    input: Omit<ZaloConnectionFailureResult, 'ok'>,
  ) {
    super(message);
    this.name = 'ZaloIntegrationError';
    this.status = input.status;
    this.retryable = input.retryable;
    this.statusCode = input.statusCode;
    this.upstreamCode = input.upstreamCode;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export class ZaloApiRequestError extends Error {
  public readonly category: ZaloRequestErrorCategory;
  public readonly statusCode?: number;
  public readonly upstreamCode?: string | number;
  public readonly retryAfterSeconds?: number;
  public readonly requestUrl?: string;

  public constructor(
    message: string,
    input: {
      readonly category: ZaloRequestErrorCategory;
      readonly statusCode?: number;
      readonly upstreamCode?: string | number;
      readonly retryAfterSeconds?: number;
      readonly requestUrl?: string;
    },
  ) {
    super(message);
    this.name = 'ZaloApiRequestError';
    this.category = input.category;
    this.statusCode = input.statusCode;
    this.upstreamCode = input.upstreamCode;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.requestUrl = input.requestUrl;
  }
}

export function sanitizeZaloUrl(rawUrl: string, token: string): string {
  const withTokenRedacted = token.trim().length > 0 ? rawUrl.replaceAll(token, '[REDACTED]') : rawUrl;

  try {
    const parsed = new URL(withTokenRedacted);
    parsed.pathname = parsed.pathname.replace(/^\/bot[^/]+\//, '/bot[REDACTED]/');
    return parsed.toString();
  } catch {
    return withTokenRedacted.replace(/\/bot[^/]+\//g, '/bot[REDACTED]/');
  }
}

function extractObjectRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  return input as Record<string, unknown>;
}

function extractRetryAfterSeconds(input: unknown): number | undefined {
  const record = extractObjectRecord(input);
  const response = extractObjectRecord(record?.response);
  const headers = extractObjectRecord(record?.headers) ?? extractObjectRecord(response?.headers);
  const retryAfterHeader = headers?.['retry-after'];
  if (typeof retryAfterHeader === 'string') {
    const parsed = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function extractStatusCode(input: unknown): number | undefined {
  const record = extractObjectRecord(input);
  const response = extractObjectRecord(record?.response);
  const status = response?.status;
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status;
  }

  const directStatus = record?.status;
  if (typeof directStatus === 'number' && Number.isFinite(directStatus)) {
    return directStatus;
  }

  return undefined;
}

function extractUpstreamCode(input: unknown): string | number | undefined {
  const record = extractObjectRecord(input);
  const response = extractObjectRecord(record?.response);
  const responseCode = response?.error_code;
  if (typeof responseCode === 'string' || typeof responseCode === 'number') {
    return responseCode;
  }

  const data = extractObjectRecord(response?.data);
  const dataErrorCode = data?.error_code;
  if (typeof dataErrorCode === 'string' || typeof dataErrorCode === 'number') {
    return dataErrorCode;
  }

  const code = record?.code;
  if (typeof code === 'string' || typeof code === 'number') {
    return code;
  }

  return undefined;
}

function isNetworkError(input: unknown): boolean {
  const record = extractObjectRecord(input);
  const code = record?.code;
  if (typeof code === 'string') {
    return new Set(['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']).has(code);
  }

  const message = typeof record?.message === 'string' ? record.message.toLowerCase() : '';
  if (message.includes('network') || message.includes('timeout')) {
    return true;
  }

  return record?.response == null;
}

function isRateLimited(statusCode: number | undefined, upstreamCode: string | number | undefined): boolean {
  if (statusCode === 429) {
    return true;
  }

  if (upstreamCode === undefined) {
    return false;
  }

  if (upstreamCode === 429 || upstreamCode === '429') {
    return true;
  }

  return false;
}

export function mapHttpError(error: unknown): ZaloIntegrationError {
  if (error instanceof ZaloApiRequestError) {
    if (error.category === 'timeout' || error.category === 'network_error') {
      return new ZaloIntegrationError('Zalo network failure', {
        status: 'NETWORK_ERROR',
        retryable: true,
        statusCode: error.statusCode,
        upstreamCode: error.upstreamCode,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }

    if (error.category === 'invalid_response') {
      return new ZaloIntegrationError('Zalo returned invalid response', {
        status: 'INVALID_RESPONSE',
        retryable: false,
        statusCode: error.statusCode,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      return new ZaloIntegrationError('Zalo authentication failed', {
        status: 'AUTHENTICATION_FAILED',
        retryable: false,
        statusCode: error.statusCode,
        upstreamCode: error.upstreamCode,
      });
    }

    if (isRateLimited(error.statusCode, error.upstreamCode)) {
      return new ZaloIntegrationError('Zalo rate limit encountered', {
        status: 'RATE_LIMITED',
        retryable: true,
        statusCode: error.statusCode ?? 429,
        upstreamCode: error.upstreamCode,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }

    return new ZaloIntegrationError('Zalo upstream failure', {
      status: 'UPSTREAM_ERROR',
      retryable: error.statusCode === undefined || error.statusCode >= 500,
      statusCode: error.statusCode,
      upstreamCode: error.upstreamCode,
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }

  const statusCode = extractStatusCode(error);
  const upstreamCode = extractUpstreamCode(error);
  const retryAfterSeconds = extractRetryAfterSeconds(error);

  if (statusCode === 401 || statusCode === 403) {
    return new ZaloIntegrationError('Zalo authentication failed', {
      status: 'AUTHENTICATION_FAILED',
      retryable: false,
      statusCode,
      upstreamCode,
    });
  }

  if (isRateLimited(statusCode, upstreamCode)) {
    return new ZaloIntegrationError('Zalo rate limit encountered', {
      status: 'RATE_LIMITED',
      retryable: true,
      statusCode: statusCode ?? 429,
      upstreamCode,
      retryAfterSeconds,
    });
  }

  if (isNetworkError(error)) {
    return new ZaloIntegrationError('Zalo network failure', {
      status: 'NETWORK_ERROR',
      retryable: true,
      statusCode,
      upstreamCode,
      retryAfterSeconds,
    });
  }

  return new ZaloIntegrationError('Zalo upstream failure', {
    status: 'UPSTREAM_ERROR',
    retryable: statusCode === undefined || statusCode >= 500,
    statusCode,
    upstreamCode,
    retryAfterSeconds,
  });
}

export function toFailureResult(error: ZaloIntegrationError): ZaloConnectionFailureResult {
  return {
    ok: false,
    status: error.status,
    retryable: error.retryable,
    statusCode: error.statusCode,
    upstreamCode: error.upstreamCode,
    retryAfterSeconds: error.retryAfterSeconds,
  };
}

export function createSafeLogPayload(error: unknown, token: string): Readonly<Record<string, unknown>> {
  if (error instanceof ZaloApiRequestError) {
    return Object.freeze({
      category: error.category,
      code: undefined,
      statusCode: error.statusCode,
      upstreamCode: error.upstreamCode,
      retryAfterSeconds: error.retryAfterSeconds,
      requestUrl: typeof error.requestUrl === 'string' ? sanitizeZaloUrl(error.requestUrl, token) : undefined,
    });
  }

  const record = extractObjectRecord(error);
  const config = extractObjectRecord(record?.config);
  const requestUrl = typeof config?.url === 'string' ? sanitizeZaloUrl(config.url, token) : undefined;

  return Object.freeze({
    category: record?.name ?? 'unknown',
    code: typeof record?.code === 'string' || typeof record?.code === 'number' ? record.code : undefined,
    statusCode: extractStatusCode(error),
    upstreamCode: extractUpstreamCode(error),
    retryAfterSeconds: extractRetryAfterSeconds(error),
    requestUrl,
  });
}
