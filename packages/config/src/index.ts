import { z } from 'zod';

export const configVersion = '1.0.0';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
const BOT_SERVICE_ROLE_VALUES = ['api', 'worker'] as const;
const ZALO_UPDATE_MODE_VALUES = ['polling', 'webhook'] as const;

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

export interface BotServiceConfig {
  readonly nodeEnv: NodeEnv;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly botServiceRole: BotServiceRole;
  readonly zaloUpdateMode: ZaloUpdateMode;
  readonly port: number;
  readonly appEncryptionKey: string;
}

export interface AdminConfig {
  readonly nodeEnv: NodeEnv;
  readonly nextPublicApiBaseUrl: string;
}

const portSchema = z.coerce.number().int().min(1).max(65535);

const botServiceEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BOT_SERVICE_ROLE: z.enum(BOT_SERVICE_ROLE_VALUES),
  ZALO_UPDATE_MODE: z.enum(ZALO_UPDATE_MODE_VALUES),
  PORT: portSchema.default(3001),
  APP_ENCRYPTION_KEY: z.string().optional(),
});

const adminEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
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

function validateProductionSecret(secret: string | undefined, envName: string): string[] {
  const issues: string[] = [];
  const normalizedSecret = secret?.trim() ?? '';

  if (!normalizedSecret) {
    issues.push(`${envName}: required in production`);
    return issues;
  }

  if (isPlaceholderSecret(normalizedSecret)) {
    issues.push(`${envName}: placeholder/default values are not allowed in production`);
  }

  if (normalizedSecret.length < 32) {
    issues.push(`${envName}: must be at least 32 characters in production`);
  }

  if (/\s/.test(normalizedSecret)) {
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

  if (parsed.data.NODE_ENV === 'production') {
    additionalIssues.push(...validateProductionSecret(parsed.data.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY'));
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
    port: parsed.data.PORT,
    appEncryptionKey: normalizedKey,
  });
}

export function loadAdminConfig(rawEnv: Readonly<Record<string, string | undefined>>): AdminConfig {
  const parsed = adminEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(toIssues(parsed.error));
  }

  const nextPublicApiBaseUrl =
    parsed.data.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:4201';

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
