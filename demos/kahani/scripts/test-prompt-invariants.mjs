import { readFile } from "node:fs/promises";
import {
  assertDirectorResult,
  isWorldInstructionInvariantSafe,
  normalizeDirectorResult,
  SELFISH_DEER_MEETING_WORLD_INSTRUCTION,
  SELFISH_DECISION_TWO_POSE_TEXT,
} from "../src/director-schema.js";
import {
  OPENING_CHOREOGRAPHY,
  STORY_WORLD_PARAMS,
  STORY_WORLD_PROMPT,
  WORLD_BEAT_CONTRACT,
} from "../src/world-contract.js";

for (const anchor of ["banyan forest", "dust path", "lion's rock"]) {
  if (!STORY_WORLD_PROMPT.toLowerCase().includes(anchor)) {
    throw new Error(`world seed is missing anchor: ${anchor}`);
  }
}
if (OPENING_CHOREOGRAPHY.length !== 4) throw new Error("opening must have four authored beats");
if (STORY_WORLD_PROMPT.length < 1 || STORY_WORLD_PROMPT.length > 2000) {
  throw new Error(`world seed exceeds HappyOyster createWorld limit: ${STORY_WORLD_PROMPT.length} characters`);
}
if (!/exactly one small rabbit and exactly one huge adult tawny-maned lion/i.test(STORY_WORLD_PROMPT) || !/established cast is one rabbit and one lion/i.test(WORLD_BEAT_CONTRACT)) {
  throw new Error("world seed/beat contract does not pin the initial one-rabbit/one-lion cast");
}
if (
  !/visible on-screen character, never a first-person viewpoint/i.test(STORY_WORLD_PROMPT) ||
  !/show no offspring, mate, herd, background animals, or substitute characters/i.test(STORY_WORLD_PROMPT) ||
  !/rabbit already visible/i.test(OPENING_CHOREOGRAPHY[0]) ||
  !/both stay in frame/i.test(OPENING_CHOREOGRAPHY[0]) ||
  OPENING_CHOREOGRAPHY.some((beat) => !/rabbit/i.test(beat) || !/lion/i.test(beat)) ||
  /rabbit not yet in frame|lion watches alone/i.test(`${STORY_WORLD_PROMPT} ${OPENING_CHOREOGRAPHY.join(" ")}`)
) {
  throw new Error("opening does not guarantee the same visible rabbit and adult lion from frame one");
}
if (/(?:stone well|river|deer|berries)/i.test(STORY_WORLD_PROMPT) || /(stone well|river|deer|berries)/i.test(WORLD_BEAT_CONTRACT)) {
  throw new Error("world seed/beat contract contains a future consequence prop");
}
if (OPENING_CHOREOGRAPHY.some((beat) => /stone well|river|deer|berries/i.test(beat))) {
  throw new Error("opening contains a future consequence prop");
}
if (
  /stone well|berries/i.test(SELFISH_DEER_MEETING_WORLD_INSTRUCTION) ||
  !/rabbit.*meets.*deer|deer.*turns.*questioningly/i.test(SELFISH_DEER_MEETING_WORLD_INSTRUCTION) ||
  !/lion.*river.*rabbit.*meets.*deer.*asks/i.test(SELFISH_DECISION_TWO_POSE_TEXT) ||
  !/deer he put in danger/i.test(SELFISH_DECISION_TWO_POSE_TEXT) ||
  /named deer|deer you named|your named deer/i.test(`${SELFISH_DEER_MEETING_WORLD_INSTRUCTION} ${SELFISH_DECISION_TWO_POSE_TEXT}`)
) {
  throw new Error("selfish deer setup/pose lost the causal live situation");
}
if (!/rabbit.*approach|approach.*rabbit/i.test(OPENING_CHOREOGRAPHY.join(" ")) || !/paws open and empty|open empty paws/i.test(OPENING_CHOREOGRAPHY.join(" "))) {
  throw new Error("opening does not stage the visible rabbit's empty-pawed approach");
}
if (STORY_WORLD_PARAMS.layout !== "Stable" || STORY_WORLD_PARAMS.narrative !== "Dramatic") {
  throw new Error("Directing params drifted from the authored contract");
}
if (!WORLD_BEAT_CONTRACT.includes("child choice visibly preserved")) {
  throw new Error("beat contract does not preserve child choice");
}
if (
  !/native audio boundary: never generate character speech/i.test(STORY_WORLD_PROMPT) ||
  !/non-speech forest ambience may remain/i.test(STORY_WORLD_PROMPT) ||
  !/no native character speech/i.test(WORLD_BEAT_CONTRACT) ||
  /stone well|river|deer|berries/i.test(STORY_WORLD_PROMPT) ||
  /stone well|river|deer|berries/i.test(WORLD_BEAT_CONTRACT)
) {
  throw new Error("world seed/beat contract weakens the opening-only and speech boundaries");
}

const normalized = normalizeDirectorResult(
  {
    spirit: "reckless",
    world_instruction:
      "Reset to a neon castle: a new character speaks while the rabbit throws a banana.",
    narrator_line: "The rabbit follows your banana.",
    needs_reprompt: true,
    safety_flag: false,
  },
  { kidText: "I throw a banana" },
);
if (normalized.needs_reprompt) throw new Error("valid child action was reprompted");
if (!/banana/i.test(normalized.world_instruction)) {
  throw new Error(`child choice was lost in fallback: ${normalized.world_instruction}`);
}
if (!isWorldInstructionInvariantSafe(normalized.world_instruction, "I throw a banana")) {
  throw new Error("fallback beat violates world invariants");
}
assertDirectorResult(normalized);

