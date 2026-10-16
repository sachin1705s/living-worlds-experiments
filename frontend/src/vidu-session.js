const sessionTokens = new WeakMap();
const trackedSessions = new Set();
const connecting = new WeakMap();
const knownIds = new WeakMap();
export async function trackConnect(session, task) {
  connecting.set(session, task);
  try { return await task; } finally { if (connecting.get(session) === task) connecting.delete(session); }
}

export function trackSession(session, jwt) {
  sessionTokens.set(session, jwt);
  trackedSessions.add(session);
}

window.addEventListener("pagehide", () => {
  for (const session of trackedSessions) {
    const sessionId = session.getSessionId() || knownIds.get(session);
    if (!sessionId) continue;
    const body = JSON.stringify({ sessionId, jwt: sessionTokens.get(session) });
    if (!navigator.sendBeacon("/api/reactor/session/end", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/reactor/session/end", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }
});

export async function stopReactor(session, apiKey, sessionId = session?.getSessionId()) {
  if (!session) return;
  await connecting.get(session)?.catch(() => {});
  sessionId ||= session.getSessionId() || knownIds.get(session);
  if (sessionId) knownIds.set(session, sessionId);
  const disconnect = session.disconnect(false).then(() => null, (error) => error);
  if (sessionId) {
    let response;
    try {
      response = await fetch("/api/reactor/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, jwt: sessionTokens.get(session) }),
        signal: AbortSignal.timeout(18000),
        keepalive: true,
      });
    } catch { response = null; }
    const error = await disconnect;
    if (!response?.ok && error) throw new Error("Termination not confirmed. Try going back again or check the Reactor dashboard.");
  } else {
    const error = await disconnect;
    if (error) throw error;
  }
  trackedSessions.delete(session);
  knownIds.delete(session);
}

export function installStopBridge(stop) {
  window.addEventListener("message", async (event) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "showcase-stop") return;
    try {
      await stop();
      window.parent.postMessage({ requestId: event.data.requestId }, location.origin);
    } catch (error) {
      window.parent.postMessage({ requestId: event.data.requestId, error: error.message }, location.origin);
    }
  });
}
