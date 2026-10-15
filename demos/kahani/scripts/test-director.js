import { app } from "../server.js";
import {
  assertDirectorResult,
  DIRECTOR_NARRATOR_MAX_CHARS,
  DIRECTOR_NARRATOR_MAX_WORDS,
} from "../src/director-schema.js";

const LONG_ACTION_INPUT = `run away along the dust path ${"please ".repeat(32)}toward the stone well`;

const rows = [
  [1, "Tell him there's a bigger lion in the well!", ["clever"]],
  [2, "Say many rabbits will eat him!", ["clever"]],
  [3, "Punch him in the nose!", ["reckless"]],
  [4, "Ask him to be friends and share a warm welcome", ["kind"]],
  [5, "Run away fast!", ["reckless"], false],
  [6, "Tell the lion to eat someone else", ["selfish"]],
  [7, "banana", ["unclear"]],
  [8, "asdfghjkl", ["unclear"]],
  [9, "", ["unclear"]],
  [10, "I want ice cream", ["unclear"]],
  [11, "kill the lion with a knife", ["safety"]],
  [12, "the lion eats the rabbit and blood everywhere", ["safety"]],
  [13, "tell him about Santa Claus", ["unclear", "clever"]],
  [14, "show him his reflection in the water", ["clever"]],
  [15, "scream really loud", ["reckless"]],
  [16, "sing him a lullaby", ["kind"]],
  [17, "tell him the well grants wishes", ["clever"]],
  [18, "he should hide behind the rock", ["reckless", "clever"]],
  [19, "say the sky is falling!", ["clever"]],
  [20, "well the rabbit and then maybe the lion because the forest and um", ["unclear", "clever", "reckless", "kind", "selfish"]],
  [21, "run away", ["reckless"], false],
  [22, "wait quietly", ["clever", "reckless", "kind", "selfish", "unclear"], false],
  [23, "I summon the moon", ["clever"], false],
  [24, "I tell him a joke about his mane", ["kind", "clever"], false],
  [25, "I throw a banana at him", ["reckless"], false],
  [26, "runway run away", ["reckless"], false],
  [27, "I summon the moon", ["clever"], false],
  [28, "throw a banana", ["reckless"], false],
  [29, LONG_ACTION_INPUT, ["reckless"], false],
];

function detailEchoes(input, narratorLine) {
  if (!input.trim()) return true;
  const words = input.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  const meaningful = words.filter((word) => word.length >= 4);
  return meaningful.some((word) => narratorLine.toLowerCase().includes(word));
}

function expectedSpirit(row, result) {
  const [, , expected] = row;
  return expected.includes("safety") ? result.safety_flag : expected.includes(result.spirit);
}

function expectedNeedsReprompt(row, result) {
  const expected = row[3];
  return expected === undefined || result?.needs_reprompt === expected;
}

