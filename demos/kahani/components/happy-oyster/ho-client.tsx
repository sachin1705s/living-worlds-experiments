"use client";

// One client surface.
//
// Every screen in this app talks to `useHappyOysterClient()`, never to the SDK
// hook directly. <LiveClientProvider> mounts the real <HappyOysterProvider> and
// adapts useHappyOyster() onto the surface below, rendering the live world into
// <HappyOysterVideo>.
//
// The surface is deliberately the shape of the SDK facade, so the adapter is a
// thin forwarding layer that keeps the SDK hook isolated to this file.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import {
  HappyOysterProvider,
  HappyOysterVideo,
  useHappyOyster,
  useHappyOysterTravelStatus,
} from "@reactor-models/happy-oyster/react";
import { connectWithPool } from "../../../../shared/reactor-capacity.js";
import AliRtcEngine from "aliyun-rtc-sdk";
import { setAliRtcRemoteAudioVolume } from "@/src/ali-rtc-audio.js";
import type {
  AdventureCommand,
  CreateWorldParams,
  HappyOysterMode,
  HappyOysterPhase,
  TravelStateMessage,
  WorldStateMessage,
} from "@reactor-models/happy-oyster";

export interface HappyOysterClient {
  phase: HappyOysterPhase;
  worldState: WorldStateMessage | null;
  travelState: TravelStateMessage | null;
  streaming: boolean;
  /** Seconds HappyOyster granted the live travel: null until one is open, and
   * for Directing travels, which run 3 min. */
  maxExperienceTimeSec: number | null;
  travelStatus: string;
  /** The last connect failure, humanized — cleared on the next attempt. */
  lastError: string | null;
  /** Open the Reactor session and sync the first world snapshot. */
  connect: () => Promise<void>;
  createWorld: (params: CreateWorldParams) => Promise<unknown>;
  attachWorld: (encryptedWorldId: string) => Promise<unknown>;
  startTravel: () => Promise<{ streaming: boolean }>;
  endTravelSession: () => Promise<void>;
  disconnect: () => Promise<void>;
  hold: (command: AdventureCommand) => Promise<void>;
  interact: (verb: string) => Promise<void>;
  release: (axes: {
    translation?: true;
    rotation?: true;
    interaction?: true;
  }) => Promise<void>;
  stop: () => Promise<void>;
  instruct: (content: string) => Promise<{ accepted: boolean }>;
  /** Set the AliRTC remote playout volume without touching Fish narrator audio. */
  setRemoteAudioVolume: (volume: number) => void;
}

interface ClientContextValue {
  client: HappyOysterClient;
  videoSlot: ReactNode;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function useHappyOysterClient(): HappyOysterClient {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error(
      "useHappyOysterClient must be used within a client provider",
    );
  }
  return ctx.client;
}

export function useVideoSlot(): ReactNode {
  const ctx = useContext(ClientContext);
  if (!ctx)
    throw new Error("useVideoSlot must be used within a client provider");
  return ctx.videoSlot;
}

// ── live ─────────────────────────────────────────────────────────────────────

// Local mode talks to a model served by the Reactor runtime on your own host
// (adventure on :8080, directing on :8081), skipping the Coordinator: connect()
// takes no JWT and there is no /tokens exchange. `local` lets the SDK pick the
// right per-mode port; an explicit VITE_COORDINATOR_URL always wins.
const LOCAL_RUNTIME = import.meta.env.VITE_HO_LOCAL_RUNTIME === "1";
const COORDINATOR_URL = import.meta.env.VITE_COORDINATOR_URL;

// The Reactor connection options, minus the mode the provider is mounted with.
const providerOptions = LOCAL_RUNTIME
  ? { local: true, ...(COORDINATOR_URL ? { apiUrl: COORDINATOR_URL } : {}) }
  : { apiUrl: COORDINATOR_URL ?? "https://api.reactor.inc" };

async function requestToken(keySlot: number): Promise<string> {
  const r = await fetch("/api/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keySlot }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  return body.jwt;
}

// The mode is fixed for the life of the session — it picks which Reactor model
// (adventure or directing) the session connects to — so the provider is mounted
// (and keyed) on it and switching experiences remounts a fresh session.
export function LiveClientProvider({
  mode,
  children,
}: {
  mode: HappyOysterMode;
  children: ReactNode;
}) {
  return (
    <HappyOysterProvider mode={mode} {...providerOptions}>
      <LiveClientBridge>{children}</LiveClientBridge>
    </HappyOysterProvider>
  );
}

// Session-level failures (no GPU capacity, bad key, network) belong next to
// the Connect button, not in the console. 429 is the one users actually hit:
// the Coordinator had no free GPU for the session.
function describeError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/\b429\b/.test(message))
    return "No GPU capacity available right now — try again in a moment.";
  return message;
}

function LiveClientBridge({ children }: { children: ReactNode }) {
  const ho = useHappyOyster();
  const [travelStatus, setTravelStatus] = useState("running");
  const [lastError, setLastError] = useState<string | null>(null);
  useHappyOysterTravelStatus(setTravelStatus);

  const setRemoteAudioVolume = useCallback((volume: number) => {
    if (typeof window === "undefined") return;
    setAliRtcRemoteAudioVolume(AliRtcEngine.getInstance(), volume);
  }, []);

  const generation = useRef(0);
  const pending = useRef<Promise<unknown> | null>(null);
  const jwt = useRef("");
  const connect = useCallback(async () => {
    if (pending.current) { await pending.current; return; }
    const run = generation.current;
    setLastError(null);
    const task = LOCAL_RUNTIME ? ho.connect() : connectWithPool({
      active: () => generation.current === run,
      token: requestToken,
      connect: async (token: string) => { jwt.current = token; await ho.connect(token); },
      cleanup: () => ho.disconnect(),
    });
    pending.current = task;
    try { await task; }
    catch (cause) { if (run === generation.current) setLastError(describeError(cause)); throw cause; }
    finally { if (pending.current === task) pending.current = null; }
  }, [ho]);

  const disconnect = useCallback(async () => {
    generation.current += 1;
    await pending.current?.catch(() => {});
    await ho.disconnect();
    jwt.current = "";
  }, [ho]);

  useEffect(() => {
    const leave = () => {
      generation.current += 1;
      const sessionId = ho.model.getSessionId();
      if (sessionId && jwt.current) navigator.sendBeacon("/api/reactor/session/end", new Blob([JSON.stringify({ sessionId, jwt: jwt.current })], { type: "application/json" }));
      void disconnect().catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [ho.model, disconnect]);

  const client = useMemo<HappyOysterClient>(
    () => ({
      phase: ho.phase,
      worldState: ho.worldState,
      travelState: ho.travelState,
      streaming: ho.streaming,
      maxExperienceTimeSec: ho.maxExperienceTimeSec,
      travelStatus,
      lastError,
      connect,
      createWorld: ho.createWorld,
      attachWorld: ho.attachWorld,
      startTravel: ho.startTravel,
      endTravelSession: ho.endTravelSession,
      disconnect,
      hold: ho.hold,
      interact: ho.interact,
      release: ho.release,
      stop: ho.stop,
      instruct: ho.instruct,
      setRemoteAudioVolume,
    }),
    [ho, travelStatus, lastError, connect, disconnect, setRemoteAudioVolume],
  );

  const value = useMemo<ClientContextValue>(
    () => ({
      client,
      videoSlot: (
        <HappyOysterVideo
          className="absolute inset-0 h-full w-full object-contain"
          muted
        />
      ),
    }),
    [client],
  );

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}
