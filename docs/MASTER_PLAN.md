---
title: Drawing-to-Live — Master Plan
date: 2026-05-29
status: living document — single source of truth
supersedes: HANDOFF.md, HANDOFF_v2.md, ADVENTURE_PLANNING.md, .ce-ideation-drawing-museum.md (strategy portions)
keeps: README.md (setup), RESEARCH.md (SDK findings), docs-cache/ (API reference), docs/brainstorms/ (Odyssey Interact spec)
---

# Drawing-to-Live — Master Plan

The single place that holds the whole picture: what we're building, the three competing
product framings, the shared foundation under all of them, and the open decisions on
framing / features / pricing / launch. Everything strategic that was scattered across eight
docs now lives here.

---

## 1. The one-line through-line

**You draw something → it comes alive → you experience it in real time.**

Every framing below is a different answer to the question *"…and then what?"* — and a different
business wrapped around the same magic moment.

---

## 2. What exists today (code reality, 2026-05-29)

| Piece | State |
|---|---|
| `backend/server.js` | Express token broker — `REACTOR_API_KEY` → short-lived JWT. Works. |
| `frontend/src/reactor.js` | LingBot session manager (raw `@reactor-team/js-sdk` + `sendCommand`). Upload → `set_image` → `set_prompt` → `start`, WASD/look setters, `state` subscription. Works. **Missing the `image_accepted` wait before `start` (first-frame flicker risk).** |
| `frontend/playground.*` | Debug tool — ~80% of the "Navigate" path. |
| `frontend/src/draw.*` | **Built this session.** Air-draw: webcam + MediaPipe Hands, index-finger-as-brush, hover-dwell Done/Clear. Not yet run. |
| `frontend/src/canvas.*` | **Built this session.** Touch/mouse/stylus drawing surface. Same `onDrawingComplete(blob)` contract. Not yet run. |
| Museum + portals (`worlds.js`, `portal.js`, `controls.js`, `index.html`) | Full contest build. Deferred — the future "World" / "Free Play" experience. |
| Odyssey "Interact" path | Greenfield. Fully specced in `docs/brainstorms/2026-05-29-odyssey-interact-mode-requirements.md`, no code. |
| Nano Banana `/api/render` | Not built. Blocked on a Gemini API key. |

---

## 3. The three framings

All three share the magic moment. They diverge on what the product *is*, why a user returns,
and how it makes money.

### Framing A — Museum / Keepsake Tiers
*(from HANDOFF_v2.md)*

- **Premise:** a creative tool. Upload a drawing, get it back "alive" at rising fidelity.
- **Experience:** Snapshot (living image) → Story (short animated video) → World (navigable LingBot world). Same input, progressively richer output.
- **Why return:** they drew something new; occasional keepsake moments.
- **Business shape:** subscription + keepsake purchases. Low frequency. Ceiling ~$5–20M.
- **Built toward it:** the World tier (museum/portals) is done; the tier ladder and funnel are not.
- **Strength:** proven category, clear willingness-to-pay, lowest build risk.
- **Weakness:** image/short-video tiers are crowded (Drawings Alive, Doodle Dreams, Draw to Life); the differentiator (navigable World) is the most expensive tier and gets buried behind a paywall.

### Framing B — Adventure / Game (the "pencil is the controller")
*(from ADVENTURE_PLANNING.md — sparked by a viral comment: "drew a dragon → fought it → won. a cave opened behind it… now i can't stop. gotta draw what's next.")*

- **Premise:** a game where the child's imagination is the controller. Drawing is how you progress, not an input.
- **Experience — the six-beat loop:** Draw → Encounter → Resolve → Unlock → Explore → Prompt-for-next-drawing. Each cycle grows a persistent world.
- **Why return:** the adventure is in progress. Daily, compulsive. The world can't continue without the next drawing.
- **Business shape:** subscription game with persistent state. Ceiling $50–500M (Roblox/Minecraft-shaped).
- **Honest constraints:** encounters are **scripted** (Wizard-of-Oz prompt sequences), not simulated — LingBot's chunk delay can't do real NPC behavior; a 7-year-old won't notice. Resolution through **connection, not violence** (befriend/outsmart/help). Story persistence = the real moat (a 50-drawing connected adventure = huge switching cost).
- **Built toward it:** the navigable-world + portal-as-transition foundation exists; the encounter system, prompt library, and story persistence do not.
- **Strength:** biggest, most defensible, most differentiated; daily engagement.
- **Weakness:** hardest to build (encounter scripting, content library, persistence), most expensive (all-World-tier-all-the-time GPU), and the companion layer triggers SB 243 + COPPA AI-safety scope. Engagement loop is also an addiction-ethics risk (needs healthy-use mechanics from day one).

