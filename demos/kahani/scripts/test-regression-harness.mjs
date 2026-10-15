// Drive the REAL check logic from public/tests/kid-story-regression.html
// against synthetic flow-event fixtures by stubbing the DOM surface it uses.
import { readFileSync } from "node:fs";
import { resolveCaptionState } from "../src/caption-state.js";
import {
  computeDesiredWorldAudio,
  describeMediaElements,
  documentMediaElements,
  enforceWorldAudioState,
  lockMutedProperty,
  stageMediaElements,
} from "../src/world-audio.js";
import { setAliRtcRemoteAudioVolume } from "../src/ali-rtc-audio.js";
import { createNarrationGate } from "../src/narration-gate.js";
import {
  readFailureCode,
  shouldMountStoryVideo,
} from "../src/story-session.js";

const html = readFileSync("public/tests/kid-story-regression.html", "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeHarness() {
  const bound = {};
  const mk = (id) => {
    const store = { text: "", cls: "" };
    const node = {
      addEventListener: (ev, fn) => { bound[`${id}:${ev}`] = fn; },
    };
    Object.defineProperty(node, "textContent", { get: () => store.text, set: (v) => { store.text = String(v); } });
    Object.defineProperty(node, "className", { get: () => store.cls, set: (v) => { store.cls = String(v); } });
    return node;
  };
  const elements = new Map([
    ["#open", mk("#open")],
    ["#check", mk("#check")],
    ["#result", mk("#result")],
  ]);
  global.document = { querySelector: (sel) => elements.get(sel) };
  global.window = { open: () => null };
  new Function(script)();
  return {
    setResultWindow(win) { global.window.open = () => win; },
    open() { bound["#open:click"](); },
    check() { bound["#check:click"](); return elements.get("#result").textContent; },
  };
}

let seq = 0;
const ev = (event, details = {}) => ({ event, details, at: seq++ * 100 });
const narr = (label) => [ev("narration_start", { label }), ev("narration_end", { label })];
const clip = (name) => narr(`clip ${name}`);
const DECISION_TWO_POSE_LABEL = "decision-2 pose (runtime TTS)";
// The narration gate reports as an "audio_telemetry" flow event whose
// details carry the actual gate event — matching recordAudioTelemetry's
// real shape (traceFlow("audio_telemetry", telemetry)).
const gateAcquire = () => ev("audio_telemetry", { event: "narration_gate_acquire" });
const gateRelease = (reason) => ev("audio_telemetry", { event: "narration_gate_release", reason });
const worldVolume = (target) => ev("audio_telemetry", {
  event: "world_volume",
  world_muted: target <= 0.001,
  world_volume: target,
  details: { target },
});

