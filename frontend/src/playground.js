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
  resetSession,
  disconnectSession,
} from "./reactor.js";

const seedFileEl = document.getElementById("seed-file");
const seedPreviewEl = document.getElementById("seed-preview");
const btnStart = document.getElementById("btn-start");
const btnReset = document.getElementById("btn-reset");
const stateEl = document.getElementById("state-display");
const logEl = document.getElementById("log");
const videoEl = document.getElementById("world-video");
const playbackEl = document.getElementById("playback-status");

videoEl.addEventListener("playing", () => { playbackEl.hidden = true; });
videoEl.addEventListener("waiting", () => {
  playbackEl.hidden = false;
  playbackEl.textContent = "Waiting for video frames…";
});
videoEl.addEventListener("error", () => {
  playbackEl.hidden = false;
  playbackEl.textContent = "Video playback failed. Stop the session and reconnect.";
});

let connected = false;
let seedRef = null;
let started = false;
let runVersion = 0;
const stopEl = document.getElementById("btn-stop");

async function stopPlayground() {
  runVersion += 1;
  connected = false;
  started = false;
  playbackEl.hidden = false;
  playbackEl.textContent = "Session stopped";
  seedRef = null;
  btnReset.disabled = true;
  btnStart.disabled = true;
  lastMv = lastLH = lastLV = "idle";
  try {
    await disconnectSession();
    stateEl.textContent = "disconnected";
    log("Session disconnected.", "evt");
  } catch {
    log("Disconnect failed. Check your Reactor dashboard to confirm the session has ended.", "err");
    throw new Error("Reactor disconnect failed");
  } finally {
    btnStart.disabled = false;
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

function log(text, cls = "") {
  const div = document.createElement("div");
  div.className = "entry " + cls;
  const ts = new Date().toLocaleTimeString();
  div.textContent = `${ts}  ${text}`;
  logEl.prepend(div);
  while (logEl.childElementCount > 50) logEl.lastChild.remove();
}

seedFileEl.addEventListener("change", () => {
  const f = seedFileEl.files?.[0];
  if (!f) {
    seedPreviewEl.removeAttribute("src");
    seedRef = null;
    return;
  }
  seedPreviewEl.src = URL.createObjectURL(f);
  seedRef = null; // re-upload required
  log(`selected ${f.name} (${(f.size / 1024).toFixed(0)} kB)`);
});

onState((s) => {
  stateEl.textContent = JSON.stringify(s, null, 2);
});

async function ensureConnected() {
  if (connected) return;
  log("connecting…");
  playbackEl.hidden = false;
  playbackEl.textContent = "Connecting to Reactor…";
  await initSession(videoEl);
  connected = true;
  log("connected", "evt");
  btnReset.disabled = false;
}

btnStart.addEventListener("click", async () => {
  const file = seedFileEl.files?.[0];
  if (!file) return log("need a seed image", "err");
  if (!file.type.startsWith("image/")) return log("Choose a reference picture.", "err");

  btnStart.disabled = true;
  const version = ++runVersion;
  const checkActive = () => {
    if (version !== runVersion) throw new Error("Session stopped");
  };
  try {
    await ensureConnected();
    checkActive();

    if (!seedRef) {
      log("uploading seed image…");
      const uploaded = await uploadImage(file);
      checkActive();
      seedRef = uploaded;
      log("upload ok", "evt");
    }

    log("set_image…");
    await setImageRef(seedRef);
    checkActive();

    await setPrompt("A living world matching the reference image, preserving its subjects, layout, colors, and visual style. Subtle natural movement and a consistent atmosphere.");
    checkActive();

    log("start…");
    await startGeneration();
    checkActive();
    log("start sent", "evt");
    if (videoEl.readyState < 2) playbackEl.textContent = "Generation started. Waiting for video frames…";
    started = true;
  } catch (e) {
    log(`error: ${e.message}`, "err");
    console.error(e);
  } finally {
    if (version === runVersion) btnStart.disabled = false;
  }
});

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
  if (!started) return;
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
  if (!started) return;
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

btnStart.disabled = false;
log("Ready. Choose a reference picture and connect.");

const savedDrawing = sessionStorage.getItem("drawing-seed");
if (savedDrawing) {
  sessionStorage.removeItem("drawing-seed");
  fetch(savedDrawing).then((response) => response.blob()).then((blob) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "my-drawing.png", { type: "image/png" }));
    seedFileEl.files = transfer.files;
    seedFileEl.dispatchEvent(new Event("change"));
    log("Your drawing is ready. Connect to explore.");
  }).catch(() => log("Could not load the drawing. Please upload it manually.", "err"));
}

document.querySelector(".back").addEventListener("click", async (event) => {
  event.preventDefault();
  if (window.parent !== window) window.parent.postMessage({ type: "showcase-back" }, location.origin);
  else { await stopPlayground(); location.href = "/showcase.html"; }
});
