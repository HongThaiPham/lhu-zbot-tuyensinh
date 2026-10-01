const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfigValidationError, loadAdminConfig, loadBotServiceConfig } = require('../dist/index.js');

function buildBotEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://localhost:5432/lhu_zbot?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    BOT_SERVICE_ROLE: 'api',
    ZALO_UPDATE_MODE: 'polling',
    PORT: '3001',
    APP_ENCRYPTION_KEY: 'development-only-app-encryption-key-not-for-production',
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
});

test('valid test bot config parses', () => {
  const config = loadBotServiceConfig(
    buildBotEnv({
      NODE_ENV: 'test',
      BOT_SERVICE_ROLE: 'worker',
      APP_ENCRYPTION_KEY: '',
    }),
  );

  assert.equal(config.nodeEnv, 'test');
  assert.equal(config.botServiceRole, 'worker');
});

test('valid production bot config parses', () => {
  const config = loadBotServiceConfig(
    buildBotEnv({
      NODE_ENV: 'production',
      ZALO_UPDATE_MODE: 'webhook',
      APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdefEXTRA',
    }),
  );

  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.zaloUpdateMode, 'webhook');
});

test('missing production secret fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', APP_ENCRYPTION_KEY: undefined })),
    'APP_ENCRYPTION_KEY: required in production',
  );
});

test('empty production secret fails', () => {
  assertConfigError(
    () => loadBotServiceConfig(buildBotEnv({ NODE_ENV: 'production', APP_ENCRYPTION_KEY: '' })),
    'APP_ENCRYPTION_KEY: required in production',
  );
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

test('worker configuration remains valid', () => {
  const config = loadBotServiceConfig(buildBotEnv({ BOT_SERVICE_ROLE: 'worker' }));
  assert.equal(config.botServiceRole, 'worker');
});

test('api configuration remains valid', () => {
  const config = loadBotServiceConfig(buildBotEnv({ BOT_SERVICE_ROLE: 'api' }));
  assert.equal(config.botServiceRole, 'api');
});

test('admin configuration parses valid NEXT_PUBLIC_API_BASE_URL', () => {
  const config = loadAdminConfig(buildAdminEnv());
  assert.equal(config.nextPublicApiBaseUrl, 'http://localhost:4201');
});