### Framing C — Air-Draw Magic (the session pivot)
*(introduced this session; not in any prior doc)*

- **Premise:** the *input* is the magic. Draw in the air (or on a canvas, or upload), Nano Banana renders it, and it instantly becomes a live world.
- **Experience:** Draw (air / canvas / upload) → Nano Banana image + caption → LingBot (Navigate) or Odyssey (Interact) → 5-min live session → keepsake clip.
- **Why return:** novelty of the air-draw interaction; the wow of "I waved my finger and walked into it."
- **Business shape:** undefined on its own — this is really an **entry modality**, not a full business framing.
- **Built toward it:** both drawing pages built this session; Nano Banana + the live hookup are not.
- **Strength:** most novel and demoable; strongest first impression; the air-draw input is genuinely uncommon.
- **Weakness:** thin as a standalone business; air-draw is a feature, not a strategy. Heavier COPPA surface (webcam). Best understood as the front door to A or B.

### How they relate (they are not mutually exclusive)

```
C (Air-Draw Magic)  =  the front door / entry experience  →  the wow
A (Keepsake Tiers)  =  the monetization model             →  the money
B (Adventure Game)  =  the north-star destination         →  the moat & scale
```

The realistic question is not "which one" but **"which do we lead v1 with, and in what order do the others follow."**

---

## 4. Shared foundation (true under every framing)

### 4.1 Models & capability tiers
- **Image** — Nano Banana (Gemini 3 Pro Image). Stateless, ~zero GPU-hold cost. The scalable free funnel.
- **Video** — Veo (premium) / Seedance (volume). Later.
- **Interactive — Navigate** — Reactor **LingBot** (WASD, image-anchored). The differentiator we've built.
- **Interactive — Interact** — **Odyssey-2** (separate provider, text/magic-button controlled, not WASD).
- **Interactive — Cinematic** — Reactor **Helios** (prompt-driven, no navigation; image-to-video with mid-stream swaps). Useful for intros/transitions.

### 4.2 Reactor constraints (confirmed)
- **5 concurrent sessions/account** (pooled, increasable via support@reactor.inc).
- **20-min hard session cap** — auto-terminates.
- **Billed per session-second** — Helios ≈ 17 credits/s ≈ $0.10/min ≈ $6.12 per 20-min session; LingBot rate unconfirmed. Recoverable disconnect keeps billing for 30s (network-blip recovery only, not a cap workaround).
- **Implication:** interactive must be a **metered premium tier**, never flat/unlimited. Image tier is the free funnel.

### 4.3 The technical moat — aesthetic preservation
The category's universal failure: AI "improves" the drawing into generic realism, parents stop
recognizing their child's work. **Our edge is fidelity** — keep the wobbles, smudges, three-legged
dogs. The viral trigger is the before/after reveal *with the quirks intact*. This is the highest-leverage
prompt-engineering work and applies to every tier and framing.

### 4.4 COPPA (first line of code, kid-facing)
Amended rule live **2026-04-22**: separate verifiable consent for any AI-training use, no indefinite
retention, ~$51,744/day penalties. Requirements: parent-gated consent, data minimization, no
third-party tracking on kid screens, **explicit no-train contracts with every provider** (Reactor,
Odyssey, Google). Webcam (air-draw) is a heavier surface — MediaPipe runs in-browser so raw frames
never leave the device; only the stroke canvas is sent. "We contractually never train on your
child's art" is also a **brand moat** competitors on general models can't easily claim.

### 4.5 Reference-app patterns (from vendored `Lingbot-Reactor/reactor-experiments/`)
The official Reactor reference frontends (Next.js + TS) reveal three things that affect our code:
1. **Typed SDK** — `@reactor-models/lingbot` / `@reactor-models/helios` (typed hooks: `useLingbot`, `useLingbotState`, `setMovement(...)`) layered over raw `@reactor-team/js-sdk`. "Never use `sendCommand` when a typed method exists." Our `reactor.js` uses the raw path.
2. **Keepsake is partly built-in** — `reactor.requestClip(seconds)` + `<ClipPlayer>` / `<ClipDownloadButton>` capture the last N seconds as MP4, model-agnostic. The keepsake artifact is largely free.
3. **Our `reactor.js` has a latent bug** — must wait for `image_accepted` between `set_image` and `start()` or the first chunk flickers (pure-prompt before the image lands). Our `stageWorld()` does not wait.

