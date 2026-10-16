import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { addEventListener() {} };
const { trackSession, trackConnect, stopReactor } = await import('../frontend/src/vidu-session.js');

test('Back waits for a pending connect and terminates its late session with the backup token', async () => {
  let resolve; let id; let disconnected = false; const requests = [];
  const session = { getSessionId: () => id, disconnect: async () => { disconnected = true; id = undefined; } };
  globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true }; };
  trackSession(session, 'backup-session-jwt');
  const connection = trackConnect(session, new Promise(r => { resolve = () => { id = 'late-session'; r(); }; }));
  const stopping = stopReactor(session);
  await Promise.resolve();
  assert.equal(disconnected, false);
  resolve(); await connection; await stopping;
  assert.equal(disconnected, true);
  assert.deepEqual(requests, [{ sessionId: 'late-session', jwt: 'backup-session-jwt' }]);
});

test('failed termination retains the original session ID for a Back retry', async () => {
  let id = 'retry-session'; let requests = 0;
  const session = { getSessionId: () => id, disconnect: async () => { id = undefined; throw new Error('network'); } };
  trackSession(session, 'original-token');
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.sessionId, 'retry-session');
    assert.equal(body.jwt, 'original-token');
    return { ok: ++requests > 1 };
  };
  await assert.rejects(stopReactor(session), /Termination not confirmed/);
  await stopReactor(session);
  assert.equal(requests, 2);
});
