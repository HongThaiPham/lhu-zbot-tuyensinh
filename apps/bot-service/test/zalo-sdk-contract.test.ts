import assert from 'node:assert/strict';
import test from 'node:test';
import ZaloBot from 'node-zalo-bot';

test('node-zalo-bot export surface used by phase 4 exists', () => {
  assert.equal(typeof ZaloBot, 'function');
  assert.ok(ZaloBot.errors);
  assert.equal(typeof ZaloBot.errors.ZaloError, 'function');

  const sdk = new ZaloBot('phase-4-contract-token', { polling: false });
  assert.equal(typeof sdk.getMe, 'function');
  assert.equal(typeof sdk.getUpdates, 'function');
  assert.equal(typeof sdk.sendMessage, 'function');
  assert.equal(typeof sdk.setWebHook, 'function');
});
