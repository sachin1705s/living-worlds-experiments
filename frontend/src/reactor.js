import { stopReactor, trackSession } from "./vidu-session.js";
import { Reactor } from "@reactor-team/js-sdk";
import { WORLDS } from "./worlds.js";
import { attachVideoTrack, waitUntilReady } from "./reactor-media.js";

let reactor = null;
let videoEl = null;
let sessionVersion = 0;
let tokenRequest = null;

// FileRef cache keyed by world id, populated once at boot so portal
// transitions don't pay the upload latency.
const seedRefs = new Map();

const stateListeners = new Set();

export function onState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

const SESSION_MODELS = {
  lingbot: { sdk: "lingbot", token: "reactor/lingbot" },
  helios: { sdk: "reactor/helios", token: "reactor/helios" },
};

export async function getToken(apiKey, signal, model = "reactor/lingbot") {
  const needsPost = Boolean(apiKey) || model !== "reactor/lingbot";
  const r = await fetch("/api/token", needsPost ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(apiKey ? { apiKey } : {}), model }),
    signal,
  } : { signal });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`token fetch failed: ${r.status} ${txt}`);
  }
  const { jwt } = await r.json();
  return jwt;
}

export async function initSession(videoElement, apiKey, modelName = "lingbot") {
  const model = SESSION_MODELS[modelName] || SESSION_MODELS.lingbot;
  await disconnectSession();
  const version = sessionVersion;
  tokenRequest = new AbortController();
  videoEl = videoElement;
  reactor = new Reactor({ modelName: model.sdk });

  reactor.on("trackReceived", (_name, track) => {
    if (version !== sessionVersion || !videoEl) return;
    attachVideoTrack(videoEl, track);
  });

  reactor.on("message", (msg) => {
    if (msg?.type === "state") {
      for (const fn of stateListeners) fn(msg.data);
    }
  });

  reactor.on("error", (err) => {
    console.error("[reactor]", err.code, err.message);
  });

  const session = reactor;
  const signal = tokenRequest.signal;
  try {
    const token = await getToken(apiKey, signal, model.token);
    if (version !== sessionVersion) throw new Error("Session stopped");
    trackSession(session, token);
    await session.connect(token);
    await waitUntilReady(session, signal);
    if (version !== sessionVersion) {
      await session.disconnect(false);
      throw new Error("Session stopped");
    }
    return session;
  } catch (error) {
    await session.disconnect(false);
    throw error;
  }
}

export async function disconnectSession() {
  sessionVersion += 1;
  tokenRequest?.abort();
  tokenRequest = null;
  const session = reactor;
  reactor = null;
  seedRefs.clear();
  if (videoEl?.srcObject) {
    videoEl.srcObject.getTracks().forEach((track) => {
      track.onunmute = null;
      track.stop();
    });
    videoEl.srcObject = null;
  }
  if (videoEl) videoEl.onloadedmetadata = null;
  videoEl = null;
  if (session) await stopReactor(session);
}

export async function preloadSeedImages() {
  for (const [id, world] of Object.entries(WORLDS)) {
    try {
      const res = await fetch(world.seedImage);
      if (!res.ok) {
        console.warn(`[reactor] seed image missing for ${id} at ${world.seedImage}`);
        continue;
      }
      const blob = await res.blob();
      const file = new File([blob], `${id.toLowerCase()}.png`, {
        type: blob.type || "image/png",
      });
      const ref = await reactor.uploadFile(file);
      seedRefs.set(id, ref);
    } catch (e) {
      console.error(`[reactor] failed to preload ${id}:`, e);
    }
  }
}

async function stageWorld(world) {
  const ref = seedRefs.get(world.id);
  if (!ref) {
    throw new Error(
      `no FileRef cached for world ${world.id} (is /drawings/${world.id.toLowerCase()} present?)`
    );
  }
  await reactor.sendCommand("set_image", { image: ref });
  await reactor.sendCommand("set_prompt", { prompt: world.prompt });
  await reactor.sendCommand("start", {});
}

// Initial load: WAITING → set_image → set_prompt → start.
export async function loadInitialWorld(world) {
  await stageWorld(world);
}

// Portal transition: GENERATING → reset → WAITING → re-stage.
// `set_image` is not valid mid-generation on LingBot, so reset is required.
export async function transitionToWorld(world) {
  await reactor.sendCommand("reset", {});
  await stageWorld(world);
}

// Upload an arbitrary image (e.g. from a file input) and return a FileRef.
export async function uploadImage(file) {
  return reactor.uploadFile(file);
}

export async function setImageRef(ref) {
  await reactor.sendCommand("set_image", { image: ref });
}

export async function startGeneration() {
  await reactor.sendCommand("start", {});
}

export async function resetSession() {
  await reactor.sendCommand("reset", {});
}

export async function setPrompt(prompt) {
  await reactor.sendCommand("set_prompt", { prompt });
}

export async function setMovement(movement) {
  await reactor.sendCommand("set_movement", { movement });
}

export async function setLookH(look_horizontal) {
  await reactor.sendCommand("set_look_horizontal", { look_horizontal });
}

export async function setLookV(look_vertical) {
  await reactor.sendCommand("set_look_vertical", { look_vertical });
}

// Helios animates a still image. Conditioning has to land before start, or the
// first frames ignore the drawing. `set_conditioning` is the atomic form.
export async function animateDrawing(file, prompt = "animate it") {
  const session = reactor;
  if (!session) throw new Error("Not connected");

  let settled = false;
  let timer;
  let onMessage;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    session.off("message", onMessage);
  };
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the drawing to come to life."));
    }, 20000);
    onMessage = (msg) => {
      if (settled) return;
      if (msg?.type === "command_error") {
        const reason = msg.data?.reason || msg.data?.message || "The model rejected the command.";
        cleanup();
        reject(new Error(String(reason)));
        return;
      }
      if (msg?.type !== "conditions_ready") return;
      cleanup();
      resolve(msg);
    };
    session.on("message", onMessage);
  });
  ready.catch(() => {});

  try {
    const ref = await session.uploadFile(file);
    if (reactor !== session) throw new Error("Session stopped");
    await session.sendCommand("set_conditioning", { prompt, image: ref });
    if (reactor !== session) throw new Error("Session stopped");
    await ready;
    if (reactor !== session) throw new Error("Session stopped");
    await session.sendCommand("start", {});
  } catch (error) {
    cleanup();
    throw error;
  }
}
