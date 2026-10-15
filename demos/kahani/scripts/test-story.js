import { randomUUID } from "node:crypto";
import { app } from "../server.js";
import {
  assertDirectorResult,
  RECKLESS_MORAL_LINE,
  SELFISH_MORAL_LINE,
} from "../src/director-schema.js";

const nativeFetch = globalThis.fetch;
if (process.env.KAHANI_TEST_FAKE_ANTHROPIC === "1" || process.env.KAHANI_TEST_FAKE_DIRECTOR === "1") {
  process.env.GEMINI_API_KEY ||= "test-only-canonical-key";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com") || !url.includes(":generateContent")) {
      return nativeFetch(input, init);
    }
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              spirit: "clever",
              world_instruction: "In the banyan forest, the rabbit moves along the dust path from lion's rock toward the stone well.",
              narrator_line: "The forest path opens toward the stone well.",
              needs_reprompt: false,
              safety_flag: false,
              checkpoint_reached: "CP1",
              beats_used_after: 0,
              ending_flavor: "triumphant",
            }),
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

// These are canonical free-form probes, not UI choices. Each story has two
// child answers, one consequence after each, then the client-owned moral CP4.
const scenarios = [
  {
    name: "clever taste fork / triumphant",
    expectedSpirits: ["clever", "clever"],
    expectedFlavor: "triumphant",
    moralFlavor: "clever",
    turns: [
      ["decision_1", "I do not taste good"],
      ["decision_2", "Show him his reflection"],
    ],
  },
  {
    name: "clever / triumphant",
    expectedSpirits: ["clever", "clever"],
    expectedFlavor: "triumphant",
    moralFlavor: "clever",
    turns: [
      ["decision_1", "Tell him there is another lion in the well"],
      ["decision_2", "Show him his reflection"],
    ],
  },
  {
    name: "kind / warm",
    expectedSpirits: ["kind", "kind"],
    expectedFlavor: "triumphant",
    moralFlavor: "kind",
    turns: [
      ["decision_1", "Ask him to be friends and share a warm welcome"],
      ["decision_2", "Tell him gently to look in the well"],
    ],
  },
  {
    name: "reckless / narrow escape",
    expectedSpirits: ["reckless", "reckless"],
    expectedFlavor: "narrow_escape",
    moralFlavor: "reckless",
    turns: [
      ["decision_1", "Run away!"],
      ["decision_2", "Dash and shout loudly"],
    ],
  },
  {
    name: "selfish / comeuppance-lite",
    expectedSpirits: ["selfish", "selfish"],
    expectedFlavor: "comeuppance_lite",
    moralFlavor: "selfish",
    turns: [
      ["decision_1", "Tell him to eat someone else"],
      ["decision_2", "Tell the deer it is safe now"],
    ],
  },
  {
    name: "selfish first / reckless lucky escape",
    expectedSpirits: ["selfish", "reckless"],
    expectedFlavor: "narrow_escape",
    expectedFlavors: ["comeuppance_lite", "narrow_escape"],
    moralFlavor: "reckless",
    turns: [
      ["decision_1", "Tell him to eat someone else"],
      ["decision_2", "Warn the deer"],
    ],
  },
  {
    name: "kind setup / reckless resolution",
    expectedSpirits: ["kind", "reckless"],
    expectedFlavor: "narrow_escape",
    expectedFlavors: ["triumphant", "narrow_escape"],
    moralFlavor: "reckless",
    turns: [
      ["decision_1", "Ask him to be friends and share a warm welcome"],
      ["decision_2", "Dash and shout loudly"],
    ],
  },
  {
    name: "reckless setup / kind resolution",
    expectedSpirits: ["reckless", "kind"],
    expectedFlavor: "triumphant",
    expectedFlavors: ["narrow_escape", "triumphant"],
    moralFlavor: "kind",
    turns: [
      ["decision_1", "Run away!"],
      ["decision_2", "Wait and help him gently"],
    ],
  },
];

const moralLines = {
  clever: /clever mind|wit outmatches strength/i,
  kind: /gentleness|kindness/i,
  reckless: /luck|deer|clever plan/i,
  selfish: /stayed safe|stopped trusting|alone/i,
};

function checkpointNumber(value) {
  return { CP1: 0, CP2: 1, CP3: 2, CP4: 3 }[value] ?? -1;
}

async function runScenario(port, scenario) {
  const playthroughId = randomUUID();
  let previousCheckpoint = -1;
  let previousBeats = 0;
  const results = [];

  for (const [index, [currentBeat, kidText]] of scenario.turns.entries()) {
    const response = await fetch(`http://127.0.0.1:${port}/api/director`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playthrough_id: playthroughId,
        current_beat: currentBeat,
        prior_beats: results.map((result) => result.narrator_line),
        kid_text: kidText,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${scenario.name}: HTTP ${response.status} ${payload.error || ""}`);
    if (response.headers.get("x-kahani-playthrough-id") !== playthroughId) {
      throw new Error(`${scenario.name}: response changed the playthrough id`);
    }
    const result = assertDirectorResult(payload);
    const checkpoint = checkpointNumber(result.checkpoint_reached);
    if (checkpoint < previousCheckpoint) throw new Error(`${scenario.name}: checkpoint regressed`);
    if (result.beats_used_after !== previousBeats + 1) {
      throw new Error(`${scenario.name}: expected beat ${previousBeats + 1}, got ${result.beats_used_after}`);
    }
    const expectedCheckpoint = index === 0 ? "CP2" : "CP3";
    if (result.checkpoint_reached !== expectedCheckpoint) {
      throw new Error(`${scenario.name}: expected ${expectedCheckpoint}, got ${result.checkpoint_reached}`);
    }
    if (result.spirit !== scenario.expectedSpirits[index]) {
      throw new Error(`${scenario.name}: expected ${scenario.expectedSpirits[index]}, got ${result.spirit}`);
    }
    if (result.needs_reprompt) throw new Error(`${scenario.name}: canonical action was reprompted`);
    const expectedFlavor = scenario.expectedFlavors?.[index] || scenario.expectedFlavor;
    if (result.ending_flavor !== expectedFlavor) {
      throw new Error(`${scenario.name}: expected ${expectedFlavor}, got ${result.ending_flavor}`);
    }
    results.push(result);
    previousCheckpoint = checkpoint;
    previousBeats = result.beats_used_after;
  }

  if (results.length !== 2 || previousCheckpoint !== checkpointNumber("CP3")) {
    throw new Error(`${scenario.name}: expected exactly two decisions ending at CP3`);
  }
  // CP4 is deliberately client-owned: the second consequence finishes, then
  // one moral clip plays and the browser records the explicit moral checkpoint.
  const moralLine = {
    clever: "Because a clever mind is stronger than the loudest roar.",
    kind: "Because gentleness can tame what strength cannot.",
    reckless: RECKLESS_MORAL_LINE,
    selfish: SELFISH_MORAL_LINE,
  }[scenario.moralFlavor];
  if (!moralLines[scenario.moralFlavor].test(moralLine)) {
    throw new Error(`${scenario.name}: canonical moral clip is not coherent`);
  }
  console.log(`PASS ${scenario.name}: decisions=2 CP2->CP3 moral=CP4 End flavor=${scenario.expectedFlavor}`);
}

const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const { port } = server.address();
let failed = false;

try {
  for (const scenario of scenarios) {
    try {
      await runScenario(port, scenario);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${error.message}`);
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = nativeFetch;
}

console.log(`Canonical endings: ${failed ? "FAILED" : "PASS"} (${scenarios.length} scenarios)`);
if (failed) process.exitCode = 1;
