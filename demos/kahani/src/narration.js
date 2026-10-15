import {
  NARRATION_CLIP_BY_KEY,
  NARRATION_CLIP_KEYS,
} from "./narration-data.js";

const DEFAULT_CLIP_BASE_URL = "/clips/";
const DEFAULT_RUNTIME_TTS_ENDPOINT = "/api/narration";
const DYNAMIC_BEAT = "dynamic_response";
const NARRATION_VOLUME = 1;

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function keyFor(beat, spirit) {
  if (typeof beat === "string" && NARRATION_CLIP_BY_KEY[beat]) return beat;
  if (beat === "opening" && Number.isInteger(spirit)) return `opening-${spirit}`;
  if (beat === "decision_1" || beat === "decision-1") return "decision-1-pose";
  if (beat === "consequence_1" || beat === "consequence-1") {
    return spirit ? `bridge-${spirit}` : null;
  }
  if (beat === "moral") return spirit ? `moral-${spirit}` : null;
  return null;
}

async function hashLine(line) {
  const value = String(line).trim();
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // A deterministic fallback keeps tests and non-browser runtimes cache-safe.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function defaultAudioFactory(source) {
  if (typeof Audio === "undefined") {
    throw new Error("Narration playback requires a browser Audio implementation");
  }
  return new Audio(source);
}

function playAudio(audio) {
  audio.preload = "auto";
  audio.load?.();
  return Promise.resolve(audio.play());
}

async function defaultRuntimeTts({ line, lineHash, endpoint, fetchImpl }) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: line, line_hash: lineHash }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Narration service returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const source = payload.audio_url || payload.audioUrl || payload.url;
    if (!source) throw new Error("Narration service returned no audio URL");
    return source;
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error("Narration service returned empty audio");
  if (!globalThis.URL?.createObjectURL) {
    throw new Error("This runtime cannot create an audio URL");
  }
  return globalThis.URL.createObjectURL(blob);
}

/**
 * Create the narration layer for one story session.
 *
 * The controller owns only narrator audio elements. It never touches the
 * HappyOyster video/audio element, so native forest ambience keeps playing
 * underneath every clip and dynamic line.
 */
export function createNarrationController({
  clipBaseUrl = DEFAULT_CLIP_BASE_URL,
  runtimeTtsEndpoint = DEFAULT_RUNTIME_TTS_ENDPOINT,
  runtimeTts = defaultRuntimeTts,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  audioFactory = defaultAudioFactory,
} = {}) {
  const baseUrl = normalizeBaseUrl(clipBaseUrl);
  const preloads = new Map();
  const dynamicAudio = new Map();
  let activeNarration = null;

  function clipUrl(key) {
    const clip = NARRATION_CLIP_BY_KEY[key];
    return clip ? `${baseUrl}${clip.filename}` : null;
  }

  function preloadClip(key) {
    if (!NARRATION_CLIP_BY_KEY[key]) return Promise.resolve(false);
    if (!preloads.has(key)) {
      const audio = audioFactory(clipUrl(key));
      audio.preload = "auto";
      audio.load?.();
      preloads.set(key, Promise.resolve(audio));
    }
    return preloads.get(key).then(() => true);
  }

  async function preload(keys = NARRATION_CLIP_KEYS) {
    await Promise.all(keys.map((key) => preloadClip(key)));
    return keys.filter((key) => NARRATION_CLIP_BY_KEY[key]);
  }

  async function playClip(key) {
    if (!NARRATION_CLIP_BY_KEY[key]) {
      return { played: false, reason: "unknown_static_clip" };
    }
    const audio = await preloads.get(key) || audioFactory(clipUrl(key));
    audio.volume = NARRATION_VOLUME;
    activeNarration?.pause?.();
    activeNarration = audio;
    await playAudio(audio);
    console.info("[kahani] narration audio path", {
      type: "clip",
      source: clipUrl(key),
    });
    return { played: true, key, source: clipUrl(key) };
  }

  async function playDynamic(line) {
    const text = String(line || "").trim();
    if (!text) return { played: false, reason: "empty_dynamic_line" };
    if (!fetchImpl && runtimeTts === defaultRuntimeTts) {
      throw new Error("Runtime narration requires fetch");
    }

    const lineHash = await hashLine(text);
    const source = await prefetchDynamic(text, lineHash);
    const audio = audioFactory(source);
    audio.volume = NARRATION_VOLUME;
    activeNarration?.pause?.();
    activeNarration = audio;
    await playAudio(audio);
    console.info("[kahani] narration audio path", {
      type: "runtime-tts",
      source,
      lineHash,
    });
    return { played: true, lineHash, source };
  }

  async function prefetchDynamic(line, knownHash) {
    const text = String(line || "").trim();
    if (!text) return null;
    if (!fetchImpl && runtimeTts === defaultRuntimeTts) {
      throw new Error("Runtime narration requires fetch");
    }

    const lineHash = knownHash || await hashLine(text);
    if (!dynamicAudio.has(lineHash)) {
      const pending = Promise.resolve(
        runtimeTts({
          line: text,
          lineHash,
          endpoint: runtimeTtsEndpoint,
          fetchImpl,
        }),
      ).catch((error) => {
        dynamicAudio.delete(lineHash);
        throw error;
      });
      dynamicAudio.set(lineHash, pending);
    }
    return dynamicAudio.get(lineHash);
  }

  async function play({ beat, spirit, key, line } = {}) {
    if (beat === DYNAMIC_BEAT || key === DYNAMIC_BEAT) return playDynamic(line);
    const staticKey = key || keyFor(beat, spirit);
    return playClip(staticKey);
  }

  function stop() {
    activeNarration?.pause?.();
    activeNarration = null;
  }

  return {
    clipUrl,
    hashLine,
    preload,
    preloadClip,
    play,
    playClip,
    playDynamic,
    prefetchDynamic,
    stop,
  };
}

const defaultController = createNarrationController();

export const narrationClipKeys = NARRATION_CLIP_KEYS;
export const preloadNarration = (...args) => defaultController.preload(...args);
export const playNarration = (...args) => defaultController.play(...args);
export const playDynamicNarration = (...args) => defaultController.playDynamic(...args);
export const prefetchDynamicNarration = (...args) => defaultController.prefetchDynamic(...args);
export const stopNarration = (...args) => defaultController.stop(...args);
export { hashLine };
