"use client";

export const REACTOR_KEY = "offseason.reactorKey";
export const GEMINI_KEY = "offseason.geminiKey";

export function readKey(name: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(name) ?? "";
  } catch {
    return "";
  }
}

export function writeKey(name: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(name, value);
    else window.sessionStorage.removeItem(name);
  } catch {
    /* private window, or site data blocked — the session just won't survive a reload */
  }
}

/** Enough of a key to recognise, never enough to use. */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/**
 * A token resolver bound to the key the player pasted. Memoised per key so
 * parallel connects coalesce rather than minting a token each.
 */
let sessionToken = "";

export function endSessionOnLeave(sessionId: string) {
  navigator.sendBeacon("/api/reactor/session/end", new Blob([JSON.stringify({ sessionId, jwt: sessionToken })], { type: "application/json" }));
}

const cache = new Map<string, { jwt: string; expiresAtMs: number }>();
const inflight = new Map<string, Promise<string>>();
const SKEW_MS = 60_000;

export function makeTokenResolver(apiKey: string) {
  return async function resolveToken(): Promise<string> {
    const hit = cache.get(apiKey);
    if (hit && Date.now() < hit.expiresAtMs - SKEW_MS) return hit.jwt;

    const pending = inflight.get(apiKey);
    if (pending) return pending;

    const p = (async () => {
      try {
        const r = await fetch("/api/reactor/token", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Token request failed (${r.status}).`);
        sessionToken = data.jwt;
        cache.set(apiKey, { jwt: data.jwt, expiresAtMs: data.expires_at * 1000 });
        return data.jwt as string;
      } finally {
        inflight.delete(apiKey);
      }
    })();
    inflight.set(apiKey, p);
    return p;
  };
}

export function forgetToken(apiKey: string) {
  cache.delete(apiKey);
}