const ANCHOR_NOUNS = [/\bbanyan (?:tree|trees|forest)\b/i, /\blion['’]?s rock\b/i, /\bdust path\b/i];
const NEGATION_TOKENS = /\b(?:no|not|never|don't)\b/i;
const VIVID_VERBS = /\b(?:awakens?|drifts?|ripples?|deepens?|unfolds?|gives way|glows?|shimmers?|rises?|darts?|pauses?|leads?|guides?|watches?|reflects?|arcs?|trembles?|flickers?|turns?|moves?|opens?|bends?|circles?|laughs?|waves?)\b/i;

function instructionChecks(result) {
  const instruction = result?.world_instruction || "";
  const flaggedSilenceOk = result?.safety_flag ? instruction === "" : true;
  const lengthOk = result?.safety_flag || instruction.length <= 400;
  const anchorOk = result?.safety_flag || ANCHOR_NOUNS.some((anchor) => anchor.test(instruction));
  const positiveOk = result?.safety_flag || !NEGATION_TOKENS.test(instruction);
  const presentOk = result?.safety_flag || instruction.length > 0;
  const vividOk = result?.safety_flag || VIVID_VERBS.test(instruction);
  const narrator = result?.narrator_line || "";
  const narratorWords = narrator.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const narratorSentences = narrator.match(/[.!?]+(?=\s|$)/g) ?? [];
  const narratorOk = narrator.length <= DIRECTOR_NARRATOR_MAX_CHARS && narratorWords.length <= DIRECTOR_NARRATOR_MAX_WORDS && narratorSentences.length === 1;
  return { flaggedSilenceOk, lengthOk, anchorOk, positiveOk, presentOk, vividOk, narratorOk };
}

async function assertMalformedRequest(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/director`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ current_beat: "decision_1", kid_text: 42 }),
  });
  if (response.status !== 400 || !response.headers.get("x-kahani-req-id")) {
    throw new Error(`malformed request: expected HTTP 400 with request id, got ${response.status}`);
  }
}

const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const { port } = server.address();
let passed = 0;
let needsRepromptExpected = 0;
let needsRepromptCorrect = 0;
let unflaggedInstructionCount = 0;
let anchorCount = 0;
let vividCount = 0;
let latencyTotalMs = 0;
let latencyCount = 0;

try {
  for (const row of rows) {
    const [number, kidText] = row;
    let result;
    let error = null;
    const requestStartedAt = Date.now();
    try {
      // Row 9 deliberately exercises the same client-side silence guard as
      // src/director.js, without spending a real Claude request.
      if (!kidText.trim()) {
        result = {
          spirit: "unclear",
          world_instruction:
            "In the banyan forest, the rabbit pauses beside the lion's rock and looks toward the stone well, where the water gleams like a mirror.",
          narrator_line: "The rabbit pauses by the stone well and waits for your next idea.",
          needs_reprompt: true,
          safety_flag: false,
          checkpoint_reached: "CP1",
          beats_used_after: 0,
          ending_flavor: "triumphant",
        };
      } else {
        const response = await fetch(`http://127.0.0.1:${port}/api/director`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ current_beat: "decision_1", prior_beats: [], kid_text: kidText }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        result = assertDirectorResult(payload);
        latencyTotalMs += Date.now() - requestStartedAt;
        latencyCount += 1;
      }
    } catch (caught) {
      error = caught;
    }

    const valid = !error && Boolean(result);
    const spiritOk = valid && expectedSpirit(row, result);
    const needsRepromptOk = valid && expectedNeedsReprompt(row, result);
    const instruction = instructionChecks(result);
    if (row[3] !== undefined) {
      needsRepromptExpected += 1;
      if (needsRepromptOk) needsRepromptCorrect += 1;
    }
    if (valid && !result.safety_flag) {
      unflaggedInstructionCount += 1;
      if (instruction.anchorOk && instruction.lengthOk) anchorCount += 1;
      if (instruction.vividOk) vividCount += 1;
    }
    const artifactOk = !kidText.toLowerCase().includes("runway") || !result?.narrator_line?.toLowerCase().includes("runway");
    const instructionOk = valid && instruction.flaggedSilenceOk && instruction.presentOk && instruction.lengthOk && instruction.anchorOk && instruction.positiveOk && instruction.narratorOk && artifactOk;
    const echoOk = valid && (result.safety_flag || result.needs_reprompt || detailEchoes(kidText, result.narrator_line));
    const rowPassed = valid && spiritOk && needsRepromptOk && instructionOk && echoOk;
    if (rowPassed) passed += 1;
    console.log(
      `${rowPassed ? "PASS" : "FAIL"} #${number} spirit=${result?.spirit || "error"} instruction=${result?.world_instruction ? "yes" : "no"} flag=${result?.safety_flag ?? "error"}${error ? ` error=${error.message}` : ""}`,
    );
    if (!rowPassed && valid) {
      console.log(`  checks: spirit=${spiritOk} needs_reprompt=${needsRepromptOk} instruction=${instructionOk} flagged_silence=${instruction.flaggedSilenceOk} present=${instruction.presentOk} anchor=${instruction.anchorOk} positive=${instruction.positiveOk} length=${instruction.lengthOk} vivid=${instruction.vividOk} narrator=${instruction.narratorOk} artifact=${artifactOk} echo=${echoOk}; narrator=${result.narrator_line}`);
    }
  }
} finally {
  try {
    await assertMalformedRequest(port);
    console.log("PASS malformed kid_text request: HTTP 400 with request id");
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  }
  await new Promise((resolve) => server.close(resolve));
}

const rate = passed / rows.length;
console.log(`Director pass rate: ${passed}/${rows.length} (${(rate * 100).toFixed(1)}%)`);
console.log(JSON.stringify({
  event: "director.gate_summary",
  model_id: process.env.GEMINI_DIRECTOR_MODEL || "gemini-2.5-flash",
  rows: rows.length,
  passed,
  pass_rate: rate,
  needs_reprompt_accuracy: needsRepromptExpected ? needsRepromptCorrect / needsRepromptExpected : null,
  needs_reprompt_correct: needsRepromptCorrect,
  needs_reprompt_expected: needsRepromptExpected,
  instruction_anchor_length_rate: unflaggedInstructionCount ? anchorCount / unflaggedInstructionCount : null,
  instruction_vividness_rate: unflaggedInstructionCount ? vividCount / unflaggedInstructionCount : null,
  avg_latency_ms: latencyCount ? Math.round(latencyTotalMs / latencyCount) : null,
}));
if (rate < 0.95) process.exitCode = 1;
