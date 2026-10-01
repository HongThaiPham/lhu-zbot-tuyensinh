export type ZaloConnectionStatus =
  | 'CONNECTED'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';

export interface ZaloBotIdentity {
  readonly id: string;
  readonly displayName?: string;
  readonly username?: string;
  readonly avatar?: string;
}

export interface ZaloConnectionSuccessResult {
  readonly ok: true;
  readonly status: 'CONNECTED';
  readonly identity: ZaloBotIdentity;
}

export interface ZaloConnectionFailureResult {
  readonly ok: false;
  readonly status: Exclude<ZaloConnectionStatus, 'CONNECTED'>;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly upstreamCode?: string | number;
  readonly retryAfterSeconds?: number;
}

export type ZaloConnectionTestResult = ZaloConnectionSuccessResult | ZaloConnectionFailureResult;
