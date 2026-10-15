import { randomUUID } from "node:crypto";
import { requestDirector } from "../src/director.js";

const nativeFetch = globalThis.fetch;
const localRequests = [];
const directorLogs = [];
const directorRequests = [];
const originalLog = console.log;
const originalApiKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "test-only-playthrough-key";

// Keep this regression deterministic and offline: the server still executes
// its real state machine, while only the upstream Gemini response is stubbed.
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("generativelanguage.googleapis.com") && url.includes(":generateContent")) {
    const body = JSON.parse(init?.body || "{}");
    const userMessage = (body.contents?.[0]?.parts || []).map((part) => part.text || "").join("\n");
    const kidText = userMessage.match(/CHILD'S EXACT WORDS[\s\S]*?<<<([\s\S]*?)>>>/)?.[1]?.trim() || "idea";
    const normalizedKidText = kidText.toLowerCase();
    directorRequests.push({ kidText, userMessage });
    const reprompt = normalizedKidText === "do not do anything";
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              // Deliberately give the model a conflicting spirit for clear inputs;
              // normalization must use the child's words as the schema's source
              // of truth. Only the exact do-nothing phrase is a reprompt.
              spirit: reprompt ? "unclear" : "clever",
              world_instruction: "In the banyan forest, the rabbit points along the dust path from lion's rock as the lion watches.",
              narrator_line: reprompt
                ? "The rabbit pauses in the forest and waits for your next idea."
                : "The rabbit follows your idea along the dust path.",
              needs_reprompt: reprompt,
              safety_flag: false,
              checkpoint_reached: "CP1",
              beats_used_after: 0,
              ending_flavor: "triumphant",
            }),
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("http://127.0.0.1:")) {
    localRequests.push({
      body: JSON.parse(init?.body || "{}"),
      headers: new Headers(init?.headers),
    });
  }
  return nativeFetch(input, init);
};

console.log = (...args) => {
  originalLog(...args);
  if (typeof args[0] !== "string") return;
  try {
    const entry = JSON.parse(args[0]);
    if (entry.route === "/api/director") directorLogs.push(entry);
  } catch {
    // Human-readable server logs are not part of this assertion.
  }
};

const { app } = await import("../server.js");
const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const { port } = server.address();
const endpoint = `http://127.0.0.1:${port}/api/director`;

async function turn({ playthroughId, currentBeat, kidText, priorBeats = [], onPlaythroughId }) {
  return requestDirector(
    { currentBeat, kidText, priorBeats, playthroughId },
    { retries: 0, endpoint, onPlaythroughId },
  );
}

function assertCausalFirst(first, label) {
  if (first.spirit !== "selfish" || first.needs_reprompt || first.beats_used_after !== 1 || first.checkpoint_reached !== "CP2" || first.ending_flavor !== "comeuppance_lite") {
    throw new Error(`${label}: decision 1 did not establish the selfish CP2 branch: ${JSON.stringify(first)}`);
  }
  if (!/save himself/i.test(first.narrator_line) || !/points the lion/i.test(first.narrator_line) || !/river|deer/i.test(first.narrator_line)) {
    throw new Error(`${label}: rabbit's selfish causal choice is missing from narrator: ${first.narrator_line}`);
  }
  if (!/rabbit points/i.test(first.world_instruction) || !/satisfied/i.test(first.world_instruction) || !/releases?/i.test(first.world_instruction) || !/lopes?/i.test(first.world_instruction) || !/river/i.test(first.world_instruction) || !/deer/i.test(first.world_instruction)) {
    throw new Error(`${label}: lion-release consequence is missing from world beat: ${first.world_instruction}`);
  }
  if (/named deer|deer you named|your named deer/i.test(`${first.narrator_line} ${first.world_instruction}`)) {
    throw new Error(`${label}: route falsely claims that the child named the deer`);
  }
  if (/berries|stone well/i.test(`${first.narrator_line} ${first.world_instruction}`)) {
    throw new Error(`${label}: future prop survived the selfish lion-release transition`);
  }
}

function assertCausalPrompt(request, label) {
  if (!request || request.kidText === "do not do anything") return;
  const causalSection = request.userMessage.split("CAUSAL DECISION-2 SITUATION")[1] || "";
  const causalCore = causalSection.split("Do not introduce the stone well")[0];
  if (
    !request.userMessage.includes("CAUSAL DECISION-2 SITUATION") ||
    !/deer asks whether the lion is nearby/i.test(causalCore) ||
    !/river/i.test(causalCore) ||
    !/live scene must show the rabbit meeting this deer before the question/i.test(causalCore) ||
    /stone well/i.test(causalCore)
  ) {
    throw new Error(`${label}: decision 2 request did not carry the causal deer/river situation`);
  }
}

function assertSelfishFirstPrompt(request, label) {
  const causalSection = request?.userMessage.split("CAUSAL DECISION-1 SELFISH CONTINUATION")[1] || "";
  const causalCore = causalSection.split("Do not mention or introduce the stone well")[0];
  if (
    !request ||
    !request.userMessage.includes("CAUSAL DECISION-1 SELFISH CONTINUATION") ||
    !/rabbit visibly points the lion toward a deer by the river/i.test(causalCore) ||
    !/satisfied lion releases him/i.test(causalCore) ||
    !/never say the child named, chose, or previously mentioned it/i.test(causalCore) ||
    /named deer|deer you named|your named deer/i.test(causalCore) ||
    /stone well|berries/i.test(causalCore)
  ) {
    throw new Error(`${label}: decision 1 request did not carry the no-well lion-release continuation`);
  }
}

