import {
  fallbackSpiritForInput,
  hasWorldDrift,
  normalizeDirectorResult,
  SELFISH_CAUSAL_BRANCH,
} from "../src/director-schema.js";

const malformed = normalizeDirectorResult(
  {
    spirit: "kind",
    world_instruction: "In the banyan forest, the rabbit listens beside lion's rock near the stone well.",
    narrator_line: "Your don't helps the rabbit stay brave.",
    needs_reprompt: false,
    safety_flag: false,
  },
  { kidText: "don't be afraid" },
);
if (/\bdon't\b|\bdoesn'?t\b/i.test(malformed.narrator_line) || !/brave words help/i.test(malformed.narrator_line)) {
  throw new Error(`malformed phrase was not cleaned: ${malformed.narrator_line}`);
}

const drifted = normalizeDirectorResult(
  {
    spirit: "clever",
    world_instruction: "In a castle kingdom, the rabbit walks beside lion's rock toward the stone well.",
    narrator_line: "The rabbit follows your reflection toward the stone well.",
    needs_reprompt: false,
    safety_flag: false,
  },
  { kidText: "Tell him about the castle" },
);
if (hasWorldDrift(drifted.world_instruction) || /castle|kingdom/i.test(drifted.world_instruction)) {
  throw new Error(`setting drift survived normalization: ${drifted.world_instruction}`);
}
if (fallbackSpiritForInput("Tell him gently to look in the well") !== "kind") {
  throw new Error("the canonical kind path was classified as clever/unclear");
}
if (fallbackSpiritForInput("I do not taste good") !== "clever") {
  throw new Error("the clever decision-1 taste answer was not classified as clever");
}
const bareNoun = normalizeDirectorResult(
  {
    spirit: "reckless",
    world_instruction: "In the banyan forest, the rabbit darts along the dust path from lion's rock while the lion watches.",
    narrator_line: "A banana lands beside the lion.",
    needs_reprompt: false,
    safety_flag: false,
  },
  { kidText: "banana", currentBeat: "decision_1" },
);
if (bareNoun.spirit !== "unclear" || !bareNoun.needs_reprompt) {
  throw new Error(`a bare unrelated noun overrode the no-action reprompt contract: ${JSON.stringify(bareNoun)}`);
}
const doNothing = normalizeDirectorResult(
  {
    spirit: "clever",
    world_instruction: "In the banyan forest, the rabbit pauses beside lion's rock along the dust path toward the stone well.",
    narrator_line: "The rabbit pauses beside the stone well.",
    needs_reprompt: false,
    safety_flag: false,
  },
  { kidText: "do not do anything" },
);
if (fallbackSpiritForInput("do not do anything") !== "unclear" || doNothing.spirit !== "unclear" || !doNothing.needs_reprompt) {
  throw new Error('"do not do anything" should remain an unclear, reprompting input');
}

const malformedSelfishNarrator = normalizeDirectorResult(
  {
    spirit: "selfish",
    world_instruction: "In the banyan forest, the rabbit points along the dust path from lion's rock toward the stone well as the lion watches.",
    narrator_line: "The rabbit carries your eat someone else toward the stone well.",
    needs_reprompt: false,
    safety_flag: false,
  },
  { kidText: "Tell him to eat someone else", currentBeat: "decision_1" },
);
if (
  malformedSelfishNarrator.spirit !== "selfish" ||
  !/save himself/i.test(malformedSelfishNarrator.narrator_line) ||
  !/points the lion/i.test(malformedSelfishNarrator.narrator_line) ||
  /berries|stone well/i.test(malformedSelfishNarrator.narrator_line) ||
  /named deer|deer you named|your named deer/i.test(`${malformedSelfishNarrator.narrator_line} ${malformedSelfishNarrator.world_instruction}`) ||
  /stone well/i.test(malformedSelfishNarrator.world_instruction)
) {
  throw new Error(`selfish causal narrator was not normalized: ${malformedSelfishNarrator.narrator_line}`);
}

const selfishState = { causal_branch: SELFISH_CAUSAL_BRANCH };
const causalChoices = [
  ["say nothing", "selfish", /safe|trust/i, /deer|river/i],
  ["keep walking", "selfish", /safe|trust/i, /deer|river/i],
  ["tell the deer it is safe now", "selfish", /safe|trust/i, /deer|river/i],
  ["warn the deer", "reckless", /luck|warning/i, /deer|river|luck/i],
  ["try to distract the lion", "reckless", /luck|distraction/i, /deer|river|luck/i],
];
for (const [kidText, expectedSpirit, narratorPattern, worldPattern] of causalChoices) {
  const result = normalizeDirectorResult(
    {
      spirit: "clever",
      world_instruction: "In a castle, a new character speaks.",
      narrator_line: "What happens next?",
      needs_reprompt: true,
      safety_flag: false,
    },
    { kidText, currentBeat: "decision_2", playthroughState: selfishState },
  );
  if (result.spirit !== expectedSpirit || result.needs_reprompt) {
    throw new Error(`clear selfish decision-2 choice was reprompted/misclassified: ${kidText} -> ${JSON.stringify(result)}`);
  }
  if (!narratorPattern.test(result.narrator_line) || /berries|stone well/i.test(result.narrator_line)) {
    throw new Error(`decision-2 narrator lost the causal outcome for ${kidText}: ${result.narrator_line}`);
  }
  if (!worldPattern.test(result.world_instruction) || /berries|stone well/i.test(result.world_instruction)) {
    throw new Error(`decision-2 world beat lost the causal setup for ${kidText}: ${result.world_instruction}`);
  }
}

const tastePath = normalizeDirectorResult(
  {
    spirit: "clever",
    world_instruction: "In a castle, a new character speaks.",
    narrator_line: "What happens next?",
    needs_reprompt: true,
    safety_flag: false,
  },
  { kidText: "I do not taste good", currentBeat: "decision_1" },
);
if (/stone well/i.test(tastePath.world_instruction)) {
  throw new Error(`taste answer introduced an uncalled-for well: ${tastePath.world_instruction}`);
}
const reflectionPath = normalizeDirectorResult(
  {
    spirit: "clever",
    world_instruction: "In a castle, a new character speaks.",
    narrator_line: "What happens next?",
    needs_reprompt: true,
    safety_flag: false,
  },
  { kidText: "Show him his reflection in the water", currentBeat: "decision_2" },
);
if (!/stone well/i.test(reflectionPath.world_instruction)) {
  throw new Error(`reflection answer did not introduce its optional well: ${reflectionPath.world_instruction}`);
}

const arbitraryDeer = "In the banyan forest, the rabbit sees a deer by the river beside lion's rock along the dust path toward the stone well.";
if (!hasWorldDrift(arbitraryDeer)) {
  throw new Error("an uncaused deer/river addition escaped world drift validation");
}

console.log("PASS normalization: malformed grammar cleaned, opening fork preserved, causal deer branches constrained, clear choices advance, and do-nothing reprompt preserved");