function goldenRun() {
  const events = [
    ev("opening started"),
    // Opening clips 1-3 + the decision-1 pose are ONE chain: acquired once,
    // released once, right before the turn opens — never restored in between.
    gateAcquire(),
    ev("opening clip", { sequence: 1 }), ...clip("opening-1.mp3"),
    ev("opening clip", { sequence: 2 }), ...clip("opening-2.mp3"),
    ev("opening clip", { sequence: 3 }), ...clip("opening-3.mp3"),
    ev("decision pose started", { decision: 1 }), ...clip("decision-1-pose.mp3"),
    gateRelease("turn_opening"), worldVolume(0.45),
    ev("your turn opened", { decision: 1 }),
    ev("decision submitted", { decision: 1, text: "Tell him to eat someone else" }),
    ev("director response", { decision: 1, spirit: "selfish", needsReprompt: false, checkpoint: "CP2", beatsUsedAfter: 1 }),
    ev("valid response advancing", { decision: 1 }),
    ev("instruct_start"), ev("instruct_accepted"),
    ev("dynamic_tts_prefetch_start"),
    // Bridge + decision-1's consequence TTS are ONE chain. The gate is
    // released after the TTS line, but the world remains muted until the
    // next child turn opens.
    gateAcquire(),
    ev("bridge_start"), ...clip("bridge-selfish.mp3"), ev("bridge_end"),
    ev("consequence_start", { decision: 1, durationMs: 28000 }),
    ...narr("runtime TTS"),
    gateRelease("consequence_1_viewing"), worldVolume(0),
    ev("consequence complete"),
    ev("causal decision-2 setup start", { decision: 2 }),
    ev("causal decision-2 setup accepted", { decision: 2 }),
    ev("decision pose started", { decision: 2, text: "The lion is coming toward the river. The rabbit meets the deer he put in danger, who asks whether the lion is nearby. What should the rabbit do next?" }),
    // Decision 2's pose is its own standalone one-source chain.
    gateAcquire(),
    ...narr(DECISION_TWO_POSE_LABEL),
    gateRelease("turn_opening"), worldVolume(0.45),
    ev("your turn opened", { decision: 2 }),
    ev("decision submitted", { decision: 2, text: "do not do anything" }),
    ev("director response", { decision: 2, spirit: "unclear", needsReprompt: true, checkpoint: "CP2", beatsUsedAfter: 1 }),
    ev("reprompt path", { decision: 2, reason: "director requested clarification" }),
    gateAcquire(), ...clip("bridge-unclear-reprompt.mp3"), gateRelease("turn_reopening"),
    ev("reprompt turn reopened", { decision: 2 }),
    ev("decision submitted", { decision: 2, text: "Tell the deer it is safe now" }),
    ev("director response", { decision: 2, spirit: "selfish", needsReprompt: false, checkpoint: "CP3", beatsUsedAfter: 2 }),
    ev("valid response advancing", { decision: 2 }),
    ev("instruct_start"), ev("instruct_accepted"),
    ev("dynamic_tts_prefetch_start"),
    // Bridge + decision-2's consequence TTS + the finalization settle wait +
    // the moral are ALL one chain: held through the settle window, released
    // only after the moral is the definitive final narration.
    gateAcquire(),
    ev("bridge_start"), ...clip("bridge-selfish.mp3"), ev("bridge_end"),
    ev("consequence_start", { decision: 2, durationMs: 0 }),
    ...narr("runtime TTS"),
    ev("final_visual_settle_start", { durationMs: 4000 }),
    ev("final_visual_settle_complete"),
    ev("moral close started", { spirit: "selfish", text: "The rabbit stayed safe, but the forest stopped trusting him, so he ended alone." }), ev("checkpoint_reached", { checkpoint: "CP4" }),
    ...narr("moral runtime TTS"),
    gateRelease("story_ended"), worldVolume(0),
    // The travel is deliberately ended right after the moral — a real
    // stopped generation, not a permanent live stream left running past the
    // story's intended close — and The End follows the completed end call.
    ev("travel_end_start"),
    ev("travel_end_complete"),
    ev("story ended"),
  ];
  const ducked = (source) => ({
    event: "narrator_duck", narrator_gain: 1.1, world_volume: 0,
    world_muted: true, active_source: source, overlap_count: 0,
    at: Date.now(), details: {},
  });
  const restored = () => ({
    event: "world_volume", narrator_gain: 1.1, world_volume: 0.45,
    world_muted: false, active_source: null, overlap_count: 0,
    at: Date.now(), details: { target: 0.45 },
  });
  const telemetry = [
    ducked("clip opening-1.mp3"),
    { ...ducked("clip bridge-selfish.mp3"), overlap_count: 0 },
    restored(),
  ];
  return { events, telemetry };
}

const restartLoop = (() => {
  const g = goldenRun();
  // old bug: sequencer restarted, replaying "opening started" + opening clip 1
  g.events.push(ev("opening started"), ev("opening clip", { sequence: 1 }));
  return g;
})();

const pauseAttempt = (() => {
  const g = goldenRun();
  g.events.push(
    ev("pause_capability_probe"),
    ev("world_paused_for_narration"),
    ev("world_resumed_for_turn"),
  );
  return g;
})();

