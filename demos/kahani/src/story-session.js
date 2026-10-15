// Small, framework-free session contracts shared by the story shell and its
// regression harness.

/** The SDK video must exist for every travel-opening render, not only after
 * streaming has already succeeded. */
export function shouldMountStoryVideo(view) {
  return view?.kind === "traveling";
}

/** Preserve SDK error codes for diagnostics without assuming a numeric code. */
export function readFailureCode(cause) {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null;
  const code = cause.code;
  return typeof code === "number" || typeof code === "string" ? code : null;
}
