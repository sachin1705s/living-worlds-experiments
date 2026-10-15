import "./dance.css";
import { ViduS2EditingModel, MODEL_NAME } from "@reactor-models/vidu-s2-editing/core";
import { attachVideoTrack, waitUntilReady } from "./reactor-media.js";
import { stopReactor, trackSession } from "./vidu-session.js";
import { setupDanceMedia } from "./dance-media.js";

const element = (id) => document.getElementById(id);
const libraries = {
  subject_replacement: { folder: "character-swap", items: [["robot", "Robot"], ["teddy-bear", "Teddy bear"], ["wizard", "Wizard"], ["pirate", "Pirate"], ["ballerina", "Ballerina"], ["deep-sea-diver", "Diver"]] },
  virtual_tryon: { folder: "virtual-try-on", items: [["sequin-tux", "Sequin tuxedo"], ["spacesuit", "Astronaut"], ["plate-armor", "Knight armor"], ["cowboy", "Cowboy"], ["tracksuit", "Tracksuit"], ["ball-gown", "Ball gown"]] },
  style_transfer: { folder: "style-transfer", items: [["anime", "Anime"], ["watercolor", "Watercolor"], ["van-gogh", "Van Gogh"], ["stop-motion", "Clay"], ["synthwave", "Synthwave"], ["knitted-wool", "Knitted wool"]] },
  background_replacement: { folder: "background-swap", items: [["mars", "Mars"], ["old-library", "Old library"], ["tropical-beach", "Tropical beach"], ["space-cupola", "Space station"], ["snow-globe", "Snow globe"], ["northern-lights", "Northern lights"]] },
};
const isDrip = document.body.dataset.mode === "drip";
const danceMedia = isDrip ? null : setupDanceMedia();
let editingType = isDrip ? "virtual_tryon" : "subject_replacement";
const imageUrl = (slug) => `https://inc-reactor-static.b-cdn.net/vidu/editing/${libraries[editingType].folder}/${slug}.jpg`;
let selected = imageUrl("robot");
let reference = null;
let model = null;
let camera = null;
let controller = null;
let phase = "idle";
let version = 0;
let pending = null;
let stopping = null;
let timer = null;
let sessionKey = "";
let switching = false;
let lastSessionId = null;
const status = (message) => { element("status").textContent = message; };
const updateApply = () => { element("apply").disabled = phase !== "live" || switching || !!stopping; };

function renderPresets() {
element("characters").replaceChildren();
const presets = libraries[editingType].items;
selected = imageUrl(presets[0][0]);
reference = null;
element("reference").value = "";
element("selection").textContent = `Selected: ${presets[0][1]}`;
for (const [slug, name] of presets) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-pressed", String(slug === presets[0][0]));
  const image = document.createElement("img");
  image.src = `/vidu/${libraries[editingType].folder}/${slug}.jpg`;
  image.alt = "";
  image.loading = "lazy";
  button.append(image, name);
  button.addEventListener("click", () => {
    selected = imageUrl(slug);
    reference = null;
    element("reference").value = "";
    element("selection").textContent = `Selected: ${name}`;
    element("characters").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  });
  element("characters").append(button);
}
}
renderPresets();
element("category")?.addEventListener("change", (event) => { editingType = event.target.value; renderPresets(); });

element("reference").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size >= 10 * 1024 * 1024) {
    status("Choose a PNG, JPG, or WEBP under 10 MB.");
    event.target.value = "";
    return;
  }
  reference = file;
  element("selection").textContent = `Selected: ${file.name}`;
  element("characters").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", "false"));
});

element("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await element("stage").requestFullscreen();
  } catch { status("Full screen is unavailable in this browser."); }
});

async function referenceArgs(session) {
  const scenario = editingType;
  if (!reference) return { editing_type: scenario, reference_image_url: selected };
  const uploaded = await session.uploadFile(reference);
  if (!uploaded) throw new Error("Character upload failed. Please retry.");
  return { editing_type: scenario, reference_image: uploaded };
}

