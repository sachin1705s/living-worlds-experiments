// Finger Frame — live AI viewfinder.
//
// Inspired by sophiamyang/finger-frame-effect-lucy (webcam → hand-tracked
// finger-frame quad → the framed region shows a real-time AI video edit),
// rebuilt on MediaPipe HandLandmarker for two-hand tracking and Reactor's
// SANA-Streaming model (via reactor-stream.js) as the video-to-video engine
// instead of Lucy 2.5. (X2 is dropped for now — its modelName 404s on this
// account; see reactor-stream.js.)
//
// Pipeline:
//   1. getUserMedia → #cam (raw, mirrored, always visible).
//   2. The same #cam track is published straight into Reactor as the model's
//      source track. The model streams an edited version back on
//      `main_video` into #ai-video — full-screen, perfectly aligned with
//      #cam (same object-fit + mirror).
//   3. HandLandmarker (numHands: 2) finds each hand's thumb tip + index tip.
//      Held apart in an open "L", these four points are the frame's corners.
//   4. A stabilization pipeline (teleport rejection, One Euro smoothing,
//      hand-identity stabilization, engage/dropout hysteresis, anatomical
//      corner ordering) turns noisy per-frame landmarks into a steady quad
//      that keeps tracking smoothly through a twist/rotation of the hands.
//   5. Each frame, that quad becomes a CSS clip-path on #ai-video — so the AI
//      edit is only ever visible through the "frame" the hands are holding
//      up; everything outside it is the plain webcam underneath.

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  connectStream,
  disconnectStream,
  releaseStreamOnUnload,
  setStreamPrompt,
  onTrack,
  onStatus,
  onStreamError,
} from "./reactor-stream.js";

const MODEL_ID = "sana-streaming";
let lifecycle = 0;
let connecting = false;

// Diagnostics (on-screen HUD + console logs) are gated behind this flag —
// flip to true to bring them back for debugging. Kept out of the hot path
// entirely when off (not called at all, not just hidden), to test whether
// they were contributing to felt input lag.
const DEBUG = false;

// ---- Tunables ------------------------------------------------------------

// One Euro filter, one pair (x, y) per corner. Same shape as draw.js's.
// beta controls how much lag fast/deliberate motion gets vs. how much slow
// jitter gets smoothed away. Nudged up again (0.03 -> 0.05): a screen
// recording showed the box visibly undershooting a fast hand-spread motion
// during otherwise-solid 2-hand tracking. Most of that lag turned out to be
// caused by a different bug (see handleDetection — MediaPipe intermittently
// loses one hand and the whole quad used to freeze), but some of it is just
// filter lag on fast motion, which this addresses directly.
const EURO_MIN_CUTOFF = 1.2;
const EURO_BETA = 0.05;
const EURO_DCUTOFF = 1.0;

// Per-corner teleport rejection, as a fraction of the viewport's short side.
const MAX_JUMP_FRACTION = 0.45;

// Thumb-tip↔index-tip gap, relative to palm length (wrist→middle-MCP), must
// exceed this to count as an open "L" rather than a closed/pinched hand.
// A logged test session (3D distance, see extractHandCorners) put closed/
// pinched hands consistently under ~0.3 and a deliberately spread "L" at
// 0.58–1.0, so 0.4 sits in the gap with margin on both sides.
const MIN_SPREAD_RATIO = 0.4;

// Reject degenerate quads (hands too close together) below this fraction of
// viewport area. A second logged session had near-misses at 1.1–1.2% against
// a 1.2% floor — right on the edge — so this gives a bit more room.
const MIN_QUAD_AREA_FRACTION = 0.01;

// Hysteresis: consecutive good frames to engage, consecutive bad frames
// (dropout hold) before disengaging. At ~30fps this is roughly 130ms to
// engage. DROPOUT_HOLD_FRAMES history: 18 (~600ms) papered over the quad
// freezing mid-twist, but caused a visibly stale box (caught on video: the
// box stayed ACTIVE for 500ms+ with zero hands on screen). Cutting it to 6
// (~200ms) then broke real use under backlighting — a second recording
// showed MediaPipe genuinely losing one hand for stretches longer than
// 200ms (window backlight silhouetting it) while the user kept gesturing
// the whole time, so the box disengaged mid-gesture. Splitting the
// difference, now that partial-hand dropouts no longer freeze the whole
// quad (see handleDetection) and don't need a long hold to hide the freeze.
const ENGAGE_FRAMES = 4;
const DROPOUT_HOLD_FRAMES = 12;

