export const DIRECTOR_SPIRITS = [
  "clever",
  "reckless",
  "kind",
  "selfish",
  "unclear",
];

export const DIRECTOR_CHECKPOINTS = ["CP1", "CP2", "CP3", "CP4"];
export const DIRECTOR_BEATS_BUDGET = 4;
export const DIRECTOR_ENDING_FLAVORS = [
  "triumphant",
  "narrow_escape",
  "comeuppance_lite",
];
export const DIRECTOR_NARRATOR_MAX_CHARS = 120;
export const DIRECTOR_NARRATOR_MAX_WORDS = 15;
export const SELFISH_CAUSAL_BRANCH = "selfish_lion_release";
export const SELFISH_DECISION_TWO_SITUATION =
  "After the rabbit points the lion toward a deer by the river, the satisfied lion releases him and lopes away. The rabbit then meets the deer he put in danger. The deer asks whether the lion is nearby.";
export const SELFISH_DEER_MEETING_WORLD_INSTRUCTION =
  "In the banyan forest, the rabbit takes a crossing dust path from lion's rock and meets the deer by the river; the deer turns questioningly as the lion approaches in the distance.";
export const SELFISH_DECISION_TWO_POSE_TEXT =
  "The lion is coming toward the river. The rabbit meets the deer he put in danger, who asks whether the lion is nearby. What should the rabbit do next?";
export const GENERIC_DECISION_TWO_POSE_TEXT =
  "The rabbit and lion continue along the dust path through the forest. What should the rabbit do next?";
export const SELFISH_MORAL_LINE =
  "The rabbit stayed safe, but the forest stopped trusting him, so he ended alone.";
export const RECKLESS_MORAL_LINE =
  "Luck helped the rabbit and deer escape; bravery needs a clever plan next time.";

export const WORLD_ANCHORS = Object.freeze([
  "banyan forest",
  "dust path",
  "lion's rock",
]);

const WORLD_INSTRUCTION_FORBIDDEN =
  /\b(?:reset|restart|start over|new scene|cut to|fade to black|different world|another world|new setting|camera|wide shot|close[- ]up|pan|whip|tracking|zoom|dialogue|conversation|speaks?|says?|voice|music|audio|sound|sing(?:s|ing)?|shout(?:s|ing)?|scream(?:s|ing)?|roar(?:s|ing)?|watercolor|photorealistic|live[- ]action|anime|neon|noir|cinematic|epic|8k)\b/i;

const EXTRA_ACTIVE_CHARACTER =
  /\b(?:monkeys?|birds?|elephant|tiger|bear|wolf|fox|snake|human|people|child|princess|wizard|dragon|robot|monster|soldier|farmer)\b/i;
const PURPOSEFUL_DEER = /\bdeer\b/i;
const RIVER = /\briver\b/i;
const CAUSAL_WORLD_PROGRESS =
  /\b(?:alone|arriv(?:es?|ed|ing)|backs?|bolts?|carries?|distracts?|escapes?|frees?|guides?|leaves?|lopes?|meets?|releases?|satisfied|trust(?:s|ed|ing)?|turns?|warns?|walks?)\b/i;

const SPIRIT_SET = new Set(DIRECTOR_SPIRITS);
const NO_ACTION_INPUT = /^(?:do not|don't)\s+do anything[.!?]*$/i;

export class DirectorSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "DirectorSchemaError";
  }
}

export function isUnsafeKidInput(value) {
  const text = String(value ?? "").toLowerCase();
  // Keep cartoon peril such as "punch him" in the reckless lane. These are
  // the graphic/weapon terms that must never become a world instruction.
  return /\b(kill|murder|knife|gun|weapon|blood|gore|stab|shoot|suicide|self[- ]harm|sexual|porn|naked|nude|rape|behead|torture|adult|cocaine|heroin)\b/.test(
    text,
  );
}

// HappyOyster is one anchored forest world. Rejecting setting/character drift
// at the normalization boundary keeps an imaginative model response from
// quietly moving the child into a castle, a new kingdom, or a second lion.
export function isPurposefulCausalWorldInstruction(value) {
  const text = String(value ?? "");
  return PURPOSEFUL_DEER.test(text) && RIVER.test(text) && CAUSAL_WORLD_PROGRESS.test(text);
}

