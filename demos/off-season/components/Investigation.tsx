"use client";
import { endSessionOnLeave } from "@/lib/keys";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useFastH3,
  useFastH3ClipFailed,
  useFastH3ClipFinished,
  useFastH3ClipGenerated,
  useFastH3ClipStarted,
  useFastH3ClipStopped,
  useFastH3CommandError,
  useFastH3StateUpdate,
  useFastH3Track,
} from "@reactor-models/fast-h3";
import type { FastH3StateUpdateMessage } from "@reactor-models/fast-h3/core";
import {
  ALL_EVIDENCE,
  CASE,
  type Evidence,
  type EvidenceId,
  type Hotspot,
  ROOM_BY_ID,
  START_ROOM,
} from "@/lib/case";
import { beatKey, makeTag, parseTag } from "@/lib/tag";
import { DEFAULT_HARNESS, type HarnessSettings, type Verdict, useFrameHarness } from "@/lib/harness";
import CaseFile from "@/components/CaseFile";
import HarnessPanel from "@/components/HarnessPanel";
import Hotspots from "@/components/Hotspots";
import Report from "@/components/Report";
import { registerShowcaseStop } from "@/components/ShowcaseBridge";
import { GEMINI_KEY, REACTOR_KEY, writeKey, forgetToken } from "@/lib/keys";

type Phase = "waiting" | "building" | "playing" | "held" | "failed";

interface Beat {
  key: string;
  room: string;
  hotspot?: string;
  prompt: string;
  intent: string;
  take: number;
  clipId?: string;
  fromCache: boolean;
}

interface PendingRepair {
  clipId: string;
  prompt: string;
  take: number;
  forKey: string;
}

