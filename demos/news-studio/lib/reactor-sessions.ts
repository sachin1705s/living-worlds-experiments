import { demoKeys } from "../../../shared/reactor-pool.js";
/**
 * What Reactor says is running, which is the only account of it that cannot
 * drift.
 *
 * The channel used to answer "is a broadcast already running?" from its own
 * registry. That registry lives in a store, and when the store was suspended
 * every read came back empty — so every tab concluded nothing was running and
 * started its own session. The guarantee was only ever as good as the storage
 * underneath it.
 *
 * Reactor knows. It is the thing actually holding the GPUs, it is authoritative
 * by definition, and asking it costs one request. The registry is still useful
 * for speed and for carrying the origin's identity, but it is no longer what
 * the single-broadcast rule depends on.
 */
export interface OpenSession {
  sessionId: string;
  createdAt: number;
  keySlot?: number;
}

interface SessionRow {
  session_id: string;
  state: string;
  closed: boolean;
  model: string;
  created_at: string;
}

/**
 * The account id never changes, so looking it up on every request was two
 * round trips where one would do — on the path a viewer waits through to see
 * the channel at all.
 */
const accountIds = new Map<string, string>();

async function account(apiKey: string): Promise<string> {
  const known = accountIds.get(apiKey);
  if (known) return known;
  const me = await fetch("https://api.reactor.inc/me", {
    headers: { "Reactor-API-Key": apiKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!me.ok) throw new Error(`Account lookup ${me.status}`);
  const { account_id } = (await me.json()) as { account_id: string };
  accountIds.set(apiKey, account_id);
  return account_id;
}

/**
 * Briefly cached. Several arrivals within a few seconds ask the same question
 * and the answer cannot meaningfully change between them, but the window is
 * short enough that a session appearing or closing is noticed quickly.
 */
const cache = new Map<string, { at: number; sessions: OpenSession[] }>();
const CACHE_MS = 4_000;

/** Every session on the account that has not been closed, oldest first. */
async function openSessionsForKey(apiKey: string): Promise<OpenSession[]> {
  const cached = cache.get(apiKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.sessions;

  const id = await account(apiKey);
  const res = await fetch(`https://api.reactor.inc/accounts/${id}/sessions`, {
    headers: { "Reactor-API-Key": apiKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Session list ${res.status}`);

  const rows = (await res.json()) as SessionRow[];
  const sessions = (Array.isArray(rows) ? rows : [])
    .filter((r) => !r.closed && r.model?.includes("fast-h3"))
    .map((r) => ({ sessionId: r.session_id, createdAt: Date.parse(r.created_at) || 0 }))
    .sort((a, b) => a.createdAt - b.createdAt);

  cache.set(apiKey, { at: Date.now(), sessions });
  return sessions;
}

/** Discover broadcasts across every configured account, preserving their owning slot. */
export async function openSessions(apiKey: string): Promise<OpenSession[]> {
  const keys = demoKeys("news");
  if (!keys.length) keys.push(apiKey);
  const groups = await Promise.all(keys.map(async (key, keySlot) =>
    (await openSessionsForKey(key)).map(session => ({ ...session, keySlot }))));
  const unique = new Map<string, OpenSession>();
  for (const session of groups.flat()) if (!unique.has(session.sessionId)) unique.set(session.sessionId, session);
  return [...unique.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Called after a termination, so the next read does not serve a dead session. */
export function forgetSessionCache(): void {
  cache.clear();
}

/**
 * Terminate a session.
 *
 * The auth here is particular and worth recording: the `Reactor-API-Key` header
 * returns 401, a JWT returns 403 however it is scoped, and only the API key
 * presented as a bearer token is accepted.
 */
export async function terminateSession(apiKey: string, sessionId: string): Promise<boolean> {
  try {
    forgetSessionCache();
    const session = (await openSessions(apiKey)).find(item => item.sessionId === sessionId);
    // Already closed is success; never attempt to end a session on another account.
    if (!session) return true;
    const ownerKey = demoKeys("news")[session.keySlot ?? 0] || apiKey;
    const res = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ownerKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