const worldRestoresWhileNarrating = (() => {
  const g = goldenRun();
  const acquire = g.events.findIndex(
    (entry) =>
      entry.event === "audio_telemetry" &&
      entry.details?.event === "narration_gate_acquire",
  );
  g.events.splice(acquire + 1, 0, worldVolume(0.45));
  return g;
})();

const repromptAfterValid = (() => {
  const g = goldenRun();
  const validIndex = g.events.findIndex(
    (x) => x.event === "valid response advancing" && x.details.decision === 1,
  );
  g.events.splice(validIndex + 1, 0, ev("reprompt path", { decision: 1 }));
  return g;
})();

const overlappingNarration = (() => {
  const g = goldenRun();
  const firstStart = g.events.findIndex((x) => x.event === "narration_start");
  g.events.splice(firstStart + 1, 0, ev("narration_start"));
  g.telemetry[1] = { ...g.telemetry[1], overlap_count: 1 };
  return g;
})();

const duplicateBridge = (() => {
  const g = goldenRun();
  const i = g.events.findIndex((x) => x.event === "bridge_end");
  g.events.splice(i, 0, ev("bridge_start"));
  return g;
})();

const thirdPrompt = (() => {
  const g = goldenRun();
  g.events.push(ev("decision pose started", { decision: 3 }));
  return g;
})();

// KAH-015 regression: decision 2's pose used to reuse the decision-1 clip
// verbatim instead of going through runtime TTS — the child heard the
// decision-1 line twice while different text was on screen.
const decisionTwoReplaysDecisionOneAudio = (() => {
  const g = goldenRun();
  const i = g.events.findIndex(
    (x) => x.event === "narration_start" && x.details?.label === DECISION_TWO_POSE_LABEL,
  );
  // Replace just the decision-2 pose's own narration pair with a replay of
  // the decision-1 static clip — the exact old bug. The gate acquire/release
  // bracketing it are untouched.
  g.events.splice(i, 2, ...clip("decision-1-pose.mp3"));
  return g;
})();

// KAH-015 follow-up regression: every telemetry-visible "narration_start" on
// every day used to duck-then-restore individually — the world unmuted
// briefly between every chained source (opening clips, bridge->TTS,
// TTS->moral), which is audible even though it only lasts a JS tick.
const perSourceDuckRestore = (() => {
  const g = goldenRun();
  // Replace the chain-level gate events with one acquire/release PER
  // narration source, exactly like the old per-source duck/restore did.
  const rebuilt = [];
  for (const entry of g.events) {
    if (entry.event === "audio_telemetry" && entry.details?.event === "narration_gate_acquire") continue;
    if (entry.event === "audio_telemetry" && entry.details?.event === "narration_gate_release") continue;
    if (entry.event === "narration_start") rebuilt.push(gateAcquire(), entry);
    else if (entry.event === "narration_end") {
      rebuilt.push(entry, gateRelease("chain_complete"));
    } else rebuilt.push(entry);
  }
  g.events = rebuilt;
  return g;
})();

// KAH-015 follow-up regression: the moral used to start immediately after
// the decision-2 consequence TTS ended, with the world still generating the
// final beat the moral was narrating over.
const noFinalizationSettle = (() => {
  const g = goldenRun();
  const settleStart = g.events.findIndex((x) => x.event === "final_visual_settle_start");
  const settleComplete = g.events.findIndex((x) => x.event === "final_visual_settle_complete");
  g.events.splice(settleStart, settleComplete - settleStart + 1);
  return g;
})();

// KAH-015 follow-up regression: a further world instruction (or another
// decision pose) fired after the moral had already started/closed the story.
const instructionAfterMoral = (() => {
  const g = goldenRun();
  const moralIndex = g.events.findIndex((x) => x.event === "moral close started");
  g.events.splice(moralIndex + 1, 0, ev("instruct_start"));
  return g;
})();

