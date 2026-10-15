// Exactly one caption source is ever shown at a time:
// - during real narration (cinema on), the in-stage cinematic caption
// - during the child's turn / any other live moment, the below-stage prompt
// - never both, and never either when the story isn't live.
export function resolveCaptionState({ showStoryInput, cinema, storyText }) {
  if (!showStoryInput) return { stageCaption: null, belowCaption: null };
  if (cinema) return { stageCaption: storyText ?? null, belowCaption: null };
  return { stageCaption: null, belowCaption: storyText ?? null };
}
