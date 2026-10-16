import test from 'node:test';
import assert from 'node:assert/strict';
import { openSessions, terminateSession } from '../demos/news-studio/lib/reactor-sessions.ts';

test('third-account broadcast is discovered and terminated using its own key', async () => {
  process.env.REACTOR_NEWS_KEYS = JSON.stringify(['primary', 'second', 'third']);
  const original = globalThis.fetch;
  let deletedWith;
  globalThis.fetch = async (url, options) => {
    const key = options.headers['Reactor-API-Key'];
    if (url.endsWith('/me')) return Response.json({ account_id: key === 'third' ? 'account-b' : 'account-a' });
    if (url.includes('/accounts/')) return Response.json(url.includes('account-b') ? [{ session_id: 'third-session', closed: false, model: 'fast-h3', created_at: '2026-10-16T00:00:00Z' }] : []);
    if (options.method === 'DELETE') { deletedWith = options.headers.Authorization; return new Response(null, { status: 204 }); }
    throw new Error('Unexpected request');
  };
  try {
    const sessions = await openSessions('primary');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].keySlot, 2);
    assert.equal(await terminateSession('primary', 'third-session'), true);
    assert.equal(deletedWith, 'Bearer third');
  } finally { globalThis.fetch = original; }
});
