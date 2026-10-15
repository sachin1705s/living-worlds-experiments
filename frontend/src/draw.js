// Air-draw capture: webcam + MediaPipe Hands + index-finger-as-brush.
//
// Flow:
//   1. User clicks Start (required by getUserMedia gesture rules).
//   2. Webcam stream renders into <video id="cam">, mirrored via CSS.
//   3. HandLandmarker runs per-frame, returns 21 landmarks for one hand.
//   4. If the hand is in a "pointing" pose (index extended, others curled),
//      the index fingertip becomes the brush; we draw to <canvas id="paper">.
//   5. Open hand / no hand = brush lifts; the next pointing pose starts a
//      new stroke instead of connecting to the old one.
//   6. The Clear and Done buttons activate by fingertip hover-dwell.
//   7. On Done we hand the PNG blob to onDrawingComplete(). For now that
//      previews + logs; next step is /api/render → Banana → LingBot.

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// ---- DOM ---------------------------------------------------------------

const camEl = document.getElementById("cam");
const paperEl = document.getElementById("paper");
const hintEl = document.getElementById("hint");
const startGateEl = document.getElementById("start-gate");
const btnStart = document.getElementById("btn-start");
const btnClear = document.getElementById("btn-clear");
const btnDone = document.getElementById("btn-done");

// Fingertip cursor — a small dot we move with JS, so it doesn't pollute
// the stroke canvas.
const cursorEl = document.createElement("div");
cursorEl.id = "fingertip-cursor";
Object.assign(cursorEl.style, {
  position: "absolute",
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: "var(--accent)",
  border: "3px solid #fff",
  pointerEvents: "none",
  zIndex: "4",
  transform: "translate(-50%, -50%)",
  opacity: "0",
  transition: "opacity 0.2s ease",
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
});
document.getElementById("stage").appendChild(cursorEl);

const ctx = paperEl.getContext("2d");

// ---- State -------------------------------------------------------------

let handLandmarker = null;
let running = false;
let lastVideoTime = -1;

// Smoothed fingertip position in canvas pixels. null when no hand or not pointing.
let tip = null;
// Previous tip from the prior frame, used to extend the current stroke.
let prevTip = null;

// Per-button dwell state.
const dwellState = new WeakMap(); // button -> { progress, last }

// ---- Setup -------------------------------------------------------------

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  paperEl.width = paperEl.clientWidth * dpr;
  paperEl.height = paperEl.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#1a1a1a";
}

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  btnStart.textContent = "Starting…";
  try {
    await initCamera();
    await initHandLandmarker();
    startGateEl.classList.add("is-hidden");
    setHint("Point your finger to draw. Open your hand to pause.");
    fadeHintAfter(4000);
    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    btnStart.disabled = false;
    btnStart.textContent = "Start";
    setHint(`Couldn't start: ${err.message}`, true);
  }
});

btnClear.addEventListener("click", () => {
  ctx.clearRect(0, 0, paperEl.width, paperEl.height);
  prevTip = null;
});

btnDone.addEventListener("click", async () => {
  if (!hasInk()) {
    setHint("Draw something first!", true);
    return;
  }
  running = false;
  setHint("Capturing…");
  const blob = await canvasToBlob(paperEl);
  onDrawingComplete(blob);
});

// ---- Camera + MediaPipe ------------------------------------------------

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 1280, height: 720 },
    audio: false,
  });
  camEl.srcObject = stream;
  await new Promise((resolve) => {
    if (camEl.readyState >= 2) return resolve();
    camEl.onloadeddata = () => resolve();
  });
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
    numHands: 1,
  });
}

// ---- Main loop ---------------------------------------------------------

function loop() {
  if (!running) return;

  if (camEl.currentTime !== lastVideoTime) {
    lastVideoTime = camEl.currentTime;
    const result = handLandmarker.detectForVideo(camEl, performance.now());
    handleDetection(result);
  }

  updateDwell(btnClear);
  updateDwell(btnDone);

  requestAnimationFrame(loop);
}

