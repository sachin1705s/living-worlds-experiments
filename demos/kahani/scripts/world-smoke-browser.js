import { HappyOysterActionError, HappyOysterModel } from "@reactor-models/happy-oyster";
import {
  SMOKE_INSTRUCTION,
  STORY_WORLD_PARAMS,
  STORY_WORLD_PROMPT,
  WORLD_CONTRACT_VERSION,
} from "../src/world-contract.js";

// This path intentionally creates/attaches the same world contract used by
// the prebuild command. No first-frame/style-anchor image is supplied: the
// current official API documents that image as optional, and this project has
// no evidence that it improves continuity for this story.

const params = new URLSearchParams(window.location.search);
const existingWorldId = params.get("worldId") || "";
const turnAddress = params.get("turnAddress") || "";
const skipSmoke = params.has("skipSmoke");
const events = [];
let latestTravelState = null;
let worldId = existingWorldId || null;
let pivotObserved = false;
let pivotStatus = null;
let sdkStatus = null;

// Some headless Chromium builds bypass --host-resolver-rules for WebRTC's
// ICE resolver. The runner supplies the resolved Reactor TURN address; use it
// only in this smoke page so the SDK can establish the same real media path.
if (turnAddress && window.RTCPeerConnection) {
  const NativePeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = class SmokePeerConnection extends NativePeerConnection {
    constructor(configuration, ...rest) {
      const patched = configuration
        ? {
            ...configuration,
            iceServers: (configuration.iceServers || []).map((server) => ({
              ...server,
              urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).map((url) =>
                String(url).replace(/turn\.us-west-2\.aws\.prod\.reactor\.inc/g, turnAddress),
              ),
            })),
          }
        : configuration;
      super(patched, ...rest);
    }
  };
}

function errorCode(error) {
  if (error instanceof HappyOysterActionError) return error.code;
  const match = String(error?.message || error).match(/\[([^\]]+)\]/);
  return error?.code || match?.[1] || null;
}

function errorAdvice(code) {
  return {
    TRAVELING: "End the current travel before changing worlds.",
    BUSY: "Wait for the current world action to finish, then retry.",
    NO_WORLD: "Create or attach a world before starting travel.",
    WORLD_NOT_READY: "Wait for the world build to reach ready.",
    MODE_MISMATCH: "Use the directing model for this directing world.",
    "403001": "The saved world id is stale or belongs to another account.",
    "403004": "The world prompt or instruction was rejected by the model gate.",
    "403005": "The prompt was rejected by the content gate.",
  }[code] || "Inspect the full error and retry the smoke test.";
}

function recordTravelState(state) {
  latestTravelState = state;
  const entry = state?.user_instructions?.find(
    (candidate) => candidate.instruction === SMOKE_INSTRUCTION,
  );
  if (entry && (entry.status === "executed" || entry.status === "completed")) {
    pivotObserved = true;
    pivotStatus = entry.status;
  }
}

function waitFor(predicate, timeoutMs, intervalMs = 250) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

async function getToken() {
  const response = await fetch("/api/token", { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.jwt) {
    throw new Error(body.error || `Token request failed (${response.status})`);
  }
  return body.jwt;
}

async function emitResult(result) {
  const response = await fetch("/api/world-smoke-result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!response.ok) throw new Error(`Smoke result POST failed (${response.status})`);
  document.body.textContent = JSON.stringify(result, null, 2);
}

async function main() {
  const video = document.querySelector("#world-video");
  const model = new HappyOysterModel({
    mode: "directing",
    videoElement: video,
    logLevel: "warn",
  });
  const statusListener = (status) => {
    sdkStatus = status;
    events.push(`sdk:${status}`);
  };
  model.on("statusChanged", statusListener);
  const offStatus = () => model.off("statusChanged", statusListener);
  const offPhase = model.onPhaseChanged((phase) => events.push(`phase:${phase}`));
  const offWorld = model.onWorldState((state) => {
    events.push(`world:${state.phase}`);
    if (state.encrypted_world_id) worldId = state.encrypted_world_id;
  });
  const offTravel = model.onTravelState((state) => {
    recordTravelState(state);
    events.push(`travel:${state.status}`);
  });

  try {
    await model.connect(getToken);
    const world = existingWorldId
      ? await model.attachWorld(existingWorldId)
      : await model.createWorld({
          prompt: STORY_WORLD_PROMPT,
          ...STORY_WORLD_PARAMS,
        });
    worldId = world.encrypted_world_id || worldId;
    if (!worldId) throw new Error("World became ready without encrypted_world_id");
    if (skipSmoke) {
      if (world.phase !== "ready") throw new Error(`World did not reach ready (phase: ${world.phase})`);
      await model.disconnect();
      offPhase();
      offWorld();
      offTravel();
      offStatus();
      emitResult({
        ok: true,
        worldId,
        worldPhase: world.phase,
        reattached: Boolean(existingWorldId),
        skippedSmoke: true,
        worldContractVersion: WORLD_CONTRACT_VERSION,
        sdkStatus,
        events,
      });
      return;
    }

    const travel = await model.startTravel();
    const videoReady = await waitFor(
      () => video.readyState >= 2 && video.videoWidth > 0 && !video.paused,
      60_000,
    );
    const audioTracks = video.srcObject?.getAudioTracks?.() || [];
    const ambienceAudible =
      videoReady && !video.muted && !video.paused && audioTracks.length > 0;
    const instructionResult = await model.instruct(SMOKE_INSTRUCTION);
    const instructionAccepted = instructionResult?.accepted === true;
    const executedBeforeTimeout = await waitFor(() => pivotObserved, 30_000);
    if (!pivotObserved && latestTravelState) {
      const entry = latestTravelState.user_instructions?.find(
        (candidate) => candidate.instruction === SMOKE_INSTRUCTION,
      );
      pivotStatus = entry?.status || null;
    }

    await model.endTravelSession();
    await model.disconnect();
    offPhase();
    offWorld();
    offTravel();
    offStatus();
    await emitResult({
      ok: Boolean(worldId && instructionAccepted && executedBeforeTimeout && ambienceAudible),
      worldContractVersion: WORLD_CONTRACT_VERSION,
      worldId,
      reattached: Boolean(existingWorldId),
      travelStarted: Boolean(travel),
      videoReady,
      audioTrackCount: audioTracks.length,
      ambienceAudible,
      instructionAccepted,
      pivotObserved,
      pivotStatus,
      sdkStatus,
      events,
    });
  } catch (error) {
    const code = errorCode(error);
    await model.endTravelSession().catch(() => {});
    await model.disconnect().catch(() => {});
    offPhase();
    offWorld();
    offTravel();
    offStatus();
    await emitResult({
      ok: false,
      worldId,
      reattached: Boolean(existingWorldId),
      error: String(error?.message || error),
      code,
      advice: errorAdvice(code),
      phase: model.phase,
      worldPhase: model.worldState?.phase || null,
      sdkStatus,
      events,
    });
  }
}

void main();
