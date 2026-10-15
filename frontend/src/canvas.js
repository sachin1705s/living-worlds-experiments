// Touch/mouse/pen drawing surface. Sibling to draw.js (air-draw) — same
// downstream contract: produces a PNG blob via onDrawingComplete().
//
// Uses pointer events so a single code path covers mouse, finger, and stylus.
// Pressure is honored when available (light taps = thin strokes, hard press =
// thicker). Monochrome and single base thickness to match the air-draw page.

const paperEl = document.getElementById("paper");
const hintEl = document.getElementById("hint");
const btnClear = document.getElementById("btn-clear");
const btnDone = document.getElementById("btn-done");

const ctx = paperEl.getContext("2d");

// Stroke state — keyed by pointerId so a multi-touch session doesn't crash,
// even though we expect single-finger drawing for now.
const activeStrokes = new Map();

const BASE_WIDTH = 5;
const MAX_WIDTH = 9;
let hintTimer = null;

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
fadeHintAfter(4000);

paperEl.addEventListener("pointerdown", onPointerDown);
paperEl.addEventListener("pointermove", onPointerMove);
paperEl.addEventListener("pointerup", onPointerUp);
paperEl.addEventListener("pointercancel", onPointerUp);
paperEl.addEventListener("pointerleave", onPointerUp);

btnClear.addEventListener("click", clearCanvas);
btnDone.addEventListener("click", finalize);

// ---- Canvas setup ------------------------------------------------------

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // Preserve current strokes across resizes (e.g. orientation change).
  const snapshot = paperEl.width
    ? ctx.getImageData(0, 0, paperEl.width, paperEl.height)
    : null;

  paperEl.width = paperEl.clientWidth * dpr;
  paperEl.height = paperEl.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1a1a1a";

  if (snapshot) ctx.putImageData(snapshot, 0, 0);
}

// ---- Pointer handlers --------------------------------------------------

function onPointerDown(e) {
  paperEl.setPointerCapture(e.pointerId);
  const { x, y } = toCanvas(e);
  activeStrokes.set(e.pointerId, { x, y, width: widthFor(e) });
  hideHint();
}

function onPointerMove(e) {
  const stroke = activeStrokes.get(e.pointerId);
  if (!stroke) return;

  const { x, y } = toCanvas(e);
  const w = widthFor(e);

  // EMA on stroke width for visual smoothness; raw position so the drawing
  // matches the user's hand exactly.
  const smoothW = stroke.width * 0.6 + w * 0.4;

  ctx.lineWidth = smoothW;
  ctx.beginPath();
  ctx.moveTo(stroke.x, stroke.y);
  ctx.lineTo(x, y);
  ctx.stroke();

  stroke.x = x;
  stroke.y = y;
  stroke.width = smoothW;
}

function onPointerUp(e) {
  if (activeStrokes.has(e.pointerId)) {
    activeStrokes.delete(e.pointerId);
  }
}

// ---- Actions -----------------------------------------------------------

function clearCanvas() {
  ctx.clearRect(0, 0, paperEl.width, paperEl.height);
}

async function finalize() {
  if (!hasInk()) {
    setHint("Draw something first.", true);
    return;
  }
  const blob = await canvasToBlob(paperEl);
  onDrawingComplete(blob);
}

// ---- Helpers -----------------------------------------------------------

function toCanvas(e) {
  const r = paperEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function widthFor(e) {
  // Pressure is 0..1. Mouse without pressure reports 0.5 (or 0 in some browsers);
  // normalize so unpressured input still gets the base width.
  const p = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
  return BASE_WIDTH + (MAX_WIDTH - BASE_WIDTH) * p;
}

function hasInk() {
  const sample = ctx.getImageData(0, 0, paperEl.width, paperEl.height).data;
  for (let i = 3; i < sample.length; i += 4 * 64) {
    if (sample[i] !== 0) return true;
  }
  return false;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function setHint(text, sticky = false) {
  hintEl.textContent = text;
  hintEl.classList.remove("is-hidden");
  if (!sticky) fadeHintAfter(3500);
}

function fadeHintAfter(ms) {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, ms);
}

function hideHint() {
  hintEl.classList.add("is-hidden");
}

// ---- Pipeline handoff (stub — same contract as draw.js) ----------------

async function onDrawingComplete(blob) {
  const seedCanvas = document.createElement("canvas");
  seedCanvas.width = paperEl.width;
  seedCanvas.height = paperEl.height;
  const seedContext = seedCanvas.getContext("2d");
  seedContext.fillStyle = "white";
  seedContext.fillRect(0, 0, seedCanvas.width, seedCanvas.height);
  seedContext.drawImage(paperEl, 0, 0);
  try {
    sessionStorage.setItem("drawing-seed", seedCanvas.toDataURL("image/png"));
    location.assign("/playground.html");
  } catch {
    setHint("This drawing is too large to transfer. Try a smaller browser window.", true);
  }
}
