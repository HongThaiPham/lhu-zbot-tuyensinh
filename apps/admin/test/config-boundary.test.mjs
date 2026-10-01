import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const adminDir = path.resolve(path.dirname(__filename), '..');

function loadNextConfigWithEnv(overrides = {}, removedKeys = []) {
  const env = { ...process.env, ...overrides };
  for (const key of removedKeys) {
    delete env[key];
  }

  return spawnSync('node', ['--input-type=module', '-e', "import('./next.config.mjs')"], {
    cwd: adminDir,
    env,
    encoding: 'utf8',
  });
}

test('admin next config fails in production when NEXT_PUBLIC_API_BASE_URL is missing', () => {
  const result = loadNextConfigWithEnv({ NODE_ENV: 'production' }, ['NEXT_PUBLIC_API_BASE_URL']);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /NEXT_PUBLIC_API_BASE_URL: required/);
});

test('admin next config succeeds in production when NEXT_PUBLIC_API_BASE_URL is valid', () => {
  const result = loadNextConfigWithEnv({
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_BASE_URL: 'https://admin.example.local',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
