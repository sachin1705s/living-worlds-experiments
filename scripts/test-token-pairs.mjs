import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.VERCEL = '1';
const { default: app } = await import('../backend/server.js');
const { MODEL_DEMOS } = await import('../shared/reactor-pool.js');
for (const demo of Object.values(MODEL_DEMOS)) process.env[`REACTOR_${demo.toUpperCase()}_KEYS`] = JSON.stringify([`${demo}-primary`, `${demo}-backup`]);
test('token broker uses the requested demo pair and never exposes raw keys', async () => {
  const server = http.createServer(app); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const original = globalThis.fetch; let usedKey;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.reactor.inc/tokens') { usedKey = options.headers['Reactor-API-Key']; return Response.json({ jwt: 'short-lived-token' }); }
    return original(url, options);
  };
  try {
    for (const [model, demo] of Object.entries(MODEL_DEMOS).slice(0, 6)) {
      for (const keySlot of [0, 1]) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, keySlot }) });
        assert.equal(response.status, 200);
        assert.equal(usedKey, `${demo}-${keySlot ? 'backup' : 'primary'}`);
        assert.deepEqual(await response.json(), { jwt: 'short-lived-token' });
      }
    }
  } finally { globalThis.fetch = original; await new Promise(r => server.close(r)); }
});
