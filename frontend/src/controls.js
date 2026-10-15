import { setMovement, setLookH, setLookV, setPrompt } from "./reactor.js";
import { AppState } from "./state.js";
import { WORLDS } from "./worlds.js";
import { onForwardStep, onBackStep } from "./portal.js";

const KEY_TO_MOVEMENT = {
  w: "forward",
  s: "back",
  a: "strafe_left",
  d: "strafe_right",
};
const KEY_TO_LOOK_H = { ArrowLeft: "left", ArrowRight: "right" };
const KEY_TO_LOOK_V = { ArrowUp: "up", ArrowDown: "down" };

// The SDK treats every set_* call as a state change. Dedupe before sending
// so we don't burn round trips re-firing the same value on key repeat.
let lastMovement = "idle";
let lastLookH = "idle";
let lastLookV = "idle";

// LIFO stack for two-key movement combos. Press W (forward), press A while
// W is held (strafe_left), release A → should resume "forward", not "idle".
const movementStack = [];

// Stack of currently-active hold-prompt strings. Topmost is what we send.
const activeHolds = [];

function sendMovement(next) {
  if (next === lastMovement) return;
  lastMovement = next;
  setMovement(next).catch(console.error);
}

function sendLookH(next) {
  if (next === lastLookH) return;
  lastLookH = next;
  setLookH(next).catch(console.error);
}

function sendLookV(next) {
  if (next === lastLookV) return;
  lastLookV = next;
  setLookV(next).catch(console.error);
}

function activeBasePrompt() {
  const world = WORLDS[AppState.current];
  if (!world) return null;
  return AppState.portalArmed ? world.portalPrompt : world.prompt;
}

function syncPrompt() {
  const base = activeBasePrompt();
  if (!base) return;
  const top = activeHolds.at(-1) ?? base;
  setPrompt(top).catch(console.error);
}

// Called by portal.js when the portal first arms (and after a transition,
// to re-establish the base prompt in case any holds were still active).
export function refreshActivePrompt() {
  syncPrompt();
}

export function resetControlState() {
  movementStack.length = 0;
  activeHolds.length = 0;
  lastMovement = "idle";
  lastLookH = "idle";
  lastLookV = "idle";
}

export function bindControls() {
  const onKeyDown = (e) => {
    if (e.repeat) return;
    if (AppState.isTransitioning) return;

    const k = e.key;
    const klow = k.toLowerCase();

    if (KEY_TO_MOVEMENT[klow]) {
      e.preventDefault();
      const mv = KEY_TO_MOVEMENT[klow];
      if (!movementStack.includes(mv)) movementStack.push(mv);
      sendMovement(movementStack.at(-1) ?? "idle");
      if (mv === "forward") onForwardStep();
      else if (mv === "back") onBackStep();
      return;
    }

    if (KEY_TO_LOOK_H[k]) {
      e.preventDefault();
      sendLookH(KEY_TO_LOOK_H[k]);
      return;
    }
    if (KEY_TO_LOOK_V[k]) {
      e.preventDefault();
      sendLookV(KEY_TO_LOOK_V[k]);
      return;
    }

    const world = WORLDS[AppState.current];
    const hold = world?.holds?.[k];
    if (hold) {
      e.preventDefault();
      activeHolds.push(hold.prompt);
      syncPrompt();
    }
  };

  const onKeyUp = (e) => {
    const k = e.key;
    const klow = k.toLowerCase();

    if (KEY_TO_MOVEMENT[klow]) {
      const mv = KEY_TO_MOVEMENT[klow];
      const idx = movementStack.indexOf(mv);
      if (idx !== -1) movementStack.splice(idx, 1);
      sendMovement(movementStack.at(-1) ?? "idle");
      return;
    }

    if (KEY_TO_LOOK_H[k]) {
      sendLookH("idle");
      return;
    }
    if (KEY_TO_LOOK_V[k]) {
      sendLookV("idle");
      return;
    }

    const world = WORLDS[AppState.current];
    const hold = world?.holds?.[k];
    if (hold) {
      const idx = activeHolds.lastIndexOf(hold.prompt);
      if (idx !== -1) activeHolds.splice(idx, 1);
      syncPrompt();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
