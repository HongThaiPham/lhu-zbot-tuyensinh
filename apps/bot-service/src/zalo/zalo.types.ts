export type ZaloConnectionStatus =
  | 'CONNECTED'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';

export interface ZaloBotIdentity {
  readonly id: string;
  readonly accountName: string;
  readonly accountType: string;
  readonly canJoinGroups: boolean;
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

export const SUPPORTED_ZALO_EVENT_NAMES = [
  'message.text.received',
  'message.image.received',
  'message.sticker.received',
  'message.voice.received',
  'message.unsupported.received',
] as const;

export type SupportedZaloEventName = (typeof SUPPORTED_ZALO_EVENT_NAMES)[number];

export interface ZaloInboundEvent {
  readonly source: 'polling' | 'webhook';
  readonly eventName: string;
  readonly supported: boolean;
  readonly messageId?: string;
  readonly chatType?: string;
  readonly senderId?: string;
  readonly recipientId?: string;
  readonly timestamp?: number;
}
