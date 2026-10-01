/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ConfigValidationError,
  loadAdminConfig,
  loadBootstrapAdminConfig,
  loadBotServiceConfig,
} = require('../dist/index.js');

function buildBotEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://localhost:5432/lhu_zbot?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    BOT_SERVICE_ROLE: 'api',
    ZALO_UPDATE_MODE: 'polling',
    ZALO_BOT_TOKEN: 'development-zalo-token-placeholder',
    PORT: '3001',
    APP_ENCRYPTION_KEY: 'development-only-app-encryption-key-not-for-production',
    SESSION_COOKIE_NAME: 'lhu_admin_session',
    SESSION_TTL_SECONDS: '28800',
    SESSION_COOKIE_SAME_SITE: 'lax',
    ADMIN_ORIGIN: 'http://127.0.0.1:4100',
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: '300',
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '5',
    TRUST_PROXY: 'false',
    ZALO_POLL_TIMEOUT_SECONDS: '30',
    ...overrides,
  };
}

function buildAdminEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4201',
    ...overrides,
  };
}

function assertConfigError(run, expectedIssue) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof ConfigValidationError);
    assert.match(error.message, new RegExp(expectedIssue));
    return true;
  });
}

test('valid development bot config parses', () => {
  const config = loadBotServiceConfig(buildBotEnv());
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.botServiceRole, 'api');
  assert.equal(config.zaloUpdateMode, 'polling');
  assert.equal(config.zaloBotToken, 'development-zalo-token-placeholder');
  assert.equal(config.sessionCookieName, 'lhu_admin_session');
  assert.equal(config.trustProxy, false);
  assert.equal(config.zaloPollTimeoutSeconds, 30);
});

test('development config can omit zalo token for deterministic tests', () => {
  const config = loadBotServiceConfig(buildBotEnv({ ZALO_BOT_TOKEN: undefined }));
  assert.equal(config.zaloBotToken, '');
});

test('valid production bot config parses', () => {
  const config = loadBotServiceConfig(
    buildBotEnv({
      NODE_ENV: 'production',
      ZALO_UPDATE_MODE: 'webhook',
      APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdefEXTRA',
      SESSION_COOKIE_SAME_SITE: 'strict',
    }),
  );

  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.zaloUpdateMode, 'webhook');
  assert.equal(config.sessionCookieSameSite, 'strict');
});

test('missing production secret fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', APP_ENCRYPTION_KEY: undefined })),
    'APP_ENCRYPTION_KEY: required in production',
  );
});

test('missing production zalo token fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', ZALO_BOT_TOKEN: undefined })),
    'ZALO_BOT_TOKEN: required in production',
  );
});

test('placeholder production zalo token fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', ZALO_BOT_TOKEN: 'placeholder' })),
    'ZALO_BOT_TOKEN: placeholder/default values are not allowed in production',
  );
});

test('unrelated loaders do not require zalo token', () => {
  const config = loadAdminConfig(buildAdminEnv());
  assert.equal(config.nodeEnv, 'development');
});

test('placeholder production secret fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', APP_ENCRYPTION_KEY: 'changeme' })),
    'APP_ENCRYPTION_KEY: placeholder/default values are not allowed in production',
  );
});

test('invalid NODE_ENV fails', () => {
  assertConfigError(() => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'stage' })), 'NODE_ENV: invalid value');
});

test('invalid BOT_SERVICE_ROLE fails', () => {
  assertConfigError(() => loadBotServiceConfig(buildBotEnv({ BOT_SERVICE_ROLE: 'all' })), 'BOT_SERVICE_ROLE: invalid value');
});

test('invalid ZALO_UPDATE_MODE fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ ZALO_UPDATE_MODE: 'stream' })),
    'ZALO_UPDATE_MODE: invalid value',
  );
});

test('invalid DATABASE_URL fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ DATABASE_URL: 'http://localhost:5432/lhu_zbot' })),
    'DATABASE_URL: unsupported protocol',
  );
});

test('invalid REDIS_URL fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ REDIS_URL: 'postgresql://localhost:6379' })),
    'REDIS_URL: unsupported protocol',
  );
});

test('invalid PORT fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ PORT: '70000' })),
    'PORT: must be a valid TCP port \\(1-65535\\)',
  );
});

test('invalid session ttl fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ SESSION_TTL_SECONDS: '10' })),
    'SESSION_TTL_SECONDS: invalid value',
  );
});

test('invalid poll timeout fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ ZALO_POLL_TIMEOUT_SECONDS: '0' })),
    'ZALO_POLL_TIMEOUT_SECONDS: invalid value',
  );
});

test('invalid admin origin fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ ADMIN_ORIGIN: 'file:///tmp/x' })),
    'ADMIN_ORIGIN: unsupported protocol',
  );
});

test('safe validation errors do not contain secret values', () => {
  const secret = 'super-secret-value-should-never-appear';

  assert.throws(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', APP_ENCRYPTION_KEY: `${secret} with-space` })),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.match(error.message, /APP_ENCRYPTION_KEY/);
      return true;
    },
  );
});

test('admin configuration parses valid NEXT_PUBLIC_API_BASE_URL', () => {
  const config = loadAdminConfig(buildAdminEnv());
  assert.equal(config.nextPublicApiBaseUrl, 'http://localhost:4201');
});

test('admin production configuration fails when NEXT_PUBLIC_API_BASE_URL is missing', () => {
  assertConfigError(
    () =>
      loadAdminConfig(
        buildAdminEnv({
          NODE_ENV: 'production',
          NEXT_PUBLIC_API_BASE_URL: undefined,
        }),
      ),
    'NEXT_PUBLIC_API_BASE_URL: required',
  );
});

test('bootstrap admin configuration parses valid credentials', () => {
  const config = loadBootstrapAdminConfig({
    ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
    ADMIN_BOOTSTRAP_PASSWORD: 'Str0ngPassword!123',
  });

  assert.equal(config.email, 'admin@example.com');
});

test('bootstrap admin validation fails safely without exposing secret values', () => {
  const secret = 'SensitiveSecret123!';

  assert.throws(
    () =>
      loadBootstrapAdminConfig({
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: `${secret} `,
      }),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.match(error.message, /ADMIN_BOOTSTRAP_PASSWORD/);
      return true;
    },
  );
});