// KAH-015 follow-up regression: an automatic phase continuation (another
// decision pose) fired after the story had already reached "The End".
const poseAfterStoryEnded = (() => {
  const g = goldenRun();
  g.events.push(ev("decision pose started", { decision: 1 }));
  return g;
})();

// KAH-015 follow-up regression: the live world kept generating past the
// moral because nothing ever told HappyOyster to stop — no
// endTravelSession() call, so no travel_end_start telemetry at all.
const noTravelEnd = (() => {
  const g = goldenRun();
  g.events = g.events.filter((entry) => !entry.event.startsWith("travel_end"));
  return g;
})();

const fixtures = [
  ["golden full run", goldenRun(), true],
  ["restart loop (flicker replay)", restartLoop, false],
  ["pause/resume attempt recorded", pauseAttempt, false],
  ["world restores while narration gate is held", worldRestoresWhileNarrating, false],
  ["reprompt after valid decision-1 selfish response", repromptAfterValid, false],
  ["overlapping narration", overlappingNarration, false],
  ["duplicate bridge on decision 1", duplicateBridge, false],
  ["third question prompt appears", thirdPrompt, false],
  ["decision 2 replays decision 1 pose audio", decisionTwoReplaysDecisionOneAudio, false],
  ["world restores between every chained source (old per-source duck)", perSourceDuckRestore, false],
  ["moral starts with no finalization settle window", noFinalizationSettle, false],
  ["a world instruction fires after the moral begins", instructionAfterMoral, false],
  ["another decision pose fires after the story ends", poseAfterStoryEnded, false],
  ["travel is never deliberately ended after the moral", noTravelEnd, false],
];

let failures = 0;

for (const [name, fixture, shouldPass] of fixtures) {
  const harness = makeHarness();
  harness.setResultWindow({
    __KAHANI_FLOW_EVENTS__: fixture.events,
    __KAHANI_AUDIO_TELEMETRY__: fixture.telemetry,
  });
  harness.open();
  const out = harness.check();
  const failedLines = out.split("\n").filter((l) => l.startsWith("FAIL"));
  if (shouldPass && failedLines.length) {
    failures++;
    console.log(`UNEXPECTED FAILURE on "${name}":\n${out}`);
  } else if (!shouldPass && !failedLines.length) {
    failures++;
    console.log(`HARNESS GAP — "${name}" was NOT caught:\n${out}`);
  } else if (!shouldPass) {
    console.log(`OK "${name}" caught -> ${failedLines.join(" | ")}`);
  } else {
    console.log(`PASS "${name}": all ${out.split("\n").length} checks green`);
  }
}

// ── caption exclusivity (KAH-015) ────────────────────────────────────────
// Exactly one caption source at a time: never both the in-stage cinematic
// caption and the below-stage prompt.
function check(name, condition) {
  if (condition) {
    console.log(`PASS "${name}"`);
  } else {
    failures++;
    console.log(`FAIL "${name}"`);
  }
}

// ── startup video mount (KAH-016) ───────────────────────────────────────
// HappyOyster waits for <HappyOysterVideo /> before startTravel() can become
// streaming. The story shell must therefore mount it for every traveling view,
// including the startup view whose `live` flag is still false.
const NO_VIDEO_ELEMENT_ERROR =
  "No video element: pass videoElement in the constructor, call attachVideo(), or mount <HappyOysterVideo /> first";
const startupView = { kind: "traveling", live: false };
const mountedTravelView = { kind: "traveling", live: true };
const noTravelView = { kind: "building" };

check(
  "startup video: traveling startup mounts the SDK video before streaming",
  shouldMountStoryVideo(startupView),
);
check(
  "startup video: live travel keeps the SDK video mounted",
  shouldMountStoryVideo(mountedTravelView),
);
check(
  "startup video: building view does not mount a travel video",
  !shouldMountStoryVideo(noTravelView),
);

