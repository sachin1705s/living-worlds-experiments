import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const listeners = new Map();
const beacons = [];
const requests = [];
globalThis.window = { addEventListener: (name, callback) => listeners.set(name, callback) };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: (url, body) => { beacons.push({ url, body }); return true; } } });
globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true }; };
const source = await readFile(new URL("../frontend/src/vidu-session.js", import.meta.url), "utf8");
const { trackSession, stopReactor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
let disconnected = false;
const session = { getSessionId: () => "test-session", disconnect: async (recoverable) => { assert.equal(recoverable, false); disconnected = true; } };
trackSession(session, "scoped-test-token");
listeners.get("pagehide")();
assert.equal(beacons.length, 1);
assert.deepEqual(JSON.parse(await beacons[0].body.text()), { sessionId: "test-session", jwt: "scoped-test-token" });
await stopReactor(session);
assert.equal(disconnected, true);
assert.equal(requests[0].options.keepalive, true);
assert.deepEqual(JSON.parse(requests[0].options.body), { sessionId: "test-session", jwt: "scoped-test-token" });
listeners.get("pagehide")();
assert.equal(beacons.length, 1, "Stopped sessions must no longer be tracked");

const fallback = { getSessionId: () => "fallback-session", disconnect: async () => { throw Error("SDK offline"); } };
trackSession(fallback, "fallback-token");
await stopReactor(fallback);
trackSession(fallback, "fallback-token");
globalThis.fetch = async () => ({ ok: false });
await assert.rejects(() => stopReactor(fallback), /Termination not confirmed/);
for (const page of ["playground", "einstein", "roast", "stylized", "dance", "drip"]) {
  const html = await readFile(new URL(`../frontend/${page}.html`, import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="(?:reactor-key|own-api-key|key)"/);
}
console.log("PASS: unload beacon, scoped authentication, permanent disconnect, keepalive fallback, failure reporting, stopped-session cleanup, and no Reactor key inputs.");