/** fast-h3 bills 70 credits a second; 10,000 credits is a dollar. */
export default function Investigation() {
  const router = useRouter();
  const { sessionId, status, connect, disconnect, enqueue, play, stop, setAutoplay, setClipSeconds, setFlushOnClipEnd } =
    useFastH3();

  useEffect(() => {
    const leave = () => {
      if (sessionId) endSessionOnLeave(sessionId);
      void disconnect(false);
    };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); };
  }, [sessionId, disconnect]);

  const videoTrack = useFastH3Track("main_video");
  const audioTrack = useFastH3Track("main_audio");

  const liveRef = useRef<HTMLVideoElement | null>(null);
  const cacheRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [entered, setEntered] = useState(false);
  const [room, setRoom] = useState(START_ROOM);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [found, setFound] = useState<EvidenceId[]>([]);
  const [finding, setFinding] = useState<Evidence | null>(null);
  const [drawer, setDrawer] = useState<"file" | "harness" | null>("file");
  const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(null);
  const [muted, setMuted] = useState(false);
  const [harness, setHarness] = useState<HarnessSettings>(DEFAULT_HARNESS);
  const [repairNote, setRepairNote] = useState<{ prompt: string; verdict: Verdict } | null>(null);
  const [filing, setFiling] = useState(false);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  const beatRef = useRef<Beat | null>(null);
  beatRef.current = beat;
  const playingRef = useRef(false);
  const repairRef = useRef<PendingRepair | null>(null);
  const dispatched = useRef(new Set<string>());
  const setupDone = useRef(false);
  const clips = useRef(new Map<string, string>());
  const recorder = useRef<{ rec: MediaRecorder; key: string; chunks: BlobPart[] } | null>(null);

  const currentRoom = ROOM_BY_ID[room];
  const noteError = useCallback((msg: string) => {
    console.error(msg);
  }, []);

  /* ------------------------------------------------------------ the picture */

  useEffect(() => {
    const el = liveRef.current;
    if (!el) return;
    const tracks = [videoTrack, audioTrack].filter(Boolean) as MediaStreamTrack[];
    if (tracks.length === 0) {
      el.srcObject = null;
      streamRef.current = null;
      return;
    }
    const stream = new MediaStream(tracks);
    streamRef.current = stream;
    el.srcObject = stream;
    el.play().catch(() => {
      // Autoplay policy: fall back to muted so the picture at least runs.
      el.muted = true;
      setMuted(true);
      el.play().catch(() => undefined);
    });
  }, [videoTrack, audioTrack]);

  useEffect(() => {
    if (liveRef.current) liveRef.current.muted = muted;
    if (cacheRef.current) cacheRef.current.muted = muted;
  }, [muted, cachedUrl]);

  /* -------------------------------------------------------- session plumbing */

  useEffect(() => {
    if (status !== "ready") return;
    if (readyAt === null) setReadyAt(Date.now());
    if (setupDone.current) return;
    setupDone.current = true;
    void (async () => {
      // The client owns playback order, so autoplay stays off: a clip only
      // reaches the tracks when this app asks for that exact clip.
      await setAutoplay({ enabled: false });
      // Hold the last frame between clips instead of flashing black — the held
      // frame is what the hotspots sit on while the next shot builds.
      await setFlushOnClipEnd({ enabled: false });
      await setClipSeconds({ seconds: 8 });
    })();
  }, [status, readyAt, setAutoplay, setClipSeconds, setFlushOnClipEnd]);

  useEffect(() => {
    return () => {
      for (const url of clips.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  /* ------------------------------------------------------------- the recorder */

  const startRecording = useCallback((key: string) => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    if (clips.current.has(key)) return;
    const mime = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
      (m) => MediaRecorder.isTypeSupported?.(m),
    );
    try {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const entry = { rec, key, chunks: [] as BlobPart[] };
      rec.ondataavailable = (e) => {
        if (e.data.size) entry.chunks.push(e.data);
      };
      rec.start();
      recorder.current = entry;
    } catch {
      recorder.current = null; // no recorder here; shots just rebuild on revisit
    }
  }, []);

  const finishRecording = useCallback((keep: boolean) => {
    const entry = recorder.current;
    recorder.current = null;
    if (!entry) return;
    entry.rec.onstop = () => {
      if (!keep || entry.chunks.length === 0) return;
      const blob = new Blob(entry.chunks, { type: entry.rec.mimeType || "video/webm" });
      clips.current.set(entry.key, URL.createObjectURL(blob));
    };
    if (entry.rec.state !== "inactive") entry.rec.stop();
  }, []);

  /* ------------------------------------------------------------- walking about */

  const request = useCallback(
    (targetRoom: string, hotspot?: Hotspot) => {
      const destination = ROOM_BY_ID[targetRoom];
      if (!destination) return;
      const key = beatKey(targetRoom, hotspot?.id);
      const prompt = hotspot ? hotspot.prompt : destination.prompt;
      const intent = hotspot ? hotspot.intent : destination.intent;

      if (hotspot?.evidence) {
        setFound((f) => (f.includes(hotspot.evidence!.id) ? f : [...f, hotspot.evidence!.id]));
        setFinding(hotspot.evidence);
      }

      setRoom(targetRoom);
      repairRef.current = null;
      setRepairNote(null);
      finishRecording(false);

      const cached = clips.current.get(key);
      if (cached) {
        setCachedUrl(cached);
        setBeat({ key, room: targetRoom, hotspot: hotspot?.id, prompt, intent, take: 0, fromCache: true });
        setPhase("playing");
        return;
      }

      setCachedUrl(null);
      setBeat({ key, room: targetRoom, hotspot: hotspot?.id, prompt, intent, take: 0, fromCache: false });
      setPhase("building");
    },
    [finishRecording],
  );

  const onHotspot = useCallback(
    (h: Hotspot) => {
      if (h.to) request(h.to);
      else request(room, h);
    },
    [request, room],
  );

  /* --------------------------------------------------------------- dispatching */

  useEffect(() => {
    if (!entered || !beat || beat.fromCache || beat.clipId) return;
    if (status !== "ready" || !setupDone.current) return;

    const stamp = `${beat.key}#${beat.take}`;
    if (dispatched.current.has(stamp)) return;
    dispatched.current.add(stamp);

    void (async () => {
      const reply = await enqueue({
        prompt: beat.prompt,
        metadata: makeTag({
          beat: beat.key,
          room: beat.room,
          hotspot: beat.hotspot,
          take: beat.take,
        }),
      });
      if (!reply) {
        dispatched.current.delete(stamp);
        setPhase("failed");
        return;
      }
      const id = reply.clip.clip_id;
      setBeat((b) => (b && b.key === beat.key && b.take === beat.take ? { ...b, clipId: id } : b));
    })();
  }, [entered, beat, status, enqueue]);

  const playClip = useCallback(
    async (clipId: string) => {
      if (playingRef.current) await stop();
      await play({ clip_id: clipId });
    },
    [play, stop],
  );

  useFastH3ClipGenerated((msg) => {
    const id = msg.clip.clip_id;
    const repair = repairRef.current;
    if (repair && repair.clipId === id) {
      void (async () => {
        await playClip(id);
        setBeat((b) =>
          b && b.key === repair.forKey
            ? { ...b, prompt: repair.prompt, take: repair.take, clipId: id }
            : b,
        );
        repairRef.current = null;
      })();
      return;
    }
    if (beatRef.current?.clipId === id) void playClip(id);
  });

  useFastH3ClipStarted((msg) => {
    const tag = parseTag(msg.clip.metadata);
    playingRef.current = true;
    setPhase("playing");
    setCachedUrl(null);
    if (tag) startRecording(tag.beat);
  });

  useFastH3ClipFinished(() => {
    playingRef.current = false;
    setPhase("held");
    finishRecording(true);
  });

  useFastH3ClipStopped(() => {
    playingRef.current = false;
    finishRecording(false);
  });

  useFastH3ClipFailed((msg) => {
    if (beatRef.current?.clipId === msg.clip.clip_id) setPhase("failed");
    noteError("The model could not build that shot.");
  });

  useFastH3StateUpdate((msg) => setSnapshot(msg));
  useFastH3CommandError((msg) => noteError(`${msg.command}: ${msg.reason}`));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  /* ------------------------------------------------------------------ harness */

  const watching = useMemo(
    () =>
      harness.enabled && phase === "playing" && beat && !beat.fromCache
        ? { beat: beat.key, take: beat.take, prompt: beat.prompt, intent: beat.intent }
        : null,
    [harness.enabled, phase, beat],
  );

  const onRepair = useCallback(
    (repaired: string, verdict: Verdict) => {
      const b = beatRef.current;
      if (!b || b.fromCache) return;
      const take = b.take + 1;
      setRepairNote({ prompt: repaired, verdict });
      void (async () => {
        const reply = await enqueue({
          prompt: repaired,
          position: 0,
          metadata: makeTag({ beat: b.key, room: b.room, hotspot: b.hotspot, take }),
        });
        if (!reply) {
          noteError("The harness wrote a repair the model would not take.");
          return;
        }
        repairRef.current = { clipId: reply.clip.clip_id, prompt: repaired, take, forKey: b.key };
      })();
    },
    [enqueue, noteError],
  );

  const { verdicts, latest, sampled, busy, reset: resetHarness } = useFrameHarness({
    videoRef: liveRef,
    watching,
    settings: harness,
    onRepair,
  });

  /* -------------------------------------------------------------------- enter */

  const enterPier = useCallback(async () => {
    setEntered(true);
    try {
      if (status !== "ready") await connect();
    } catch (err) {
      noteError(err instanceof Error ? err.message : "Could not open a Reactor session.");
      return;
    }
    request(START_ROOM);
  }, [connect, status, request, noteError]);

  const leave = useCallback(async () => {
    try {
      await disconnect();
    } catch {
      /* already gone */
    }
    forgetToken("server");
    router.push("/");
  }, [disconnect, router]);

  useEffect(() => registerShowcaseStop(async () => {
    await disconnect();
    forgetToken("server");
    writeKey(REACTOR_KEY, "");
    writeKey(GEMINI_KEY, "");
    router.replace("/");
  }), [disconnect, router]);

  if (filing) {
    return (
      <Report
        found={found}
        total={ALL_EVIDENCE.length}
        onBack={() => setFiling(false)}
        onLeave={leave}
      />
    );
  }

  return (
    <div className="shell" data-drawer={drawer !== null}>
      <header className="topbar">
        <div className="wordmark">
          The Off Season <span>· {CASE.slug}</span>
        </div>
        <nav>
          <button className="tab" onClick={() => setMuted((m) => !m)}>
            Sound {muted ? "off" : "on"}
          </button>
          <button
            className="tab"
            data-on={drawer === "file"}
            onClick={() => setDrawer((d) => (d === "file" ? null : "file"))}
          >
            Case file <span className="count">{found.length}</span>
          </button>
          <button
            className="tab"
            data-on={drawer === "harness"}
            onClick={() => setDrawer((d) => (d === "harness" ? null : "harness"))}
          >
            Harness{" "}
            <span className="count">
              {latest && latest.match >= 0 ? latest.match : harness.enabled ? "—" : "off"}
            </span>
          </button>
          <button className="tab" onClick={() => setFiling(true)}>
            File report
          </button>
          <button className="tab" onClick={leave}>
            Leave
          </button>
        </nav>
      </header>

      <div className="stagewrap">
        <div className="stage">
          <div className="frame">
            <video ref={liveRef} playsInline autoPlay muted={muted} />
            {cachedUrl && (
              <video
                ref={cacheRef}
                data-layer="cache"
                src={cachedUrl}
                playsInline
                autoPlay
                muted={muted}
                onEnded={() => setPhase("held")}
              />
            )}
            <div className="vignette" />

            {entered && (phase === "playing" || phase === "held") && (
              <Hotspots
                room={currentRoom}
                found={found}
                onPick={onHotspot}
                activeBeat={beat?.key ?? ""}
              />
            )}

            {!entered && (
              <div className="slate">
                <p className="small">Marrow Bay · 06:40 · tide going out</p>
                <p className="big">
                  &ldquo;The gate was open when I got here. That is where this starts.&rdquo;
                </p>
                <button className="tab" data-on="true" onClick={enterPier}>
                  Enter the pier
                </button>
              </div>
            )}

            {entered && phase === "building" && (
              <div className="slate">
                <p className="big">{currentRoom.name}</p>
                {repairNote && (
                  <p className="small" style={{ color: "var(--amber)" }}>
                    Harness rebuild in flight
                  </p>
                )}
              </div>
            )}

            {entered && phase === "failed" && (
              <div className="slate">
                <p className="big">That shot did not come back.</p>
                <button
                  className="tab"
                  data-on="true"
                  onClick={() => {
                    if (!beat) return;
                    dispatched.current.delete(`${beat.key}#${beat.take}`);
                    setBeat({ ...beat, clipId: undefined, take: beat.take + 1 });
                    setPhase("building");
                  }}
                >
                  Try it again
                </button>
              </div>
            )}

            {finding && (
              <div className="finding">
                <div className="kicker">Written into the file</div>
                <h3>{finding.title}</h3>
                <p>{finding.note}</p>
                <button className="dismiss" onClick={() => setFinding(null)}>
                  Close ×
                </button>
              </div>
            )}
          </div>
        </div>

        {drawer === "file" && (
          <aside className="drawer">
            <CaseFile found={found} />
          </aside>
        )}
        {drawer === "harness" && (
          <aside className="drawer">
            <HarnessPanel
              settings={harness}
              onChange={setHarness}
              verdicts={verdicts}
              sampled={sampled}
              busy={busy}
              hasKey
              repairNote={repairNote}
              onClear={resetHarness}
            />
          </aside>
        )}
      </div>

      <footer className="footbar">
        <div className="place">
          <span className="room">{currentRoom.name}</span>
          <span className="stamp">{currentRoom.stamp}</span>
        </div>
        <div className="readouts">
          <span>
            Evidence <b>{found.length}</b>/{ALL_EVIDENCE.length}
          </span>
        </div>
      </footer>
    </div>
  );
}
