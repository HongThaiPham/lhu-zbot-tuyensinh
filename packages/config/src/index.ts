import { z } from 'zod';

export const configVersion = '1.2.0';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
const BOT_SERVICE_ROLE_VALUES = ['api', 'worker'] as const;
const ZALO_UPDATE_MODE_VALUES = ['polling', 'webhook'] as const;
const COOKIE_SAME_SITE_VALUES = ['lax', 'strict'] as const;

const POSTGRES_PROTOCOLS = new Set(['postgresql:', 'postgres:']);
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

const PRODUCTION_SECRET_PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'replace-me',
  'placeholder',
  'default',
  'example',
  'your-secret-here',
  'secret',
  '0123456789abcdef0123456789abcdef',
]);

export type NodeEnv = (typeof NODE_ENV_VALUES)[number];
export type BotServiceRole = (typeof BOT_SERVICE_ROLE_VALUES)[number];
export type ZaloUpdateMode = (typeof ZALO_UPDATE_MODE_VALUES)[number];
export type CookieSameSite = (typeof COOKIE_SAME_SITE_VALUES)[number];

export interface BotServiceConfig {
  readonly nodeEnv: NodeEnv;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly botServiceRole: BotServiceRole;
  readonly zaloUpdateMode: ZaloUpdateMode;
  readonly zaloBotToken: string;
  readonly port: number;
  readonly appEncryptionKey: string;
  readonly sessionCookieName: string;
  readonly sessionTtlSeconds: number;
  readonly adminOrigin: string;
  readonly sessionCookieSameSite: CookieSameSite;
  readonly loginRateLimitWindowSeconds: number;
  readonly loginRateLimitMaxAttempts: number;
  readonly trustProxy: boolean;
  readonly zaloPollTimeoutSeconds: number;
  readonly zaloWebhookUrl: string;
  readonly zaloWebhookSecretToken: string;
}

export interface AdminConfig {
  readonly nodeEnv: NodeEnv;
  readonly nextPublicApiBaseUrl: string;
}

export interface BootstrapAdminConfig {
  readonly email: string;
  readonly password: string;
}

const portSchema = z.coerce.number().int().min(1).max(65535);

const botServiceEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BOT_SERVICE_ROLE: z.enum(BOT_SERVICE_ROLE_VALUES),
  ZALO_UPDATE_MODE: z.enum(ZALO_UPDATE_MODE_VALUES),
  ZALO_BOT_TOKEN: z.string().optional(),
  PORT: portSchema.default(3001),
  APP_ENCRYPTION_KEY: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().trim().min(1).max(128).default('lhu_admin_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(28_800),
  SESSION_COOKIE_SAME_SITE: z.enum(COOKIE_SAME_SITE_VALUES).default('lax'),
  ADMIN_ORIGIN: z.string().url().optional(),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(300),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  ZALO_POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(300).default(30),
  ZALO_WEBHOOK_URL: z.string().url().optional(),
  ZALO_WEBHOOK_SECRET_TOKEN: z.string().optional(),
});

const adminEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES),
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
});

const bootstrapAdminEnvSchema = z.object({
  ADMIN_BOOTSTRAP_EMAIL: z.string().email(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).max(256).regex(/^\S+$/, {
    message: 'ADMIN_BOOTSTRAP_PASSWORD: invalid value',
  }),
});

export class ConfigValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

function parseUrl(value: string, envName: string, protocols: Set<string>): string | null {
  try {
    const parsedUrl = new URL(value);
    if (!protocols.has(parsedUrl.protocol)) {
      return `${envName}: unsupported protocol`;
    }

    return null;
  } catch {
    return `${envName}: must be a valid URL`;
  }
}

function isPlaceholderSecret(secret: string): boolean {
  return PRODUCTION_SECRET_PLACEHOLDERS.has(secret.toLowerCase());
}

function validateProductionSecret(
  secret: string | undefined,
  envName: string,
  options: { readonly minLength?: number; readonly rejectWhitespace?: boolean } = {},
): string[] {
  const issues: string[] = [];
  const normalizedSecret = secret?.trim() ?? '';

  if (!normalizedSecret) {
    issues.push(`${envName}: required in production`);
    return issues;
  }

  if (isPlaceholderSecret(normalizedSecret)) {
    issues.push(`${envName}: placeholder/default values are not allowed in production`);
  }

  if (typeof options.minLength === 'number' && normalizedSecret.length < options.minLength) {
    issues.push(`${envName}: must be at least 32 characters in production`);
  }

  if (options.rejectWhitespace && /\s/.test(normalizedSecret)) {
    issues.push(`${envName}: must not contain whitespace`);
  }

  return issues;
}

function toIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const envName = issue.path[0];
    if (typeof envName === 'string') {
      if (issue.code === 'invalid_enum_value') {
        return `${envName}: invalid value`;
      }

      if (issue.code === 'invalid_type' && issue.received === 'undefined') {
        return `${envName}: required`;
      }

      if (envName === 'PORT') {
        return `${envName}: must be a valid TCP port (1-65535)`;
      }

      return `${envName}: invalid value`;
    }

    return 'Configuration contains invalid values';
  });
}

