# Project Handoff: The Drawing Museum — v2
**For Claude Code — Updated Implementation Guide**

*Updated: May 28, 2026*
*Supersedes the original contest-era handoff (HANDOFF.md)*

---

## What Changed Since v1

The original handoff was for the contest entry: a single LingBot museum-with-portals demo, deadline-driven. **That shipped and the Reactor team responded well.** This v2 reframes the project from "contest demo" to "consumer product with a launch funnel."

The big shifts:
- The museum + portals experience is now the **premium "World" tier**, not the whole product
- We're adding a **tiered offering** (Snapshot → Story → World) to capture a wider funnel
- Generation is now **model-agnostic** — LingBot, Helios, and Odyssey-2 are interchangeable engines chosen per tier, never exposed to users
- The immediate priority is a **funnel** (landing page → email capture → free first generation), not more world-model features
- **COPPA compliance** is now a first-line-of-code requirement (kid-facing consumer product)
- Every output produces a **shareable side-by-side keepsake artifact**
- Longer term, this converges with **Interact Studio** (separate real-time character-interaction platform) at the character-companion layer

The Phase 1 museum/portal implementation from v1 is still valid and is preserved in Part C below. Build the funnel first (Part A), then the tiers (Part B), and treat the museum as the World tier.

---

# PART A — Build This First (Launch Funnel)

The single highest-value work right now is converting attention into a list we own. The existing LingBot demo is a thing people watch; the funnel makes it a thing people use and we can reach again.

## A1. The Flow

```
Landing page (drawing → world side-by-side hero)
   → "Turn your child's drawing into a world you can walk through"
   → single email field
   → upload a drawing
   → see a result (lightest viable output — a single living image)
   → email captured, added to list
   → soft upsell to the richer tiers
```

## A2. What To Ship Tomorrow

1. **Landing page** — hero is the nephew's drawing next to its generated world, one-line value prop, one email field, examples gallery below (include intentionally abstract kid drawings to set honest expectations)
2. **Email capture** — store email before showing result. Not behind a paywall or card — just email.
3. **One free generation** — upload a drawing, get the lightest viable output back (a single "living" image / Snapshot). No card, no subscription.
4. **Existing LingBot demo connected** — linked from the landing page as the "World" preview. Don't rebuild it.

This is a complete, valuable soft-launch. The rest of the week adds one *outcome* per day (see Part B), building to a real launch at week's end with a grown list.

## A3. Launch Principle: Ship Outcomes, Not Models

Never announce "Helios is live" or "Odyssey demo." Parents don't care which model renders their kid's dragon — they care that the dragon comes alive. Announce outcomes a parent understands ("see your drawing move", "walk inside your drawing"). Model names appear ONLY in developer-facing build-in-public content for the AI community.

## A4. Email Capture Is The Asset

Email is the highest-converting channel for kids products (parents check email; they don't get notifications from apps they don't use yet). Every free generation must capture an email. That list is worth more than social following in 12 months. Capture it from day one.

---

# PART B — The Tiered Product

Same input (the drawing), progressively richer output. The ladder captures different willingness-to-pay and creates an upsell funnel.

## B1. The Three Tiers

| Tier | Output | Engine (silent) | Cost to generate | Role |
|---|---|---|---|---|
| **Snapshot** ($) | One living image, hand-drawn aesthetic preserved | Image model (FLUX / Nano Banana / similar) | Very low | Widest funnel. First one free. |
| **Story** ($$) | 10-15s animated video, optional child voiceover | Video / world model (Helios / Veo / Runway / Kling — whichever preserves the aesthetic best) | Medium | Competes with Drawings Alive / Doodle Dreams. Win on fidelity to the original. |
| **World** ($$$) | Walkable navigable world + portals (the museum) | Reactor LingBot | High (real-time streaming) | Uniquely ours. No competitor offers it. |

## B2. Build Sequence (One Outcome Per Day After Launch Day)

- **Day 1:** Funnel (Part A) — landing + email + free Snapshot + World preview connected
- **Day 2:** Snapshot polished (free single living image)
- **Day 3:** Side-by-side keepsake artifact with watermark (see B4)
- **Day 4:** Story (short animated video tier)
- **Day 5:** World packaged as a named, polished tier (the museum from Part C)
- **End of week:** Real launch moment, full product + grown list

## B3. Pricing (Proposed)

Single subscription with usage limits — NOT tokens/credits (parents hate the mental math):

- **Free Forever:** 1 Snapshot + 1 Story / month, watermarked, World preview only
- **Family ($9.99/mo or $79/yr):** Unlimited Snapshots, 10 Stories, 3 Worlds / month, no watermark, voice narration, side-by-side keepsakes
- **Family Plus ($19.99/mo or $159/yr):** Unlimited everything, share Worlds with up to 5 family members, keepsake books, priority generation, early access

