import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustProxySetting } from '../src/http/trust-proxy';

test('TRUST_PROXY=false disables express proxy trust', () => {
  assert.equal(getTrustProxySetting(false), false);
});

test('TRUST_PROXY=true trusts a single reverse-proxy hop only', () => {
  assert.equal(getTrustProxySetting(true), 1);
});