const LANDMARK = { WRIST: 0, THUMB_TIP: 4, INDEX_TIP: 8, MIDDLE_MCP: 9 };

// Written per Reactor's SANA-Streaming prompt guide
// (docs.reactor.inc/model-api-reference/sana-streaming/prompt-guide): an
// edit instruction, not a scene description — 2-4 concrete visual details
// (capped there; more degrades the edit), and preserved axes named
// explicitly (identity, pose, motion, background, framing) rather than a
// vague "keep everything else the same", which the guide calls out as a
// common pitfall since the model only preserves what's actually named.
const PRESETS = [
  { label: "Noir", prompt: "Apply a film noir look: high-contrast black-and-white grading, deep inky shadows, and dramatic venetian-blind light streaks. Preserve the subject's identity, pose, motion, and framing exactly, with seamless temporal consistency across all frames." },
  { label: "Pixar", prompt: "Restyle the footage as 3D Pixar-style animation: glossy rounded surfaces, big expressive eyes, and warm saturated studio lighting. Preserve the subject's identity, pose, motion, and framing exactly, with seamless temporal consistency across all frames." },
  { label: "Lego", prompt: "Restyle the footage as LEGO brick animation: glossy plastic surfaces, visible stud textures, and blocky chunky proportions in saturated primary colors. Preserve the subject's pose, motion, and framing exactly, with seamless temporal consistency across all frames." },
  { label: "Ghibli", prompt: "Restyle the footage as hand-painted Studio Ghibli-style animation: soft watercolor backgrounds, clean cel-shaded linework, and a gentle warm color palette. Preserve the subject's identity, pose, motion, and framing exactly, with seamless temporal consistency across all frames." },
  { label: "Claymation", prompt: "Restyle the footage as stop-motion claymation, with visible fingerprint texture, matte surfaces, and slightly imperfect frame-to-frame motion. Preserve the subject's identity, pose, and framing exactly." },
];

// ---- DOM -------------------------------------------------------------

const stageEl = document.getElementById("stage");
const camEl = document.getElementById("cam");
const aiVideoEl = document.getElementById("ai-video");
const overlayEl = document.getElementById("overlay");
const overlayCtx = overlayEl.getContext("2d");

const startGateEl = document.getElementById("start-gate");
const btnStart = document.getElementById("btn-start");
const hintEl = document.getElementById("hint");
const controlsEl = document.getElementById("controls");
const presetRowEl = document.getElementById("preset-row");
const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const btnStop = document.getElementById("btn-stop");
const debugHudEl = document.getElementById("debug-hud");

// ---- One Euro filter (identical algorithm to draw.js's OneEuro) ----------