const startTravelFixture = async (videoMounted) => {
  if (!videoMounted) throw new Error(NO_VIDEO_ELEMENT_ERROR);
  return { streaming: true };
};
const startupTravelResult = await startTravelFixture(shouldMountStoryVideo(startupView));
check(
  "startup video: mounted startup path avoids the SDK no-video rejection",
  startupTravelResult.streaming === true,
);
const noVideoRejection = await startTravelFixture(false).catch((cause) => cause);
check(
  "startup video: an SDK no-video rejection remains an observable failure",
  noVideoRejection instanceof Error && noVideoRejection.message === NO_VIDEO_ELEMENT_ERROR,
);

const codedFailure = new Error("stream failed");
codedFailure.code = 10020105;
check(
  "session failure: machine-readable numeric cause.code is retained",
  readFailureCode(codedFailure) === 10020105,
);
check(
  "session failure: uncoded failures remain explicitly uncoded",
  readFailureCode(new Error("stream failed")) === null,
);

for (const cinema of [true, false]) {
  for (const showStoryInput of [true, false]) {
    const { stageCaption, belowCaption } = resolveCaptionState({
      showStoryInput,
      cinema,
      storyText: "The rabbit is thinking of a plan.",
    });
    check(
      `caption exclusivity: showStoryInput=${showStoryInput} cinema=${cinema} never renders both`,
      !(stageCaption && belowCaption),
    );
    if (!showStoryInput) {
      check(
        `caption exclusivity: no caption when story isn't live (cinema=${cinema})`,
        stageCaption === null && belowCaption === null,
      );
    } else if (cinema) {
      check("caption exclusivity: cinema shows the in-stage caption", stageCaption !== null);
      check("caption exclusivity: cinema hides the below-stage prompt", belowCaption === null);
    } else {
      check("caption exclusivity: child's turn shows the below-stage prompt", belowCaption !== null);
      check("caption exclusivity: child's turn hides the in-stage caption", stageCaption === null);
    }
  }
}

// ── world-audio enforcement (KAH-015) ────────────────────────────────────
// HappyOyster's video/audio elements must be forced to the desired mute
// state even when the SDK swaps in a fresh, unmuted element mid-narration —
// something no single "mute on narration start" effect call can catch.
function fakeMediaElement(overrides = {}) {
  return { muted: false, volume: 1, isConnected: true, ...overrides };
}

{
  const duckDesired = computeDesiredWorldAudio(0);
  const ambienceDesired = computeDesiredWorldAudio(0.45);
  check("world-audio: duck target mutes and zeroes volume", duckDesired.muted === true && duckDesired.volume === 0);
  check(
    "world-audio: ambience target unmutes to the ambience level",
    ambienceDesired.muted === false && ambienceDesired.volume === 0.45,
  );

  // The SDK replaces the ambience <video> with a fresh, unmuted node mid-clip
  // (real HappyOyster behavior) — a stale element list would miss it, so the
  // enforcer must be re-run against a freshly-queried element list each tick.
  const stageRoot = { elements: [fakeMediaElement({ muted: true, volume: 0 })] };
  stageRoot.querySelectorAll = () => stageRoot.elements;
  let elements = stageMediaElements(stageRoot);
  check("world-audio: initial narrating element already muted needs no change", !enforceWorldAudioState(elements, duckDesired));

  const remounted = fakeMediaElement({ muted: false, volume: 1 });
  stageRoot.elements = [...stageRoot.elements, remounted];
  elements = stageMediaElements(stageRoot);
  const changed = enforceWorldAudioState(elements, duckDesired);
  check("world-audio: a remounted element is detected as needing correction", changed === true);
  check("world-audio: the remounted element is muted", remounted.muted === true);
  check("world-audio: the remounted element's volume is ducked to zero", remounted.volume === 0);

  // Restoring after narration ends unmutes and returns every element to the
  // ambience volume — including the one that was remounted mid-narration.
  const restored = enforceWorldAudioState(elements, ambienceDesired);
  check("world-audio: restore after narration reports a change", restored === true);
  check("world-audio: restore unmutes every element", elements.every((el) => el.muted === false));
  check(
    "world-audio: restore returns every element to the ambience volume",
    elements.every((el) => el.volume === 0.45),
  );

  // While a volume fade owns the transition, the enforcer must not fight it —
  // only `.muted` is corrected, `.volume` is left to the fade.
  const fadingElement = fakeMediaElement({ muted: false, volume: 0.2 });
  enforceWorldAudioState([fadingElement], duckDesired, { ramping: true });
  check("world-audio: ramping still forces mute immediately", fadingElement.muted === true);
  check("world-audio: ramping leaves volume to the fade, not the enforcer", fadingElement.volume === 0.2);

  // The persistent narrator <audio> element lives outside the stage subtree
  // entirely, so a query scoped to the stage root must never reach it.
  const stageWithoutNarrator = { querySelectorAll: () => [fakeMediaElement()] };
  check(
    "world-audio: stageMediaElements only returns elements the query root contains",
    stageMediaElements(stageWithoutNarrator).length === 1,
  );
  check("world-audio: a missing stage root yields no elements", stageMediaElements(null).length === 0);
}

