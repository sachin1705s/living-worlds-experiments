// World-owned contract shared by the prebuild/smoke path and the director.
// Keep this file free of browser or React dependencies so the same text can be
// imported by the Node world runner and the browser smoke page.

export const STORY_WORLD_PARAMS = Object.freeze({
  resolution: "720p",
  layout: "Stable",
  narrative: "Dramatic",
});

export const OPENING_CHOREOGRAPHY = Object.freeze([
  "A fixed third-person wide view shows exactly one rabbit already visible on the dust path and exactly one adult lion at lion's rock; both stay in frame.",
  "A slow push keeps the whole rabbit visible as he approaches with both front paws open and empty; the same adult lion watches from lion's rock.",
  "A steady view brings the rabbit to lion's rock; the lion turns as rabbit and lion begin their wary forest encounter.",
  "A fixed medium view holds the rabbit and lion together at lion's rock; the rabbit's open paws and the dust path remain visible as the encounter continues.",
]);

export const STORY_WORLD_PROMPT = `Create a third-person story scene in a sunlit Panchatantra forest. Opening cast is strict: exactly one small rabbit and exactly one huge adult tawny-maned lion. The rabbit is a visible on-screen character, never a first-person viewpoint, and remains fully visible in every opening beat. The lion is solitary and adult. Show no offspring, mate, herd, background animals, or substitute characters. World: giant banyan trees, a winding dust path, and lion's rock. The rabbit has both front paws open and empty. Use a soft 3D animated film look, warm golden light, rounded shapes, and rich colors.

Opening choreography: at the beginning of every travel, show these first four roughly-four-second visual beats in order: (1) fixed third-person wide view with the whole rabbit already visible at the near end of the dust path and the adult lion visible at lion's rock; these are the only two animals; (2) slow push keeps the whole rabbit visible as he approaches with open empty paws while the same lion watches; (3) steady view as the rabbit reaches lion's rock and the lion turns; (4) fixed medium view holds the same rabbit and lion together at the rock as their wary encounter begins.

After opening, continue from the live scene. Each directing instruction is one roughly-four-second visual beat with one visible action and one immediate outcome. Preserve the same rabbit and adult lion, the banyan forest, dust path, lion's rock, fixed or slow-push continuity, soft 3D style, and visible child choices. A later director beat may introduce a story prop or character only when the current instruction explicitly requires it; never add arbitrary settings or characters. Beat instructions are visual-only. Native audio boundary: never generate character speech, dialogue, lyrics, or other spoken words; characters communicate through visible movement and expression only. Non-speech forest ambience may remain.`;

export const WORLD_BEAT_CONTRACT =
  "one roughly-four-second visual beat; one visible action; one immediate outcome; established cast is one rabbit and one lion; banyan forest, dust path, and lion's rock remain continuous; optional story props appear only when the current child choice calls for them; no arbitrary settings or active characters; fixed frame or slow push-in; child choice visibly preserved; no native character speech, dialogue, lyrics, or spoken words; visible action/expression only; visual-only text with native non-speech ambience left to the world stream";

export const WORLD_CONTRACT_VERSION = "rabbit-lion-encounter-v7";

export const SMOKE_INSTRUCTION =
  "The rabbit keeps both front paws open as he arrives along the dust path and faces the lion at lion's rock.";
