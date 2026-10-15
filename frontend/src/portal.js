import { AppState } from "./state.js";
import { WORLDS, nextWorldId } from "./worlds.js";
import { transitionToWorld, setMovement } from "./reactor.js";
import { refreshActivePrompt, resetControlState } from "./controls.js";
import { showFlash, hideFlash, setWorldLabel } from "./ui.js";

// Tune during testing. PROMPT_THRESHOLD swaps to the portal prompt (the
// portal "appears" in the world); CROSS_THRESHOLD triggers the transition.
const PORTAL_PROMPT_THRESHOLD = 20;
const PORTAL_CROSS_THRESHOLD = 35;

export function onForwardStep() {
  if (AppState.isTransitioning) return;
  AppState.forwardSteps += 1;

  if (!AppState.portalArmed && AppState.forwardSteps >= PORTAL_PROMPT_THRESHOLD) {
    AppState.portalArmed = true;
    refreshActivePrompt();
  }

  if (AppState.forwardSteps >= PORTAL_CROSS_THRESHOLD) {
    crossPortal().catch(console.error);
  }
}

export function onBackStep() {
  AppState.forwardSteps = Math.max(0, AppState.forwardSteps - 1);
}

async function crossPortal() {
  if (AppState.isTransitioning) return;
  AppState.isTransitioning = true;

  try {
    await setMovement("idle");
    showFlash();

    const nextId = nextWorldId(AppState.current);
    const nextWorld = WORLDS[nextId];

    // Mark state BEFORE the swap so any in-flight `state` messages from the
    // old world don't flip flags back.
    AppState.current = nextId;
    AppState.forwardSteps = 0;
    AppState.portalArmed = false;
    AppState.running = false;
    resetControlState();

    await transitionToWorld(nextWorld);
    setWorldLabel(nextWorld.name);

    await waitForRunning();

    // A short grace period so the first chunk has actually rendered to the
    // video element before we lift the flash.
    await new Promise((r) => setTimeout(r, 400));
    hideFlash();
  } finally {
    AppState.isTransitioning = false;
  }
}

function waitForRunning(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (AppState.running) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("timed out waiting for generation to start"));
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}
