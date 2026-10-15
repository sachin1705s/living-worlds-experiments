/**
 * FastH3 echoes `metadata` back untouched on every message about a clip, so the
 * beat a clip belongs to rides on the wire instead of in component state. A
 * reconnect loses nothing.
 */
export interface BeatTag {
  /** roomId, or `roomId:hotspotId` for a close-up. */
  beat: string;
  room: string;
  hotspot?: string;
  /** Which attempt this is — 0 is the first, 1+ came from the harness. */
  take: number;
}

export function makeTag(tag: BeatTag): string {
  return JSON.stringify(tag);
}

export function parseTag(metadata: string | undefined | null): BeatTag | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed?.beat === "string") return parsed as BeatTag;
  } catch {
    /* not ours */
  }
  return null;
}

export const beatKey = (room: string, hotspot?: string) =>
  hotspot ? `${room}:${hotspot}` : room;