Build the trust-wedge mechanics that competitors fail at:
- One genuinely free generation (no card)
- "Regenerate free" button on every paid output
- Honest "works best with…" guidance shown up front
- Show real examples before charging

## B4. The Side-By-Side Keepsake Artifact (Critical)

Every tier's output produces, by default, a single shareable image:

```
┌─────────────────────┬─────────────────────┐
│   ORIGINAL DRAWING  │   THE LIVING WORLD  │
│   (scanned crayon)  │  (frame from output)│
└─────────────────────┴─────────────────────┘
        "Tommy's Dragon, age 5"   [watermark: yoururl.com]
```

- Left: the actual uploaded drawing. Right: a representative frame from the generated output.
- Honors the original (parents need their child's work celebrated, not replaced).
- Tells the whole story in one glance — no video needed to understand the magic.
- Frictionless to share (one image works everywhere), printable (physical product revenue later).
- Watermark = every user becomes a distribution channel.
- Implement with canvas compositing (`html2canvas` or direct canvas draw). Provide Download + native Web Share.

## B5. Model-Agnostic Generation Layer

Abstract the generation backend so any model can power any tier:

```javascript
// generation/index.js — single interface, swappable engines
async function generate(tier, drawingRef, options) {
  switch (tier) {
    case 'snapshot': return imageEngine.generate(drawingRef, options);
    case 'story':    return videoEngine.generate(drawingRef, options);
    case 'world':    return worldEngine.start(drawingRef, options); // LingBot
  }
}
```

Each engine implements the same interface. Test LingBot vs Helios vs Odyssey-2 privately with the same drawing; use whichever best preserves the hand-drawn aesthetic for each tier. Model choice is an implementation detail, hot-swappable as pricing/quality shift.

## B6. Style Preservation Is The Technical Moat

The category's biggest failure: outputs "improve" the drawing into generic AI realism, and parents can't recognize their child's work. Our differentiator is fidelity to the hand-drawn aesthetic.

Naive prompt: *"animate this drawing"* → model polishes it into generic CGI.

Correct prompt pattern (applies across all engines and tiers):
```
Animate/render this child's drawing while preserving the EXACT hand-drawn
aesthetic — wobbly lines, flat childlike perspective, bright simple colors,
visible crayon/marker texture. Do NOT add realism. Do NOT smooth or correct.
The sky stays crayon blue, the grass stays scribbled green. Every element moves
but stays recognizably drawn by the child.
```

This prompt engineering is the highest-leverage technical work for the Snapshot and Story tiers.

---

# PART C — The World Tier (Museum + Portals)

This is the original v1 implementation, preserved. It is now the premium "World" tier. The full working code from v1 stands; the summary below is the reference. (See HANDOFF.md for the complete original code blocks if needed — they remain accurate.)

## C1. Concept

A navigable museum gallery (LingBot) with a child's drawings hung as framed paintings. Walking toward a painting and crossing a **portal threshold** transitions you *inside* that drawing's world. Portals connect worlds in a ring: Museum → Drawing 1 → Drawing 2 → Drawing 3 → Museum.

## C2. Tech Stack

```
Frontend: Vanilla JS + HTML/CSS (lightweight, fast)
World gen: Reactor JS SDK (@reactor-team/js-sdk)
Backend: Node.js + Express (JWT auth, asset serving)
Target: Desktop web, keyboard controls
```

## C3. LingBot Integration (Confirmed Pattern)

- `uploadFile` → `FileRef`, then `set_image` (anchors visual identity; accepts PNG/JPEG)
- `set_prompt` (≤1000 chars; steers world + preserves aesthetic)
- `start` (requires both image and prompt set)
- `set_movement` ("idle"|"forward"|"back"|"strafe_left"|"strafe_right") — persistent state, applied at chunk boundary
- `set_look_horizontal` / `set_look_vertical` ("idle"|"left"|"right" / "idle"|"up"|"down")
- `set_rotation_speed_deg` (0–30, default 5)
- `reset` → clears state → re-stage with new image/prompt for the portal transition
- Subscribe to `state` events as the authoritative session snapshot
- Re-anchor style every ~10 chunks (on `chunk_complete`) to counter drift

## C4. Session State Machine

```
MUSEUM → (walk forward N steps → portal) → TRANSITIONING (flash → reset → new seed → start)
       → DRAWING_1 → ... → DRAWING_3 → back to MUSEUM (ring)
```

```javascript
const AppState = {
  current: 'MUSEUM',      // 'MUSEUM' | 'DRAWING_1..3' | 'TRANSITIONING'
  forwardSteps: 0,        // net forward steps since entering current world
  isTransitioning: false  // prevent double-trigger
};
```

## C5. Portal Mechanic

- No 3D coordinates (LingBot is a video stream) → track proximity via net forward steps
- `PORTAL_PROMPT_THRESHOLD = 20` → swap to portal prompt (glow appears ahead)
- `PORTAL_CROSS_THRESHOLD = 35` → flash overlay → reset → load next world → wait for `generation_started` → hide flash → reset counters
- The white flash naturally masks the reset/reload gap — frame it as the portal effect
- Tune thresholds during testing (depends on apparent motion per step)

## C6. World Definitions

Museum world + 3 drawing worlds, each with a base `prompt` and a `portalPrompt`. Drawing worlds use the actual scanned drawing as the seed image; prompts enforce the crayon aesthetic. (Full prompt strings in v1 HANDOFF.md — reuse verbatim.)

## C7. Known Challenges

- **Chunk-boundary delay** — commands apply at next chunk, not instantly. Acceptable; investigate hold-prompt pattern if it feels bad.
- **Style drift** — re-send base prompt every ~10 chunks.
- **Transition gap** — covered by the flash. If LingBot supports parallel sessions, pre-stage the next world to reduce lag (open research question).

## C8. World-Tier Keepsake: Polaroid Strip

When exiting a world via the portal, capture a frame (`canvas.drawImage` from the video element ~5 steps before crossing — portal glow visible, world fully rendered). Collect one Polaroid per drawing. End screen shows the strip: each world frame paired with its original drawing, child's name + date, Download + Share. This is the World-tier version of the B4 keepsake artifact.

---

# PART D — Constraints (Apply From First Line Of Code)

## D1. COPPA (Non-Negotiable)

Kid-facing consumer product. Amended COPPA rules (mandatory since April 22, 2026) explicitly cover children's data for AI development. Penalties ~$51,744 per incident per day. Achievable for ~$0 with discipline:

- Email-plus-confirmation parental consent before collecting any child data
- Plain-language privacy notice (Iubenda / Termly free tier)
- Data minimization — collect ONLY: drawing images, parent email, optional child first name
- Parent dashboard with working delete-all-data button
- ZERO third-party tracking/analytics on kid-facing screens (no GA, no Meta Pixel, no session recording)
- Explicit "do not train on this data" agreement with Reactor and every model provider — verify in their terms, state it in the privacy notice
- Default opt-out for any data sharing

Paid steps for later (after revenue): kidSAFE Seal (~$500–2,500/yr), one-time privacy lawyer review (~$1,500–3,000). Full Safe Harbor only at scale.

## D2. AI Companion Safety (Before Any Conversational Feature — Phase 4)

Do NOT ship character conversations until this is built. California SB 243 (eff. Jan 2026) requires AI companions to detect/respond to self-harm and prevent explicit content for minors. Required before any talking-character feature:
- Two-way content filtering (child input + character output)
- Constrained, jailbreak-resistant personas
- Crisis detection escalating to parents
- Parent visibility into conversations
- No emotional-manipulation patterns ("I'll be sad if you leave")
- Clear "this is pretend" framing
- Healthy-use mechanics (time limits, "go play outside" prompts)

This is shared infrastructure with Interact Studio (Part E) — build once.

---

# PART E — Interact Studio Convergence (Forward-Looking)

Interact Studio is a separate existing platform for real-time interactive media where you can talk to characters. The two products converge at the **character-companion layer** (this project's Phase 4).

## E1. The Combined Loop

```
Drawing Museum: drawing → world → extracted character   (the WHO + WHERE)
Interact Studio: real-time character conversation + memory (the INTERACTION)
Combined: child draws a character → it becomes a navigable world →
          the character lives there → child talks to it → it remembers
```

## E2. How They Feed Each Other

- **Museum → Interact Studio:** characters extracted from kids' drawings become endless, personal, user-generated character content, each carrying its visual identity (crayon aesthetic), its world, and its child-assigned persona.
- **Interact Studio → Museum:** its conversation engine, memory, persona management, and real-time interaction become the backend for "talk to your drawing's character" — so we don't rebuild companion infra from scratch.
- **Shared safety layer (D2):** expensive to build, amortized across both.

## E3. Revenue Framing

Drawing Museum = near-term revenue entry point (clear willingness-to-pay, proven category, tiered subscription). Interact Studio = deeper platform bet (character-interaction engine that compounds as it accumulates characters). Museum revenue funds the platform; the platform deepens the Museum's moat (the companion layer competitors can't match).

## E4. Integration Questions To Resolve

1. Interact Studio's character/persona data model — can a drawing-derived character map onto it cleanly?
2. Does its conversation engine support the memory persistence needed for "remembers what the child said"?
3. What real-time media infra (streaming, session management) can the Museum reuse?
4. Can the safety scaffolding be a shared layer both depend on?
5. Cleanest boundary — Museum calls Interact Studio as a service, or shared common core?

---

# PART F — Repo Structure (Updated)

```
drawing-museum/
├── backend/
│   ├── server.js              # Express: JWT auth, email capture, generation routing
│   ├── generation/
│   │   ├── index.js           # model-agnostic generate(tier, drawing, opts)
│   │   ├── imageEngine.js     # Snapshot tier
│   │   ├── videoEngine.js     # Story tier (Helios/Veo/Runway/Kling — swappable)
│   │   └── worldEngine.js     # World tier (Reactor LingBot)
│   ├── consent/               # COPPA parental consent flow
│   ├── .env.example           # provider API keys
│   └── package.json
├── frontend/
│   ├── landing/               # PART A: hero, email capture, examples gallery
│   ├── studio/                # upload → pick tier → generate → keepsake
│   │   ├── snapshot.js
│   │   ├── story.js
│   │   └── world/             # PART C: museum + portals (from v1)
│   │       ├── reactor.js     # LingBot session manager
│   │       ├── controls.js    # WASD + look
│   │       └── portal.js      # proximity + transition
│   ├── keepsake/              # side-by-side artifact compositor + share
│   └── drawings/              # seed images (museum + samples)
├── RESEARCH.md                # model comparison findings
└── README.md
```

---

# PART G — Open Research Tasks

Document findings in `RESEARCH.md`.

1. **Aesthetic fidelity bake-off** — feed the same kid drawing into LingBot, Helios, and Odyssey-2. Which best preserves the hand-drawn style? Assign engines to tiers based on results.
2. **Helios vs Odyssey-2 control surface** — both are prompt-steerable real-time models; confirm whether either exposes movement commands (only LingBot is known to). Determines if either can serve any navigation role.
3. **Story-tier video model** — compare Helios vs Veo vs Runway vs Kling on aesthetic preservation + cost per clip. Build `videoEngine` against whichever wins; keep it swappable.
4. **Snapshot-tier image model** — compare FLUX / Nano Banana / others on crayon-style fidelity and cost.
5. **LingBot parallel sessions** — can we pre-stage the next world to eliminate portal lag?
6. **Provider no-train terms** — confirm Reactor and each model provider's data-training opt-out; required for COPPA.

---

# PART H — Success Criteria

## Launch funnel (Part A) — done when:
- [ ] Landing page live with drawing→world hero + email field + examples gallery
- [ ] Email captured before result shown; stored to a list we own
- [ ] One free Snapshot generation works end-to-end (upload → result)
- [ ] Existing LingBot World demo linked as preview
- [ ] No third-party tracking on any kid-facing screen

## Tiered product (Part B) — done when:
- [ ] Snapshot, Story, World all generate from the same uploaded drawing
- [ ] Generation layer is model-agnostic (engines swappable per tier)
- [ ] Hand-drawn aesthetic preserved across tiers (not "improved" to realism)
- [ ] Side-by-side watermarked keepsake produced by default for every output
- [ ] Flat subscription with usage limits (no tokens); regenerate-free button present

## World tier (Part C) — done when:
- [ ] Museum navigable with WASD + look
- [ ] Portal glow appears after walking forward; crossing triggers flash → transition
- [ ] Drawing worlds preserve the crayon aesthetic
- [ ] Full ring completes: Museum → D1 → D2 → D3 → Museum, no stuck states
- [ ] Polaroid strip captured on exits; end screen + share

## Constraints (Part D) — done when:
- [ ] Parental consent flow gates child-data collection
- [ ] Privacy notice published; data minimized; delete-all-data works
- [ ] No-train agreements confirmed with all providers

---

## References

- Reactor docs index: https://docs.reactor.inc/llms.txt
- LingBot overview: https://docs.reactor.inc/model-api-reference/lingbot/overview
- LingBot prompt guide: https://docs.reactor.inc/model-api-reference/lingbot/prompt-guide
- Helios overview: https://docs.reactor.inc/model-api-reference/helios/overview
- Navigable LingBot world tutorial: https://docs.reactor.inc/examples/navigable-lingbot-world
- Odyssey: https://odyssey.ml/ (Odyssey-2 available; Starchild-1 + Agora-1 internal-only)
- CityWalk (prior work): https://github.com/guanyu-gerry-tao/2026-world-model-hackathon
- Yume (reference, World Labs): https://devpost.com/software/yume-d0w8fe
- Original contest handoff: HANDOFF.md (Phase 1 code, still valid for the World tier)
- Strategy doc: PROJECT_VISION.md

---

*v2 prepared May 28, 2026. Contest is won; this is the consumer-product build. Build order: Part A (funnel) → Part B (tiers) → Part C (World tier polish), with Part D constraints from the first line of code.*
