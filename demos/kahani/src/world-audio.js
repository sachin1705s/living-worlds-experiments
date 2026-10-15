// Media-layer control for HappyOyster's world video/audio elements.
//
// HappyOyster's one combined stream carries both ambience and character
// speech, so it must be silenced for the whole interval any real narrator
// source (clip or Fish Audio TTS) is playing, and remains silent through every
// non-child story phase. It is restored only when a child turn opens. The SDK
// can replace/remount the
// underlying <video> (and it renders a fresh element with `muted={false}`
// each time), so a one-shot mute set at narration-start is not enough: the
// desired state must be re-asserted continuously against whatever elements
// are actually present, not just the one queried at the moment narration
// began.

/** Given the ambience-volume target the app wants right now, derive the
 * concrete { muted, volume } state every world media element should have. */
export function computeDesiredWorldAudio(target) {
  const volume = Math.max(0, Math.min(1, target));
  return { muted: volume <= 0.001, volume };
}

/** Every audio-bearing element HappyOyster currently has mounted inside the
 * given stage root — video or audio, however many the SDK happens to render. */
export function stageMediaElements(stageRoot) {
  if (!stageRoot || typeof stageRoot.querySelectorAll !== "function") return [];
  return Array.from(stageRoot.querySelectorAll("video, audio"));
}

/**
 * Force every element to the desired mute/volume state. Returns true if any
 * element actually needed correcting (useful for telemetry/tests) so callers
 * can tell a one-shot "already correct" tick apart from a real re-assertion
 * (e.g. after the SDK swapped in a fresh, unmuted element).
 *
 * While `ramping` is true a volume fade (rAF-driven) already owns `.volume`
 * for these elements, so only `.muted` is enforced here — otherwise this
 * would fight that fade and make the duck/restore transition choppy.
 */
export function enforceWorldAudioState(elements, desired, { ramping = false } = {}) {
  let changed = false;
  for (const element of elements) {
    if (element.muted !== desired.muted) {
      element.muted = desired.muted;
      changed = true;
    }
    if (!ramping && Math.abs((element.volume ?? 0) - desired.volume) > 0.01) {
      element.volume = desired.volume;
      changed = true;
    }
  }
  return changed;
}

const MUTE_LOCK_FLAG = "__kahaniMutedLocked";

function findMutedAccessor(element) {
  let proto = Object.getPrototypeOf(element);
  while (proto) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, "muted");
    if (descriptor && typeof descriptor.set === "function") return descriptor;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

/**
 * Pin `element.muted` to whatever `desiredRef.current.muted` says, rejecting
 * every other write — ours included; going through `desiredRef` is the only
 * way to change it.
 *
 * This exists because HappyOyster's own video-playback layer writes
 * `videoElement.muted = false` directly on the persisted `<video>` node on
 * every travel (re)bind — a plain property set on a node we never replace,
 * so no MutationObserver or polling interval can see it happen; the write
 * has already landed (and the world has already been audible) by the time
 * any interval-based re-assertion would next run. A property override is the
 * only place that can intercept it before it takes effect. Only `.muted` is
 * locked — a binary silence switch — leaving `.volume` free for the smooth
 * ramp in `applyWorldAudioState` to animate through intermediate values.
 *
 * Idempotent: safe to call every time an element is (re)discovered.
 */
export function lockMutedProperty(element, desiredRef) {
  if (!element || element[MUTE_LOCK_FLAG]) return;
  const native = findMutedAccessor(element);
  // Real HTMLMediaElement: delegate through its native accessor so actual
  // playback behavior is unchanged. Plain test fixtures (no such element in
  // their prototype chain) fall back to a boxed value on the object itself.
  const read = native ? () => native.get.call(element) : () => element.__kahaniMutedValue;
  const write = native
    ? (value) => native.set.call(element, value)
    : (value) => {
        element.__kahaniMutedValue = value;
      };
  if (!native) write(element.muted);
  Object.defineProperty(element, "muted", {
    configurable: true,
    get: read,
    set() {
      write(desiredRef.current.muted);
    },
  });
  element[MUTE_LOCK_FLAG] = true;
  write(desiredRef.current.muted);
}

/** Install the mute lock on every element that doesn't already have it. */
export function ensureMutedLocks(elements, desiredRef) {
  for (const element of elements) lockMutedProperty(element, desiredRef);
}

/**
 * Every video/audio element in the WHOLE document, minus any elements to
 * exclude (the persistent narrator <audio> element, always). HappyOyster's
 * docs describe a single stream rendered by the attached <video> element
 * with no separate audio API — but a stray element the SDK (or a nested
 * dependency) attaches outside the stage subtree, or swaps in transiently,
 * would be invisible to a query scoped to stageRef alone. This is the
 * defense-in-depth query used by the enforcement loop in addition to (not
 * instead of) the stage-scoped one, so the mute/lock is applied wherever
 * HappyOyster's media actually lives, not just where we expect it to.
 */
/** @returns {HTMLMediaElement[]} */
export function documentMediaElements(excludeElements = []) {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
  const exclude = new Set(excludeElements.filter(Boolean));
  return /** @type {HTMLMediaElement[]} */ (Array.from(document.querySelectorAll("video, audio"))).filter(
    (element) => !exclude.has(element),
  );
}

/**
 * A concise snapshot of every media element in the document — for the one
 * question that actually settles which element is carrying HappyOyster's
 * audible output: which one has a live srcObject/currentSrc, and is it
 * inside the stage we already lock, or somewhere else entirely. Meant to be
 * logged occasionally (on count change), not every enforcement tick.
 */
/**
 * @param {HTMLMediaElement[]} elements
 * @returns {Array<{tag: string, inStage: boolean, hasSrcObject: boolean, currentSrc: string, muted: boolean, volume: number | null, paused: boolean, locked: boolean}>}
 */
export function describeMediaElements(elements, { stageRoot } = {}) {
  return elements.map((element) => ({
    tag: element.tagName,
    inStage: !!(stageRoot && stageRoot.contains && stageRoot.contains(element)),
    hasSrcObject: !!element.srcObject,
    currentSrc: element.currentSrc || element.src || "",
    muted: element.muted,
    volume: Number.isFinite(element.volume) ? Number(element.volume.toFixed(3)) : null,
    paused: element.paused,
    locked: !!element[MUTE_LOCK_FLAG],
  }));
}
