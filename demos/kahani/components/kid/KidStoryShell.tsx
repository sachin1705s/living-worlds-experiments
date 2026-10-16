"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CreateWorldParams } from "@reactor-models/happy-oyster";
import type { WorldIntent } from "@/lib/worlds";
import { requestDirector } from "@/src/director.js";
import {
  GENERIC_DECISION_TWO_POSE_TEXT,
  RECKLESS_MORAL_LINE,
  SELFISH_DEER_MEETING_WORLD_INSTRUCTION,
  SELFISH_DECISION_TWO_POSE_TEXT,
  SELFISH_MORAL_LINE,
} from "@/src/director-schema.js";
import { createNarrationController } from "@/src/narration.js";
import { NARRATION_CLIP_BY_KEY } from "@/src/narration-data.js";
import { STORY_WORLD_PARAMS, STORY_WORLD_PROMPT } from "@/src/world-contract.js";
import {
  computeDesiredWorldAudio,
  describeMediaElements,
  documentMediaElements,
  enforceWorldAudioState,
  ensureMutedLocks,
} from "@/src/world-audio.js";
import { resolveCaptionState } from "@/src/caption-state.js";
import { createNarrationGate } from "@/src/narration-gate.js";
import { shouldMountStoryVideo, reusableWorldId } from "@/src/story-session.js";
import { KidDecisionInput } from "./KidDecisionInput";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import { useVideoSlot } from "@/components/happy-oyster/ho-client";

const WORLD_AMBIENCE_VOLUME = 0.45;
// HappyOyster's one combined stream contains ambience and character sounds,
// so it must be silent while any narrator source is playing.
const NARRATION_DUCK_VOLUME = 0;
const NARRATION_VOLUME = 1;
// How long `live` must stay gone before a story run is considered truly
// over (exit/restart) rather than a transient streaming flicker.
const STORY_RUN_GRACE_MS = 900;
const DECISION_POSE_CLIP = NARRATION_CLIP_BY_KEY["decision-1-pose"];
const DECISION_POSE_TEXT = DECISION_POSE_CLIP.text;
const DECISION_2_POSE_LABEL = "decision-2 pose (runtime TTS)";
const REPROMPT_CLIP = NARRATION_CLIP_BY_KEY["bridge-unclear-reprompt"];
const REPROMPT_TEXT = REPROMPT_CLIP.text;
const TURN_OPEN_CHIME = "turn-open.wav";
const YOUR_TURN_TEXT = "Your turn! Tell the rabbit what to do!";
// How often the world-audio enforcer re-checks HappyOyster's video/audio
// elements against the desired mute state. A MutationObserver catches the
// SDK swapping in a fresh <video> node immediately; this interval is the
// backstop for a property-only reset (e.g. a re-render that doesn't replace
// the node) that no DOM mutation event would ever surface.
const WORLD_AUDIO_ENFORCE_MS = 150;

const STORY_PARAMS: CreateWorldParams = {
  prompt: STORY_WORLD_PROMPT,
  ...STORY_WORLD_PARAMS,
};

const STORY_INTENT: WorldIntent = {
  kind: "create",
  mode: "directing",
  title: "The Clever Rabbit and the Lion",
  params: STORY_PARAMS,
};

const JOURNEY_WORDS: Record<string, string> = {
  connect: "Finding the first page",
  request: "Making room for your idea",
  generate: "Setting the scene",
  stream: "Turning the page",
};

type StoryPhase =
  | "opening"
  | "decision_1_pose"
  | "your_turn_1"
  | "bridge_1"
  | "reprompt"
  | "consequence_1"
  | "decision_2_pose"
  | "your_turn_2"
  | "bridge_2"
  | "consequence_2"
  | "moral"
  | "ending"
  | "ended";

type StorySpirit = "clever" | "reckless" | "kind" | "selfish";
type DecisionNumber = 1 | 2;
type StoryClip = { filename: string; text: string };
type KidFlowDebugWindow = Window & {
  __KAHANI_FLOW_EVENTS__?: Array<{
    event: string;
    details: Record<string, unknown>;
    at: number;
  }>;
  __KAHANI_ACTIVE_NARRATOR__?: string | null;
  __KAHANI_AUDIO_TELEMETRY__?: Array<{
    event: string;
    narrator_gain: number | null;
    narrator_volume: number | null;
    world_volume: number | null;
    world_muted: boolean | null;
    active_source: string | null;
    overlap_count: number;
    at: number;
    details?: Record<string, unknown>;
  }>;
};

const CONSEQUENCE_DURATION_MS = 28_000;
// The finalization barrier: after decision 2's world_instruction is accepted
// and its consequence narrator line finishes, wait this long for the live
// world to actually render that final beat (the "roughly-four-second visual
// beat" the world contract promises, see src/world-contract.js) before the
// moral starts — otherwise the moral narrates over a stale, pre-instruction
// frame while the real final beat is still catching up behind it. The gate
// stays held (world stays ducked) for this whole wait — see startConsequence.
const FINAL_VISUAL_SETTLE_MS = 4_000;

function traceFlow(event: string, details: Record<string, unknown> = {}) {
  console.info(`[kahani] flow: ${event}`, details);
  if (typeof window !== "undefined") {
    const debugWindow = window as KidFlowDebugWindow;
    debugWindow.__KAHANI_FLOW_EVENTS__ ||= [];
    debugWindow.__KAHANI_FLOW_EVENTS__.push({ event, details, at: Date.now() });
  }
}

function mountedVideo(stage: HTMLDivElement | null): HTMLVideoElement | null {
  return stage?.querySelector<HTMLVideoElement>("video") ?? null;
}

function videoMetrics(video: HTMLVideoElement | null) {
  return video
    ? {
        volume: Number(video.volume.toFixed(3)),
        muted: video.muted,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        currentSrc: video.currentSrc || video.src || "",
      }
    : { volume: null, muted: null, readyState: null, videoWidth: null, currentSrc: "" };
}

function isTurnPhase(phase: StoryPhase): phase is "your_turn_1" | "your_turn_2" {
  return phase === "your_turn_1" || phase === "your_turn_2";
}

// Small, non-blocking status copy shown in a pill OUTSIDE the video frame.
// The live world must always stay visible — never cover it with an opaque
// overlay panel.
function phaseLabel(phase: StoryPhase, thinking: boolean): string | null {
  if (thinking) return "The rabbit is thinking…";
  switch (phase) {
    case "bridge_1":
    case "bridge_2":
      return "The rabbit is taking a brave breath… a new forest path is opening.";
    case "consequence_1":
    case "consequence_2":
      return "Your idea is changing the forest…";
    default:
      return null;
  }
}

function isStorySpirit(value: unknown): value is StorySpirit {
  return value === "clever" || value === "reckless" || value === "kind" || value === "selfish";
}

function dominantSpirit(spirits: StorySpirit[]): StorySpirit {
  if (spirits[0] === "selfish") {
    // The selfish first choice owns the second situation. Its second answer
    // is a causal outcome, not a vote in a two-spirit tally: warning or
    // distracting the lion is the reckless lucky escape; the remaining
    // authored selfish answers end in distrust and solitude.
    if (spirits[1] === "reckless") return "reckless";
    if (spirits[1] === "selfish") return "selfish";
  }
  // Decision 1 creates the situation; decision 2 resolves it and therefore
  // owns the moral. This avoids two different answers becoming an arbitrary
  // tie that always fell through to the clever ending.
  return spirits[1] || spirits[0] || "clever";
}

function decisionTwoPoseText(spirits: StorySpirit[]) {
  return spirits[0] === "selfish"
    ? SELFISH_DECISION_TWO_POSE_TEXT
    : GENERIC_DECISION_TWO_POSE_TEXT;
}

