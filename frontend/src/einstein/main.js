import { trackSession } from "../vidu-session.js";
import "./style.css";
import "../experiment-shell.css";
if (window.parent !== window) document.documentElement.classList.add("framed");
import { ReactorStreamService, attachStream, loadImageFile } from "./original/reactorStream";
import { EXPLAIN_QUESTIONS, pcmToWav, glListProps, buildReactorInteractPrompt } from "./original/character";

const video = document.getElementById("einstein-video");
const status = { set textContent(_value) {} };
const connectButton = document.getElementById("connect");
const speech = document.getElementById("speech");
const historyEl = document.getElementById("history");
let service = null;
let reactorKey = "";
let sessionId = "";
let version = 0;
let request = new AbortController();
let history = [];
let visibleObjects = [];
let objectTimer = null;
let sessionTimer = null;
let speechUrl = null;
let busy = false;
let ready = false;
let stopTask = null;

function updateControls() {
  document.querySelectorAll("#topics button, #ask, #direct").forEach((button) => {
    button.disabled = !ready || busy;
  });
}

function addLine(role, text) {
  const line = document.createElement("p");
  line.textContent = `${role}: ${text}`;
  historyEl.append(line);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (${response.status})`);
  }
  return response;
}

async function stopSession() {
  if (stopTask) return stopTask;
  stopTask = (async () => {
    version += 1;
    ready = false;
    busy = false;
    updateControls();
    connectButton.disabled = true;
    request.abort();
    clearTimeout(objectTimer);
    clearTimeout(sessionTimer);
    speech.pause();
    speech.removeAttribute("src");
    speech.hidden = true;
    if (speechUrl) URL.revokeObjectURL(speechUrl);
    speechUrl = null;
    const current = service;
    const currentId = sessionId || current?.getSessionId();
    service = null;
    if (current) await current.disconnect();
    video.srcObject?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    if (currentId) {
      const response = await fetch("/api/reactor/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jwt: reactorKey, sessionId: currentId }),
      });
      if (!response.ok) {
        status.textContent = "Disconnected locally. Provider stop unconfirmed; go back again to retry.";
        throw new Error("Provider stop unconfirmed. Retry going back or check your Reactor dashboard.");
      }
    }
    sessionId = "";
    reactorKey = "";
    status.textContent = "Session stopped. Keys cleared.";
    connectButton.disabled = false;
  })();
  try { await stopTask; } finally { stopTask = null; }
}

window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "showcase-stop") return;
  try {
    await stopSession();
    event.source.postMessage({ requestId: event.data.requestId }, event.origin);
  } catch (error) {
    event.source.postMessage({ requestId: event.data.requestId, error: error.message }, event.origin);
  }
});
window.addEventListener("pagehide", () => {
  request.abort();
  speech.pause();
  if (sessionId) {
    navigator.sendBeacon("/api/reactor/session/end", new Blob([JSON.stringify({ sessionId, jwt: reactorKey })], { type: "application/json" }));
  }
  void service?.disconnect();
});

document.getElementById("connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (service || stopTask) return;
  const attempt = ++version;
  request = new AbortController();
  connectButton.disabled = true;
  history = [];
  visibleObjects = [];
  historyEl.replaceChildren();
  status.textContent = "Connecting to Einstein…";
  try {
    const response = await api("/api/token", { jwt: reactorKey, model: "reactor/visko-orbis-stable" });
    const { jwt } = await response.json();
    reactorKey = jwt;
    if (attempt !== version) return;
    const current = new ReactorStreamService(jwt, "reactor/visko-orbis-stable");
    service = current;
    trackSession(current, jwt);
    await current.connect({
      onConnected: (stream) => {
        if (attempt === version) void attachStream(video, stream);
      },
      onSessionCreated: (id) => { if (attempt === version) sessionId = id; },
      onStatusChange: (state) => { if (attempt === version) status.textContent = `Einstein: ${state}`; },
      onStreamError: (_reason, message) => { if (attempt === version) status.textContent = message || "The stream reported an error. Stop and reconnect."; },
      onStreamEnded: () => {
        if (attempt !== version) return;
        ready = false;
        updateControls();
        status.textContent = "Generation ended. Stop and reconnect for another session.";
      },
    });
    if (attempt !== version) return;
    status.textContent = "Preparing Einstein’s classroom…";
    const image = await loadImageFile("/einstein/reference.jpg", "einstein-reference.jpg");
    if (attempt !== version) return;
    await current.startStream({ prompt: "Animate it", image });
    if (attempt !== version) return;
    ready = true;
    updateControls();
    status.textContent = "Einstein is ready. Choose a topic or ask a question.";
    speech.src = "/einstein/greeting.wav";
    speech.hidden = false;
    void speech.play().catch(() => {});
    sessionTimer = setTimeout(() => { void stopSession().catch((error) => { status.textContent = error.message; }); }, 5 * 60 * 1000);
  } catch (error) {
    if (attempt !== version) return;
    await stopSession().catch(() => {});
    status.textContent = error.message;
  }
});

async function playReply(text, attempt) {
  const response = await api("/api/character/tts", { text, character: "Einstein's Chalkboard", geminiVoice: "Charon" });
  const audio = await response.arrayBuffer();
  if (attempt !== version) return;
  const isPcm = response.headers.get("content-type")?.includes("audio/pcm");
  const wav = isPcm ? pcmToWav(audio, Number(response.headers.get("x-sample-rate") || 24000), Number(response.headers.get("x-channels") || 1), Number(response.headers.get("x-bit-depth") || 16)) : audio;
  if (speechUrl) URL.revokeObjectURL(speechUrl);
  speechUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  speech.src = speechUrl;
  speech.hidden = false;
  await speech.play().catch(() => { status.textContent = "Answer ready. Press play to hear Einstein."; });
}

async function ask(question) {
  if (!ready || busy || !question.trim()) return;
  const attempt = version;
  busy = true;
  updateControls();
  speech.pause();
  clearTimeout(objectTimer);
  status.textContent = "Einstein is thinking…";
  addLine("You", question);
  try {
    const searchTriggers = ["today", "latest", "recent", "news", "price", "stock", "weather", "who is", "when did", "score", "happened"];
    const response = await api("/api/character/chat", {
      message: question,
      history: history.slice(-6),
      character: "Einstein's Chalkboard",
      enableSearch: searchTriggers.some((word) => question.toLowerCase().includes(word)),
    });
    const data = await response.json();
    if (attempt !== version) return;
    const reply = (String(data.reply || "Hmm, fascinating.").trim()).split(/\s+/).slice(0, 40).join(" ");
    const action = String(data.action || "nod thoughtfully and gesture gently");
    const objects = Array.isArray(data.objects) ? data.objects.filter(Boolean).slice(0, 1) : [];
    history.push({ role: "user", content: question }, { role: "assistant", content: reply });
    addLine("Einstein", reply);
    const leaving = visibleObjects.filter((object) => !objects.includes(object));
    const exitClause = leaving.length ? `He puts ${glListProps(leaving)} away. ` : "";
    const verb = action.replace(/^SCENE_ACTION_/i, "").toLowerCase().replace(/_/g, " ").trim();
    const actionClause = verb ? `He ${verb}. ` : "";
    const propsClause = objects.length ? `${glListProps(objects)} in his hands, clearly visible as a small prop.` : "";
    await service.interact(buildReactorInteractPrompt(`${exitClause}${actionClause}${propsClause}`.trim()));
    if (attempt !== version) return;
    visibleObjects = objects;
    status.textContent = "Einstein is explaining…";
    await playReply(reply, attempt);
    if (attempt !== version) return;
    const clearProps = () => {
      if (attempt !== version || !service || !visibleObjects.length) return;
      if (!speech.paused && !speech.ended) { objectTimer = setTimeout(clearProps, 500); return; }
      const props = glListProps(visibleObjects);
      visibleObjects = [];
      void service.interact(buildReactorInteractPrompt(`He puts ${props} away; his hands are empty and the scene is exactly as it was before.`)).catch(() => {});
    };
    objectTimer = setTimeout(clearProps, 8000);
  } catch (error) {
    if (attempt === version) status.textContent = error.message;
  } finally {
    if (attempt === version) { busy = false; updateControls(); }
  }
}

for (const topic of EXPLAIN_QUESTIONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = topic.label;
  button.disabled = true;
  button.addEventListener("click", () => { void ask(topic.prompt); });
  document.getElementById("topics").append(button);
}
document.getElementById("question-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("question");
  void ask(input.value.trim());
  input.value = "";
});
document.getElementById("direction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ready || busy) return;
  const instruction = document.getElementById("direction").value.trim();
  if (!instruction) return;
  try {
    await service.interact(buildReactorInteractPrompt(instruction));
    status.textContent = "Scene direction sent.";
  } catch (error) { status.textContent = error.message; }
});
