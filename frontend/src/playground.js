import "./experiment-shell.css";
import {
  initSession,
  onState,
  uploadImage,
  setImageRef,
  setPrompt,
  setMovement,
  setLookH,
  setLookV,
  startGeneration,
  animateDrawing,
  resetSession,
  disconnectSession,
} from "./reactor.js";

if (window.parent !== window) document.documentElement.classList.add("framed");

const STEP_PROMPT = "The video presents a first-person walk through the world of this drawing, preserving its subjects, layout, colors, and visual style. The ground continues underfoot and the scene opens ahead. Gentle, curious wonder.";

const seedFileEl = document.getElementById("seed-file");
const seedPreviewEl = document.getElementById("seed-preview");
const btnStep = document.getElementById("btn-step");
const btnLive = document.getElementById("btn-live");
const btnReset = document.getElementById("btn-reset");
const videoEl = document.getElementById("world-video");
const controlsHint = document.getElementById("controls-hint");

let connected = false;
let sessionModel = null;
let activeMode = null;
let seedRef = null;
let started = false;
let runVersion = 0;
const stopEl = document.getElementById("btn-stop");

function selectedFile() {
  return seedFileEl.files?.[0] || null;
}

function setChoicesEnabled(enabled) {
  const ready = enabled && Boolean(selectedFile());
  btnStep.disabled = !ready;
  btnLive.disabled = !ready;
}

function setActiveChoice(mode) {
  activeMode = mode;
  btnStep.setAttribute("aria-pressed", mode === "step" ? "true" : "false");
  btnLive.setAttribute("aria-pressed", mode === "live" ? "true" : "false");
  if (mode === "step") {
    controlsHint.hidden = false;
    controlsHint.textContent = "WASD — Move  ·  Arrows — Look";
  } else if (mode === "live") {
    controlsHint.hidden = false;
    controlsHint.textContent = "Your drawing is coming to life";
  } else {
    controlsHint.hidden = true;
  }
}

async function stopPlayground() {
  runVersion += 1;
  connected = false;
  sessionModel = null;
  started = false;
  seedRef = null;
  btnReset.disabled = true;
  setChoicesEnabled(false);
  setActiveChoice(null);
  lastMv = lastLH = lastLV = "idle";
  try {
    await disconnectSession();
  } catch {
    throw new Error("Reactor disconnect failed");
  } finally {
    setChoicesEnabled(true);
  }
}

stopEl.addEventListener("click", () => { void stopPlayground().catch(() => {}); });
window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "showcase-stop") return;
  try {
    await stopPlayground();
    event.source.postMessage({ requestId: event.data.requestId }, event.origin);
  } catch (error) {
    event.source.postMessage({ requestId: event.data.requestId, error: error.message }, event.origin);
  }
});

window.addEventListener("pagehide", () => { void disconnectSession(); });

function log() {}

seedFileEl.addEventListener("change", () => {
  const f = seedFileEl.files?.[0];
  if (!f) {
    seedPreviewEl.removeAttribute("src");
    seedRef = null;
    setChoicesEnabled(false);
    return;
  }
  seedPreviewEl.src = URL.createObjectURL(f);
  seedRef = null; // re-upload required
  setChoicesEnabled(true);
  log(`selected ${f.name} (${(f.size / 1024).toFixed(0)} kB)`);
});

onState(() => {});

async function ensureConnected(modelName) {
  if (connected && sessionModel === modelName) return;
  if (connected) {
    await disconnectSession();
    connected = false;
    sessionModel = null;
    seedRef = null;
  }
  await initSession(videoEl, undefined, modelName);
  connected = true;
  sessionModel = modelName;
  log("connected", "evt");
  btnReset.disabled = false;
}

async function startMode(mode) {
  const file = selectedFile();
  if (!file) return log("Choose a drawing first.", "err");
  if (!file.type.startsWith("image/")) return log("Choose a picture of a drawing.", "err");

  setChoicesEnabled(false);
  const version = ++runVersion;
  const checkActive = () => {
    if (version !== runVersion) throw new Error("Session stopped");
  };
  try {
    const modelName = mode === "live" ? "helios" : "lingbot";
    await ensureConnected(modelName);
    checkActive();

    if (mode === "live") {
      log("animate it…");
      await animateDrawing(file, "animate it");
      checkActive();
      log("the drawing is coming to life", "evt");
    } else {
      if (!seedRef) {
        log("uploading drawing…");
        seedRef = await uploadImage(file);
        checkActive();
        log("upload ok", "evt");
      }
      log("set_image…");
      await setImageRef(seedRef);
      checkActive();
      await setPrompt(STEP_PROMPT);
      checkActive();
      log("start…");
      await startGeneration();
      checkActive();
      log("you can step inside", "evt");
    }

    setActiveChoice(mode);
    started = true;
  } catch (e) {
    if (version === runVersion) console.error(e);
  } finally {
    if (version === runVersion) setChoicesEnabled(true);
  }
}