// ── AliRTC remote playout (HappyOyster audio leak) ───────────────────────
// The remote audio element is detached and may be routed through the SDK's
// AudioContext gain node, so setting the DOM element's muted/volume fields is
// not the complete output control. The client adapter must drive AliRTC's
// global playout volume for both ducking and restoration.
{
  const playoutVolumes = [];
  const engine = { setPlayoutVolume: (volume) => playoutVolumes.push(volume) };
  setAliRtcRemoteAudioVolume(engine, 0);
  setAliRtcRemoteAudioVolume(engine, 0.45);
  check(
    "AliRTC audio: narration duck maps to SDK playout volume 0",
    playoutVolumes[0] === 0,
  );
  check(
    "AliRTC audio: child-turn ambience maps to SDK playout volume 45",
    playoutVolumes[1] === 45,
  );
  check(
    "AliRTC audio: SDK receives only the two explicit world-output updates",
    playoutVolumes.length === 2,
  );
}

// ── mute property lock (KAH-015) ─────────────────────────────────────────
// HappyOyster's own video-playback layer writes `videoElement.muted = false`
// directly on the persisted <video> node on every travel (re)bind — a plain
// property set that neither a MutationObserver nor a polling interval can
// ever observe. The lock is the only thing that can intercept it before it
// takes effect: it must win over every writer except one that goes through
// desiredRef, no matter how many times an outside write tries.
{
  const desiredRef = { current: computeDesiredWorldAudio(0) }; // ducked
  const element = { muted: false, volume: 1 };
  lockMutedProperty(element, desiredRef);
  check("mute lock: installing it immediately syncs to the current desired state", element.muted === true);

  // Simulate HappyOyster's TravelVideoPlayback.bind() writing muted=false
  // directly on the same node mid-narration.
  element.muted = false;
  check("mute lock: an external unmute write is defeated, not applied", element.muted === true);

  // A legitimate change goes through desiredRef, then any write re-syncs.
  desiredRef.current = computeDesiredWorldAudio(0.45);
  element.muted = true; // any write triggers a re-sync to the new desired value
  check("mute lock: updating desiredRef and re-syncing reflects the new state", element.muted === false);

  // Installing twice must not throw or double-wrap the property.
  let threw = false;
  try {
    lockMutedProperty(element, desiredRef);
  } catch {
    threw = true;
  }
  check("mute lock: installing on an already-locked element is a safe no-op", !threw);
  element.muted = true;
  check("mute lock: still enforced after a redundant install", element.muted === false);

  // A real HTMLMediaElement exposes `muted` as a native accessor on its
  // prototype, not an own property — exercise that path too, since it's
  // the one that actually matters in the browser.
  class FakeMediaElement {
    constructor() {
      this._muted = false;
    }
    get muted() {
      return this._muted;
    }
    set muted(value) {
      this._muted = value;
    }
  }
  const nativeLikeDesired = { current: computeDesiredWorldAudio(0) };
  const nativeLikeElement = new FakeMediaElement();
  lockMutedProperty(nativeLikeElement, nativeLikeDesired);
  nativeLikeElement.muted = false;
  check(
    "mute lock: defeats external writes on a native-accessor-style element too",
    nativeLikeElement.muted === true,
  );
}