export function loadBotServiceConfig(
  rawEnv: Readonly<Record<string, string | undefined>>,
): BotServiceConfig {
  const parsed = botServiceEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(toIssues(parsed.error));
  }

  const additionalIssues: string[] = [];

  const databaseUrlIssue = parseUrl(parsed.data.DATABASE_URL, 'DATABASE_URL', POSTGRES_PROTOCOLS);
  if (databaseUrlIssue) {
    additionalIssues.push(databaseUrlIssue);
  }

  const redisUrlIssue = parseUrl(parsed.data.REDIS_URL, 'REDIS_URL', REDIS_PROTOCOLS);
  if (redisUrlIssue) {
    additionalIssues.push(redisUrlIssue);
  }

  const adminOrigin = parsed.data.ADMIN_ORIGIN?.trim() || 'http://127.0.0.1:4100';
  const adminOriginIssue = parseUrl(adminOrigin, 'ADMIN_ORIGIN', WEB_PROTOCOLS);
  if (adminOriginIssue) {
    additionalIssues.push(adminOriginIssue);
  }

  if (parsed.data.NODE_ENV === 'production') {
    additionalIssues.push(
      ...validateProductionSecret(parsed.data.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY', {
        minLength: 32,
        rejectWhitespace: true,
      }),
    );
    additionalIssues.push(...validateProductionSecret(parsed.data.ZALO_BOT_TOKEN, 'ZALO_BOT_TOKEN'));
    if (parsed.data.ZALO_UPDATE_MODE === 'webhook' && !parsed.data.ZALO_WEBHOOK_URL?.trim()) {
      additionalIssues.push('ZALO_WEBHOOK_URL: required in production when ZALO_UPDATE_MODE=webhook');
    }
  }

  const webhookUrl = parsed.data.ZALO_WEBHOOK_URL?.trim() ?? '';
  const webhookSecretToken = parsed.data.ZALO_WEBHOOK_SECRET_TOKEN?.trim() ?? '';
  if (webhookUrl.length > 0) {
    const webhookUrlIssue = parseUrl(webhookUrl, 'ZALO_WEBHOOK_URL', WEB_PROTOCOLS);
    if (webhookUrlIssue) {
      additionalIssues.push(webhookUrlIssue);
    }
  }

  if (webhookSecretToken.length > 0 && (webhookSecretToken.length < 8 || webhookSecretToken.length > 256)) {
    additionalIssues.push('ZALO_WEBHOOK_SECRET_TOKEN: must be 8-256 characters');
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.ZALO_UPDATE_MODE === 'webhook') {
    if (webhookSecretToken.length === 0) {
      additionalIssues.push(
        'ZALO_WEBHOOK_SECRET_TOKEN: required in production when ZALO_UPDATE_MODE=webhook',
      );
    }
  }

  if (additionalIssues.length > 0) {
    throw new ConfigValidationError(additionalIssues);
  }

  const normalizedKey =
    parsed.data.APP_ENCRYPTION_KEY?.trim() ||
    'development-only-app-encryption-key-not-for-production';

  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    botServiceRole: parsed.data.BOT_SERVICE_ROLE,
    zaloUpdateMode: parsed.data.ZALO_UPDATE_MODE,
    zaloBotToken: parsed.data.ZALO_BOT_TOKEN?.trim() || '',
    port: parsed.data.PORT,
    appEncryptionKey: normalizedKey,
    sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
    sessionTtlSeconds: parsed.data.SESSION_TTL_SECONDS,
    sessionCookieSameSite: parsed.data.SESSION_COOKIE_SAME_SITE,
    adminOrigin,
    loginRateLimitWindowSeconds: parsed.data.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    loginRateLimitMaxAttempts: parsed.data.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    trustProxy: parsed.data.TRUST_PROXY === 'true',
    zaloPollTimeoutSeconds: parsed.data.ZALO_POLL_TIMEOUT_SECONDS,
    zaloWebhookUrl: webhookUrl,
    zaloWebhookSecretToken: webhookSecretToken,
  });
}

export function loadAdminConfig(rawEnv: Readonly<Record<string, string | undefined>>): AdminConfig {
  const parsed = adminEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(toIssues(parsed.error));
  }

  const nextPublicApiBaseUrl = parsed.data.NEXT_PUBLIC_API_BASE_URL.trim();

  const nextPublicApiBaseUrlIssue = parseUrl(
    nextPublicApiBaseUrl,
    'NEXT_PUBLIC_API_BASE_URL',
    WEB_PROTOCOLS,
  );

  if (nextPublicApiBaseUrlIssue) {
    throw new ConfigValidationError([nextPublicApiBaseUrlIssue]);
  }

  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    nextPublicApiBaseUrl,
  });
}

export function loadBootstrapAdminConfig(
  rawEnv: Readonly<Record<string, string | undefined>>,
): BootstrapAdminConfig {
  const parsed = bootstrapAdminEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(toIssues(parsed.error));
  }

  return Object.freeze({
    email: parsed.data.ADMIN_BOOTSTRAP_EMAIL.trim(),
    password: parsed.data.ADMIN_BOOTSTRAP_PASSWORD,
  });
}