function handleDetection(result) {
  const lm = result?.landmarks?.[0];
  if (!lm) {
    // No hand — lift the brush.
    tip = null;
    prevTip = null;
    cursorEl.style.opacity = "0";
    return;
  }

  // Normalised landmarks come from the un-mirrored video. CSS mirrors the
  // <video>, so we flip x to match what the user sees.
  const rect = paperEl.getBoundingClientRect();
  const rawX = (1 - lm[8].x) * rect.width;
  const rawY = lm[8].y * rect.height;

  // EMA smoothing — kills jitter without much lag.
  const sx = tip ? tip.x * 0.55 + rawX * 0.45 : rawX;
  const sy = tip ? tip.y * 0.55 + rawY * 0.45 : rawY;
  tip = { x: sx, y: sy };

  cursorEl.style.opacity = "1";
  cursorEl.style.left = `${sx}px`;
  cursorEl.style.top = `${sy}px`;

  if (!isPointingPose(lm)) {
    // Hand open / fist / other — lift the brush. Next pointing pose starts
    // a new stroke instead of joining to wherever we last were.
    prevTip = null;
    cursorEl.style.background = "transparent";
    cursorEl.style.borderColor = "rgba(255,255,255,0.7)";
    return;
  }

  cursorEl.style.background = "var(--accent)";
  cursorEl.style.borderColor = "#fff";

  // If the fingertip is hovering a button, don't draw — let the dwell logic
  // own that region.
  if (isOverButton(sx, sy)) {
    prevTip = null;
    return;
  }

  if (prevTip) {
    ctx.beginPath();
    ctx.moveTo(prevTip.x, prevTip.y);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  prevTip = { x: sx, y: sy };
}

// ---- Pose detection ----------------------------------------------------

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A finger is "extended" when its tip sits well beyond its MCP joint from
// the wrist. "Curled" when the tip has fallen back toward the wrist.
function isExtended(tip, mcp, wrist) {
  return dist(tip, wrist) > dist(mcp, wrist) * 1.35;
}
function isCurled(tip, mcp, wrist) {
  return dist(tip, wrist) < dist(mcp, wrist) * 1.15;
}

function isPointingPose(lm) {
  const wrist = lm[0];
  return (
    isExtended(lm[8], lm[5], wrist) &&     // index extended
    isCurled(lm[12], lm[9], wrist) &&      // middle curled
    isCurled(lm[16], lm[13], wrist) &&     // ring curled
    isCurled(lm[20], lm[17], wrist)        // pinky curled
  );
}

// ---- Button dwell ------------------------------------------------------

function isOverButton(x, y) {
  return [btnClear, btnDone].some((b) => pointInRect(x, y, b.getBoundingClientRect()));
}

function pointInRect(x, y, r) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function updateDwell(btn) {
  const target = parseFloat(btn.dataset.dwell || "0.8");
  const state = dwellState.get(btn) ?? { progress: 0, last: performance.now() };
  const now = performance.now();
  const dt = (now - state.last) / 1000;
  state.last = now;

  const over = tip && pointInRect(tip.x, tip.y, btn.getBoundingClientRect());
  if (over) {
    state.progress = Math.min(target, state.progress + dt);
    btn.classList.add("is-hovering");
    btn.style.setProperty("--dwell", (state.progress / target).toFixed(3));
    if (state.progress >= target) {
      state.progress = 0;
      btn.style.setProperty("--dwell", "0");
      btn.classList.remove("is-hovering");
      btn.click();
    }
  } else if (state.progress > 0) {
    // Decay if the finger drifted off — feels more forgiving than a hard reset.
    state.progress = Math.max(0, state.progress - dt * 2);
    btn.style.setProperty("--dwell", (state.progress / target).toFixed(3));
    if (state.progress === 0) btn.classList.remove("is-hovering");
  }
  dwellState.set(btn, state);
}

// ---- Utilities ---------------------------------------------------------

function setHint(text, sticky = false) {
  hintEl.textContent = text;
  hintEl.classList.remove("is-hidden");
  if (!sticky) fadeHintAfter(4000);
}

let hintTimer = null;
function fadeHintAfter(ms) {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add("is-hidden"), ms);
}

function hasInk() {
  // Cheap "is the canvas non-empty?" check: sample alpha channel.
  const sample = ctx.getImageData(0, 0, paperEl.width, paperEl.height).data;
  for (let i = 3; i < sample.length; i += 4 * 64) {
    if (sample[i] !== 0) return true;
  }
  return false;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ---- Pipeline handoff (stub for now) -----------------------------------
//
// This is the seam where the air-drawing leaves the page. Next step plugs
// in /api/render (Nano Banana) → reactor.js (LingBot/Odyssey).

async function onDrawingComplete(blob) {
  console.log("[draw] captured", blob.size, "bytes");

  // For now: open a preview in a new tab so we can sanity-check capture
  // quality before wiring Banana.
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");

  setHint("Saved a preview tab. (Banana hookup is next.)", true);

  // Allow restarting the loop after a beat — user might want to redraw.
  setTimeout(() => {
    running = true;
    requestAnimationFrame(loop);
  }, 1500);
}