class OneEuro {
  constructor(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, tMs) {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuro.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuro.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

// Four corners: left-hand thumb/index, right-hand thumb/index. Each carries
// its own smoothing + teleport-rejection state so one glitchy corner doesn't
// disturb the others.
function makeCorner() {
  return {
    euroX: new OneEuro(EURO_MIN_CUTOFF, EURO_BETA, EURO_DCUTOFF),
    euroY: new OneEuro(EURO_MIN_CUTOFF, EURO_BETA, EURO_DCUTOFF),
    smoothed: null, // {x,y} in viewport px, last accepted+filtered
    lastRaw: null,
    skipCount: 0,
  };
}

const corners = { leftThumb: makeCorner(), leftIndex: makeCorner(), rightThumb: makeCorner(), rightIndex: makeCorner() };

// Slot 0 = leftThumb/leftIndex, slot 1 = rightThumb/rightIndex — arbitrary
// internal labels, not physical left/right (see stabilizeHandOrder). Used to
// update just one hand's corners when only one hand is currently detected.
const CORNER_SLOTS = [
  ["leftThumb", "leftIndex"],
  ["rightThumb", "rightIndex"],
];

function resetCorner(c) {
  c.euroX.reset();
  c.euroY.reset();
  c.smoothed = null;
  c.lastRaw = null;
  c.skipCount = 0;
}
function resetAllCorners() {
  Object.values(corners).forEach(resetCorner);
}

// ---- State -----------------------------------------------------------

let handLandmarker = null;
let running = false;
let lastVideoTime = -1;
let webcamTrack = null;

let frameActive = false;
let presentStreak = 0;
let absentStreak = 0;

// Previous frame's [hand0, hand1] raw detections (thumb/index points), used
// to keep physical hand identity consistent frame-to-frame — see
// stabilizeHandOrder().
let prevDetected = null;

let currentPrompt = "";
let streaming = false; // Reactor session connected + ready
let lastStreamStatus = "disconnected";

// ---- Boot: preset UI ---------------------------------------------------

for (const preset of PRESETS) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "preset-chip";
  chip.textContent = preset.label;
  chip.addEventListener("click", () => applyPrompt(preset.prompt, chip));
  presetRowEl.appendChild(chip);
}

promptForm.addEventListener("submit", (e) => {
  e.preventDefault();
  applyPrompt(promptInput.value, null);
});

// ---- Boot: own-API-key field --------------------------------------------
const OWN_KEY_STORAGE = "dm:ownReactorKey";

try { sessionStorage.removeItem(OWN_KEY_STORAGE); } catch {}

function getOwnApiKey() {
  return undefined;
}

function applyPrompt(prompt, activeChip) {
  currentPrompt = prompt;
  promptInput.value = prompt;
  [...presetRowEl.children].forEach((c) => c.classList.toggle("is-active", c === activeChip));
  if (streaming) {
    setStreamPrompt(prompt).catch((err) => {
      console.error("[finger-frame] set_prompt failed:", err);
      setStatus("Couldn't apply that prompt.", true);
    });
  }
}

// ---- Reactor stream lifecycle -------------------------------------------

onTrack((stream) => {
  if (!running) return;
  aiVideoEl.srcObject = stream;
  aiVideoEl.play().catch(() => { aiVideoEl.controls = true; });
});

onStatus((s) => {
  streaming = s === "ready";
  lastStreamStatus = s;
  if (s === "ready") setHint("Form the frame with both hands to reveal the AI edit.");
});

onStreamError((err) => {
  if (!running) return;
  const expired = /expire|duration|timeout/i.test(err?.message || "");
  setStatus(expired ? "The stream session timed out — restarting." : friendlyStreamError(err), true);
  if (webcamTrack && !connecting) startStream();
});

async function startStream() {
  if (!running || connecting) return;
  connecting = true;
  try {
    await connectStream(MODEL_ID, webcamTrack, currentPrompt, { userApiKey: getOwnApiKey() });
  } catch (err) {
    console.error("[finger-frame] connectStream failed:", err);
  } finally {
    connecting = false;
  }
}

// Order matters: "token fetch failed: <status> <body>" is present on every
// failure (it's getToken's own error-message prefix), so the specific
// REACTOR_API_KEY / token-exchange checks have to run first or that generic
// prefix would shadow them.
function friendlyStreamError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/wasm failed to load|does not provide an export/i.test(msg)) return "The streaming engine could not load. Refresh this page.";
  if (/REACTOR_API_KEY not set/i.test(msg)) return "The server connection is not configured.";
  if (/token exchange failed/i.test(msg)) return "That Reactor API key looks invalid — check it and try again.";
  if (/token fetch failed/i.test(msg)) return "Couldn't reach the token server. Please try again.";
  if (/busy|concurrent|conflict/i.test(msg)) return "Reactor is busy right now — try again in a moment.";
  if (/timed out/i.test(msg)) return "That took too long to connect. Please try again.";
  return "Lost the live edit — reconnecting.";
}

// ---- Start gate ---------------------------------------------------------

