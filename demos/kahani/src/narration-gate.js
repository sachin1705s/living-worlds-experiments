// A ref-level (not React-state) lease for whether the world's audio should
// be ducked for narration.
//
// A narration CHAIN (every opening clip, or bridge -> consequence TTS ->
// moral) must duck the world exactly once and hold it for every source in
// that chain — never unmute-then-remute between chained sources. Every
// source in a chain calls hold() unconditionally; it's a no-op past the
// first call in a row. Only the orchestrator that knows a chain has truly
// ended (turn opening, definitive error/cancel, or the final moral) calls
// release() — and it only actually fires once per hold, so a redundant
// release from an already-released chain is always safe.
export function createNarrationGate({ onAcquire, onRelease } = {}) {
  let held = false;
  return {
    hold() {
      if (held) return false;
      held = true;
      onAcquire?.();
      return true;
    },
    release(reason = "chain_complete") {
      if (!held) return false;
      held = false;
      onRelease?.(reason);
      return true;
    },
    isHeld() {
      return held;
    },
  };
}
