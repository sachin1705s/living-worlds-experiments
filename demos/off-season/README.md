# The Off Season

A detective walks a shuttered seaside pier that does not exist until you look at it.

Every room and every close-up is generated on demand by **FastH3** on [Reactor](https://reactor.inc) —
picture and sound in one pass — and watched, while it plays, by a **Gemini** harness that samples
every fourth frame, scores it against the prompt that asked for it, and rewrites and rebuilds the
shot when the picture drifts.

Both API keys are pasted into the UI and live in your browser.

---

## The game

Claim MB-4417. Marrow Bay pier arcade, the morning after the storm of the fourteenth. The night
watchman has not been seen since; the owner filed a four-hundred-thousand claim two days before the
weather turned. You are the loss adjuster.

Six locations, sixteen findable things. Clicking a label on the frame generates that shot and writes
what you found into the case file. There is no fail state and no wrong turn — the report you can
file at the end is built from the case file and nothing else, so what you get is exactly what you
bothered to look at.

## The harness

`lib/harness.ts` and `app/api/vision/route.ts`.

While a freshly generated shot is on the tracks:

1. A `requestVideoFrameCallback` loop takes **one frame in every N** the video element paints
   (default 4) into a three-slot ring. This is real frame cadence, not a wall clock.
2. Every few seconds (default 2.6s) the ring goes to `gemini-3.8-flash` along with the prompt that
   was enqueued and a one-line `intent` — the checkable claim about what those frames must show.
3. Gemini returns `{ match, reading, missing[], repair }`. Anything under the threshold is a miss.
4. **Two misses in a row and the harness reprompts itself**: it takes Gemini's rewritten prompt,
   enqueues it at `position: 0`, and swaps the rebuild onto the tracks the moment it is ready.

Every knob — sample rate, check interval, pass threshold, strikes, rebuilds allowed per shot, and an
observe-only switch — is live in the Harness drawer, and every verdict is logged with its score and
what the model said it actually saw.

Replays out of the local clip cache are not scored: they were judged the first time.

## How the model is driven

FastH3 detail worth knowing, all of it in `components/Investigation.tsx`:

- **Autoplay is off.** The client owns playback order — a clip reaches the tracks only when this app
  asks for that exact `clip_id`. A queue that plays itself would show you the wrong room.
- **`set_flush_on_clip_end` is off**, so the stream holds the last frame instead of cutting to black
  between clips. The held frame is what the hotspots sit on while the next shot builds.
- **Clips have no memory of each other**, so every prompt in `lib/case.ts` re-establishes the whole
  scene from scratch and ends on its own soundscape clause.
- **`metadata` carries the beat** (room, hotspot, take) as JSON. The model never reads it and echoes
  it back on every message about that clip, so a reconnect loses no bookkeeping.
- **Shots are cached in the browser** with `MediaRecorder` on the live tracks. Walking back through
  the pier costs nothing and looks the same as it did the first time.

## Cost

FastH3 bills for the GPU, not the generation: 70 credits/second from `ready` until you disconnect —
about **$0.42/minute**, whether or not a clip is building. Sessions are capped at twenty minutes.
The footer runs a live meter and `Leave` ends the session.

Gemini charges per check; at the defaults that is roughly one flash call every 2.6 seconds of
freshly generated video.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste a Reactor key (`rk_…`) and, optionally, a Gemini key. There are no
environment variables: the keys go into `localStorage`, and are posted to this app's own two routes
— `/api/reactor/token` swaps the Reactor key for a short-lived session-scoped JWT, `/api/vision`
proxies the frame checks. Neither route stores anything.

## Layout

```
app/page.tsx              front door — brief, keys, cost
app/case/page.tsx         FastH3Provider bound to the pasted key
app/api/reactor/token/    rk_ → session-scoped JWT
app/api/vision/           frames + prompt → Gemini verdict
components/Investigation  the engine: beats, queue, cache, repair swap
lib/case.ts               the story — rooms, hotspots, prompts, evidence
lib/harness.ts            frame sampler and the reprompt loop
```
