import { stopReactor, trackSession } from "../vidu-session.js";
// Reactor adapter for camera-input streaming models.
//
// These models take a live video track IN (the webcam) and stream an edited
// version back OUT on `main_video` — so the wiring is "publish a track" +
// "set a prompt" rather than "upload a seed image + generate from nothing".
//
// X2 is dropped for now (its modelName 404s: "not found: model not found" —
// not enabled on this account/plan). Only SANA-Streaming is wired up. The
// STREAM_MODELS map keeps the per-model handshake differences isolated to
// one place, so re-adding a model later is a new entry here, not a rewrite.
//
//   SANA-Streaming — track name "camera". Needs set_mode({mode:"live"}) then
//                     start() after the source is publishing and the prompt
//                     (if any) is set.
//
// Source: https://docs.reactor.inc/model-api-reference/sana-streaming/overview.

import { Reactor } from "@reactor-team/js-sdk";
import { waitUntilReady } from "../reactor-media.js";

// Exchanges a Reactor API key for a short-lived JWT via the backend's token
// broker. Normally that's the server-side REACTOR_API_KEY env var; if the
// caller supplies their own key (see finger-frame.js's "use your own key"
// field), it's sent as a header and the broker uses it for this exchange
// instead — the raw key still never touches Reactor directly from the
// browser, only our own same-origin endpoint.
async function getToken(userApiKey, signal) {
  const r = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: userApiKey, model: "reactor/sana-streaming" }),
    signal,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`token fetch failed: ${r.status} ${txt}`);
  }
  const { jwt } = await r.json();
  return jwt;
}

export const STREAM_MODELS = {
  "sana-streaming": {
    id: "sana-streaming",
    modelName: "reactor/sana-streaming",
    label: "SANA-Streaming",
    sourceTrack: "camera",
    async afterPublish(reactorClient) {
      await reactorClient.sendCommand("set_mode", { mode: "live" });
      await reactorClient.sendCommand("start", {});
    },
  },
};

let reactor = null;
let activeConfig = null;
let currentStatus = "disconnected";
let generation = 0;
let pendingRequest = null;

const trackListeners = new Set();
const statusListeners = new Set();
const errorListeners = new Set();

export function onTrack(fn) {
  trackListeners.add(fn);
  return () => trackListeners.delete(fn);
}
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
export function onStreamError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

export function getActiveModel() {
  return activeConfig?.id ?? null;
}

export function getStreamStatus() {
  return currentStatus;
}

// Connect to `modelId` (currently just "sana-streaming"), publish `track` as
// its source, and (optionally) set an initial prompt. Tears down any
// previous session first, so reconnecting is just calling this again with
// the same webcam track.
export async function connectStream(modelId, track, initialPrompt = "", { timeoutMs = 20000, userApiKey } = {}) {
  const config = STREAM_MODELS[modelId];
  if (!config) throw new Error(`Unknown stream model: ${modelId}`);

  await disconnectStream();
  const attempt = generation;
  pendingRequest = new AbortController();
  const signal = pendingRequest.signal;

  activeConfig = config;
  reactor = new Reactor({ modelName: config.modelName });

  reactor.on("trackReceived", (_name, track) => {
    if (attempt !== generation || track.kind !== "video") return;
    for (const fn of trackListeners) fn(new MediaStream([track]));
  });
  reactor.on("statusChanged", (s) => {
    if (attempt !== generation) return;
    currentStatus = s;
    for (const fn of statusListeners) fn(s);
  });
  reactor.on("error", (err) => {
    if (attempt !== generation) return;
    console.error("[reactor-stream]", err.code, err.message);
    for (const fn of errorListeners) fn(err);
  });

  const session = reactor;
  const checkActive = () => {
    if (attempt !== generation) throw new Error("Session stopped");
  };
  try {
    const token = await getToken(userApiKey, signal);
    checkActive();
    trackSession(session, token);
    await session.connect(token);
    await waitUntilReady(session, signal, timeoutMs);
    checkActive();
    await session.publishTrack(config.sourceTrack, track);
    checkActive();
    if (initialPrompt && initialPrompt.trim()) {
      await session.sendCommand("set_prompt", { prompt: initialPrompt.trim() });
    }
    checkActive();
    await config.afterPublish(session);
    checkActive();
    currentStatus = "ready";
    for (const fn of statusListeners) fn(currentStatus);
  } catch (error) {
    await session.disconnect(false);
    throw error;
  }

  return config;
}

export async function setStreamPrompt(prompt) {
  if (!reactor) return;
  await reactor.sendCommand("set_prompt", { prompt });
}

export async function disconnectStream() {
  generation += 1;
  pendingRequest?.abort();
  pendingRequest = null;
  if (!reactor) return;
  const r = reactor;
  reactor = null;
  activeConfig = null;
  currentStatus = "disconnected";
  try {
    await stopReactor(r);
  } catch (e) {
    console.warn("[reactor-stream] disconnect:", e?.message);
    throw e;
  }
}

// Best-effort synchronous release for beforeunload.
export function releaseStreamOnUnload() {
  if (!reactor) return;
  try {
    void stopReactor(reactor).catch(() => {});
  } catch {
    /* page is going away anyway */
  }
  reactor = null;
  activeConfig = null;
}