async function start() {
  const attempt = ++version;
  danceMedia?.beginSession();
  controller = new AbortController();
  const signal = controller.signal;
  const check = () => { if (attempt !== version) throw new Error("Session stopped"); };
  element("start").disabled = true;
  status("Requesting camera access…");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  if (attempt !== version) { stream.getTracks().forEach((track) => track.stop()); return; }
  camera = stream;
  element("camera").srcObject = stream;
  status("Connecting to Vidu…");
  const response = await fetch("/api/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: sessionKey, model: MODEL_NAME }), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not get a Reactor token.");
  check();
  const session = new ViduS2EditingModel();
  model = session;
  trackSession(session, data.jwt);
  session.onMainVideo((track) => {
    if (attempt !== version) return;
    attachVideoTrack(element("output"), track);
    element("placeholder").hidden = true;
  });
  session.onSessionState((state) => {
    if (attempt !== version) return;
    phase = state.phase;
    danceMedia?.setLive(phase === "live");
    updateApply();
    status(phase === "live" ? (isDrip ? "Live — your whole camera frame is being edited. Choose another reference and Apply to change the look." : "Live — dance in full view. Your soundtrack starts with the picture; recording is optional.") : `Vidu: ${phase}${state.end_reason ? ` (${state.end_reason})` : ""}`);
    if (["ended", "failed"].includes(phase)) void stop().catch((error) => status(error.message));
  });
  session.onCommandError((error) => {
    if (attempt !== version) return;
    const message = `${error.code}: ${error.reason}`;
    status(message);
    if (["start_edit", "session"].includes(error.command)) {
      void stop().then(() => status(message), (failure) => status(failure.message));
    }
  });
  session.on("error", (error) => {
    if (attempt !== version) return;
    status(error.message || "Reactor connection error");
    void stop().catch((failure) => status(failure.message));
  });
  timer = setTimeout(() => { void stop().catch((error) => status(error.message)); }, 5 * 60 * 1000);
  await session.connect(data.jwt);
  check();
  await waitUntilReady(session, signal);
  check();
  lastSessionId = session.getSessionId();
  await session.publishCamera(stream.getVideoTracks()[0]);
  check();
  const args = await referenceArgs(session);
  check();
  await session.startEdit(args);
}

async function release() {
  version += 1;
  controller?.abort();
  clearTimeout(timer);
  camera?.getTracks().forEach((track) => track.stop());
  camera = null;
  element("camera").srcObject = null;
  element("music")?.pause();
  const recordingSaved = danceMedia?.stop();
  element("apply").disabled = true;
  const session = model;
  lastSessionId = session?.getSessionId() || lastSessionId;
  status("Camera and music stopped. Disconnecting…");
  await Promise.all([stopReactor(session, sessionKey, lastSessionId), recordingSaved]);
  model = null;
  lastSessionId = null;
  sessionKey = "";
  phase = "idle";
  element("output").srcObject = null;
  element("placeholder").hidden = false;
  element("start").disabled = !!pending;
  status("Stopped. Camera off, music paused.");
}

function stop() {
  if (!stopping) stopping = release().finally(() => { stopping = null; });
  return stopping;
}
element("stop").addEventListener("click", () => { void stop().catch((error) => status(error.message)); });
element("connect").addEventListener("submit", (event) => {
  event.preventDefault();
  if (pending || model || stopping) return;
  pending = start().catch(async (error) => {
    try { await stop(); } catch (failure) { status(failure.message); return; }
    status(error.message);
  }).finally(() => { pending = null; element("start").disabled = !!model || !!stopping; });
});
element("apply").addEventListener("click", async () => {
  if (!model || phase !== "live" || switching || stopping) return;
  switching = true;
  updateApply();
  const session = model;
  const attempt = version;
  try {
    const args = await referenceArgs(session);
    if (attempt !== version) return;
    await session.switchReference(args);
    if (attempt === version) status("Character switch requested. Allow a few seconds for the change.");
  } catch (error) { if (attempt === version) status(error.message); }
  finally { switching = false; updateApply(); }
});
window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "showcase-stop") return;
  try { await stop(); window.parent.postMessage({ requestId: event.data.requestId }, location.origin); }
  catch (error) { window.parent.postMessage({ requestId: event.data.requestId, error: error.message }, location.origin); }
});
window.addEventListener("pagehide", () => {
  version += 1;
  controller?.abort();
  camera?.getTracks().forEach((track) => track.stop());
  element("music").pause();
  if (model) void stopReactor(model, sessionKey, model.getSessionId() || lastSessionId).catch(() => {});
});
