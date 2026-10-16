import {
  assertDirectorResult,
  DirectorSchemaError,
  isUnsafeKidInput,
} from "./director-schema.js";

export class DirectorError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "DirectorError";
    this.status = status;
  }
}

const playthroughTokens = new Map();

const EMPTY_INPUT_RESULT = {
  spirit: "unclear",
  world_instruction:
    "In the banyan forest, the rabbit pauses beside lion's rock along the dust path as the lion watches.",
  narrator_line: "The rabbit pauses in the forest and waits for your next idea.",
  needs_reprompt: true,
  safety_flag: false,
  checkpoint_reached: "CP1",
  beats_used_after: 0,
  ending_flavor: "triumphant",
};

/** @typedef {{currentBeat?: string, priorBeats?: string[], kidText?: string, playthroughId?: string, signal?: AbortSignal}} DirectorRequest */
/** @typedef {{fetchImpl?: typeof globalThis.fetch, retries?: number, endpoint?: string, onPlaythroughId?: (id: string) => void}} DirectorClientOptions */

function transientStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * Ask the server-side director. The empty-input branch is intentional: the
 * microphone/text client should not spend an API call on silence.
 */
export async function requestDirector(
  /** @type {DirectorRequest} */
  { currentBeat = "decision_1", priorBeats = [], kidText = "", playthroughId, signal } = {},
  /** @type {DirectorClientOptions} */
  {
    fetchImpl = globalThis.fetch,
    retries = 2,
    endpoint = "/api/director",
    onPlaythroughId,
  } = {},
) {
  if (!String(kidText ?? "").trim()) return { ...EMPTY_INPUT_RESULT };
  if (typeof fetchImpl !== "function") {
    throw new DirectorError("This environment does not provide fetch");
  }

  let currentPlaythroughId = playthroughId;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentPlaythroughId
            ? { "X-Kahani-Playthrough-Id": currentPlaythroughId }
            : {}),
        },
        body: JSON.stringify({
          current_beat: currentBeat,
          prior_beats: priorBeats,
          kid_text: String(kidText),
          ...(currentPlaythroughId ? { playthrough_id: currentPlaythroughId, playthrough_state: playthroughTokens.get(currentPlaythroughId) } : {}),
        }),
        signal,
      });
      const responsePlaythroughId = response.headers?.get?.("X-Kahani-Playthrough-Id");
      if (responsePlaythroughId) {
        currentPlaythroughId = responsePlaythroughId;
        if (typeof onPlaythroughId === "function") onPlaythroughId(responsePlaythroughId);
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error || `Director request failed (${response.status})`;
        throw new DirectorError(message, { status: response.status });
      }
      try {
        const result = assertDirectorResult(payload);
        const state = response.headers?.get?.("X-Kahani-Playthrough-State");
        if (state && currentPlaythroughId) {
          playthroughTokens.set(currentPlaythroughId, state);
          if (playthroughTokens.size > 10) playthroughTokens.delete(playthroughTokens.keys().next().value);
        }
        return result;
      } catch (error) {
        if (error instanceof DirectorSchemaError) {
          throw new DirectorError(`Invalid director response: ${error.message}`, { cause: error });
        }
        throw error;
      }
    } catch (error) {
      lastError = error instanceof DirectorError ? error : new DirectorError(error.message, { cause: error });
      if (attempt >= retries || (lastError.status && !transientStatus(lastError.status))) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  throw lastError;
}

export { assertDirectorResult, isUnsafeKidInput };