btnStart.addEventListener("click", async () => {
  const attempt = ++lifecycle;
  btnStart.disabled = true;
  btnStart.textContent = "Starting…";
  try {
    await initCamera(attempt);
    if (attempt !== lifecycle) return;
    await initHandLandmarker();
    if (attempt !== lifecycle) {
      handLandmarker?.close();
      handLandmarker = null;
      return;
    }
    startGateEl.classList.add("is-hidden");
    controlsEl.classList.remove("is-hidden");
    if (DEBUG) debugHudEl.classList.remove("is-hidden");
    setHint("Connecting to the model…", true);
    running = true;
    requestAnimationFrame(loop);
    startStream();
  } catch (err) {
    if (attempt !== lifecycle) return;
    webcamTrack?.stop();
    webcamTrack = null;
    camEl.srcObject = null;
    console.error(err);
    btnStart.disabled = false;
    btnStart.textContent = "Start";
    setHint(`Couldn't start: ${err.message}`, true);
  }
});

btnStop.addEventListener("click", () => { void stopEverything().catch((error) => setStatus(error.message, true)); });

async function initCamera(attempt) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 1280, height: 720 },
    audio: false,
  });
  if (attempt !== lifecycle) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  webcamTrack = stream.getVideoTracks()[0];
  camEl.srcObject = stream;
  await new Promise((resolve) => {
    if (camEl.readyState >= 2) return resolve();
    camEl.onloadeddata = () => resolve();
  });
  resizeOverlay();
}

async function initHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function stopEverything() {
  lifecycle += 1;
  running = false;
  frameActive = false;
  presentStreak = 0;
  absentStreak = 0;
  prevDetected = null;
  resetAllCorners();
  updateClip();
  clearOverlay();

  const disconnect = disconnectStream();
  aiVideoEl.srcObject = null;

  if (webcamTrack) {
    webcamTrack.stop();
    webcamTrack = null;
  }
  camEl.srcObject = null;
  handLandmarker?.close();
  handLandmarker = null;

  controlsEl.classList.add("is-hidden");
  debugHudEl.classList.add("is-hidden");
  startGateEl.classList.remove("is-hidden");
  btnStart.disabled = false;
  btnStart.textContent = "Start";
  await disconnect;
}

window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "showcase-stop") return;
  try {
    await stopEverything();
    event.source.postMessage({ requestId: event.data.requestId }, event.origin);
  } catch (error) {
    event.source.postMessage({ requestId: event.data.requestId, error: error.message }, event.origin);
  }
});

window.addEventListener("beforeunload", () => {
  releaseStreamOnUnload();
  webcamTrack?.stop();
});

// ---- Resize -----------------------------------------------------------