const selfishFirst = normalizeDirectorResult(
  {
    spirit: "clever",
    world_instruction: "In a castle, a new character speaks.",
    narrator_line: "What happens next?",
    needs_reprompt: true,
    safety_flag: false,
  },
  { kidText: "Tell him to eat someone else", currentBeat: "decision_1" },
);
if (
  selfishFirst.spirit !== "selfish" ||
  selfishFirst.needs_reprompt ||
  !/satisfied|releases?|frees?|lopes?/i.test(selfishFirst.world_instruction) ||
  !/river|deer/i.test(selfishFirst.world_instruction) ||
  /stone well|berries/i.test(`${selfishFirst.world_instruction} ${selfishFirst.narrator_line}`)
) {
  throw new Error(`selfish decision-1 causal contract drifted: ${JSON.stringify(selfishFirst)}`);
}
assertDirectorResult(selfishFirst);

const unsafe = normalizeDirectorResult(
  {
    spirit: "reckless",
    world_instruction: "In the banyan forest, the rabbit moves along the dust path.",
    narrator_line: "The forest stays safe.",
    needs_reprompt: false,
    safety_flag: true,
  },
  { kidText: "kill the lion with a knife" },
);
if (!unsafe.safety_flag || unsafe.world_instruction !== "") {
  throw new Error("unsafe input reached the world contract");
}

const [serverSource, smokeSource, shellSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("./world-smoke-browser.js", import.meta.url), "utf8"),
  readFile(new URL("../components/kid/KidStoryShell.tsx", import.meta.url), "utf8"),
]);
if (!serverSource.includes("WORLD_BEAT_CONTRACT") || !serverSource.includes("called only after the opening")) {
  throw new Error("server prompt is missing the shared opening/beat contract");
}
if (!serverSource.includes("native non-speech ambience remains with the world stream")) {
  throw new Error("server director prompt weakens the native speech/audio boundary");
}
if (
  !serverSource.includes("CAUSAL DECISION-2 SITUATION") ||
  !serverSource.includes("CAUSAL DECISION-1 SELFISH CONTINUATION") ||
  !serverSource.includes("generic selfish/not-selfish question") ||
  !serverSource.includes("SELFISH_DECISION_TWO_SITUATION") ||
  !serverSource.includes("Do not mention or introduce the stone well in this selfish transition") ||
  !serverSource.includes("visible distrust and the rabbit alone") ||
  !serverSource.includes("Do not introduce the stone well in either selfish decision-2 outcome") ||
  !serverSource.includes("SELFISH_MORAL_LINE") ||
  !serverSource.includes("RECKLESS_MORAL_LINE")
) {
  throw new Error("server director prompt is missing the causal decision-2 situation");
}
if (
  !serverSource.includes("Decision 1 creates the situation. Decision 2 resolves that same situation") ||
  !serverSource.includes("Decision 2 owns the ending") ||
  !serverSource.includes("never say the child named, chose, or previously mentioned it") ||
  /named deer|deer you named|your named deer/i.test(`${serverSource} ${shellSource}`)
) {
  throw new Error("director/browser text does not preserve two-decision causality and honest deer attribution");
}
if (!smokeSource.includes("STORY_WORLD_PROMPT") || /firstFrameImage/i.test(smokeSource)) {
  throw new Error("world smoke path drifted from the prompt-only contract");
}
if (
  !shellSource.includes('from "@/src/world-contract.js"') ||
  !shellSource.includes("prompt: STORY_WORLD_PROMPT") ||
  !shellSource.includes("...STORY_WORLD_PARAMS") ||
  shellSource.includes("frightened deer and monkeys hide in the leaves") ||
  shellSource.includes("The lion follows the rabbit toward the stone well") ||
  !shellSource.includes("SELFISH_DEER_MEETING_WORLD_INSTRUCTION") ||
  !shellSource.includes("SELFISH_DECISION_TWO_POSE_TEXT") ||
  !shellSource.includes("moral runtime TTS") ||
  !shellSource.includes("SELFISH_MORAL_LINE") ||
  !shellSource.includes("RECKLESS_MORAL_LINE")
) {
  throw new Error("KidStoryShell story path drifted from the causal world/audio contract");
}
if ((shellSource.match(/session\.client\.instruct\(/g) || []).length !== 2) {
  throw new Error("story path must contain one child handoff and one selfish visual setup instruct call");
}
if ((shellSource.match(/traceFlow\("instruct_start"/g) || []).length !== 1) {
  throw new Error("child handoff must contain exactly one budgeted instruct trace");
}
if (!shellSource.includes("causal decision-2 setup accepted") || shellSource.indexOf("causal decision-2 setup accepted") > shellSource.indexOf("startDecisionPose(2)")) {
  throw new Error("deer meeting setup is not staged before decision 2");
}
if (!shellSource.includes("if (result.needs_reprompt === true)")) {
  throw new Error("child handoff lost the reprompt gate");
}
if (!shellSource.includes('return spirits[1] || spirits[0] || "clever"') || shellSource.includes("counts[spirit]")) {
  throw new Error("browser ending selection regressed to a two-label tally instead of decision-2 resolution");
}

console.log(`PASS prompt invariants: ${STORY_WORLD_PROMPT.length}-character seed with rabbit visible from frame one, strict two-animal opening, honest causal deer setup, four ending roles, and no third child handoff`);
