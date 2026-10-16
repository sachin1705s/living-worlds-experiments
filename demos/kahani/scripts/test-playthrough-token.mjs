import test from 'node:test';
import assert from 'node:assert/strict';
import { signPlaythrough, readPlaythrough } from '../src/playthrough-token.js';

test('restores story state on another instance with the same server secret', () => {
  const state = { checkpoint: 'CP2', beats_used: 1, causal_branch: 'selfish', path_summary: [] };
  const token = signPlaythrough('story-1', state, 'test-secret', 1000);
  assert.deepEqual(readPlaythrough(token, 'story-1', 'test-secret', 2000), state);
  assert.equal(readPlaythrough(token, 'other-story', 'test-secret', 2000), null);
  assert.equal(readPlaythrough(token, 'story-1', 'wrong-secret', 2000), null);
  assert.equal(readPlaythrough(token, 'story-1', 'test-secret', 3601001), null);
});

test('rejects altered state and malformed tokens', () => {
  const token = signPlaythrough('story-1', { beats_used: 1 }, 'test-secret');
  const [, signature] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ id: 'story-1', state: { beats_used: 99 }, expires: Date.now() + 60000 })).toString('base64url')}.${signature}`;
  assert.equal(readPlaythrough(forged, 'story-1', 'test-secret'), null);
  assert.equal(readPlaythrough('broken', 'story-1', 'test-secret'), null);
});