export function KidStoryShell({
  session,
  onBackToExperiments,
}: {
  session: WorldSession;
  onBackToExperiments?: () => void;
}) {
  const videoSlot = useVideoSlot();
  const [savedWorldId, setSavedWorldId] = useState<string | null | undefined>(
    undefined,
  );
  const [launchId, setLaunchId] = useState(0);
  const [leftStory, setLeftStory] = useState(false);
  const [sawSession, setSawSession] = useState(false);
  const openedLaunch = useRef(-1);
  const persistedWorldId = useRef<string | null>(null);
  const [startingStory, setStartingStory] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [needsReprompt, setNeedsReprompt] = useState(false);
  const [narrationPlaying, setNarrationPlaying] = useState(false);
  const [turnReady, setTurnReady] = useState(false);
  const [turnAnnouncement, setTurnAnnouncement] = useState(false);
  const [storyText, setStoryText] = useState(DECISION_POSE_TEXT);
  const [storyPhase, setStoryPhase] = useState<StoryPhase>("opening");
  const [consequenceProgress, setConsequenceProgress] = useState(0);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [turnCueVersion, setTurnCueVersion] = useState(0);
  // A still frame of the world, captured right before we deliberately end
  // the travel after the moral — the stable "last frame" backdrop for the
  // End screen, independent of whatever the live <video> element does once
  // the stream actually stops (freeze, black out, or get torn down).
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // One persistent, always-mounted <audio> element carries every authored
  // clip, dynamic Fish Audio TTS line, and turn chime. It is never recreated
  // mid-session — recreating a fresh Audio() after an async gap is exactly
  // what makes Chrome reject play(). Reusing one element also serializes
  // playback for free: setting a new .src while a previous play() is still
  // pending simply interrupts it, so only one narrator source is ever live.
  const narrationAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const narratorGainRef = useRef<GainNode | null>(null);
  const narratorCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const narrationRun = useRef(0);
  const narrationCleanup = useRef<(() => void) | null>(null);
  const activeNarrationLabel = useRef<string | null>(null);
  const narrationActiveCount = useRef(0);
  const narrationOverlapMax = useRef(0);
  const lastTurnChimeVersion = useRef(-1);
  const ambienceRamp = useRef<number | null>(null);
  const consequenceTimer = useRef<number | null>(null);
  const finalSettleTimer = useRef<number | null>(null);
  const currentDecision = useRef<DecisionNumber>(1);
  // Idempotent story sequencer state (KAH-013 follow-up). The opening
  // sequence must run exactly ONCE per actual story/travel — never replayed
  // because `live`/streaming flickers, StrictMode double-mounts, or an SDK
  // state change re-renders the shell. `storyRunStartedRef` latches the run;
  // it only resets when a live travel has truly gone away for longer than a
  // flicker (grace timer), i.e. on exit/restart.
  const storyRunStartedRef = useRef(false);
  const storyRunTokenRef = useRef(0);
  const liveGraceTimerRef = useRef<number | null>(null);
  const deliberateEndRef = useRef(false);
  const flowRequest = useRef(0);
  const spirits = useRef<StorySpirit[]>([]);
  const priorBeats = useRef<string[]>([]);
  // One id is shared by both child decisions. It is intentionally cleared
  // only by startStory(), which is the boundary for a genuinely new story.
  const playthroughId = useRef<string | null>(null);
  // Only used for prefetchDynamic(): a plain fetch to /api/narration cached
  // by line hash. It never owns an Audio element of its own.
  const narrationController = useRef<ReturnType<typeof createNarrationController> | null>(
    null,
  );

  const view = session.view;
  const live = view.kind === "traveling" && view.live;
  const mountVideo = shouldMountStoryVideo(view);
  const setRemoteAudioVolume = session.client.setRemoteAudioVolume;

  const recordAudioTelemetry = useCallback((event: string, details: Record<string, unknown> = {}) => {
    if (typeof window === "undefined") return;
    const debugWindow = window as KidFlowDebugWindow;
    const audio = narrationAudioElRef.current;
    const video = mountedVideo(stageRef.current);
    const worldElements = documentMediaElements([audio]);
    const worldAudio =
      worldElements.find((element) => element.srcObject || element.currentSrc) ??
      worldElements[0] ??
      video;
    const telemetry = {
      event,
      narrator_gain: narratorGainRef.current?.gain.value ?? null,
      narrator_volume: audio?.volume ?? null,
      world_volume: worldAudio?.volume ?? null,
      world_muted: worldAudio?.muted ?? null,
      active_source: activeNarrationLabel.current,
      overlap_count: Math.max(0, narrationActiveCount.current - 1),
      at: Date.now(),
      details,
    };
    narrationOverlapMax.current = Math.max(narrationOverlapMax.current, telemetry.overlap_count);
    debugWindow.__KAHANI_AUDIO_TELEMETRY__ ||= [];
    debugWindow.__KAHANI_AUDIO_TELEMETRY__.push(telemetry);
    traceFlow("audio_telemetry", telemetry);
  }, []);

  // The single source of truth for what HappyOyster's world audio should be
  // doing right now. `applyWorldAudioState` re-reads this every time it runs
  // (explicit transition, MutationObserver tick, or the interval backstop),
  // so any element the SDK swaps in later — mid-narration, mid-ramp, whenever
  // — gets corrected against the current target, not a stale one.
  const desiredWorldAudioRef = useRef(computeDesiredWorldAudio(NARRATION_DUCK_VOLUME));
  // The last media-inventory signature we logged, so the diagnostic below
  // fires on a real change (an element appearing/disappearing/moving
  // in-or-out of the stage) rather than spamming every enforcement tick.
  const lastMediaInventorySignature = useRef<string>("");

  // Every video/audio element HappyOyster's world audio could possibly be
  // coming from: document-wide, not just inside the stage. HappyOyster's own
  // docs describe a single stream on the one attached <video> element with
  // no separate audio API, but that's exactly the kind of claim worth
  // defending against in code — a nested dependency attaching a stray
  // element outside the stage subtree, or a transient swap our stage-scoped
  // query would miss between ticks, would otherwise leak silently past
  // every check we have. The persistent narrator <audio> element is the one
  // and only exclusion; it must never be muted or logged as "the leak".
  const worldMediaElements = useCallback(
    () => documentMediaElements([narrationAudioElRef.current]),
    [],
  );

  // Apply `desiredWorldAudioRef` to every HappyOyster video/audio element in
  // the document (see worldMediaElements above — not just inside the stage).
  // Muting is instant and always enforced; volume only ramps when `smooth`
  // starts a fade here, and the periodic re-assertion (see the effect below)
  // deliberately leaves volume alone while a fade owns it so it doesn't
  // fight/choppy-cut the transition.
  const applyWorldAudioState = useCallback((smooth: boolean) => {
    const elements = worldMediaElements();
    const desired = desiredWorldAudioRef.current;
    if (!elements.length) {
      traceFlow("video metrics", { target: desired.volume, mounted: false });
      return;
    }
    // The AliRTC remote track is also played through a detached <audio>
    // element. In audio-context playout mode its SDK-owned gain node is the
    // audible path, so the document media elements above cannot control it.
    // This call changes only HappyOyster's remote output; Fish narration uses
    // the separate persistent <audio> graph below.
    setRemoteAudioVolume(desired.volume);
    // Every element HappyOyster hands us gets its `.muted` pinned to
    // `desiredWorldAudioRef` at the property level (idempotent, no-op past
    // the first call per element) — the only thing that can defeat the
    // SDK's own `videoElement.muted = false` write on travel (re)bind,
    // which happens on the persisted node with no DOM mutation a
    // MutationObserver or polling interval could ever observe.
    ensureMutedLocks(elements, desiredWorldAudioRef);
    if (ambienceRamp.current !== null) {
      window.cancelAnimationFrame(ambienceRamp.current);
      ambienceRamp.current = null;
    }
    // Mute is always instant. Volume is instant only for a non-smooth call —
    // a smooth call must NOT have its volume forced here, or the ramp below
    // would start from (and immediately overwrite) an already-target value.
    enforceWorldAudioState(elements, desired, { ramping: smooth });
    if (!smooth) {
      traceFlow("video metrics", { target: desired.volume, ...videoMetrics(mountedVideo(stageRef.current)) });
      recordAudioTelemetry("world_volume", { target: desired.volume });
      return;
    }
    const initials = elements.map((element) => element.volume);
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 220);
      elements.forEach((element, index) => {
        if (!element.isConnected) return;
        element.volume = initials[index] + (desired.volume - initials[index]) * progress;
      });
      if (progress < 1) {
        ambienceRamp.current = window.requestAnimationFrame(animate);
      } else {
        ambienceRamp.current = null;
        traceFlow("video metrics", { target: desired.volume, ...videoMetrics(mountedVideo(stageRef.current)) });
        recordAudioTelemetry("world_volume", { target: desired.volume });
      }
    };
    ambienceRamp.current = window.requestAnimationFrame(animate);
  }, [recordAudioTelemetry, setRemoteAudioVolume, worldMediaElements]);

  const setWorldAmbienceVolume = useCallback((target: number, smooth = false) => {
    desiredWorldAudioRef.current = computeDesiredWorldAudio(target);
    applyWorldAudioState(smooth);
  }, [applyWorldAudioState]);

  // A narration CHAIN (every opening clip, or bridge -> consequence TTS ->
  // moral) must duck the world exactly once and hold it for every source in
  // that chain — never unmute-then-remute between chained sources. The hold
  // is a plain ref-backed gate (see src/narration-gate.js), not React
  // state: state updates aren't guaranteed to land before the very next
  // source's play() call, and a real (if brief) unmute between chained
  // sources is exactly the kind of gap a child can hear. `hold()` is
  // idempotent (a no-op once already held), so every source in a chain can
  // call it unconditionally; only the orchestrator that knows a chain has
  // truly ended (turn opening, error/cancel, or the final moral) calls
  // `release()`.
  const narrationGateRef = useRef<ReturnType<typeof createNarrationGate> | null>(null);
  if (!narrationGateRef.current) {
    // Lazy singleton, same pattern as narrationController.current below —
    // setWorldAmbienceVolume/recordAudioTelemetry are stable across renders
    // (their own dependency chains never change), so capturing them once
    // here is safe and avoids re-creating the gate (and losing its held
    // state) on every render.
    narrationGateRef.current = createNarrationGate({
      onAcquire: () => {
        setWorldAmbienceVolume(NARRATION_DUCK_VOLUME);
        recordAudioTelemetry("narration_gate_acquire");
      },
      onRelease: (reason: string) => {
        // The world is restored only when a child turn opens. During every
        // other phase it stays muted, including the silent visual-settle
        // window and the gap after a narrator source finishes. The gate has
        // already released its lease before this callback runs, so a restore
        // here can never occur while the narrator gate is held.
        const restoreForChildTurn = reason === "turn_opening" || reason === "turn_reopening";
        recordAudioTelemetry("narration_gate_release", {
          reason,
          restoreForChildTurn,
        });
        setWorldAmbienceVolume(
          restoreForChildTurn ? WORLD_AMBIENCE_VOLUME : NARRATION_DUCK_VOLUME,
          restoreForChildTurn,
        );
      },
    });
  }

  const holdNarrationGate = useCallback(() => {
    narrationGateRef.current?.hold();
  }, []);

  const releaseNarrationGate = useCallback((reason?: string) => {
    narrationGateRef.current?.release(reason);
  }, []);

  // Backstop against the SDK replacing/remounting HappyOyster's <video> (it
  // renders fresh elements with `muted={false}`) or otherwise resetting the
  // element's audio state without our knowledge. A MutationObserver catches
  // a node swap the instant it happens, immediately installing the mute
  // lock on the new node; the interval is a safety net for volume drift and
  // for installing the lock on any element the observer's childList/subtree
  // watch somehow missed. The mute lock itself (not this polling) is what
  // actually defeats HappyOyster's own same-node `videoElement.muted =
  // false` write on travel (re)bind — see lockMutedProperty in
  // src/world-audio.js for why polling alone can't catch that.
  useEffect(() => {
    if (!live) return;
    const reassert = () => {
      // Document-wide, not stage-scoped — see worldMediaElements above. A
      // stray element outside the stage (or a swap the stage-scoped
      // MutationObserver below would race) is exactly the case this
      // backstop exists to still catch, on the next 150ms tick at worst.
      const elements = worldMediaElements();
      if (!elements.length) return;
      // Re-apply the SDK output target after a remote user appears. AliRTC
      // creates the detached audio element lazily, after the DOM video may
      // already have been muted; this is what initializes/updates its own
      // AudioContext gain node.
      setRemoteAudioVolume(desiredWorldAudioRef.current.volume);
      ensureMutedLocks(elements, desiredWorldAudioRef);
      const changed = enforceWorldAudioState(elements, desiredWorldAudioRef.current, {
        ramping: ambienceRamp.current !== null,
      });
      if (changed) {
        recordAudioTelemetry("world_audio_reasserted", {
          elements: elements.length,
          desired: desiredWorldAudioRef.current,
        });
      }
      // Concise diagnostic: only logged when the inventory actually changes
      // (an element appears/disappears, or moves in/out of the stage), never
      // every tick. This is the decisive evidence for "which element is
      // HappyOyster's audio actually on" if a leak is ever reported again —
      // in particular whether anything with hasSrcObject=true ever shows up
      // with inStage=false.
      const inventory = describeMediaElements(elements, { stageRoot: stageRef.current });
      const signature = inventory
        .map((entry) => `${entry.tag}:${entry.inStage}:${entry.hasSrcObject}:${entry.muted}`)
        .join("|");
      if (signature !== lastMediaInventorySignature.current) {
        lastMediaInventorySignature.current = signature;
        recordAudioTelemetry("media_inventory", { inventory });
      }
    };
    reassert();
    const stage = stageRef.current;
    const observer = stage
      ? new MutationObserver(() => reassert())
      : null;
    if (stage && observer) {
      observer.observe(stage, { childList: true, subtree: true });
    }
    const interval = window.setInterval(reassert, WORLD_AUDIO_ENFORCE_MS);
    return () => {
      observer?.disconnect();
      window.clearInterval(interval);
    };
  }, [live, recordAudioTelemetry, setRemoteAudioVolume, worldMediaElements]);

  const setupNarratorAudioGraph = useCallback((audio: HTMLAudioElement) => {
    if (typeof window === "undefined" || audioContextRef.current) {
      if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume();
      return;
    }
    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const context = new AudioContextConstructor();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      // Keep Fish Audio clearly above the muted world while the compressor
      // prevents an unusually hot clip from clipping the child's ears.
      gain.gain.value = 1.1;
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      source.connect(gain).connect(compressor).connect(context.destination);
      audioContextRef.current = context;
      narratorGainRef.current = gain;
      narratorCompressorRef.current = compressor;
      if (context.state === "suspended") void context.resume();
      recordAudioTelemetry("narrator_graph_ready");
    } catch (error) {
      // A browser may reject MediaElementSource creation; the persistent
      // element remains a safe fallback and still uses the world mute.
      console.warn("[kahani] narrator Web Audio graph unavailable", error);
      recordAudioTelemetry("narrator_graph_unavailable", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }, [recordAudioTelemetry]);

  // Unlock the persistent narration element on the first real user gesture
  // (Start story tap, or a mic/turn interaction). This calls play() on the
  // SAME element every later narration line reuses, synchronously inside the
  // gesture's event handler — the one thing Chrome's autoplay policy actually
  // requires. A muted, near-silent authored clip is used so nothing audible
  // leaks out; it is paused and rewound the instant it starts.
  const unlockNarrationAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    const audio = narrationAudioElRef.current;
    if (!audio) return;
    audioUnlockedRef.current = true;
    setupNarratorAudioGraph(audio);
    const unlockSrc = `/clips/${TURN_OPEN_CHIME}`;
    // Only this unlock call is allowed to touch muted/currentTime — if real
    // narration has already claimed the element by the time this settles
    // (the unlock play() and a real playNarrationSource() call can race),
    // leave it alone.
    const stillUnlocking = () => audio.currentSrc.endsWith(unlockSrc) || audio.src.endsWith(unlockSrc);
    try {
      audio.muted = true;
      audio.src = unlockSrc;
      audio.load();
      Promise.resolve(audio.play())
        .then(() => {
          if (!stillUnlocking()) return;
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          traceFlow("audio_unlocked", {});
        })
        .catch((error) => {
          if (stillUnlocking()) audio.muted = false;
          const name = error instanceof Error ? error.name : "";
          traceFlow(name === "AbortError" ? "audio_unlock_superseded" : "audio_unlock_failed", {
            reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          });
        });
    } catch (error) {
      if (stillUnlocking()) audio.muted = false;
      traceFlow("audio_unlock_failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }, [setupNarratorAudioGraph]);

  if (!narrationController.current) {
    narrationController.current = createNarrationController();
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/world-id")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Saved world lookup failed (${response.status})`);
        const payload = (await response.json()) as { worldId?: unknown };
        if (active) {
          setSavedWorldId(typeof payload.worldId === "string" ? payload.worldId : null);
        }
      })
      .catch((error) => {
        console.error("[kahani] Saved world lookup failed; falling back to create", error);
        if (active) setSavedWorldId(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session.view.kind !== "traveling" || !session.view.live) {
      setThinking(false);
    }
  }, [session.view]);

  useEffect(() => {
    // HappyOysterVideo is mounted muted and the global gate owns the one
    // allowed transition to audible ambience. Opening and all narrator-led
    // phases therefore begin deterministically silent until a child turn.
    setWorldAmbienceVolume(NARRATION_DUCK_VOLUME);
    return () => {
      if (ambienceRamp.current !== null) {
        window.cancelAnimationFrame(ambienceRamp.current);
      }
    };
  }, [setWorldAmbienceVolume]);

  useEffect(() => {
    if (storyPhase !== "consequence_1") {
      setConsequenceProgress(0);
      return;
    }
    const startedAt = performance.now();
    const update = () => {
      setConsequenceProgress(
        Math.min(1, (performance.now() - startedAt) / CONSEQUENCE_DURATION_MS),
      );
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [storyPhase]);

  useEffect(() => {
    if (!live) {
      setVideoReady(false);
      // A transient stream-health note is useful while the live page is
      // opening, but it must never follow the child into the held end frame.
      setVideoNotice(null);
      return;
    }
    const inspectVideo = () => {
      const video = mountedVideo(stageRef.current);
      const metrics = videoMetrics(video);
      traceFlow("video metrics", metrics);
      if (!video || video.videoWidth === 0 || video.readyState < 2) {
        console.warn("[kahani] flow: video is not ready; retaining story UI", metrics);
        setVideoReady(false);
        setVideoNotice("The forest window is warming up… the story is still going.");
      } else {
        setVideoReady(true);
        setVideoNotice(null);
      }
    };
    inspectVideo();
    const interval = window.setInterval(inspectVideo, 2000);
    return () => window.clearInterval(interval);
  }, [live]);

  // NOTE: there is deliberately no `narrationPlaying`-driven effect here.
  // World ambience is owned exclusively by the narration gate
  // (holdNarrationGate/releaseNarrationGate): `narrationPlaying` toggles
  // false between every individual source (including mid-chain, e.g.
  // between opening clips, or during the multi-second final-visual-settle
  // wait before the moral), and reacting to it here would restore ambience
  // during those gaps — exactly the audible leak this gate exists to close.

  const startStory = () => {
    if (savedWorldId === undefined || startingStory) return;
    playthroughId.current = null;
    // This tap is the first real user gesture of the session — unlock the
    // one persistent narration <audio> element now, synchronously in this
    // handler, so every later clip/TTS/chime play() call (even ones fired
    // long after this async chain) is on an element Chrome already knows is
    // allowed to play with sound.
    unlockNarrationAudio();
    setStartError(null);
    if (savedWorldId) {
      session.run({
        kind: "attach",
        mode: "directing",
        encryptedWorldId: savedWorldId,
        title: "The Clever Rabbit and the Lion",
      });
      return;
    }

    setStartingStory(true);
    // The world is created straight from the authored docs/data/story.md
    // prompt — no firstFrameImage/style-anchor image is sent to
    // createWorld(). See scripts/create-or-attach-world.js --recreate for
    // the explicit, human-triggered way to build a fresh world from a
    // revised prompt.
    session.run({
      kind: "create",
      mode: "directing",
      title: "The Clever Rabbit and the Lion",
      params: STORY_PARAMS,
    });
    setStartingStory(false);
  };

  useEffect(() => {
    if (leftStory || savedWorldId === undefined || view.kind !== "browse") return;
    if (openedLaunch.current === launchId) return;
    openedLaunch.current = launchId;
    startStory();
  }, [leftStory, savedWorldId, view.kind, launchId]);

  useEffect(() => {
    if (view.kind !== "browse") setSawSession(true);
  }, [view.kind]);

  useEffect(() => {
    const id = reusableWorldId(session.client.worldState);
    if (!id || persistedWorldId.current === id) return;
    persistedWorldId.current = id;
    setSavedWorldId(id);
    void fetch("/api/world-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worldId: id, ready: true }),
    }).then((response) => {
      if (!response.ok) throw new Error(`World save failed (${response.status})`);
    }).catch((error) => {
      console.error("[kahani] Could not keep the built world", error);
      persistedWorldId.current = null;
    });
  }, [session.client.worldState]);

  // Stop whatever is currently on the shared element without starting
  // anything new. Used on unmount / when the world stops being live.
  const stopNarration = useCallback(() => {
    narrationRun.current += 1;
    narrationCleanup.current?.();
    narrationCleanup.current = null;
    const audio = narrationAudioElRef.current;
    try {
      audio?.pause();
    } catch {
      // Pausing an element mid-interruption can itself throw in some
      // browsers; there is nothing left to clean up either way.
    }
    if (activeNarrationLabel.current) {
      traceFlow("narration_end", { label: activeNarrationLabel.current, stopped: true });
      activeNarrationLabel.current = null;
      narrationActiveCount.current = Math.max(0, narrationActiveCount.current - 1);
      if (typeof window !== "undefined") {
        (window as KidFlowDebugWindow).__KAHANI_ACTIVE_NARRATOR__ = null;
      }
    }
    recordAudioTelemetry("narration_stopped");
    setNarrationPlaying(false);
    // Cancellation always releases the gate (a no-op if nothing was held) —
    // this is the "definitive cancel" release path.
    narrationGateRef.current?.release("stopped");
  }, [recordAudioTelemetry]);

  // Play one narration source (authored clip, dynamic TTS line, or turn
  // chime) on the single persistent element. Every source is serialized:
  // setting a new .src on the shared element interrupts whatever was playing
  // before it, so at most one narrator source is ever live.
  //
  // World-audio gating is intentionally the FIRST thing this function does —
  // before telemetry, before touching the narrator element, before any
  // React state — so a `narration_start` log always reflects a world that is
  // ALREADY ducked, never one caught mid-transition. Restoring ambience is
  // NOT this function's job: the gate is held across every source in a
  // chain (see holdNarrationGate/releaseNarrationGate above), and only the
  // orchestrator that knows a chain has truly ended calls
  // releaseNarrationGate — never `settle()` below.
  const playNarrationSource = useCallback(
    async (source: string, label: string, volume = NARRATION_VOLUME): Promise<boolean> => {
      // The short turn-open chime is not narration: it must NOT duck the
      // world and must never hold or release the narration gate. (The
      // cinematic veil itself no longer keys off "is narration playing" at
      // all — see the phase-driven `cinema` definition in the render below —
      // so this flag is purely about the world-audio gate now.)
      const isRealNarration = !label.startsWith("turn chime");
      if (isRealNarration) holdNarrationGate();
      unlockNarrationAudio();
      const audio = narrationAudioElRef.current;
      if (!audio) {
        traceFlow("narration_start", { label, mounted: false });
        return false;
      }
      const run = ++narrationRun.current;
      setupNarratorAudioGraph(audio);
      // A previous source may have been interrupted (its play() promise
      // rejects with AbortError) without ever firing 'ended'/'error' on this
      // shared element — drop its now-stale listeners before adding new ones.
      narrationCleanup.current?.();
      narrationCleanup.current = null;

      if (activeNarrationLabel.current) {
        traceFlow("narration_end", { label: activeNarrationLabel.current, stopped: true });
        narrationActiveCount.current = Math.max(0, narrationActiveCount.current - 1);
      }
      activeNarrationLabel.current = label;
      narrationActiveCount.current += 1;
      narrationOverlapMax.current = Math.max(
        narrationOverlapMax.current,
        Math.max(0, narrationActiveCount.current - 1),
      );
      if (typeof window !== "undefined") {
        (window as KidFlowDebugWindow).__KAHANI_ACTIVE_NARRATOR__ = label;
      }
      // Logged AFTER the gate is already held: telemetry for this event must
      // show the post-mute world state, not a stale pre-mute snapshot.
      traceFlow("narration_start", { label });
      recordAudioTelemetry("narration_start", { label });
      setNarrationPlaying(true);

      const settle = (playedFully: boolean) => {
        if (run !== narrationRun.current) return;
        if (activeNarrationLabel.current === label) {
          traceFlow("narration_end", { label, stopped: !playedFully });
          activeNarrationLabel.current = null;
          if (typeof window !== "undefined") {
            (window as KidFlowDebugWindow).__KAHANI_ACTIVE_NARRATOR__ = null;
          }
          narrationActiveCount.current = Math.max(0, narrationActiveCount.current - 1);
        }
        recordAudioTelemetry("narration_end", { label, playedFully });
        setNarrationPlaying(false);
        // No ambience restore here — see the function-level comment above.
      };

      const ended = new Promise<boolean>((resolve) => {
        const onEnded = () => {
          cleanup();
          resolve(true);
        };
        const onError = () => {
          cleanup();
          resolve(false);
        };
        const cleanup = () => {
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          if (narrationCleanup.current === cleanup) narrationCleanup.current = null;
        };
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        narrationCleanup.current = cleanup;
      });

      audio.muted = false;
      audio.preload = "auto";
      audio.volume = volume;
      if (narratorGainRef.current) narratorGainRef.current.gain.value = 1.1;
      audio.src = source;
      audio.load();
      try {
        await audio.play();
        console.info(`[kahani] narration audio path: ${label}`, { source });
      } catch (error) {
        // Surface the actual rejection reason (e.g. NotAllowedError,
        // AbortError from being interrupted by the next source) instead of
        // silently swallowing it.
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn("[kahani] narration audio could not play", { source, label, reason });
        traceFlow("narration_play_rejected", { label, reason });
        settle(false);
        return run === narrationRun.current;
      }
      const playedFully = await ended;
      settle(playedFully);
      return run === narrationRun.current;
    },
    [holdNarrationGate, recordAudioTelemetry, setupNarratorAudioGraph, unlockNarrationAudio],
  );

  const playStoryClip = useCallback(
    (clip: StoryClip) => playNarrationSource(`/clips/${clip.filename}`, `clip ${clip.filename}`),
    [playNarrationSource],
  );

  const playRuntimeNarration = useCallback(
    async (text: string, label: string): Promise<boolean> => {
      const controller = narrationController.current;
      if (!controller) return true;
      try {
        const source = await controller.prefetchDynamic(text);
        if (!source) return true;
        return await playNarrationSource(source, label);
      } catch (error) {
        console.warn(`[kahani] ${label} runtime TTS unavailable; continuing without audio`, error);
        traceFlow("runtime_tts_error", {
          label,
          reason: error instanceof Error ? error.message : String(error),
        });
        // No replacement clip is started. The caller owns the gate release,
        // and the story still advances when Fish Audio is unavailable.
        return true;
      }
    },
    [playNarrationSource],
  );

  const playDynamicNarrator = useCallback(
    async (line: string, requestId: number, prefetched?: Promise<string | null>) => {
      traceFlow("dynamic_tts_start", { requestId, chars: line.length });
      try {
        const source = await (prefetched || narrationController.current?.prefetchDynamic(line));
        if (!source) return;
        await playNarrationSource(source, "runtime TTS");
        traceFlow("dynamic_tts_end", { requestId });
      } catch (error) {
        // A valid director response still advances the story if runtime TTS is
        // unavailable; the static bridge and world remain the source of truth,
        // and no duplicate/overlapping audio is started in its place. Whether
        // the narration gate should release here depends on where this line
        // sits in its chain (decision-1's consequence window vs. decision-2's
        // run into the moral) — that's the caller's call, made via
        // releaseNarrationGate in startConsequence, not this function.
        console.warn("[kahani] runtime narrator line could not play", error);
        traceFlow("dynamic_tts_error", {
          requestId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [playNarrationSource],
  );

  // Decision 2 has no authored clip (see DECISION_2_POSE_TEXT above), so its
  // pose line always goes through the same runtime-TTS path the consequence
  // narrator lines use. If Fish Audio is unavailable, the pose is shown
  // silently and the turn still opens — semantically distinct silence beats
  // playing decision-1's words back as decision-2's.
  const playDecisionTwoPose = useCallback(
    (text: string) => playRuntimeNarration(text, DECISION_2_POSE_LABEL),
    [playRuntimeNarration],
  );

  const startDecisionPose = useCallback(
    async (decision: DecisionNumber) => {
      currentDecision.current = decision;
      setStoryPhase(decision === 1 ? "decision_1_pose" : "decision_2_pose");
      setTurnReady(false);
      setTurnAnnouncement(false);
      setNeedsReprompt(false);
      setThinking(false);
      const poseText = decision === 1 ? DECISION_POSE_TEXT : decisionTwoPoseText(spirits.current);
      setStoryText(poseText);
      traceFlow("decision pose started", { decision, text: poseText });
      const played =
        decision === 1
          ? await playStoryClip(DECISION_POSE_CLIP)
          : await playDecisionTwoPose(poseText);
      // The pose is the end of its chain either way — decision 1's opening
      // clips + pose, or decision 2's standalone pose — the child's turn is
      // about to open and the world must be audible for it.
      releaseNarrationGate(played ? "turn_opening" : "pose_failed");
      if (!played) return;
      setStoryPhase(decision === 1 ? "your_turn_1" : "your_turn_2");
      setStoryText(YOUR_TURN_TEXT);
      setTurnAnnouncement(true);
      setTurnReady(true);
      setTurnCueVersion((version) => version + 1);
      traceFlow("your turn opened", { decision });
    },
    [playStoryClip, playDecisionTwoPose, releaseNarrationGate],
  );

  // Freeze a still of the world right now, for the End screen's backdrop.
  // Independent of whatever the live element does once the travel actually
  // ends (freeze on its own, black out, or get torn down) — this is a
  // stable frame we own. Returns null (silently — the End screen just goes
  // without a frozen backdrop) if there's nothing to draw or the browser
  // refuses (e.g. a tainted-canvas error, which same-origin WebRTC/MSE
  // playback shouldn't hit, but a defensive fallback beats a thrown error).
  const captureLastFrame = useCallback((): string | null => {
    const video = mountedVideo(stageRef.current);
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.warn("[kahani] last-frame capture failed", error);
      return null;
    }
  }, []);

  const startMoralClose = useCallback(
    async (requestId: number) => {
      if (requestId !== flowRequest.current) return;
      const spirit = dominantSpirit(spirits.current);
      const clip = NARRATION_CLIP_BY_KEY[`moral-${spirit}`];
      const runtimeMoral = spirit === "selfish"
        ? SELFISH_MORAL_LINE
        : spirit === "reckless"
          ? RECKLESS_MORAL_LINE
          : null;
      setStoryPhase("moral");
      setTurnReady(false);
      setTurnAnnouncement(false);
      setNeedsReprompt(false);
      setThinking(false);
      setStoryText(runtimeMoral || clip.text);
      traceFlow("moral close started", {
        requestId,
        spirit,
        spirits: spirits.current,
        text: runtimeMoral || clip.text,
      });
      traceFlow("checkpoint_reached", { checkpoint: "CP4", requestId });
      const played = runtimeMoral
        ? await playRuntimeNarration(runtimeMoral, "moral runtime TTS")
        : await playStoryClip(clip);
      // The moral is the final narration and the final story boundary,
      // full stop — release unconditionally, whether it played cleanly or
      // not. Nothing after this point ever re-acquires the gate, issues
      // another world instruction, or opens another turn.
      releaseNarrationGate(played ? "story_ended" : "moral_failed");
      if (requestId !== flowRequest.current) return;
      // Freeze the frame and deliberately end the travel — this is the
      // final visual and nothing should keep generating past it. The
      // documented endTravelSession() path ends the active travel while
      // keeping the session and world; the world stays attachable afterward.
      // Tell the session hook this end is deliberate first, so its own
      // established-travel/phase-ended auto-exit (meant for a travel that
      // died on its own) doesn't also fire and yank the child back to
      // browse out from under the End screen we're about to show.
      const frame = captureLastFrame();
      if (frame) setLastFrameDataUrl(frame);
      deliberateEndRef.current = true;
      if (liveGraceTimerRef.current !== null) {
        window.clearTimeout(liveGraceTimerRef.current);
        liveGraceTimerRef.current = null;
      }
      setStoryPhase("ending");
      traceFlow("travel_end_start", { requestId });
      session.suppressAutoExit();
      try {
        await session.client.endTravelSession();
        traceFlow("travel_end_complete", { requestId });
      } catch (error) {
        traceFlow("travel_end_error", {
          requestId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      if (requestId !== flowRequest.current) return;
      // Always land on the End screen at this point, whether or not the
      // moral clip itself played cleanly — the travel is already being torn
      // down above, so the end state is stable even if the network call
      // reports an error.
      setStoryPhase("ended");
      setStoryText("The End");
      traceFlow("story ended", { requestId, spirit, moralPlayed: played });
    },
    [captureLastFrame, playRuntimeNarration, playStoryClip, releaseNarrationGate, session],
  );

  const startConsequence = useCallback(
    (
      decision: DecisionNumber,
      result: { narrator_line: string; spirit?: StorySpirit },
      requestId: number,
      prefetched?: Promise<string | null>,
    ) => {
      if (requestId !== flowRequest.current) return;
      setStoryPhase(decision === 1 ? "consequence_1" : "consequence_2");
      setTurnReady(false);
      setTurnAnnouncement(false);
      setNeedsReprompt(false);
      setThinking(false);
      setConsequenceProgress(0);
      setVideoNotice(null);
      setStoryText(result.narrator_line);
      // Hold through the bridge->TTS transition — the bridge clip that just
      // finished already holds the gate, but this call is what covers the
      // (sometimes real, network-bound) gap while the TTS line is still
      // being prefetched, before playNarrationSource ever runs for it.
      holdNarrationGate();
      traceFlow("consequence_start", {
        decision,
        requestId,
        durationMs: decision === 1 ? CONSEQUENCE_DURATION_MS : 0,
      });
      if (decision === 1) {
        if (consequenceTimer.current !== null) window.clearTimeout(consequenceTimer.current);
        consequenceTimer.current = window.setTimeout(() => {
          consequenceTimer.current = null;
          if (requestId !== flowRequest.current) return;
          traceFlow("consequence complete", { decision, requestId });
          const stageDecisionTwoSituation = async () => {
            if (result.spirit === "selfish" && spirits.current[0] === "selfish") {
              traceFlow("causal decision-2 setup start", {
                decision: 2,
                requestId,
                instruction: SELFISH_DEER_MEETING_WORLD_INSTRUCTION,
              });
              try {
                await session.client.instruct(SELFISH_DEER_MEETING_WORLD_INSTRUCTION);
                priorBeats.current = [
                  ...priorBeats.current,
                  "causal setup: the rabbit meets the deer he put in danger by the river, and the deer asks whether the lion is nearby",
                ];
                traceFlow("causal decision-2 setup accepted", { decision: 2, requestId });
              } catch (error) {
                console.error("[kahani] selfish deer-meeting world instruction failed", error);
                traceFlow("causal decision-2 setup failed", {
                  decision: 2,
                  requestId,
                  reason: error instanceof Error ? error.message : String(error),
                });
              }
            }
            if (requestId === flowRequest.current) void startDecisionPose(2);
          };
          void stageDecisionTwoSituation();
        }, CONSEQUENCE_DURATION_MS);
        // Decision 1's consequence is a real ~28s viewing window (see the
        // phase pill: "Your idea is changing the forest…") — the world must
        // be audible for it, so this chain ends the instant its TTS line does.
        void playDynamicNarrator(result.narrator_line, requestId, prefetched).finally(() => {
          releaseNarrationGate("consequence_1_viewing");
        });
      } else {
        void playDynamicNarrator(result.narrator_line, requestId, prefetched).finally(() => {
          if (requestId !== flowRequest.current) {
            releaseNarrationGate("stale_request");
            return;
          }
          // Finalization barrier: give the live world a bounded window to
          // actually render decision 2's final (reflection/well) beat before
          // the moral narrates over it. The gate stays held (world stays
          // ducked) through this wait — see FINAL_VISUAL_SETTLE_MS above —
          // there is deliberately no restore-to-ambience gap between this
          // TTS line and the moral that follows it.
          traceFlow("final_visual_settle_start", {
            requestId,
            durationMs: FINAL_VISUAL_SETTLE_MS,
          });
          if (finalSettleTimer.current !== null) window.clearTimeout(finalSettleTimer.current);
          finalSettleTimer.current = window.setTimeout(() => {
            finalSettleTimer.current = null;
            if (requestId !== flowRequest.current) {
              releaseNarrationGate("stale_request");
              return;
            }
            traceFlow("final_visual_settle_complete", { requestId });
            void startMoralClose(requestId);
          }, FINAL_VISUAL_SETTLE_MS);
        });
      }
    },
    [
      holdNarrationGate,
      playDynamicNarrator,
      releaseNarrationGate,
      session,
      startDecisionPose,
      startMoralClose,
    ],
  );

  const playReprompt = useCallback(
    async (reason: string, requestId: number) => {
      if (requestId !== flowRequest.current) return;
      setStoryPhase("reprompt");
      setNeedsReprompt(true);
      setThinking(false);
      setTurnReady(false);
      setTurnAnnouncement(false);
      setStoryText(REPROMPT_TEXT);
      traceFlow("reprompt path", {
        reason,
        requestId,
        decision: currentDecision.current,
      });
      const played = await playStoryClip(REPROMPT_CLIP);
      // The reprompt clip is a standalone one-source chain — the turn is
      // about to reopen, so the world must be audible for it either way.
      releaseNarrationGate(played ? "turn_reopening" : "reprompt_failed");
      if (!played || requestId !== flowRequest.current) return;
      setStoryPhase(currentDecision.current === 1 ? "your_turn_1" : "your_turn_2");
      setStoryText(YOUR_TURN_TEXT);
      setTurnAnnouncement(true);
      setTurnReady(true);
      setTurnCueVersion((version) => version + 1);
      traceFlow("reprompt turn reopened", {
        requestId,
        decision: currentDecision.current,
      });
    },
    [playStoryClip, releaseNarrationGate],
  );

  // ── Story sequencer (idempotent per story/travel) ────────────────────────
  // The opening → decision → consequence ladder must run exactly ONCE per
  // real story run. It is keyed by `storyRunStartedRef` and a monotonically
  // increasing token, so re-renders, StrictMode double-mounts, `live`
  // flickers, or SDK state changes can never replay "opening clip 1". The
  // run only resets when the live travel has been gone for longer than a
  // brief flicker window (grace timer) — i.e. on exit/restart.
  const sequencerRefs = useRef({ playStoryClip, startDecisionPose, stopNarration });
  sequencerRefs.current = { playStoryClip, startDecisionPose, stopNarration };

  const teardownStoryRun = useCallback(() => {
    deliberateEndRef.current = false;
    storyRunStartedRef.current = false;
    storyRunTokenRef.current += 1;
    if (consequenceTimer.current !== null) {
      window.clearTimeout(consequenceTimer.current);
      consequenceTimer.current = null;
    }
    if (finalSettleTimer.current !== null) {
      window.clearTimeout(finalSettleTimer.current);
      finalSettleTimer.current = null;
    }
    flowRequest.current += 1;
    sequencerRefs.current.stopNarration();
    setStoryPhase("opening");
    setTurnReady(false);
    setTurnAnnouncement(false);
  }, []);

  useEffect(() => {
    if (!live) {
      // A deliberate moral close owns the transition to the End screen. Do
      // not let the normal live-loss grace timer tear that screen back down
      // into the ready/browse state after endTravelSession completes.
      if (deliberateEndRef.current) {
        if (liveGraceTimerRef.current !== null) {
          window.clearTimeout(liveGraceTimerRef.current);
          liveGraceTimerRef.current = null;
        }
        return;
      }
      // Don't tear down instantly: transient live/streaming flickers (and
      // StrictMode's double mount) must not kill a running story. Wait out
      // a short grace window first; a flicker that returns cancels it.
      if (liveGraceTimerRef.current !== null) return;
      liveGraceTimerRef.current = window.setTimeout(() => {
        liveGraceTimerRef.current = null;
        teardownStoryRun();
      }, STORY_RUN_GRACE_MS);
      return;
    }
    if (liveGraceTimerRef.current !== null) {
      // Flicker recovered within the grace window — keep the running story.
      window.clearTimeout(liveGraceTimerRef.current);
      liveGraceTimerRef.current = null;
    }
    deliberateEndRef.current = false;
    if (storyRunStartedRef.current) return;
    storyRunStartedRef.current = true;
    const token = ++storyRunTokenRef.current;

    spirits.current = [];
    priorBeats.current = [];
    currentDecision.current = 1;
    if (typeof window !== "undefined") {
      const debugWindow = window as KidFlowDebugWindow;
      debugWindow.__KAHANI_FLOW_EVENTS__ = [];
      debugWindow.__KAHANI_AUDIO_TELEMETRY__ = [];
      debugWindow.__KAHANI_ACTIVE_NARRATOR__ = null;
    }
    setStoryPhase("opening");
    setTurnReady(false);
    setTurnAnnouncement(false);
    setNeedsReprompt(false);
    setStoryText(NARRATION_CLIP_BY_KEY["opening-1"].text);
    traceFlow("opening started", {});

    const { playStoryClip: playClip, startDecisionPose: startPose } =
      sequencerRefs.current;
    const playOpening = async () => {
      for (let sequence = 1; sequence <= 3; sequence += 1) {
        if (token !== storyRunTokenRef.current) return;
        const clip = NARRATION_CLIP_BY_KEY[`opening-${sequence}`];
        setStoryText(clip.text);
        traceFlow("opening clip", { sequence, filename: clip.filename });
        const played = await playClip(clip);
        if (!played || token !== storyRunTokenRef.current) return;
      }
      if (token === storyRunTokenRef.current) await startPose(1);
    };
    void playOpening();
  }, [live, teardownStoryRun]);

  // Final unmount teardown. Grace-based like the live-loss path: a
  // StrictMode simulated unmount/remount lands well inside the window and
  // keeps the running story intact, while a real unmount tears down audio.
  useEffect(
    () => () => {
      if (liveGraceTimerRef.current !== null) {
        window.clearTimeout(liveGraceTimerRef.current);
        liveGraceTimerRef.current = null;
      }
      if (ambienceRamp.current !== null) window.cancelAnimationFrame(ambienceRamp.current);
      liveGraceTimerRef.current = window.setTimeout(() => {
        liveGraceTimerRef.current = null;
        storyRunStartedRef.current = false;
        storyRunTokenRef.current += 1;
        if (consequenceTimer.current !== null) {
          window.clearTimeout(consequenceTimer.current);
          consequenceTimer.current = null;
        }
        if (finalSettleTimer.current !== null) {
          window.clearTimeout(finalSettleTimer.current);
          finalSettleTimer.current = null;
        }
        sequencerRefs.current.stopNarration();
      }, STORY_RUN_GRACE_MS);
    },
    [],
  );

  useEffect(() => {
    if (!turnReady || narrationPlaying || lastTurnChimeVersion.current === turnCueVersion) return;
    lastTurnChimeVersion.current = turnCueVersion;
    void playNarrationSource(`/clips/${TURN_OPEN_CHIME}`, `turn chime ${TURN_OPEN_CHIME}`, 0.55);
  }, [narrationPlaying, playNarrationSource, turnCueVersion, turnReady]);

  const handleDecision = async (text: string) => {
    if (!isTurnPhase(storyPhase)) {
      traceFlow("ignored submit outside turn", { phase: storyPhase });
      return;
    }
    const decision = currentDecision.current;
    const requestId = ++flowRequest.current;
    setNeedsReprompt(false);
    setThinking(true);
    setTurnReady(false);
    setTurnAnnouncement(false);
    setStoryPhase(decision === 1 ? "bridge_1" : "bridge_2");
    traceFlow("decision submitted", { decision, requestId, text });

    let result;
    try {
      result = await requestDirector({
        currentBeat: decision === 1 ? "decision_1" : "decision_2",
        priorBeats: priorBeats.current,
        kidText: text,
        playthroughId: playthroughId.current || undefined,
      }, {
        onPlaythroughId: (id) => {
          if (!playthroughId.current) {
            playthroughId.current = id;
            traceFlow("playthrough_id_captured", { id });
          }
        },
      });
    } catch (error) {
      if (requestId !== flowRequest.current) return;
      console.error("[kahani] director response failed; using reprompt", error);
      playReprompt("director request failed", requestId);
      return;
    }
    if (requestId !== flowRequest.current) {
      traceFlow("stale director response ignored", { decision, requestId });
      return;
    }
    traceFlow("director response", {
      decision,
      requestId,
      spirit: result.spirit,
      needsReprompt: result.needs_reprompt,
      checkpoint: result.checkpoint_reached,
      beatsUsedAfter: result.beats_used_after,
      playthroughId: playthroughId.current,
    });

    // A valid response is terminal for this request. In particular, do not
    // infer reprompt from stale React state or from a classified spirit.
    if (result.needs_reprompt === true) {
      playReprompt("director requested clarification", requestId);
      return;
    }

    const spirit: StorySpirit = isStorySpirit(result.spirit) ? result.spirit : "clever";
    if (!isStorySpirit(result.spirit)) {
      traceFlow("invalid spirit normalized for valid response", {
        decision,
        requestId,
        received: result.spirit,
        fallback: spirit,
      });
    }
    spirits.current = [...spirits.current, spirit];
    priorBeats.current = [
      ...priorBeats.current,
      `decision_${decision}: ${text} -> ${spirit}: ${result.narrator_line}`,
    ];
    setNeedsReprompt(false);
    setThinking(false);
    setStoryText(result.narrator_line);
    traceFlow("valid response advancing", {
      decision,
      requestId,
      spirit,
      spiritHistory: spirits.current,
    });
    traceFlow("instruct_start", { decision, requestId });
    const instruction = Promise.resolve().then(() =>
      session.client.instruct(result.world_instruction),
    );
    void instruction
      .then(() => {
        traceFlow("instruct_accepted", { decision, requestId });
      })
      .catch((error) => {
        console.error("[kahani] director world instruction failed", error);
        traceFlow("instruct_failed", {
          decision,
          requestId,
          reason: error instanceof Error ? error.message : String(error),
        });
      });

    traceFlow("dynamic_tts_prefetch_start", { decision, requestId });
    const ttsPrefetch = narrationController.current
      ? narrationController.current.prefetchDynamic(result.narrator_line)
      : Promise.resolve(null);
    const bridge = NARRATION_CLIP_BY_KEY[`bridge-${spirit}`];
    traceFlow("bridge_start", { decision, requestId, filename: bridge.filename, spirit });
    try {
      const bridgePlayed = await playStoryClip(bridge);
      traceFlow("bridge_end", { decision, requestId, played: bridgePlayed });
      if (!bridgePlayed || requestId !== flowRequest.current) return;
      startConsequence(decision, result, requestId, ttsPrefetch);
    } catch (error) {
      console.error("[kahani] bridge transition failed", error);
      traceFlow("bridge_end", {
        decision,
        requestId,
        played: false,
        reason: error instanceof Error ? error.message : String(error),
      });
      if (requestId === flowRequest.current) {
        startConsequence(decision, result, requestId, ttsPrefetch);
      }
    }
  };

  const handleSilence = useCallback(() => {
    if (!live || thinking || narrationPlaying || !turnReady || !isTurnPhase(storyPhase)) {
      return;
    }
    const requestId = ++flowRequest.current;
    playReprompt("twenty seconds without an answer", requestId);
  }, [live, narrationPlaying, playReprompt, storyPhase, thinking, turnReady]);

  const exitStory = useCallback(() => {
    deliberateEndRef.current = false;
    teardownStoryRun();
    // Keep the saved world. The next open attaches to it instead of building
    // the forest again.
    setStartingStory(false);
    session.exit();
  }, [session, teardownStoryRun]);

  const storyEnded = storyPhase === "ended";
  const storyClosing = storyPhase === "ending" || storyEnded;
  // Once we've deliberately ended the travel (see startMoralClose), `live`
  // goes false and `view.kind` moves on to "ready" — but the End screen
  // must stay put, not fade back to the quiet background treatment.
  const stageMode = live || storyClosing
    ? "is-live"
    : view.kind === "browse"
      ? "is-hidden"
      : "is-soft";
  const showStoryInput = live && !storyClosing;
  const hasDecisionPanel = showStoryInput && isTurnPhase(storyPhase);
  // Cinematic listen state is PHASE-driven, not audio-driven: the surrounding
  // story room goes dark whenever the child doesn't have to speak — opening, poses, bridges,
  // consequence viewing windows, the finalization settle wait, the moral —
  // not just the narrower moments a narrator source happens to be actively
  // playing. Tying it to "is audio playing right now" (the old
  // `cinemaNarrating` state) meant the veil flickered off during every
  // silent gap within a phase (the director-response wait, decision 1's
  // ~28s consequence window, the 4s pre-moral settle), which read as "the
  // cinematic effect isn't happening." Normal brightness is reserved for
  // the one thing it should be: the child's own turn. The video itself stays
  // at full brightness; only its surrounding room changes tone.
  const cinema = live && !isTurnPhase(storyPhase);
  // The child's turn: normal brightness, prominent mic/transcript cue.
  const turnCue = live && turnReady && !thinking && isTurnPhase(storyPhase);
  // Exactly one caption source at a time: the in-stage cinematic caption
  // while narrating, the below-stage prompt otherwise. Never both.
  const { stageCaption, belowCaption } = resolveCaptionState({
    showStoryInput,
    cinema,
    storyText,
  });

  return (
    <div className={`kid-app kid-shell kid-shell-${view.kind} ${cinema ? "is-cinematic" : "is-child-turn"}`}>
      {/* The one persistent narration audio element for the whole session.
         Every authored clip, dynamic TTS line, and turn chime plays through
         this same element; it is unlocked once by the first real user
         gesture (see unlockNarrationAudio) and never recreated. */}
      <audio ref={narrationAudioElRef} playsInline preload="auto" style={{ display: "none" }} />
      <KidHeader
        onLeave={view.kind === "browse" ? undefined : () => { setLeftStory(true); exitStory(); }}
        onBackToExperiments={onBackToExperiments}
      />
      <div
        className={`kid-live-layout ${live || storyClosing ? "is-active" : "is-quiet"} ${hasDecisionPanel ? "has-decision-panel" : ""}`}
      >
        <div
          className={`kid-video-stage-layer ${stageMode}`}
          aria-hidden={!live && !storyClosing}
        >
          <StoryStage
            videoSlot={videoSlot}
            mountVideo={mountVideo}
            live={live}
            videoReady={videoReady}
            fallbackFrame={session.seedFrame}
            frozenFrame={storyClosing ? lastFrameDataUrl ?? session.seedFrame : null}
            phaseLabel={phaseLabel(storyPhase, thinking)}
            consequence={storyPhase === "consequence_1"}
            consequenceProgress={consequenceProgress}
            cinema={cinema}
            caption={stageCaption}
            // Never carry a live-stream health note into the moral/end frame.
            videoNotice={live && !storyClosing ? videoNotice : null}
            stageRef={stageRef}
          />
        </div>

        {showStoryInput && (
          <main className={`kid-main kid-main-live ${turnCue ? "is-cue-active" : ""}`}>
            {belowCaption && (
              <p
                className={`kid-subtitle ${turnAnnouncement ? "is-turn-open" : ""}`}
                aria-live="polite"
              >
                {belowCaption}
              </p>
            )}
            {isTurnPhase(storyPhase) && (
              <KidDecisionInput
                thinking={thinking}
                needsReprompt={needsReprompt}
                narrationPlaying={narrationPlaying}
                turnReady={turnReady}
                onSilence={handleSilence}
                onFirstGesture={unlockNarrationAudio}
                onSubmit={handleDecision}
              />
            )}
          </main>
        )}
      </div>

      {view.kind === "browse" && !storyClosing && !leftStory && !sawSession && (
        <BuildingStory session={session} />
      )}
      {view.kind === "browse" && !storyClosing && (leftStory || sawSession) && (
        <main className="kid-main kid-centered-main">
          <div className="kid-recovery-card">
            <h1>{leftStory ? "The story is closed." : "The story didn’t open."}</h1>
            <button
              type="button"
              className="kid-start-button compact"
              onClick={() => {
                setLeftStory(false);
                setSawSession(false);
                openedLaunch.current = -1;
                setLaunchId((value) => value + 1);
              }}
            >
              Open the story
            </button>
            {startError && <p>{startError}</p>}
          </div>
        </main>
      )}
      {(view.kind === "connecting" || view.kind === "building") && !storyClosing && (
        <BuildingStory session={session} />
      )}
      {view.kind === "traveling" && !view.live && !storyClosing && (
        <BuildingStory session={session} openingStream />
      )}
      {view.kind === "error" && !storyClosing && (
        <RecoveryStory
          message={view.message}
          onRetry={session.retry}
          onLeave={exitStory}
        />
      )}
      {view.kind === "ready" && !storyClosing && (
        <ReadyStory onBegin={session.beginTravel} />
      )}
      {/* Decoupled from `live` on purpose: once we've deliberately ended the
         travel (startMoralClose), `live` goes false but the End screen we
         chose to show must not disappear with it. */}
      {storyEnded && (
        <EndStory
          onRestart={() => { setLeftStory(false); exitStory(); setLaunchId((value) => value + 1); }}
          onLeave={() => { setLeftStory(true); exitStory(); }}
        />
      )}
    </div>
  );
}

function BuildingStory({
  session,
  openingStream = false,
}: {
  session: WorldSession;
  openingStream?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const active = session.journey.find((step) => step.status === "active");
  const current = openingStream
    ? "Turning the page"
    : JOURNEY_WORDS[active?.key ?? "connect"];
  return (
    <main className="kid-main kid-loading-main">
      <div className="kid-loading-card">
        <div className="kid-loading-lamp" aria-hidden="true">
          <span className="kid-loading-flame" />
          <i />
        </div>
        <p className="kid-eyebrow">A new fable is taking shape</p>
        <h1>Opening the story…</h1>
        <p className="kid-loading-copy">
          {active?.key === "generate"
            ? "The forest is being built. Once it is ready, we’ll save it so future stories can open faster."
            : "Opening your forest and bringing the characters to life."}
        </p>
        <div className="kid-progress-story" aria-label={current}>
          <span className="kid-progress-leaf" aria-hidden="true">❧</span>
          <span>{current}{elapsed >= 10 ? ` · ${elapsed}s` : ""}</span>
        </div>
        {elapsed >= 30 && <p role="status">The story service is taking longer than usual. You can leave and try again later.</p>}
        <button type="button" onClick={session.exit}>Back to stories</button>
        <div className="kid-journey" aria-label="Story progress">
          {session.journey.map((step) => (
            <span
              key={step.key}
              className={`kid-journey-leaf ${step.status}`}
              title={JOURNEY_WORDS[step.key]}
            >❧</span>
          ))}
        </div>
      </div>
    </main>
  );
}

function EndStory({ onRestart, onLeave }: { onRestart: () => void; onLeave: () => void }) {
  return (
    <main className="kid-main kid-centered-main">
      <div className="kid-recovery-card kid-end-card">
        <div className="kid-end-ornament" aria-hidden="true">❧</div>
        <p className="kid-eyebrow">A story you helped make</p>
        <h1>The End</h1>
        <p>
          The forest will remember your brave idea. Its lesson belongs to you.
        </p>
        <div className="kid-recovery-actions">
          <button type="button" className="kid-start-button compact" onClick={onRestart}>
            Tell it again <span aria-hidden="true">↻</span>
          </button>
          <button type="button" className="kid-soft-button" onClick={onLeave}>
            Leave story
          </button>
        </div>
      </div>
    </main>
  );
}

function RecoveryStory({
  message,
  onRetry,
  onLeave,
}: {
  message: string;
  onRetry: () => void;
  onLeave: () => void;
}) {
  return (
    <main className="kid-main kid-centered-main">
      <div className="kid-recovery-card">
        <div className="kid-recovery-face" aria-hidden="true">🐇💭</div>
        <p className="kid-eyebrow">The forest is taking a tiny nap</p>
        <h1>Let’s try that again.</h1>
        <p>
          The rabbit is still here. We can wake the story up and keep going.
        </p>
        {message ? (
          <p className="kid-loading-copy">
            {/model not exist/i.test(message)
              ? "The story world is ready, but HappyOyster’s video service says that model does not exist."
              : message}
          </p>
        ) : null}
        <div className="kid-recovery-actions">
          <button type="button" className="kid-start-button compact" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="kid-soft-button" onClick={onLeave}>
            Back to the beginning
          </button>
        </div>
      </div>
    </main>
  );
}

function ReadyStory({ onBegin }: { onBegin: () => void }) {
  return (
    <main className="kid-main kid-centered-main">
      <div className="kid-recovery-card">
        <div className="kid-recovery-face" aria-hidden="true">🌳🐇</div>
        <p className="kid-eyebrow">The forest is ready</p>
        <h1>Let the adventure begin!</h1>
        <p>The rabbit has found the dusty path. Shall we go?</p>
        <button type="button" className="kid-start-button compact" onClick={onBegin}>
          Open the story
        </button>
      </div>
    </main>
  );
}

function KidHeader({
  onLeave,
  onBackToExperiments,
}: {
  onLeave?: () => void;
  onBackToExperiments?: () => void;
}) {
  if (!onLeave && !onBackToExperiments) return null;
  return (
    <header className="kid-header">
      <div className="kid-header-actions">
        {onBackToExperiments && (
          <button type="button" className="kid-leave-button" onClick={onBackToExperiments}>
            <span aria-hidden="true">←</span> All experiments
          </button>
        )}
        {onLeave && (
          <button type="button" className="kid-leave-button" onClick={onLeave}>
            <span aria-hidden="true">←</span> Leave story
          </button>
        )}
      </div>
    </header>
  );
}

function ForestPicture({ small = false }: { small?: boolean }) {
  return (
    <div className={`kid-forest-picture ${small ? "small" : ""}`} aria-hidden="true">
      <div className="kid-sun" />
      <div className="kid-cloud cloud-one" />
      <div className="kid-cloud cloud-two" />
      <div className="kid-tree tree-left">🌳</div>
      <div className="kid-tree tree-right">🌳</div>
      <div className="kid-path" />
      <div className="kid-well">◯</div>
      <div className="kid-character rabbit">🐇</div>
      <div className="kid-character lion">🦁</div>
      <div className="kid-leaf leaf-one">🍃</div>
      <div className="kid-leaf leaf-two">🍃</div>
    </div>
  );
}

function StoryStage({
  videoSlot,
  mountVideo,
  live,
  videoReady,
  fallbackFrame,
  frozenFrame,
  phaseLabel,
  consequence,
  consequenceProgress,
  cinema,
  caption,
  videoNotice,
  stageRef,
}: {
  videoSlot: React.ReactNode;
  /** The travel is opening or live; browse/building views stay unmounted. */
  mountVideo: boolean;
  live: boolean;
  /** The SDK video has real dimensions and can replace the stable fallback. */
  videoReady: boolean;
  /** First generated frame used while the stream opens or after a capture miss. */
  fallbackFrame: string | null;
  /** A captured last frame to show instead of the live video, once the
   * travel has been deliberately ended after the moral. */
  frozenFrame: string | null;
  phaseLabel: string | null;
  consequence: boolean;
  consequenceProgress: number;
  /** Cinematic listen state: dark surrounding room, world stays visible. */
  cinema: boolean;
  /** Small narrator caption shown during the cinematic listen state. */
  caption: string | null;
  videoNotice: string | null;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const frame = frozenFrame ?? (!live || !videoReady ? fallbackFrame : null);
  const showVideo = !frozenFrame && live && videoReady;
  const showFallback = !showVideo;
  return (
    <section className="kid-stage-wrap">
      <div
        className={`kid-stage ${cinema ? "is-cinema" : ""}`}
        data-stage-mode={cinema ? "cinematic" : "child-turn"}
        ref={stageRef}
      >
        {mountVideo && !frozenFrame && videoSlot}
        {showFallback && frame && (
          <img className="kid-stage-fallback-frame" src={frame} alt="" aria-hidden="true" />
        )}
        {showFallback && !frame && <div className="kid-stage-fallback" aria-hidden="true" />}
        <div className="kid-stage-shade" aria-hidden="true" />
        {/* The cinematic mode is carried by the dark room around this frame;
           the media itself stays clean and at full brightness. */}
        <div className={`kid-cinema-veil ${cinema ? "is-on" : ""}`} aria-hidden="true" />
        {videoNotice && (
          <div className="kid-video-health-note" role="status">{videoNotice}</div>
        )}
      </div>
      {(showVideo || caption) && (
        <div className="kid-stage-storybar">
          {caption && (
            <div className="kid-stage-caption" role="status" aria-live="polite">
              <span className="kid-stage-caption-mark" aria-hidden="true">“</span>
              <span>{caption}</span>
            </div>
          )}
        </div>
      )}
      {/* The live world stays fully visible. Phase copy is a small,
         storybook status note below the frame — never an opaque overlay. */}
      {phaseLabel && (
        <div className="kid-phase-pill-row">
          <div className="kid-phase-pill" role="status" aria-live="polite">
            <span>{phaseLabel}</span>
            {consequence && (
              <span className="kid-phase-progress" aria-label="The forest is changing">
                <span style={{ width: `${Math.round(consequenceProgress * 100)}%` }} />
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
