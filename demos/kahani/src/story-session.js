// Small, framework-free session contracts shared by the story shell and its
// regression harness.

/** The SDK video must exist for every travel-opening render, not only after
 * streaming has already succeeded. */
export function shouldMountStoryVideo(view) {
  return view?.kind === "traveling";
}

/** An id can arrive before generation finishes; it is not a reusable world yet. */
export function reusableWorldId(state) {
  if (!['ready', 'traveling'].includes(state?.phase)) return null;
  return typeof state.encrypted_world_id === 'string' && state.encrypted_world_id
    ? state.encrypted_world_id : null;
}

/** Phase changes must not restart the entire build timeout. */
export function worldBuildTimeRemaining(started, now, budget) {
  return Math.max(0, budget - (now - started));
}

/** Preserve SDK error codes for diagnostics without assuming a numeric code. */
export function readFailureCode(cause) {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null;
  const code = cause.code;
  return typeof code === "number" || typeof code === "string" ? code : null;
}
