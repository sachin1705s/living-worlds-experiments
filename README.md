# Living Worlds Experiments

A showcase of eight interactive Reactor demos: Drawing to Live, Einstein’s Chalkboard, Tech Roast, Stylized Worlds, Check Your Drip, Off Season, R24 News Studio, and Vidu Dance Game.

Live showcase: https://www.livingworlds.in/experiments

## Status

This repository contains the latest source, including the button and session-cleanup updates. The deployed site may lag until the Vercel Git-author permission issue is resolved. The original Drawing Museum remains available alongside the showcase.

See [RESEARCH.md](./RESEARCH.md) for the SDK research that informs this implementation.

## Setup

### Local showcase

Use Node.js 24. From this repository root:

```bash
cp .env.example .env
npm run install:all
npm run dev
```

Fill in the two keys in `.env` before starting. The launcher loads them once and passes them to the backend and both Next.js apps. No real API keys are included in this repository.

Open **http://127.0.0.1:5180/showcase.html**. This starts the Vite showcase (5180),
token broker (3001), Off Season (5191), and News Studio (5192).
Use Back to leave a demo and stop its session before shutting down the servers. Camera demos and Drawing to Live also have Stop buttons.

| Demo | Model | Setup |
| --- | --- | --- |
| Drawing to live | Reactor LingBot | Shared server-side Reactor key |
| Einstein’s Chalkboard | Reactor Visko Orbis | Shared Reactor key; Gemini for chat/voice |
| Tech Roast | Reactor Vidu S2-Avatar | Shared Reactor key; fixed thumbnail character |
| Stylized Worlds | Reactor SANA-Streaming | Shared Reactor key and camera permission |
| Check Your Drip | Reactor Vidu S2-Editing | Shared Reactor key and camera permission |
| Off Season | Reactor FastH3 | Shared Reactor key; optional Gemini vision key |
| News Studio | Reactor FastH3 | Server-side Reactor and Gemini keys |
| Vidu Dance Game | Reactor Vidu S2-Editing | Shared Reactor key and camera permission; random soundtrack included |

**Shared authentication:** set `REACTOR_API_KEY` once in the root ignored `.env` (the local backend and demo env files link to it). In production, configure it as a Vercel secret in each of the three projects. Reactor key overrides are not accepted by the token brokers. Browsers receive only scoped session tokens. Refresh/back navigation sends keepalive termination requests; modal close waits for its stop acknowledgment. Provider caps bound sessions when a browser cannot deliver its unload request. Run `node scripts/eval-session-lifecycle.mjs` to evaluate cleanup without opening paid sessions.

**Deployment:** `https://www.livingworlds.in/experiments` embeds `worlds-experiments.vercel.app`. Off Season and News Studio run as separate Next.js projects. News Studio still requires Gemini and durable shared storage for multi-user broadcasts.

**News Studio:** copy `demos/news-studio/.env.example` to
`demos/news-studio/.env.local`, set `REACTOR_API_KEY` and `GEMINI_API_KEY`,
then restart its server. Redis is optional for local use. Missing credentials
produce setup guidance rather than a broken player. Opening the page does not
start a paid broadcast; click Start. The original newsroom and broadcast logic
remain in the bundled application.

**Check Your Drip:** full-frame camera editing, not a finger mask. Select
Outfits, Characters, Styles, or Backgrounds; choose a Reactor gallery reference
or upload PNG/JPG/WEBP under 10 MB. Apply changes while live.

**Vidu Dance Game:** character replacement follows the live camera's movement.
Choose a character or upload one and keep your full body visible. Each stream
randomly picks one of the three supplied tracks: I Love You Baby, Uptown Funk,
or Move (feat. Camila Cabello). Music starts when the generated picture is live
and loops the same track without reshuffling. If autoplay is blocked, tap Play
soundtrack. Music is served locally and is not sent to Reactor.
Record dance captures the generated video and browser soundtrack (no microphone
or raw camera preview). Stop & save produces a preview and a download link in
WebM or MP4, depending on browser support. Killing the session also finalizes an
active recording. Download before closing the demo; clips are held only in tab
memory, and starting another recording does not erase the last clip until the
new recording is saved. Muting or pausing the soundtrack also affects recording.
The supplied songs are local preview assets; obtain appropriate music rights
before publicly distributing them or recordings. This is a creative dance mirror,
not a pose scoring game. Generated video has latency and is not guaranteed to
sync to beats.

**Tech Roast:** replaces the earlier Lemon Slice demo with Vidu's built-in
conversation and avatar API. Paste a pitch or import TXT/Markdown, up to 2,000
characters per turn. PDF parsing and URL fetching are not implemented.
Audio and video return from the avatar; your microphone and camera remain off.
No separate language-model key is needed.