**Open stack decision:** stay vanilla JS, or migrate to the Next.js + typed-`@reactor-models` stack the reference apps (and the clip feature) assume.

### 4.6 Prompt rules (LingBot)
≤1000 chars, paragraph-length, all 7 traversal anchors, **no camera verbs** (pan/dolly/zoom — they
fight the control signals), one mood phrase. Describe camera framing explicitly ("rear view, subject
centered; look-input turns the subject, not the camera"). Re-anchor style every ~10 chunks to fight drift.

---

## 5. Market signal (why this matters)
- Image + short-video "drawing alive" is **crowded** (Drawings Alive $5–17/mo, Doodle Dreams $4.99/mo, Draw to Life, Higgsfield Sketch-to-Video).
- The **interactive / navigable tier is empty** — World Labs Marble ($20–95/mo), DeepMind Genie 2, Yume exist but none take child sketches as first-class input and most are research-only.
- Pricing sweet spot ~$10–25/mo if quality is differentiated. Physical keepsakes are an adjacent revenue line. Viral channel = TikTok/Shorts before/after reveals.
- **Takeaway:** our defensible ground is the interactive tier + aesthetic fidelity. The image tier is table-stakes funnel, not differentiation.

---

## 6. Decisions made (2026-05-29)

- **Framing:** Lead v1 with the **magic moment** — C (air-draw) as the front door, A (keepsake tiers) as the business model, **B (Adventure game) as the north star** to build toward once the core loop is proven. ✅
- **Stack:** **Migrate to Next.js + TypeScript + Tailwind + typed `@reactor-models`**, mirroring the vendored reference apps. The vanilla `draw.*` / `canvas.*` / `playground.*` we built get ported to React components; the MediaPipe air-draw logic carries over (framework-agnostic DOM/canvas), `reactor.js` is replaced by `<LingbotProvider>` + typed hooks. ✅
- **Input for v1:** all three surfaces — **upload, canvas, air-draw** (built/specced already). ✅

**Why this framing:** smallest provable loop, ~80% built; de-risks B (the adventure only works if the core "alive + affectable" moment lands); respects the per-second GPU cost model (free image funnel, metered interactive premium). The risk we accept: temporarily shipping into the crowded keepsake space — mitigated by making the navigable/interactive experience the demo hero, not burying it behind the image tier.

### Update (2026-05-29) — 2-day launch decisions, supersedes the migrate-first call
- **Ship on the current vanilla JS stack now; defer the Next.js migration.** A from-scratch migration is incompatible with a 2-day launch and would throw away the working `canvas.js` / `reactor.js` / controls. Migrate after launch. ✅
- **Access confirmed:** we have both a **Gemini (Nano Banana) key** and **Odyssey-2 API access** in hand → the full 2-day plan (render + LingBot Navigate + Odyssey Interact) is on. ✅
- **"Talk to the painting" = direct the world with text/voice commands** (Odyssey reshapes the scene), per the Interact spec — NOT a two-way conversational character (that's the SB-243-regulated companion layer, out of scope for launch).

---

## 7. Open unknowns
- LingBot per-second credit rate (affects all pricing).
- Odyssey-2: npm package, token endpoint, image-upload mechanism, hard session cap (from the Interact brainstorm).
- Gemini API key (blocks the Nano Banana render route).
- Provider no-train terms — especially Odyssey (unconfirmed).

---

## 8. The v1 plan (magic moment: C entry + A model, B north star)

### 8.1 Feature plan (phased)

**Phase 0 — Foundation & stack migration**
- Scaffold Next.js + TS + Tailwind, mirroring `Lingbot-Reactor/reactor-experiments/lingbot`.
- Token broker as a cacheable Next.js GET route (`Cache-Control: private, max-age=<expires_at>`).
- Port LingBot **Navigate** to `@reactor-models/lingbot` (`<LingbotProvider>`, typed hooks). **Fix the `image_accepted` wait** between `set_image` and `start()`.
- Wire keepsake capture via `reactor.requestClip()` + `<ClipPlayer>` / `<ClipDownloadButton>` (built-in, model-agnostic).
- *Exit:* upload an image → walk a LingBot world → grab a clip, on the new stack.

**Phase 1 — The magic loop (the v1 core)**
- Three input surfaces ported to React: **upload**, **canvas** (touch/mouse/stylus), **air-draw** (MediaPipe finger-as-brush).
- `/api/render` → **Nano Banana** (Gemini 3 Pro Image): stroke PNG + aesthetic-preservation prompt → returns `{ image, caption }`. Caption becomes the LingBot prompt (kills the separate prompt-derivation step).
- **Mode pick:** Navigate (LingBot) default; Interact (Odyssey) when ready. Auto-suggest by drawing type, one-tap switch.
- Live session: image+caption → `set_image` → wait `image_accepted` → `set_prompt` → `start`.
- **5-min cap** as a story beat (last 60s = "world going to sleep" wind-down) + visible countdown.
- **Auto keepsake:** before/after (original drawing ↔ hero frame/clip), watermarked, download + Web Share.
- **Session broker:** track the 5 concurrent slots, queue when full ("you're next"), reap idle/abandoned sessions immediately (stop the meter + free a slot).
- *Exit (the "prove the magic" gate):* a kid draws → it's alive → they affect it → they keep a shareable keepsake.

**Phase 2 — Interact mode (Odyssey)** — per `docs/brainstorms/2026-05-29-odyssey-interact-mode-requirements.md`
- Separate `odyssey` typed module, backend token route, magic-button row (preset prompts → COPPA-safe), parent-only free-text. *Blocked on Odyssey access details.*

**Phase 3 — Funnel & tiers (A business model)**
- Landing page (copy already drafted — "Step inside your drawing").
- Free **Snapshot** (living image) tier — the scalable funnel.
- **Parental consent gate + COPPA wrapper** (cross-cutting, designed in from Phase 1, hard-gated here).
- Pricing + metering live.

**North star (B) — deferred until the loop is proven**
- Encounter system (scripted), prompt library, story persistence. Build on the validated Phase-1 loop, not before.

**Cross-cutting from line one:** COPPA (in-browser MediaPipe, data minimization, no kid-screen tracking, no-train contracts), aesthetic-preservation prompt engineering (the moat), "ship outcomes not model names."

### 8.2 Pricing

Cost reality: interactive ≈ $0.10/min+ GPU (Helios confirmed; **LingBot rate TBD** → allotments provisional). Image ≈ ~free. So image is unlimited; interactive is the metered cost center.

| Tier | Price | Image (Snapshot) | Interactive (Navigate/Interact) | Keepsake | Other |
|---|---|---|---|---|---|
| **Free** | $0 | A few living images/mo, watermarked | 1 short taste session/mo (or pre-rendered teaser) | Watermarked | Email + consent captured |
| **Family** | ~$12–15/mo | Unlimited | ~10 sessions/mo (5-min each) | No watermark, downloads | 1 child profile |
| **Family Plus** | ~$24/mo | Unlimited | More sessions + skip-the-queue priority | Prints/exports | Multiple profiles, early access |

- **Metering shown as "sessions/month"** (human-legible), internally backed by a minute/credit budget. **Never expose raw credits** — parents hate token math.
- Trust-wedge mechanics: one genuinely free generation (no card), "regenerate free" on paid outputs, honest "works best with…" guidance, real examples before charging.
- **Blocked on:** LingBot's per-second rate to finalize session allotments.

### 8.3 Launch plan

Principle: **ship outcomes, not model names** ("walk inside your drawing," never "Helios is live"). Prove one loop before scaling (the Adventure doc's Phase-A ethos).

- **M0 — Foundation (internal):** Next.js scaffold + LingBot Navigate + clip capture + `image_accepted` fix on an uploaded image.
- **M1 — Magic loop (private demo):** all three inputs + Nano Banana + Navigate + 5-min cap + keepsake. Demo to a handful of parents + kids. **Gate: does the magic land?**
- **M2 — Soft launch (waitlist):** landing page + free Snapshot funnel + consent flow + 1 paid tier + session broker. Email capture from day one; limited concurrency.
- **M3 — Public launch:** pricing live, keepsake share-loop driving TikTok/Shorts, Reactor quota raised, Interact (Odyssey) if access lands.
- **Post-launch:** begin Framing B (adventure) experiments on the proven loop.

**Gating dependencies:** Gemini key → M1 · LingBot rate → pricing/M2 · Reactor quota increase → M3 · Odyssey access → Interact/M3.

---

## 9. Goal & ICP

### 9.1 Goal
- **North star:** make *"step inside your drawing"* real — any child can turn a drawing into a living world they explore and shape. (Adventure framing B is where this fully lands.)
- **This quarter:** prove the magic loop with real families, establish the **interactive tier as the wedge** (the thing no competitor offers), and stand up a before/after share loop that acquires the next family for free.
- **This week (start small):** a working private magic-loop demo + the partner-integration conversation opened + the two unblocking dependencies secured (Gemini key, LingBot rate). **Not** a public paid launch.

### 9.2 ICP
- **Buyer (pays):** millennial parent, ~28–42, one or more kids aged **4–9 who draw**; active on TikTok/Instagram and already shares their kid's art; already pays for kids' keepsakes / creative subscriptions (Artkive, Tonies, Lovevery, Canva-for-Kids). Tech-comfortable early adopter.
- **User (plays):** the child, 4–9. Can't reliably read or type → UI must be visual, voiceover-friendly, parent-gated.
- **Distributor (spreads it):** the same parent — the before/after reveal is the growth engine.
- **Secondary:** gift-buying grandparents (price-insensitive, emotional); educators (B2B2C, later — cleaner consent path).
- **Anti-ICP for now:** adults wanting an art tool for themselves; teens; kids who don't draw. Don't design for them.

## 10. Launch sprint — next 2 days (vanilla stack)

**Goal:** launch Drawing-to-Live publicly. Canvas input → Nano Banana render → choose **Navigate** (LingBot, walk the world) or **Interact** (Odyssey, direct/"talk to" the painting) → keepsake.

### Day 1 — Core loop: canvas → render → LingBot Navigate
**Backend**
- [ ] `npm i @google/genai`; add `GEMINI_API_KEY` to `.env` + `.env.example`.
- [ ] `POST /api/render` — drawing PNG in → Nano Banana (Gemini 3 Pro Image) with the style-preservation prompt → `{ imageBase64, caption }`.

**Frontend (entry + integration)**
- [ ] Real entry page (replace playground as the front door): canvas (reuse `canvas.js`) + "Bring it to life".
- [ ] On submit → POST `/api/render` → receive image + caption.
- [ ] `reactor.js`: **add the `image_accepted` wait** between `set_image` and `start`.
- [ ] Wire: rendered image → `uploadImage` → `setImageRef` → await `image_accepted` → `setPrompt(caption)` → `start`.
- [ ] WASD + look controls on the live stream (reuse control patterns; no portals).
- [ ] 5-min countdown + auto-end.
- [ ] Smoke test: draw → live world, end-to-end.

### Day 2 — Odyssey Interact + launch
**Odyssey**
- [ ] First thing: confirm Odyssey npm package, token endpoint, image-upload mechanism, hard session cap.
- [ ] `POST /api/odyssey-token` (key stays server-side).
- [ ] `odyssey.js` module (mirrors `reactor.js`): connect → seed image → send prompt → attach stream.

**Mode + interaction**
- [ ] Mode picker after render: **Navigate (LingBot)** | **Interact (Odyssey)**.
- [ ] Interact surface: magic buttons (preset prompts) + "talk to the painting" text box → send to Odyssey.
- [ ] Shared `<video>`; tear down one session before starting another; 5-min cap (≤ Odyssey's hard cap).

**Launch**
- [ ] Keepsake: clip download (`requestClip`) or screenshot fallback.
- [ ] Minimal COPPA: parent gate ("a grown-up here?") + privacy / no-train note.
- [ ] Deploy backend + frontend; set env keys in prod.
- [ ] Prod smoke test → launch.

### Definition of done
A kid draws on the canvas → it renders in their own style → they pick Navigate or Interact → walk it or direct it ("talk to the painting") → keep a clip. Live on a public URL.

### Deferred (explicitly NOT in these 2 days)
Next.js migration · air-draw page polish (canvas leads) · full COPPA wrapper · pricing/tiers · landing-page funnel · Adventure (B) features · conversational-character companion.

## Appendix — doc provenance
- `HANDOFF.md` — original contest Phase-1 handoff (museum + portals code). Historical.
- `HANDOFF_v2.md` — Framing A (tiers, funnel, COPPA, Interact Studio convergence).
- `ADVENTURE_PLANNING.md` — Framing B (adventure game reframe).
- `.ce-ideation-drawing-museum.md` — GPU-economics tier strategy (capacity-rationed tiers, artifact-as-product, booked sessions, no-train brand moat, replay tier, B2B2C, gift-buyer ICP).
- `docs/brainstorms/2026-05-29-odyssey-interact-mode-requirements.md` — full Odyssey Interact spec (R1–R15).
- `RESEARCH.md` — Reactor SDK findings. `docs-cache/` — cached API reference.
