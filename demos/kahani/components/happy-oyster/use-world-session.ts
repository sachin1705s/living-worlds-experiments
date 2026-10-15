"use client";

// The session driver behind the fixed layout. It owns the user's pending
// intent, walks the model through connect → create (or attach) → auto-travel,
// and reduces every render's SDK snapshot to the single AppView the layout
// renders from.
//
// The walk is phase-driven, not a one-shot script: dev StrictMode's phantom
// mount/unmount disconnects the model mid-connect, so reacting to the phase
// means any aborted step simply gets retried on the next render.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldStateMessage } from "@reactor-models/happy-oyster";
import type { WorldIntent } from "@/lib/worlds";
import {
  deriveJourney,
  deriveView,
  type AppView,
  type JourneyStep,
} from "@/lib/view";
import { readFailureCode } from "@/src/story-session.js";
import { useHappyOysterClient, type HappyOysterClient } from "./ho-client";

const WORLD_ACTION_TIMEOUT_MS = 180_000;

function failureReason(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String(cause.message);
  }
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

function logSessionFailure(
  stage: string,
  cause: unknown,
  context: { phase: string; worldPhase: string; intentKey: string | null },
) {
  console.error("[kahani] story session failure", {
    stage,
    code: readFailureCode(cause),
    reason: failureReason(cause),
    ...context,
  });
}

// The intent lives above the provider (HappyOysterApp) because the mode it
// carries decides which model the session connects to. This hook receives it,
// walks it through the client, and drives run/exit back up.
export interface WorldSessionInput {
  intent: WorldIntent | null;
  /** Set a new intent (and its mode) — invoked by the browse surfaces. */
  onRun: (intent: WorldIntent) => void;
  /** Drop the intent, back to browsing. */
  onClearIntent: () => void;
}

export interface WorldSession {
  view: AppView;
  /** The loading steps of the API's machine, for the loading pane. */
  journey: JourneyStep[];
  client: HappyOysterClient;
  /** What the session is running, null while browsing. */
  intent: WorldIntent | null;
  /** The generated first frame that seeds the world, once the model reports it. */
  seedFrame: string | null;
  starting: boolean;
  /** Run a new intent through the session. */
  run: (intent: WorldIntent) => void;
  /** Retry the current intent from scratch. */
  retry: () => void;
  /** Drop the intent and disconnect: back to browsing. */
  exit: () => void;
  beginTravel: () => void;
  /**
   * Call right before a deliberate `client.endTravelSession()` (e.g. after
   * the story's own closing narration). Suppresses the next
   * established-travel `phase === "ended" | "failed"` auto-exit, which
   * otherwise assumes any such transition means the travel died on its own
   * and drops all the way back to browsing — exactly what a caller ending
   * the travel on purpose, to show its own end screen, does not want.
   */
  suppressAutoExit: () => void;
}

