import type { ZaloConnectionFailureResult } from './zalo.types';

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

export function sanitizeZaloUrl(rawUrl: string, token: string): string {
  const withTokenRedacted = token.trim().length > 0 ? rawUrl.replaceAll(token, '[REDACTED]') : rawUrl;
  return withTokenRedacted.replace(/\/bot[^/]+\//g, '/bot[REDACTED]/');
}

function extractObjectRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  return input as Record<string, unknown>;
}

function extractRetryAfterSeconds(input: unknown): number | undefined {
  const record = extractObjectRecord(input);
  const headers = extractObjectRecord(record?.headers);
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

export function mapSdkError(error: unknown): ZaloIntegrationError {
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

  if (statusCode === 429 || upstreamCode === 429) {
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