// ── narration gate (KAH-015) ─────────────────────────────────────────────
// A chain of many narration sources must acquire the world-mute exactly
// once and release it exactly once — never once per source.
{
  let acquires = 0;
  let releases = [];
  const gate = createNarrationGate({
    onAcquire: () => {
      acquires += 1;
    },
    onRelease: (reason) => {
      releases.push(reason);
    },
  });

  check("narration gate: starts released", !gate.isHeld());
  check("narration gate: first hold acquires", gate.hold() === true && gate.isHeld());
  check("narration gate: acquiring exactly once so far", acquires === 1);

  // Three more sources in the same chain: every one calls hold(), but only
  // the first one in the whole chain should have triggered onAcquire.
  gate.hold();
  gate.hold();
  gate.hold();
  check("narration gate: repeated holds within a chain are no-ops", acquires === 1 && releases.length === 0);

  check("narration gate: release fires onRelease with its reason", gate.release("turn_opening") === true);
  check("narration gate: released after the chain's one release", !gate.isHeld());
  check("narration gate: exactly one release recorded", releases.length === 1 && releases[0] === "turn_opening");

  // A redundant release (e.g. a stale/cancelled continuation calling it
  // again) must not fire onRelease a second time.
  check("narration gate: a redundant release is a no-op", gate.release("stale") === false);
  check("narration gate: no extra release recorded", releases.length === 1);

  // A fresh chain acquires again.
  check("narration gate: a new chain can acquire again", gate.hold() === true);
  check("narration gate: second chain's acquire count", acquires === 2);
  gate.release();
  check("narration gate: default release reason is chain_complete", releases[1] === "chain_complete");
}

// ── global media inventory (KAH-015 follow-up) ───────────────────────────
// The mute lock and enforcement must not be scoped to the stage — a stray
// element the SDK (or a nested dependency) attaches outside the stage
// subtree would otherwise leak silently past every check.
{
  const originalDocument = global.document;
  const narrator = { tagName: "AUDIO", muted: false };
  const strayAudio = { tagName: "AUDIO", muted: false, srcObject: {} };
  const stageVideo = { tagName: "VIDEO", muted: false, srcObject: {} };
  global.document = {
    querySelectorAll: (selector) =>
      selector === "video, audio" ? [narrator, strayAudio, stageVideo] : [],
  };
  try {
    const elements = documentMediaElements([narrator]);
    check("documentMediaElements: excludes the given (narrator) element", !elements.includes(narrator));
    check(
      "documentMediaElements: includes every other element, in or out of the stage",
      elements.includes(strayAudio) && elements.includes(stageVideo),
    );

    const stageRoot = { contains: (el) => el === stageVideo };
    const inventory = describeMediaElements(elements, { stageRoot });
    const strayEntry = inventory[elements.indexOf(strayAudio)];
    const stageEntry = inventory[elements.indexOf(stageVideo)];
    check("describeMediaElements: flags an element outside the stage as inStage=false", strayEntry.inStage === false);
    check("describeMediaElements: flags the stage element as inStage=true", stageEntry.inStage === true);
    check(
      "describeMediaElements: reports hasSrcObject for a live WebRTC-style element",
      strayEntry.hasSrcObject === true && stageEntry.hasSrcObject === true,
    );
  } finally {
    global.document = originalDocument;
  }
  check(
    "documentMediaElements: no document (non-browser context) yields no elements",
    (() => {
      const saved = global.document;
      delete global.document;
      const result = documentMediaElements([]);
      global.document = saved;
      return result.length === 0;
    })(),
  );
}

process.exitCode = failures ? 1 : 0;
