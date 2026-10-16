import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWithPair, isSessionCapacityError } from '../shared/reactor-capacity.js';
import { demoKeys } from '../shared/reactor-pool.js';

test('each demo uses only its pair, in primary-first order', () => {
  const env = { REACTOR_DRAWING_KEYS: '["drawing-primary","drawing-backup"]', REACTOR_ROAST_KEYS: '["roast-primary","roast-backup"]', REACTOR_API_KEY: 'legacy' };
  assert.deepEqual(demoKeys('drawing', env), ['drawing-primary', 'drawing-backup']);
  assert.deepEqual(demoKeys('roast', env), ['roast-primary', 'roast-backup']);
  assert.deepEqual(demoKeys('unknown', env), []);
});

test('backup stays selected after primary frees; no background primary session', async () => {
  const calls = []; let primaryBusy = true;
  const credential = await connectWithPair({
    token: async slot => { calls.push(`token:${slot}`); return slot; },
    connect: async slot => { calls.push(`connect:${slot}`); if (!slot && primaryBusy) throw new Error('concurrent_session_limit'); },
    cleanup: async () => { calls.push('cleanup'); primaryBusy = false; },
  });
  assert.equal(credential, 1);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(calls, ['token:0','connect:0','cleanup','token:1','connect:1']);
});

test('both full stops after exactly two attempts', async () => {
  let tries = 0;
  await assert.rejects(connectWithPair({ token: async slot => slot, connect: async () => { tries++; throw new Error('HTTP 429'); }, cleanup: async () => {} }), /429/);
  assert.equal(tries, 2);
});

test('invalid credentials, depleted credits and network failures do not rotate keys', async () => {
  for (const message of ['401 Unauthorized', 'credits_depleted 402', 'network timeout']) {
    let tries = 0;
    await assert.rejects(connectWithPair({ token: async slot => slot, connect: async () => { tries++; throw new Error(message); }, cleanup: async () => {} }));
    assert.equal(tries, 1);
  }
  assert.equal(isSessionCapacityError(new Error('max_sessions exceeded')), true);
});

test('Back during token request prevents starting either session', async () => {
  const controller = new AbortController(); let starts = 0;
  await assert.rejects(connectWithPair({ signal: controller.signal, token: async () => { controller.abort(); return 'token'; }, connect: async () => { starts++; }, cleanup: async () => {} }), /stopped/);
  assert.equal(starts, 0);
});

test('Back during connect closes late session without starting backup', async () => {
  let active = true; let closed = 0; let tokens = 0;
  await assert.rejects(connectWithPair({ active: () => active, token: async () => ++tokens, connect: async () => { active = false; }, cleanup: async () => { closed++; } }), /stopped/);
  assert.equal(tokens, 1); assert.ok(closed >= 1);
});

test('unconfirmed cleanup prevents a second session', async () => {
  let tokens = 0;
  await assert.rejects(connectWithPair({ token: async () => ++tokens, connect: async () => { throw new Error('session limit'); }, cleanup: async () => { throw new Error('termination failed'); } }), /termination failed/);
  assert.equal(tokens, 1);
});