export function useWorldSession({
  intent,
  onRun,
  onClearIntent,
}: WorldSessionInput): WorldSession {
  const client = useHappyOysterClient();
  const {
    phase,
    worldState,
    streaming,
    connect,
    createWorld,
    attachWorld,
    startTravel,
    disconnect,
  } = client;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tick, setTick] = useState(0);
  const [worldActionStartedAt, setWorldActionStartedAt] = useState<number | null>(
    null,
  );
  const busyRef = useRef(false);
  const connectTries = useRef(0);
  const lastConnectError = useRef<string | null>(null);
  const doneIntent = useRef<string | null>(null);
  const autoStarted = useRef<string | null>(null);

  const intentKey = intent
    ? `${attempt}:${
        intent.kind === "attach"
          ? intent.encryptedWorldId
          : JSON.stringify(intent.params)
      }`
    : null;

  useEffect(() => {
    if (!intent || !intentKey || error || busyRef.current) return;
    const step = (
      run: Promise<unknown>,
      onStepError: (cause: unknown) => void,
    ) => {
      busyRef.current = true;
      void run.catch(onStepError).finally(() => {
        busyRef.current = false;
        setTick((value) => value + 1);
      });
    };

    if (phase === "idle" || phase === "ended" || phase === "failed") {
      if (connectTries.current >= 3) {
        setError(lastConnectError.current ?? "Could not connect to the model.");
        return;
      }
      connectTries.current += 1;
      step(
        connect().then(() => {
          connectTries.current = 0;
        }),
        (cause) => {
          const reason = failureReason(cause);
          lastConnectError.current = reason;
          logSessionFailure("connect", cause, {
            phase,
            worldPhase: worldState?.phase ?? "none",
            intentKey,
          });
          // A missing model or a rejected session will not succeed on a
          // second dial. Timeouts are the only failures worth another try.
          if (!/timed out/i.test(reason)) setError(reason);
        },
      );
      return;
    }
    if (phase === "connected" && doneIntent.current !== intentKey) {
      doneIntent.current = intentKey;
      setWorldActionStartedAt(Date.now());
      step(
        intent.kind === "create"
          ? createWorld(intent.params)
          : attachWorld(intent.encryptedWorldId),
        (cause) => {
          logSessionFailure("world-action", cause, {
            phase,
            worldPhase: worldState?.phase ?? "none",
            intentKey,
          });
          setError(failureReason(cause));
        },
      );
    }
  }, [
    phase,
    tick,
    error,
    intentKey,
    intent,
    connect,
    createWorld,
    attachWorld,
  ]);

  useEffect(() => {
    if (!worldActionStartedAt || error || !intentKey) return;
    if (worldState?.phase === "ready" || worldState?.phase === "traveling") {
      setWorldActionStartedAt(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const timeoutError = new Error(
        "The forest took longer than three minutes to wake up.",
      );
      logSessionFailure("world-action-timeout", timeoutError, {
        phase,
        worldPhase: worldState?.phase ?? "none",
        intentKey,
      });
      setError(timeoutError.message);
    }, WORLD_ACTION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error, intentKey, phase, worldActionStartedAt, worldState?.phase]);

  useEffect(() => {
    if (worldState?.phase !== "failed") return;
    const stateDetails = worldState as WorldStateMessage & {
      error?: unknown;
      error_message?: unknown;
      reason?: unknown;
    };
    const reason =
      stateDetails.error_message ??
      stateDetails.error ??
      stateDetails.reason ??
      "HappyOyster reported that the world build failed.";
    logSessionFailure("world-state-failed", reason, {
      phase,
      worldPhase: worldState.phase,
      intentKey,
    });
  }, [intentKey, phase, worldState?.phase]);

  const run = useCallback(
    (next: WorldIntent) => {
      connectTries.current = 0;
      lastConnectError.current = null;
      setError(null);
      setWorldActionStartedAt(null);
      setAttempt((value) => value + 1);
      onRun(next);
    },
    [onRun],
  );

  const retry = useCallback(() => {
    connectTries.current = 0;
    lastConnectError.current = null;
    setError(null);
    setWorldActionStartedAt(null);
    setAttempt((value) => value + 1);
  }, []);

  const exit = useCallback(() => {
    void disconnect().catch(() => {});
    setError(null);
    onClearIntent();
  }, [disconnect, onClearIntent]);

  const beginTravel = useCallback(() => {
    setError(null);
    setStarting(true);
    void startTravel()
      .catch((cause) => {
        logSessionFailure("start-travel", cause, {
          phase,
          worldPhase: worldState?.phase ?? "none",
          intentKey,
        });
        setError(failureReason(cause));
      })
      .finally(() => setStarting(false));
  }, [intentKey, phase, startTravel, worldState?.phase]);

  // Auto-start once per intent: the first time its world reports ready, go
  // straight into the travel. Ending a travel lands back on the ready view
  // rather than looping into another.
  useEffect(() => {
    if (!intentKey || error || streaming || starting) return;
    if (phase !== "connected" || worldState?.phase !== "ready") return;
    if (autoStarted.current === intentKey) return;
    autoStarted.current = intentKey;
    beginTravel();
  }, [
    error,
    streaming,
    starting,
    phase,
    worldState?.phase,
    intentKey,
    beginTravel,
  ]);

  // Once this intent's world is up, a session drop exits to browse instead of
  // re-entering the connect loop — this example doesn't reconnect (SKILL.md).
  const established = useRef(false);
  useEffect(() => {
    established.current = false;
  }, [intentKey]);
  // Set right before a deliberate endTravelSession() call — see
  // suppressAutoExit below — so the very next "ended"/"failed" transition
  // this effect observes is treated as expected, not as a died-on-its-own
  // travel to drop the whole session for.
  const suppressNextAutoExit = useRef(false);
  useEffect(() => {
    // A new intent is a new session boundary; never carry an old deliberate
    // end exemption into a later travel.
    suppressNextAutoExit.current = false;
  }, [intentKey]);
  useEffect(() => {
    if (worldState?.phase === "ready" || worldState?.phase === "traveling")
      established.current = true;
    if (
      established.current &&
      intent &&
      (phase === "ended" || phase === "failed")
    ) {
      if (suppressNextAutoExit.current) {
        suppressNextAutoExit.current = false;
        return;
      }
      exit();
    }
  }, [phase, worldState?.phase, intent, exit]);

  const suppressAutoExit = useCallback(() => {
    suppressNextAutoExit.current = true;
  }, []);

  const autoStartPending =
    !!intentKey &&
    phase === "connected" &&
    worldState?.phase === "ready" &&
    autoStarted.current !== intentKey;

  const view = deriveView({
    intent,
    error,
    phase,
    worldState,
    streaming,
    starting,
    autoStartPending,
  });

  const journey = deriveJourney({
    intent,
    phase,
    worldState,
    streaming,
    starting,
    autoStartPending,
  });

  return {
    view,
    journey,
    client,
    intent,
    seedFrame: worldState?.first_frame ?? null,
    starting,
    run,
    retry,
    exit,
    beginTravel,
    suppressAutoExit,
  };
}