btnStep.addEventListener("click", () => { void startMode("step"); });
btnLive.addEventListener("click", () => { void startMode("live"); });

btnReset.addEventListener("click", async () => {
  log("reset…");
  try {
    await resetSession();
    started = false;
    log("reset ok", "evt");
  } catch (e) {
    log(`error: ${e.message}`, "err");
  }
});

// Controls. Simpler than the museum's controls.js: no portal step counting,
// no movement stack — this is a debug tool.
const KEY_TO_MOVEMENT = { w: "forward", s: "back", a: "strafe_left", d: "strafe_right" };
const KEY_TO_LOOK_H = { ArrowLeft: "left", ArrowRight: "right" };
const KEY_TO_LOOK_V = { ArrowUp: "up", ArrowDown: "down" };

let lastMv = "idle";
let lastLH = "idle";
let lastLV = "idle";

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (!started || activeMode !== "step") return;
  // Don't intercept keys while the user is typing in a textarea.
  if (e.target?.tagName === "TEXTAREA" || e.target?.tagName === "INPUT") return;

  const k = e.key;
  const klow = k.toLowerCase();

  if (KEY_TO_MOVEMENT[klow]) {
    e.preventDefault();
    const next = KEY_TO_MOVEMENT[klow];
    if (next !== lastMv) {
      lastMv = next;
      setMovement(next).catch((err) => log(`mv err: ${err.message}`, "err"));
    }
    return;
  }
  if (KEY_TO_LOOK_H[k]) {
    e.preventDefault();
    if (KEY_TO_LOOK_H[k] !== lastLH) {
      lastLH = KEY_TO_LOOK_H[k];
      setLookH(lastLH).catch((err) => log(`look err: ${err.message}`, "err"));
    }
    return;
  }
  if (KEY_TO_LOOK_V[k]) {
    e.preventDefault();
    if (KEY_TO_LOOK_V[k] !== lastLV) {
      lastLV = KEY_TO_LOOK_V[k];
      setLookV(lastLV).catch((err) => log(`look err: ${err.message}`, "err"));
    }
    return;
  }

});

window.addEventListener("keyup", (e) => {
  if (!started || activeMode !== "step") return;
  if (e.target?.tagName === "TEXTAREA" || e.target?.tagName === "INPUT") return;

  const k = e.key;
  const klow = k.toLowerCase();

  if (KEY_TO_MOVEMENT[klow]) {
    if (lastMv !== "idle") {
      lastMv = "idle";
      setMovement("idle").catch(() => {});
    }
    return;
  }
  if (KEY_TO_LOOK_H[k]) {
    if (lastLH !== "idle") {
      lastLH = "idle";
      setLookH("idle").catch(() => {});
    }
    return;
  }
  if (KEY_TO_LOOK_V[k]) {
    if (lastLV !== "idle") {
      lastLV = "idle";
      setLookV("idle").catch(() => {});
    }
    return;
  }

});

setChoicesEnabled(true);
log("Choose a drawing, then step inside it or make it come to life.");

const savedDrawing = sessionStorage.getItem("drawing-seed");
if (savedDrawing) {
  sessionStorage.removeItem("drawing-seed");
  fetch(savedDrawing).then((response) => response.blob()).then((blob) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "my-drawing.png", { type: "image/png" }));
    seedFileEl.files = transfer.files;
    seedFileEl.dispatchEvent(new Event("change"));
    log("Your drawing is ready. Step inside it, or make it come to life.");
  }).catch(() => log("Could not load the drawing. Please upload it manually.", "err"));
}

document.querySelector(".back").addEventListener("click", async (event) => {
  event.preventDefault();
  if (window.parent !== window) window.parent.postMessage({ type: "showcase-back" }, location.origin);
  else { await stopPlayground(); location.href = "/showcase.html"; }
});