window.addEventListener("resize", resizeOverlay);
function resizeOverlay() {
  const dpr = window.devicePixelRatio || 1;
  overlayEl.width = overlayEl.clientWidth * dpr;
  overlayEl.height = overlayEl.clientHeight * dpr;
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---- Main loop ----------------------------------------------------------

function loop() {
  if (!running) return;
  if (camEl.currentTime !== lastVideoTime) {
    lastVideoTime = camEl.currentTime;
    const result = handLandmarker.detectForVideo(camEl, performance.now());
    handleDetection(result);
  }
  requestAnimationFrame(loop);
}

function handleDetection(result) {
  const hands = result?.landmarks ?? [];
  const rawDetected = hands.map((lm) => extractHandCorners(lm));
  const now = performance.now();

  if (rawDetected.length === 0) {
    prevDetected = null; // hand tracking lost entirely; re-identify fresh on return
    registerBadFrame();
    if (DEBUG) reportDiagnostics({ hands: 0, detected: [], areaFraction: null });
    render();
    return;
  }

  if (rawDetected.length === 1) {
    // Partial detection: MediaPipe commonly loses ONE hand under harsh
    // conditions (e.g. backlit against a bright window) while the other
    // tracks fine and the user hasn't stopped gesturing at all. Keep
    // tracking the hand we DO have — matched to whichever slot it's closer
    // to last frame, so identity doesn't flip — instead of freezing the
    // whole quad. That was the real source of the "lag": freeze both hands,
    // then jump to catch up once 2-hand detection resumes.
    const slot = matchSingleHandSlot(rawDetected[0], prevDetected);
    const [thumbKey, indexKey] = CORNER_SLOTS[slot];
    updateCorner(corners[thumbKey], rawDetected[0].thumb, now);
    updateCorner(corners[indexKey], rawDetected[0].index, now);
    if (prevDetected) prevDetected[slot] = rawDetected[0];
    registerBadFrame();
    if (DEBUG) reportDiagnostics({ hands: 1, detected: rawDetected, areaFraction: null });
    render();
    return;
  }

  // MediaPipe's own hands[] order can flip frame-to-frame — more likely
  // during fast motion. Match whichever (hand0,hand1) <-> (prev0,prev1)
  // assignment stays closer to last frame's raw points, so physical hand
  // identity (and therefore corner identity) stays stable instead of
  // reading as a teleport on whichever corner swapped.
  const detected = stabilizeHandOrder(rawDetected, prevDetected);
  prevDetected = detected;

  const rawPoints = [detected[0].thumb, detected[0].index, detected[1].thumb, detected[1].index];
  const area = quadArea(orderPoints(rawPoints));
  const viewportArea = stageEl.clientWidth * stageEl.clientHeight;
  const areaFraction = area / viewportArea;
  const spreadOk = detected.every((h) => h.ok);

  // Track raw point motion whenever both hands are visible, independent of
  // the spread/area gate below. Gating only controls engage/dropout
  // hysteresis now — it used to also gate this update, which meant the
  // rendered quad FROZE on any momentary gate miss (spread can transiently
  // dip as a hand rotates through certain angles), making a twist look like
  // it stalls and jumps instead of rotating smoothly.
  const cornerKeys = ["leftThumb", "leftIndex", "rightThumb", "rightIndex"];
  cornerKeys.forEach((key, i) => updateCorner(corners[key], rawPoints[i], now));

  if (spreadOk && areaFraction >= MIN_QUAD_AREA_FRACTION) {
    presentStreak++;
    absentStreak = 0;
    if (presentStreak >= ENGAGE_FRAMES) frameActive = true;
  } else {
    registerBadFrame();
  }

  if (DEBUG) reportDiagnostics({ hands: 2, detected, areaFraction });
  render();
}

// Teleport-rejected, One-Euro-filtered update of a single tracked corner.
// Shared by both the 2-hand and 1-hand (partial detection) paths.
function updateCorner(c, raw, now) {
  const maxJump = MAX_JUMP_FRACTION * Math.min(stageEl.clientWidth, stageEl.clientHeight);
  if (c.lastRaw) {
    const jump = Math.hypot(raw.x - c.lastRaw.x, raw.y - c.lastRaw.y);
    if (jump > maxJump && c.skipCount < 3) {
      c.skipCount++;
      return; // hold last smoothed value this frame
    }
    if (jump > maxJump) {
      c.euroX.reset();
      c.euroY.reset();
    }
  }
  c.skipCount = 0;
  c.lastRaw = raw;
  c.smoothed = { x: c.euroX.filter(raw.x, now), y: c.euroY.filter(raw.y, now) };
}

// See handleDetection's call site for why this exists.
function stabilizeHandOrder(dets, prevDets) {
  if (!prevDets) return dets;
  const cost = (a, b) => Math.hypot(a.thumb.x - b.thumb.x, a.thumb.y - b.thumb.y) + Math.hypot(a.index.x - b.index.x, a.index.y - b.index.y);
  const straight = cost(dets[0], prevDets[0]) + cost(dets[1], prevDets[1]);
  const swapped = cost(dets[0], prevDets[1]) + cost(dets[1], prevDets[0]);
  return swapped < straight ? [dets[1], dets[0]] : dets;
}

// Which corner slot does this lone detected hand belong to? Matches to
// whichever of last frame's two hands it's closer to; defaults to slot 0
// with no prior context.
function matchSingleHandSlot(hand, prevDets) {
  if (!prevDets) return 0;
  const cost = (a, b) => Math.hypot(a.thumb.x - b.thumb.x, a.thumb.y - b.thumb.y) + Math.hypot(a.index.x - b.index.x, a.index.y - b.index.y);
  return cost(hand, prevDets[0]) <= cost(hand, prevDets[1]) ? 0 : 1;
}

function registerBadFrame() {
  // Decay rather than hard-reset: a single glitchy frame (a hand momentarily
  // dipping just under the spread threshold, one dropped detection) shouldn't
  // throw away several frames' worth of progress toward engaging. Full
  // disengagement still requires a sustained absence (DROPOUT_HOLD_FRAMES).
  presentStreak = Math.max(0, presentStreak - 2);
  absentStreak++;
  if (absentStreak >= DROPOUT_HOLD_FRAMES) {
    frameActive = false;
    presentStreak = 0;
    resetAllCorners();
  }
}

// Thumb tip + index tip for one hand, mapped to viewport px, plus whether
// they're spread wide enough to count as an open "L" (not a fist/pinch).
// Always returns a result (never null) so the caller can surface *why* a
// hand didn't qualify, not just that it didn't.
//
// Spread is measured in 3D (including MediaPipe's z, depth relative to the
// wrist), not just image-plane x/y. Logged sessions showed the same physical
// gesture reading anywhere from 0.07 to 1.0 on a 2D-only ratio — a same-size
// spread that's angled toward/away from the camera foreshortens hard in x/y
// even though it hasn't actually closed. z recovers that lost dimension.
function extractHandCorners(lm) {
  const palm = dist3D(lm[LANDMARK.WRIST], lm[LANDMARK.MIDDLE_MCP]) || 1;
  const spread = dist3D(lm[LANDMARK.THUMB_TIP], lm[LANDMARK.INDEX_TIP]) / palm;
  return {
    ok: spread >= MIN_SPREAD_RATIO,
    spread,
    thumb: videoToScreen(lm[LANDMARK.THUMB_TIP].x, lm[LANDMARK.THUMB_TIP].y),
    index: videoToScreen(lm[LANDMARK.INDEX_TIP].x, lm[LANDMARK.INDEX_TIP].y),
  };
}

function dist3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Same cover-scale + selfie-mirror transform as draw.js's videoToCanvas,
// against the full-viewport #stage instead of a canvas element.
function videoToScreen(nx, ny) {
  const bw = stageEl.clientWidth;
  const bh = stageEl.clientHeight;
  const vw = camEl.videoWidth || 1280;
  const vh = camEl.videoHeight || 720;
  const scale = Math.max(bw / vw, bh / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offsetX = (bw - dispW) / 2;
  const offsetY = (bh - dispH) / 2;
  const boxX = offsetX + nx * dispW;
  const boxY = offsetY + ny * dispH;
  return { x: bw - boxX, y: boxY };
}

// Sort 4 points into a consistent cyclic (non-self-intersecting) order by
// angle around their centroid, so the quad renders correctly no matter which
// physical hand/finger produced which raw point.
function orderPoints(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

function quadArea(ordered) {
  let sum = 0;
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % ordered.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// ---- Render: clip-path + outline ----------------------------------------

function render() {
  updateClip();
  drawOverlay();
}

function currentQuad() {
  if (!corners.leftThumb.smoothed) return null;
  const raw = [corners.leftThumb.smoothed, corners.leftIndex.smoothed, corners.rightThumb.smoothed, corners.rightIndex.smoothed];
  if (raw.some((p) => !p)) return null;
  return orderPoints(raw);
}

function updateClip() {
  if (!frameActive) {
    aiVideoEl.style.clipPath = "polygon(0 0, 0 0, 0 0)";
    return;
  }
  const quad = currentQuad();
  if (!quad) return;
  // #ai-video has `transform: scaleX(-1)` in CSS (the selfie mirror). A CSS
  // clip-path with length values is evaluated against the element's own
  // PRE-transform box, then the whole clipped result is mirrored by the
  // transform — so feeding it our already-mirrored on-screen coordinates
  // (from videoToScreen, used everywhere else: overlay drawing, area/spread
  // math) double-flips the visible window to the wrong side of the actual
  // hands. Un-mirror x here only, to compensate; the CSS transform re-
  // applies the flip for the final on-screen result.
  const bw = stageEl.clientWidth;
  aiVideoEl.style.clipPath = `polygon(${quad.map((p) => `${bw - p.x}px ${p.y}px`).join(", ")})`;
}

function clearOverlay() {
  overlayCtx.clearRect(0, 0, overlayEl.clientWidth, overlayEl.clientHeight);
}

function drawOverlay() {
  clearOverlay();
  if (!frameActive) return;
  const quad = currentQuad();
  if (!quad) return;

  overlayCtx.save();
  overlayCtx.strokeStyle = "rgba(255,255,255,0.9)";
  overlayCtx.lineWidth = 2.5;
  overlayCtx.shadowColor = "rgba(232,93,58,0.8)";
  overlayCtx.shadowBlur = 12;
  overlayCtx.beginPath();
  quad.forEach((p, i) => (i === 0 ? overlayCtx.moveTo(p.x, p.y) : overlayCtx.lineTo(p.x, p.y)));
  overlayCtx.closePath();
  overlayCtx.stroke();

  overlayCtx.shadowBlur = 0;
  overlayCtx.fillStyle = "#fff";
  quad.forEach((p) => {
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    overlayCtx.fill();
  });
  overlayCtx.restore();
}

// ---- Diagnostics: on-screen HUD + console log ------------------------------
//
// Surfaces exactly what the gesture pipeline is seeing, frame by frame, so a
// failure to engage is diagnosable ("0 hands detected" vs "2 hands, but
// spread too low" vs "spread OK, quad too small") instead of a silent no-op.
// The console log is throttled (one line per LOG_INTERVAL_MS) so it's
// copy-pasteable rather than a firehose — plus an unthrottled line on every
// engage/disengage transition, since those are the moments that matter most.

const LOG_INTERVAL_MS = 500;
let lastLogTime = 0;
let prevFrameActive = false;

function reportDiagnostics({ hands, detected, areaFraction }) {
  // Transition fires immediately regardless of throttle — that moment
  // matters most and it's cheap (one console line).
  if (frameActive !== prevFrameActive) {
    console.info(`[finger-frame] ${frameActive ? "▶ FRAME ENGAGED" : "■ FRAME DISENGAGED"}`);
    prevFrameActive = frameActive;
  }

  // Everything else — including the HUD's DOM write — is throttled. Writing
  // debugHudEl.textContent every single detected frame (~30-60/sec) adds
  // real overhead on top of live MediaPipe inference + WebRTC video decode,
  // and was a contributor to felt input lag.
  const now = performance.now();
  if (now - lastLogTime < LOG_INTERVAL_MS) return;
  lastLogTime = now;

  updateDebugHud({ hands, detected, areaFraction });
  logDiagnostics({ hands, detected, areaFraction });
}

function updateDebugHud({ hands, detected, areaFraction }) {
  const lines = [
    `model      ${MODEL_ID}  (${lastStreamStatus})`,
    `hands seen ${hands}`,
    ...detected.map(
      (h, i) => `  hand ${i + 1}    spread ${h.spread.toFixed(2)} / ${MIN_SPREAD_RATIO}  ${h.ok ? "OK" : "too closed"}`
    ),
    `quad area  ${areaFraction === null ? "—" : `${(areaFraction * 100).toFixed(1)}% / ${MIN_QUAD_AREA_FRACTION * 100}%`}`,
    `engage     ${presentStreak}/${ENGAGE_FRAMES}${frameActive ? "  ACTIVE" : ""}`,
  ];
  debugHudEl.textContent = lines.join("\n");
}

function logDiagnostics({ hands, detected, areaFraction }) {
  const spreads = detected.length
    ? detected.map((h) => `${h.spread.toFixed(2)}${h.ok ? "✓" : "✗"}`).join(",")
    : "—";
  const area = areaFraction === null ? "—" : `${(areaFraction * 100).toFixed(1)}%`;
  console.log(
    `[finger-frame] hands=${hands} spreads=[${spreads}](need≥${MIN_SPREAD_RATIO}) area=${area}(need≥${MIN_QUAD_AREA_FRACTION * 100}%) engage=${presentStreak}/${ENGAGE_FRAMES} absent=${absentStreak} active=${frameActive} model=${MODEL_ID} status=${lastStreamStatus}`
  );
}

// ---- Status / hint helpers -----------------------------------------------

let hintTimer = null;
function setHint(text, sticky = false) {
  hintEl.textContent = text;
  hintEl.classList.remove("is-hidden");
  clearTimeout(hintTimer);
  if (!sticky) hintTimer = setTimeout(() => hintEl.classList.add("is-hidden"), 4000);
}

function setStatus() {}