export function hasWorldDrift(value, { allowPurposefulDeer = false, allowRiver = false } = {}) {
  const text = String(value ?? "").toLowerCase();
  return (
    /\b(?:castle|kingdom|palace|city|village|ocean|sea|beach|mountain|island|spaceship|rocket|dragon|wizard|princess|knight|robot|school)\b/.test(text) ||
    /\b(?:another|extra|second|two|three|many)\s+(?:proud\s+)?lions?\b/.test(text) ||
    /\bnew\s+(?:world|land|place|setting|lion)\b/.test(text) ||
    WORLD_INSTRUCTION_FORBIDDEN.test(text) ||
    EXTRA_ACTIVE_CHARACTER.test(text) ||
    (PURPOSEFUL_DEER.test(text) && !allowPurposefulDeer) ||
    (RIVER.test(text) && !allowRiver)
  );
}

function hasAllWorldAnchors(value) {
  const text = String(value ?? "");
  return WORLD_ANCHORS.every((anchor) =>
    new RegExp(anchor.replace(/[']/g, "['’]?"), "i").test(text),
  );
}

function hasBeatProgress(value) {
  return /\b(?:alone|arrives?|arcs?|backs?|bolts?|carries?|catches?|deepens?|darts?|distracts?|drifts?|escapes?|follows?|frees?|gleams?|guides?|leads?|leaves?|lopes?|meets?|offers?|pauses?|points?|races?|releases?|ripples?|satisfied|settles?|steps?|turns?|unfolds?|waits?|walks?|warns?)\b/i.test(
    String(value ?? ""),
  );
}

function choiceCue(kidText, { currentBeat = "decision_1", playthroughState = null } = {}) {
  const text = String(kidText ?? "").toLowerCase();
  const causalBranch = playthroughState?.causal_branch;
  if (normalizedBeat(currentBeat) === "decision_2" && causalBranch === SELFISH_CAUSAL_BRANCH) {
    if (/say nothing|keep walking|tell (?:the )?deer (?:it is )?safe(?: now)?|deer.*safe(?: now)?|safe now/.test(text)) {
      return "silent|quiet|walk|safe|deer";
    }
    if (/warn (?:the )?deer|distract (?:the )?lion|draw (?:the )?lion away|keep (?:the )?lion away/.test(text)) {
      return "warn|deer|distract|lion|luck|river";
    }
  }
  if (/do not taste good|don't taste good|taste bad|bad taste/.test(text)) return "taste|good|plan";
  if (/reflection|bigger lion|many rabbits|well grants wishes|sky (?:is|was) falling|trick|pretend|mislead/.test(text)) return "reflection|mirror|water|clue";
  if (/throw(?:s|ing)? .*banana/.test(text)) return "banana|arc|toss";
  if (/share(?: a warm welcome)?|warm welcome/.test(text)) return "share|offer|welcome|gesture";
  if (/lullaby|sing/.test(text)) return "gentle|soothing|welcoming";
  if (/run away|escape|flee|dash|rush/.test(text)) return "dust path|races?|darts?|dashes?|flees?";
  if (/hide/.test(text)) return "hide|rock|shelter";
  if (/punch/.test(text)) return "feint|dodge|bold|dash|paws";
  if (/scream|loud/.test(text)) return "startle|gesture|bold|paws|ripple";
  if (/wait|stay|watch/.test(text)) return "wait|pauses?|watches?|patient";
  return "";
}

export function preservesChildChoice(worldInstruction, kidText, context = {}) {
  const cue = choiceCue(kidText, context);
  return !cue || new RegExp(`(?:${cue})`, "i").test(String(worldInstruction ?? ""));
}

export function isWorldInstructionInvariantSafe(value, kidText = "", context = {}) {
  const text = String(value ?? "").trim();
  const causalBranch = context.playthroughState?.causal_branch || context.causalBranch;
  const branchAllowsCausalCharacters = causalBranch === SELFISH_CAUSAL_BRANCH &&
    ["decision_2", "consequence_1", "consequence_2"].includes(normalizedBeat(context.currentBeat));
  const allowPurposefulDeer = context.allowPurposefulDeer === true || branchAllowsCausalCharacters;
  const allowRiver = context.allowRiver === true || branchAllowsCausalCharacters;
  return Boolean(
    text &&
      text.length <= 400 &&
      /\brabbit\b/i.test(text) &&
      /\blion\b/i.test(text) &&
      hasAllWorldAnchors(text) &&
      hasBeatProgress(text) &&
      !hasWorldDrift(text, { allowPurposefulDeer, allowRiver }) &&
      preservesChildChoice(text, kidText, context),
  );
}

function firstConcreteDetail(kidText) {
  const text = String(kidText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "your idea";

  const normalized = text.toLowerCase();
  if (/\b(?:don't|do not)\s+be\s+afraid\b/.test(normalized)) return "brave words";
  const actionPhrase = [
    "another lion",
    "bigger lion",
    "many rabbits",
    "punch",
    "warm welcome",
    "friends",
    "eat someone else",
    "run away",
    "dash",
    "do not taste good",
    "say nothing",
    "keep walking",
    "safe now",
    "warn the deer",
    "distract the lion",
    "look in the well",
    "show him his reflection",
    "reflection",
    "scream",
    "lullaby",
    "well grants wishes",
    "hide behind the rock",
    "sky is falling",
    "summon the moon",
    "joke about his mane",
    "throw a banana",
    "wait quietly",
  ].find((phrase) => normalized.includes(phrase));
  if (actionPhrase) return actionPhrase;

  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "be",
    "he",
    "him",
    "i",
    "in",
    "is",
    "it",
    "let",
    "me",
    "of",
    "say",
    "should",
    "the",
    "to",
    "will",
  ]);
  const detail = words.find((word) => word.length >= 4 && !stopWords.has(word.toLowerCase()));
  return (detail || words[0] || text).slice(0, 80);
}

function normalizedBeat(value) {
  return String(value || "decision_1").toLowerCase().replace(/-/g, "_");
}

function causalBranchFor(context = {}) {
  return context.playthroughState?.causal_branch || context.causalBranch || null;
}

function isSelfishCausalDecision(context = {}) {
  const beat = normalizedBeat(context.currentBeat);
  return causalBranchFor(context) === SELFISH_CAUSAL_BRANCH &&
    (beat === "decision_2" || beat === "consequence_1" || beat === "consequence_2");
}

function isSelfishFirstDecision(context = {}, spirit = "unclear") {
  return normalizedBeat(context.currentBeat) === "decision_1" && spirit === "selfish";
}

function selfishDecisionTwoKind(kidText) {
  return /say nothing|keep walking|tell (?:the )?deer (?:it is )?safe(?: now)?|deer.*safe(?: now)?|safe now/i.test(
    String(kidText ?? ""),
  );
}

function selfishDecisionTwoReckless(kidText) {
  return /warn (?:the )?deer|distract (?:the )?lion|draw (?:the )?lion away|keep (?:the )?lion away/i.test(
    String(kidText ?? ""),
  );
}

function selfishCausalWorldInstruction(spirit, kidText) {
  if (spirit === "selfish" && selfishDecisionTwoKind(kidText)) {
    if (/tell (?:the )?deer|safe now|deer.*safe/i.test(String(kidText ?? ""))) {
      return "In the banyan forest, the rabbit gives the deer a reassuring gesture by the river; the deer turns away, and the forest grows empty as the rabbit walks alone along the dust path from lion's rock.";
    }
    return "In the banyan forest, the rabbit keeps silent by the river; the deer turns away, and the forest grows empty as the rabbit walks alone along the dust path from lion's rock.";
  }
  if (spirit === "reckless" && selfishDecisionTwoReckless(kidText)) {
    const text = String(kidText ?? "");
    if (/distract|draw .*away|keep .*away/i.test(text)) {
      return "In the banyan forest, the rabbit makes a distracting paw gesture toward the lion by the river; the deer darts clear, and luck carries the rabbit along the dust path from lion's rock.";
    }
    return "In the banyan forest, the rabbit raises a warning paw by the river; the deer darts clear as the lion reaches the bank, and luck carries the rabbit along the dust path from lion's rock.";
  }
  if (spirit === "clever") {
    return "In the banyan forest, the rabbit marks a false trail by the river; the lion follows it away from the deer, and the clever clue guides both animals clear of the dust path from lion's rock.";
  }
  if (spirit === "kind") {
    return "In the banyan forest, the rabbit guides the deer behind broad banyan roots by the river; the lion slows, and the two animals stay together beside the dust path from lion's rock.";
  }
  return "In the banyan forest, the rabbit points from lion's rock down the dust path toward a deer at the river; the satisfied lion releases him and lopes that way.";
}

export function fallbackWorldInstruction(spirit = "unclear", kidText = "", context = {}) {
  if (
    (isSelfishFirstDecision(context, spirit) || isSelfishCausalDecision(context)) &&
    spirit !== "unclear"
  ) {
    return selfishCausalWorldInstruction(spirit, kidText);
  }

  const action = {
    clever: "the rabbit turns the chosen idea into a sparkling reflection clue",
    reckless: "the rabbit darts boldly along the dust path while the lion follows",
    kind: "the rabbit offers a gentle, welcoming gesture",
    selfish: "the rabbit keeps a small prize close to his paws",
    unclear: "the rabbit pauses, then looks toward the next path",
  }[spirit] || "the rabbit pauses, then looks toward the next path";

  const choice = choiceCue(kidText, context).split("|")[0];
  const choiceAction = choice
    ? {
        clever: `the rabbit shapes the ${choice} into a sparkling reflection clue`,
        reckless: `the rabbit turns the ${choice} into a bold movement along the dust path`,
        kind: `the rabbit makes a gentle ${choice} gesture`,
        selfish: `the rabbit keeps the ${choice} close while stepping onward`,
        unclear: `the rabbit pauses beside the ${choice}`,
      }[spirit]
    : action;

  const text = String(kidText ?? "");
  const reflectionCalledFor = spirit === "clever" && /reflection|mirror|water|well|wish|bigger lion/i.test(text);
  const continuation = reflectionCalledFor
    ? "along the dust path toward the stone well, where mirror-like water gleams"
    : "along the dust path as the next forest beat unfolds";
  return `In the banyan forest, ${choiceAction}; the rabbit and lion step from lion's rock ${continuation}.`;
}

function oneSentence(value) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const terminal = compact.match(/^[^.!?]*[.!?](?:\s|$)/);
  return (terminal ? terminal[0] : `${compact}.`).trim();
}

function obviousSpeechGarbage(value) {
  const text = String(value ?? "").toLowerCase();
  return /\b(?:asdf[a-z]*|qwer[a-z]*|zxcv[a-z]*|[bcdfghjklmnpqrstvwxyz]{6,})\b/i.test(text);
}

function selfishConsequenceLine(kidText, detail, context = {}) {
  const beat = normalizedBeat(context.currentBeat);
  if (beat === "decision_1") {
    return "To save himself, the rabbit points the lion toward a deer by the river.";
  }
  if (beat === "decision_2" && causalBranchFor(context) === SELFISH_CAUSAL_BRANCH) {
    return "The rabbit stays safe, but the deer and forest animals stop trusting him.";
  }
  return `The rabbit keeps your ${detail} plan close and finds a fresh path through the forest.`;
}

function conciseConsequenceLine(spirit, detail, kidText = "", context = {}) {
  if (normalizedBeat(context.currentBeat) === "decision_2" && causalBranchFor(context) === SELFISH_CAUSAL_BRANCH) {
    if (spirit === "selfish") return selfishConsequenceLine(kidText, detail, context);
    if (spirit === "reckless") {
      return /distract|draw .*away|keep .*away/i.test(String(kidText ?? ""))
        ? "The distraction works by luck, not a clever trick, and the deer escapes."
        : "The warning works by luck, not a clever trick, and the deer escapes.";
    }
  }
  const lines = {
    clever: `The rabbit turns your ${detail} into a clever forest path.`,
    reckless: `The rabbit races from lion's rock after you ${detail}, then follows the dust path.`,
    kind: `The rabbit follows your ${detail} with a gentle step through the forest.`,
    selfish: selfishConsequenceLine(kidText, detail, context),
    unclear: `The forest carries your ${detail} into the next bright beat.`,
  };
  return lines[spirit] || lines.unclear;
}

function narratorLineIsGeneric(line) {
  return /what happens next|what should the rabbit do|say it again|tell me more|the rabbit heard your idea/i.test(line);
}

function narratorLineHasAwkwardSelfishPhrase(line) {
  return /\byour\s+(?:eat|hide|keep|save|guard)\b/i.test(line);
}

function normalizeNarratorLine(raw, { spirit, kidText, safetyFlag, currentBeat = "decision_1", playthroughState = null }) {
  if (safetyFlag) return "The forest stays gentle and safe.";
  const context = { currentBeat, playthroughState };
  const detail = obviousSpeechGarbage(kidText) ? "idea" : firstConcreteDetail(kidText);
  const causalConsequence =
    (isSelfishFirstDecision(context, spirit) || isSelfishCausalDecision(context)) &&
    spirit !== "unclear";
  if (causalConsequence) {
    return conciseConsequenceLine(spirit, detail, kidText, context);
  }
  let line = oneSentence(raw)
    .replace(/\byour\s+(?:don't|do not)\s+helps?\b/gi, "your brave words help")
    .replace(/\byour\s+doesn'?t\s+helps?\b/gi, "your brave words help");
  if (
    !line ||
    obviousSpeechGarbage(line) ||
    (spirit !== "unclear" &&
      (narratorLineIsGeneric(line) ||
        !line.toLowerCase().includes(detail.toLowerCase()) ||
        (spirit === "selfish" && narratorLineHasAwkwardSelfishPhrase(line))))
  ) {
    line = safetyFlag
      ? "The forest stays gentle and safe."
      : conciseConsequenceLine(spirit, detail, kidText, context);
  }
  const words = line.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  if (line.length > DIRECTOR_NARRATOR_MAX_CHARS || words.length > DIRECTOR_NARRATOR_MAX_WORDS) {
    line = conciseConsequenceLine(spirit, detail, kidText, context);
  }
  if (line.length > DIRECTOR_NARRATOR_MAX_CHARS || (line.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length > DIRECTOR_NARRATOR_MAX_WORDS) {
    line = oneSentence(line.split(/\s+/).slice(0, DIRECTOR_NARRATOR_MAX_WORDS).join(" "));
  }
  const bounded = line.slice(0, DIRECTOR_NARRATOR_MAX_CHARS).trim();
  if (/[.!?]$/.test(bounded)) return bounded;
  return `${bounded.slice(0, DIRECTOR_NARRATOR_MAX_CHARS - 1).trim()}.`;
}

export function fallbackSpiritForInput(kidText, { currentBeat = "decision_1", playthroughState = null } = {}) {
  const text = String(kidText ?? "").toLowerCase();
  if (isUnsafeKidInput(text)) return "unclear";
  if (normalizedBeat(currentBeat) === "decision_2" && playthroughState?.causal_branch === SELFISH_CAUSAL_BRANCH) {
    if (selfishDecisionTwoKind(text)) return "selfish";
    if (selfishDecisionTwoReckless(text)) return "reckless";
  }
  if (/eat someone else|another animal|for himself|for herself|for yourself|only me/.test(text)) return "selfish";
  // Kindness wins over a setting noun such as "well" in the canonical
  // warm path: "tell him gently to look in the well" is still kind.
  if (/friend|share|warm welcome|lullaby|sing|gentl|help|wait|stay|watch|talk to him/.test(text)) return "kind";
  if (/reflection|bigger lion|many rabbits|sky (is|was) falling|well grants wishes|trick|pretend|mislead|summon(?:s|ed)? the moon|joke about|do not taste good|don't taste good|taste bad|bad taste/.test(text)) {
    return "clever";
  }

  if (/punch|run away|dash|scream|hide|loud|fast|rush|throw(?:s|ing)? .*banana/.test(text)) return "reckless";
  // Explicit waiting is covered by the kind lane above. "Do not do
  // anything" supplies no interpretable story action, so it stays unclear
  // and follows the schema's reprompt path.
  return "unclear";
}

function isNoActionInput(kidText) {
  return NO_ACTION_INPUT.test(String(kidText ?? "").replace(/\s+/g, " ").trim());
}

function mustRepromptInput(kidText) {
  const text = String(kidText ?? "").replace(/\s+/g, " ").trim();
  return (
    !text ||
    isNoActionInput(text) ||
    obviousSpeechGarbage(text) ||
    /^(?:banana|ice cream|i want ice cream|tell him about santa(?: claus)?)[.!?]*$/i.test(text)
  );
}

export function fallbackDirectorResult(
  kidText = "",
  {
    checkpointReached = "CP1",
    beatsUsedAfter = 0,
    endingFlavor = "triumphant",
    currentBeat = "decision_1",
    playthroughState = null,
  } = {},
) {
  const safetyFlag = isUnsafeKidInput(kidText);
  const context = { currentBeat, playthroughState };
  const spirit = safetyFlag ? "unclear" : fallbackSpiritForInput(kidText, context);
  return normalizeDirectorResult(
    {
      spirit,
      world_instruction: safetyFlag ? "" : fallbackWorldInstruction(spirit, kidText, context),
      narrator_line: "",
      needs_reprompt: spirit === "unclear" || safetyFlag,
      safety_flag: safetyFlag,
    },
    { kidText, checkpointReached, beatsUsedAfter, endingFlavor, ...context },
  );
}

export function normalizeDirectorResult(
  raw,
  {
    kidText = "",
    checkpointReached = "CP1",
    beatsUsedAfter = 0,
    endingFlavor = "triumphant",
    currentBeat = "decision_1",
    playthroughState = null,
  } = {},
) {
  if (!raw || typeof raw !== "object") {
    throw new DirectorSchemaError("Director output is not an object");
  }

  const modelSpirit = SPIRIT_SET.has(raw.spirit) ? raw.spirit : null;
  const context = { currentBeat, playthroughState };
  const inferredSpirit = fallbackSpiritForInput(kidText, context);
  // The exact no-action phrase is the schema's reprompt case even if a model
  // response supplies a conflicting spirit label.
  const spirit = mustRepromptInput(kidText)
    ? "unclear"
    : inferredSpirit !== "unclear"
      ? inferredSpirit
      : modelSpirit;
  if (!spirit) throw new DirectorSchemaError("Director output has an invalid spirit");

  const safetyFlag = raw.safety_flag === true || isUnsafeKidInput(kidText);
  const rawNarratorLine = typeof raw.narrator_line === "string" ? raw.narrator_line : "";

  if (safetyFlag) {
    return {
      spirit: "unclear",
      world_instruction: "",
      narrator_line: normalizeNarratorLine(rawNarratorLine, { spirit: "unclear", kidText, safetyFlag, ...context }),
      needs_reprompt: true,
      safety_flag: true,
      checkpoint_reached: checkpointReached,
      beats_used_after: beatsUsedAfter,
      ending_flavor: endingFlavor,
    };
  }

  let worldInstruction =
    typeof raw.world_instruction === "string" ? raw.world_instruction.trim() : "";
  const causalConsequence =
    (isSelfishFirstDecision(context, spirit) || isSelfishCausalDecision(context)) &&
    (spirit === "selfish" || spirit === "reckless");
  const escapeInput = /\b(run away|escape|flee|dash)\b/i.test(kidText);
  const honorsEscape = /\b(runs?|races?|darts?|dashes?|flees?|scurries?|bounds?)\b/i.test(worldInstruction) && /dust path/i.test(worldInstruction);
  if (causalConsequence) {
    worldInstruction = fallbackWorldInstruction(spirit, kidText, context);
  } else if (
    !isWorldInstructionInvariantSafe(worldInstruction, kidText, { ...context, spirit }) ||
    isUnsafeKidInput(worldInstruction) ||
    (escapeInput && !honorsEscape)
  ) {
    worldInstruction = escapeInput
      ? "In the banyan forest, the rabbit races along the dust path from lion's rock while the lion follows through the forest."
      : fallbackWorldInstruction(spirit, kidText, context);
  }

  const narratorLine = normalizeNarratorLine(rawNarratorLine, {
    spirit,
    kidText,
    safetyFlag: false,
    ...context,
  });

  return {
    spirit,
    world_instruction: worldInstruction.slice(0, 400),
    narrator_line: narratorLine,
    // A recognized child action is terminal even if Claude asks for a
    // reprompt. This keeps the child choice from being discarded by a
    // contradictory boolean in an otherwise usable tool response.
    needs_reprompt: spirit === "unclear" || (raw.needs_reprompt === true && inferredSpirit === "unclear"),
    safety_flag: false,
    checkpoint_reached: checkpointReached,
    beats_used_after: beatsUsedAfter,
    ending_flavor: endingFlavor,
  };
}

export function assertDirectorResult(value) {
  if (!value || typeof value !== "object") {
    throw new DirectorSchemaError("Director response is not an object");
  }
  if (!SPIRIT_SET.has(value.spirit)) {
    throw new DirectorSchemaError("Director response has an invalid spirit");
  }
  if (typeof value.world_instruction !== "string" || value.world_instruction.length > 400) {
    throw new DirectorSchemaError("world_instruction must be a string of 400 characters or fewer");
  }
  if (typeof value.narrator_line !== "string" || !value.narrator_line.trim() || value.narrator_line.length > DIRECTOR_NARRATOR_MAX_CHARS) {
    throw new DirectorSchemaError(`narrator_line must be a non-empty string of ${DIRECTOR_NARRATOR_MAX_CHARS} characters or fewer`);
  }
  const narratorWords = value.narrator_line.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const narratorSentences = value.narrator_line.match(/[.!?]+(?=\s|$)/g) ?? [];
  if (narratorWords.length > DIRECTOR_NARRATOR_MAX_WORDS || narratorSentences.length !== 1) {
    throw new DirectorSchemaError("narrator_line must be one sentence of 15 words or fewer");
  }
  if (typeof value.needs_reprompt !== "boolean" || typeof value.safety_flag !== "boolean") {
    throw new DirectorSchemaError("Director boolean fields are invalid");
  }
  if (!DIRECTOR_CHECKPOINTS.includes(value.checkpoint_reached)) {
    throw new DirectorSchemaError("checkpoint_reached is invalid");
  }
  if (!Number.isInteger(value.beats_used_after) || value.beats_used_after < 0 || value.beats_used_after > DIRECTOR_BEATS_BUDGET) {
    throw new DirectorSchemaError(`beats_used_after must be an integer from 0 to ${DIRECTOR_BEATS_BUDGET}`);
  }
  if (!DIRECTOR_ENDING_FLAVORS.includes(value.ending_flavor)) {
    throw new DirectorSchemaError("ending_flavor is invalid");
  }
  if (value.safety_flag && value.world_instruction !== "") {
    throw new DirectorSchemaError("Safety-flagged output must not contain a world instruction");
  }
  if (!value.safety_flag) {
    const text = value.world_instruction;
    const basicWorldInstructionSafe = isWorldInstructionInvariantSafe(text);
    const causalSpiritAllowsBranch =
      isPurposefulCausalWorldInstruction(text) &&
      ((value.spirit === "selfish" && /\b(?:alone|satisfied|releases?|frees?|lopes?|trust(?:s|ed|ing)?|turns?)\b/i.test(text)) ||
        (value.spirit === "reckless" && /\b(?:warns?|distracts?|luck|escapes?)\b/i.test(text)) ||
        (value.spirit === "clever" && /\b(?:clever|clue|misleads?|false trail)\b/i.test(text)) ||
        (value.spirit === "kind" && /\b(?:gentle|guides?|together)\b/i.test(text)));
    const causalWorldInstructionSafe = causalSpiritAllowsBranch &&
      isWorldInstructionInvariantSafe(text, "", { allowPurposefulDeer: true, allowRiver: true });
    if (!basicWorldInstructionSafe && !causalWorldInstructionSafe) {
      throw new DirectorSchemaError("world_instruction violates the rabbit/lion continuity contract");
    }
  }
  if (value.spirit !== "unclear" && value.needs_reprompt) {
    throw new DirectorSchemaError("Recognized child actions must advance without a reprompt");
  }
  return value;
}
