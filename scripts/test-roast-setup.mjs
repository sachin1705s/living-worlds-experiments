import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMaleVoice, prepareAvatar, rememberAvatar } from '../frontend/src/roast-setup.js';

function setup() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const calls = [];
  const session = {
    attachAvatar: async () => calls.push('attach'),
    uploadFile: async () => { calls.push('upload'); return { id: 'file' }; },
    createAvatar: async () => calls.push('create'),
  };
  const options = { check() {}, wait: async () => calls.push('ready'), resetError: () => calls.push('reset') };
  return { session, options, calls, storage };
}

test('selects an explicitly male English voice, never the default female voice', () => {
  assert.equal(chooseMaleVoice({ default_voice: 'default', system: [
    { voice: 'default', description: 'Warm female', accent: 'American' },
    { voice: 'male-other', description: 'Male', accent: 'French' },
    { voice: 'critic', description: 'Deep male voice', accent: 'American' },
  ] }), 'critic');
  assert.throws(() => chooseMaleVoice({ system: [{ voice: 'female', description: 'Female' }] }), /No male/);
  assert.throws(() => chooseMaleVoice(undefined), /No male/);
});

test('repeat starts reuse the avatar without upload or generation', async () => {
  const { session, options, calls } = setup();
  rememberAvatar('saved-avatar');
  await prepareAvatar(session, {}, options);
  assert.deepEqual(calls, ['attach', 'ready']);
});

test('missing cached avatar recovers by preparing a new one', async () => {
  const { session, options, calls } = setup();
  rememberAvatar('deleted-avatar');
  let attempts = 0;
  options.wait = async () => {
    if (!attempts++) throw new Error('AVATAR_NOT_FOUND: expired');
    calls.push('ready');
  };
  await prepareAvatar(session, {}, options);
  assert.deepEqual(calls, ['attach', 'reset', 'upload', 'create', 'ready']);
});

test('first start prepares a portrait and cancellation prevents avatar generation', async () => {
  const { session, options, calls } = setup();
  await prepareAvatar(session, {}, options);
  assert.deepEqual(calls, ['upload', 'create', 'ready']);
  calls.length = 0;
  options.check = () => { throw new Error('Session stopped'); };
  await assert.rejects(prepareAvatar(session, {}, options), /Session stopped/);
  assert.deepEqual(calls, ['upload']);
});

test('connection failures do not trigger another paid avatar creation', async () => {
  const { session, options, calls } = setup();
  rememberAvatar('saved-avatar');
  options.wait = async () => { throw new Error('Connection failed'); };
  await assert.rejects(prepareAvatar(session, {}, options), /Connection failed/);
  assert.deepEqual(calls, ['attach']);
});