async function runBranch({ label, secondText, expectedSpirit, expectedFlavor, narratorPattern, worldPattern }) {
  let playthroughId = null;
  let capturedId = null;
  const first = await turn({
    currentBeat: "decision_1",
    kidText: "Tell him to eat someone else",
    onPlaythroughId: (id) => { capturedId ||= id; },
  });
  if (!capturedId) throw new Error(`${label}: generated id was not adopted`);
  playthroughId = capturedId;
  assertCausalFirst(first, label);
  assertSelfishFirstPrompt(directorRequests.at(-1), label);

  const second = await turn({
    currentBeat: "decision_2",
    kidText: secondText,
    playthroughId,
    priorBeats: [first.narrator_line],
    onPlaythroughId: (id) => {
      if (id !== playthroughId) throw new Error(`${label}: server changed the playthrough id`);
    },
  });
  if (second.spirit !== expectedSpirit || second.needs_reprompt || second.beats_used_after !== 2 || second.checkpoint_reached !== "CP3" || second.ending_flavor !== expectedFlavor) {
    throw new Error(`${label}: decision 2 outcome was wrong: ${JSON.stringify(second)}`);
  }
  if (!narratorPattern.test(second.narrator_line) || !worldPattern.test(second.world_instruction)) {
    throw new Error(`${label}: decision 2 consequence lost its authored flavor: ${JSON.stringify(second)}`);
  }
  if (/berries|stone well/i.test(`${second.narrator_line} ${second.world_instruction}`)) {
    throw new Error(`${label}: future prop survived decision 2`);
  }
  assertCausalPrompt(directorRequests.at(-1), label);
  const log = directorLogs.at(-1);
  if (log?.causal_branch !== "selfish_lion_release" || !/deer asks whether the lion is nearby/i.test(log?.decision_2_situation || "")) {
    throw new Error(`${label}: telemetry did not retain causal decision-2 state: ${JSON.stringify(log)}`);
  }
  return { playthroughId, first, second };
}

try {
  await runBranch({
    label: "selfish comeuppance",
    secondText: "Tell the deer it is safe now",
    expectedSpirit: "selfish",
    expectedFlavor: "comeuppance_lite",
    narratorPattern: /safe|trust/i,
    worldPattern: /deer|river/i,
  });
  await runBranch({
    label: "reckless narrow escape",
    secondText: "Warn the deer",
    expectedSpirit: "reckless",
    expectedFlavor: "narrow_escape",
    narratorPattern: /luck|warning/i,
    worldPattern: /deer|river|luck/i,
  });

  const repromptId = randomUUID();
  const repromptFirst = await turn({ currentBeat: "decision_1", kidText: "Tell him to eat someone else", playthroughId: repromptId });
  assertCausalFirst(repromptFirst, "decision-2 reprompt");
  const reprompt = await turn({ currentBeat: "decision_2", kidText: "do not do anything", playthroughId: repromptId, priorBeats: [repromptFirst.narrator_line] });
  if (reprompt.spirit !== "unclear" || !reprompt.needs_reprompt || reprompt.beats_used_after !== 1 || reprompt.checkpoint_reached !== "CP2" || reprompt.ending_flavor !== "comeuppance_lite") {
    throw new Error(`exact do-nothing phrase did not reprompt inside decision 2: ${JSON.stringify(reprompt)}`);
  }
  const validAfterReprompt = await turn({ currentBeat: "decision_2", kidText: "say nothing", playthroughId: repromptId, priorBeats: [repromptFirst.narrator_line] });
  if (validAfterReprompt.spirit !== "selfish" || validAfterReprompt.needs_reprompt || validAfterReprompt.beats_used_after !== 2 || validAfterReprompt.checkpoint_reached !== "CP3") {
    throw new Error(`clear decision-2 answer after reprompt did not advance: ${JSON.stringify(validAfterReprompt)}`);
  }
  if (directorLogs.at(-1)?.path_summary?.some((entry) => entry.kid_text === "do not do anything")) {
    throw new Error("reprompt attempt was incorrectly recorded as a third path entry");
  }

  const sameIdRequests = localRequests.filter((request) => request.headers.get("x-kahani-playthrough-id") === repromptId);
  if (sameIdRequests.length !== 3 || directorLogs.at(-1)?.beats_used !== 2) {
    throw new Error(`decision-2 reprompt did not stay on one id/beat sequence: requests=${sameIdRequests.length}`);
  }
  const secondDecisionRequests = directorRequests.filter((request) => request.kidText !== "Tell him to eat someone else");
  if (secondDecisionRequests.some((request) => request.kidText !== "do not do anything" && !/deer|lion/i.test(request.userMessage))) {
    throw new Error("offline selfish playthrough included an unexpected third decision input");
  }
  originalLog("PASS causal selfish playthrough: lion-release setup, selfish comeuppance, reckless lucky escape, and decision-2-only reprompt all preserve CP2/CP3 state");
} finally {
  await new Promise((resolve) => server.close(resolve));
  console.log = originalLog;
  globalThis.fetch = nativeFetch;
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
}