All new sessions have a five-minute provider-enforced cap. The Vidu demos also have five-minute client timers. Kill switches stop camera/audio
immediately and disconnect model sessions; modal close waits for the stop
acknowledgment. Abrupt browser/process termination cannot guarantee a clean stop:
check the Reactor dashboard after a network failure. Do not expose this temporary
bring-your-own-key token broker publicly without authentication.

Keys entered into the Vidu, Drawing, Einstein, and Stylized Worlds UIs are not
persisted. Off Season keeps its keys in tab-scoped session storage for navigation
and clears them when stopped through the showcase. News Studio uses server env vars.

Einstein is extracted from `sachin1705s/interactive-studio-reactor` at
`2abe64047c19642f1e6c50bdf26cb2e053d40f68`. Its original streaming/model adapters
are in `frontend/src/einstein/original/`. Stylized Worlds is based on
`saitiger/Experimentation`, branch `finger-frame-effect`, commit
`9b10bc8c60d8a10c9086a3d7c1b233d95ad1838e`. Camera frames are sent while it runs,
even without a detected hand frame. MediaPipe needs network access.
See [bundled source attribution](demos/SOURCES.md) for the two Next.js apps.

Provider references:
- https://www.reactor.inc/models/vidu-s2-editing/api
- https://www.reactor.inc/models/vidu-s2-avatar/api
- https://www.reactor.inc/models/lingbot/api

Real provider generation requires valid credentials, model access, and credits.
Local/mock checks do not establish live generation quality or latency.

### Prerequisites

- Node.js 20+
- A Reactor API key
- Four seed images (see [frontend/public/drawings/README.md](./frontend/public/drawings/README.md))

### Backend (token broker)

```bash
cd backend
npm install
cp .env.example .env
# put your REACTOR_API_KEY into .env
npm run dev
```

Listens on `http://localhost:3001`. Exchanges the API key for a short-lived JWT via `https://api.reactor.inc/tokens`. Server-configured keys never reach the browser; keys entered in the temporary UI are sent to this broker without persistence.

### Frontend

```bash
cd frontend
npm install
# place museum.jpg, drawing-1.jpg, drawing-2.jpg, drawing-3.jpg in public/drawings/
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the backend.

## Controls

| Key          | Action                                    |
| ------------ | ----------------------------------------- |
| `W` `A` `S` `D` | Move (forward, strafe left, back, strafe right) |
| `Arrow keys` | Look around                                |
| `1` `2`      | Add an event to the current world (varies per drawing) |

Walk forward long enough in any world and a portal materializes ahead. Walk into it to transition to the next world.

## Architecture

- `backend/server.js` &mdash; Express token broker. `GET /api/token` returns `{ jwt }`.
- `frontend/src/reactor.js` &mdash; single LingBot session manager. Pre-uploads all four seed images at boot and caches the `FileRef`s so portal transitions skip upload latency. Exposes a `state`-message subscription.
- `frontend/src/controls.js` &mdash; WASD + look + hold-prompts. Movement uses a LIFO stack so two-key combos resume correctly on release; all `set_*` calls dedupe before sending.
- `frontend/src/portal.js` &mdash; counts net forward steps in the current world, swaps to the portal prompt at threshold 1 (the portal "appears" in the stream), triggers `reset` &rarr; re-stage at threshold 2.
- `frontend/src/worlds.js` &mdash; four worlds, each with a base prompt, a portal prompt, and 0&ndash;2 hold prompts. All prompts follow LingBot's traversal recipe (&le;1000 chars, 7 anchors, no camera verbs).
- `frontend/src/state.js` &mdash; `AppState` singleton holding portal-step count, current world, transition flag, and the latest `running` / `current_chunk` mirror from `state` messages.
- `frontend/src/ui.js` &mdash; tiny DOM helpers for the flash overlay, world label, status text.

## Known constraints

- LingBot output is portrait (480x832). The video uses `object-fit: contain` so the stream is letterboxed rather than cropped.
- LingBot's `set_image` is not valid mid-generation, so portal transitions must go through `reset`. The white flash hides the gap.
- Parallel LingBot sessions are not a documented feature; pre-loading the next world while the current one streams is not possible. Pre-uploading seed images at boot is the only latency mitigation.
- Heavy A/D strafing displaces the camera off the centered subject. Forward motion is the best-supported control.

## Not in Phase 1

Polaroid capture, end screen, music, mobile / touch controls. See the handoff doc.
