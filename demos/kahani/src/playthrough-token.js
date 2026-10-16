import { createHmac, timingSafeEqual } from 'node:crypto';

export function signPlaythrough(id, state, secret, now = Date.now()) {
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ id, state, expires: now + 3600000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readPlaythrough(token, id, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 16000) return null;
  try {
    const [payload, signature] = token.split('.');
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.id === id && data.expires > now ? data.state : null;
  } catch { return null; }
}
