import test from 'node:test';
import assert from 'node:assert/strict';
import { reusableWorldId, worldBuildTimeRemaining } from '../demos/kahani/src/story-session.js';

test('only completed worlds can be saved for faster reuse', () => {
  for (const phase of ['no_world', 'creating', 'building', 'failed']) {
    assert.equal(reusableWorldId({ phase, encrypted_world_id: 'early-id' }), null);
  }
  for (const phase of ['ready', 'traveling']) {
    assert.equal(reusableWorldId({ phase, encrypted_world_id: 'built-id' }), 'built-id');
  }
  assert.equal(reusableWorldId(null), null);
});

test('progress updates cannot extend the world-build deadline', () => {
  assert.equal(worldBuildTimeRemaining(1000, 1000, 180000), 180000);
  assert.equal(worldBuildTimeRemaining(1000, 61000, 180000), 120000);
  assert.equal(worldBuildTimeRemaining(1000, 181000, 180000), 0);
  assert.equal(worldBuildTimeRemaining(1000, 200000, 180000), 0);
});
