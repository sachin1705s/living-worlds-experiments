"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Verdict {
  id: number;
  at: number;
  beat: string;
  take: number;
  match: number;
  reading: string;
  missing: string[];
  repair: string | null;
  /** Set when the check itself failed rather than the picture. */
  error?: string;
}

export interface HarnessSettings {
  enabled: boolean;
  /** Sample one frame out of every N the video paints. */
  sampleEvery: number;
  /** How often a sampled frame is actually sent to Gemini. */
  checkEveryMs: number;
  /** Below this score the shot counts as a miss. */
  threshold: number;
  /** Consecutive misses before the harness reprompts. */
  strikes: number;
  /** How many times the harness may reprompt one beat. */
  maxRepairs: number;
  /** Score and log, but never reprompt. */
  observeOnly: boolean;
}

export const DEFAULT_HARNESS: HarnessSettings = {
  enabled: true,
  sampleEvery: 4,
  checkEveryMs: 2600,
  threshold: 62,
  strikes: 2,
  maxRepairs: 1,
  observeOnly: false,
};

const SAMPLE_WIDTH = 448;
const RING = 3;

interface Args {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The clip currently on the tracks, or null when nothing is playing. */
  watching: { beat: string; take: number; prompt: string; intent: string } | null;
  geminiKey: string;
  settings: HarnessSettings;
  /** Called once per beat when the harness decides the shot has to be rebuilt. */
  onRepair: (repairedPrompt: string, verdict: Verdict) => void;
}

/**
 * Watches the live video the way a supervisor would: it takes every Nth frame
 * the element paints, and every few seconds hands the most recent samples to
 * Gemini together with the prompt that asked for them. Two bad reads in a row
 * and it writes a corrected prompt and calls `onRepair`.
 */
export function useFrameHarness({ videoRef, watching, geminiKey, settings, onRepair }: Args) {
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [sampled, setSampled] = useState(0);
  const [latest, setLatest] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);

  const ring = useRef<string[]>([]);
  const frameCount = useRef(0);
  const misses = useRef(0);
  const repairs = useRef<Record<string, number>>({});
  const inflight = useRef(false);
  const verdictId = useRef(0);
  const watchRef = useRef(watching);
  watchRef.current = watching;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onRepairRef = useRef(onRepair);
  onRepairRef.current = onRepair;

  // A new beat is a clean slate: old samples describe a shot that is gone.
  useEffect(() => {
    ring.current = [];
    frameCount.current = 0;
    misses.current = 0;
    setSampled(0);
    setLatest(null);
  }, [watching?.beat, watching?.take]);

  const reset = useCallback(() => {
    ring.current = [];
    frameCount.current = 0;
    misses.current = 0;
    repairs.current = {};
    setVerdicts([]);
    setLatest(null);
    setSampled(0);
  }, []);

  /* ---- the sampler: every Nth painted frame lands in a 3-slot ring ---- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !settings.enabled || !watching) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let stopped = false;
    let handle = 0;

    const grab = () => {
      if (stopped || video.videoWidth === 0) return;
      frameCount.current += 1;
      if (frameCount.current % Math.max(1, settingsRef.current.sampleEvery) !== 0) return;

      const scale = SAMPLE_WIDTH / video.videoWidth;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", 0.62).split(",")[1];
      ring.current = [...ring.current, b64].slice(-RING);
      setSampled((n) => n + 1);
    };

    // rVFC gives real frame cadence, so "every 4th frame" means every 4th frame.
    const hasRvfc = typeof (video as HTMLVideoElement & {
      requestVideoFrameCallback?: unknown;
    }).requestVideoFrameCallback === "function";

    if (hasRvfc) {
      const tick = () => {
        if (stopped) return;
        grab();
        handle = (video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }).requestVideoFrameCallback(tick);
      };
      handle = (video as HTMLVideoElement & {
        requestVideoFrameCallback: (cb: () => void) => number;
      }).requestVideoFrameCallback(tick);
      return () => {
        stopped = true;
        (video as HTMLVideoElement & {
          cancelVideoFrameCallback?: (h: number) => void;
        }).cancelVideoFrameCallback?.(handle);
      };
    }

    // Fallback for browsers without rVFC: 24fps by the clock.
    const id = window.setInterval(grab, 1000 / 24);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [videoRef, settings.enabled, watching]);

  /* ---- the check: hand the ring to Gemini on a slower clock ---- */
  useEffect(() => {
    if (!settings.enabled || !watching || !geminiKey) return;

    const run = async () => {
      const now = watchRef.current;
      if (!now || inflight.current || ring.current.length === 0) return;
      inflight.current = true;
      setBusy(true);
      const frames = [...ring.current];

      try {
        const r = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: geminiKey,
            prompt: now.prompt,
            intent: now.intent,
            frames,
          }),
        });
        const data = await r.json();
        verdictId.current += 1;

        const verdict: Verdict = r.ok
          ? {
              id: verdictId.current,
              at: Date.now(),
              beat: now.beat,
              take: now.take,
              match: data.match,
              reading: data.reading,
              missing: data.missing ?? [],
              repair: data.repair ?? null,
            }
          : {
              id: verdictId.current,
              at: Date.now(),
              beat: now.beat,
              take: now.take,
              match: -1,
              reading: "",
              missing: [],
              repair: null,
              error: data.error ?? `Vision check failed (${r.status}).`,
            };

        setLatest(verdict);
        setVerdicts((v) => [verdict, ...v].slice(0, 40));

        if (verdict.error) return;

        const s = settingsRef.current;
        if (verdict.match < s.threshold) misses.current += 1;
        else misses.current = 0;

        const used = repairs.current[now.beat] ?? 0;
        if (
          !s.observeOnly &&
          misses.current >= s.strikes &&
          used < s.maxRepairs &&
          verdict.repair
        ) {
          repairs.current[now.beat] = used + 1;
          misses.current = 0;
          onRepairRef.current(verdict.repair, verdict);
        }
      } catch (err) {
        verdictId.current += 1;
        const verdict: Verdict = {
          id: verdictId.current,
          at: Date.now(),
          beat: now.beat,
          take: now.take,
          match: -1,
          reading: "",
          missing: [],
          repair: null,
          error: err instanceof Error ? err.message : "Vision check failed.",
        };
        setLatest(verdict);
        setVerdicts((v) => [verdict, ...v].slice(0, 40));
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    };

    const id = window.setInterval(run, Math.max(1200, settings.checkEveryMs));
    return () => window.clearInterval(id);
  }, [settings.enabled, settings.checkEveryMs, watching, geminiKey]);

  return { verdicts, latest, sampled, busy, reset };
}
