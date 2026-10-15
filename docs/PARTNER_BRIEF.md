# Drawing-to-Live — Partner Brief

*For you — since we're already building **Interact Studio** together, this is the full picture on
the other half: what Drawing-to-Live is, why it exists, how it's priced, and how it feeds Interact
Studio. The ask on your side is the **landing page** — everything you need for that is here, with the
pixel-level design spec in `LANDING_PAGE_STITCH_BRIEF.md`. Last updated 2026-05-30.*

> Working title only — "Drawing-to-Live" is our internal name; the public product name is still TBD,
> so the landing page leaves a wordmark placeholder.

---

## 1. The vision

**A child's drawing becomes a living world they can step into.**

A kid makes a drawing three ways — **upload** a photo of a paper drawing, **draw on screen**
(finger / stylus / mouse), or **draw in the air** (webcam + hand tracking, point your finger and
draw). That drawing is rendered into an image that **preserves the child's own style** (the wobbly
lines, the crayon texture, the three-legged dog — we deliberately *don't* "fix" it into generic AI
art), and then becomes a **real-time, navigable world**. The child walks through it or directs it
with simple "magic" actions, and every session produces a **shareable before/after keepsake** — the
original drawing beside a frame of the world it became.

The one-line version, and the hero headline: **"Step inside your drawing."**

**Why it's different.** The "animate my kid's drawing" space is full of tools that spit out a static
image or a short video. Ours is **interactive and navigable** — you don't watch your drawing, you
walk around inside it in real time. And we treat **fidelity to the child's original style as the
whole point**, not something to polish away. That aesthetic-preservation is the technical moat and
the viral trigger: the before/after reveal *with the quirks intact*.

## 2. How it works (for you, the builder)

- **Input:** in-browser drawing capture (MediaPipe Hands for air-draw; canvas for touch/mouse; file
  upload). Raw webcam frames never leave the device — only the resulting drawing is sent on.
- **Render:** the drawing → an image model (Nano Banana / Gemini 3 Pro Image) with a
  style-preservation prompt → a rendered image + a caption.
- **Live world:** image + caption seed a real-time interactive video model (Reactor **LingBot** for
  *Navigate* / WASD; **Odyssey** for *Interact* / direct-the-painting). WebRTC video, ~real-time.
- **Keepsake:** the session auto-captures a short clip / before-after artifact, formatted to share.

Stack: shipping on the current vanilla JS + Express stack to launch fast; Next.js + typed Reactor
SDK migration comes after.

## 3. The strategy: Drawing-to-Live is the funnel into Interact Studio

This is the part that matters most for how you frame the page. **Drawing-to-Live is our
top-of-funnel — its job is to bring views and users to Interact Studio.** The two products are one
strategy, not two:

```
Drawing-to-Live  →  the warm, viral, kid-friendly front door   →  audience + trust
Interact Studio  →  the deep real-time character-interaction platform  →  the long-term product
```

**Why Drawing-to-Live is the front door:**
- **Proven willingness-to-pay + a built-in viral loop.** "Bring my kid's drawing to life" is a known,
  high-shareability moment. Every session ends in a before/after keepsake that parents post — each
  share sends a new family back to us for free. That's the cheapest audience acquisition we have.
- **It's a consumer-grade taste of the Interact Studio magic.** The *Interact* mode (direct/"talk to"
  the painting and watch the world reshape) is a gentle first contact with the same real-time
  interactive media that Interact Studio does at depth.
- **It captures the relationship.** Email + parental consent are captured from the first free
  generation — that's the list we later invite into Interact Studio.

**Where they converge — the character-companion layer:**

```
Drawing-to-Live:  drawing → world → extracted character      (the WHO + WHERE)
Interact Studio:  real-time character conversation + memory  (the INTERACTION)
Combined:         a kid draws a character → it becomes a navigable world →
                  the character lives there → the kid talks to it → it remembers
```

Characters extracted from kids' drawings become endless, personal, user-generated content for
Interact Studio — each one carrying its crayon aesthetic, its world, and a child-assigned persona.
In return, Interact Studio's conversation / memory / persona engine becomes the backend for "talk to
your drawing's character," so we never rebuild companion infrastructure twice. **Drawing-to-Live
revenue funds the platform; the platform deepens Drawing-to-Live's moat.**

**Honest phasing (important for the landing page).** The *audience/views* funnel is live from day one
(the share loop + email capture). The *deep product convergence* — actually talking to a character
that remembers you — is forward-looking: it's a regulated companion layer (SB 243 + COPPA) and is
**explicitly out of scope for the Drawing-to-Live launch**. So on the page, plant the seed
tastefully and **parent-facing** (e.g., on the keepsake/share moment or a footer link), **never** a
hard "upgrade to our other product" banner on a kid-facing surface — it would break both the warm
trust tone and the COPPA posture. Let's align on exactly how overt that handoff is before you build it.

> **Naming caveat so we don't trip on it:** Drawing-to-Live has an in-product mode called *"Interact"*
> (Odyssey-powered, direct the painting with text — *not* conversational). That is **not** the same
> thing as **Interact Studio** (our separate talk-to-characters platform). Same word, different scope.

## 4. Pricing & tiers

Two things stack here: the **consumer price tiers** (what the landing page sells) and the **modality
capability tiers** that power them (why the economics work).

**Consumer price tiers** — metering is shown as human-legible *"sessions per month,"* never raw
credits or tokens (parents hate token math):

| Tier | Price | Living images | Interactive sessions | Keepsake | Other |
|---|---|---|---|---|---|
| **Free** | $0 | A few/mo, watermarked | 1 short taste session/mo | Watermarked | Email + consent captured |
| **Family** | ~$12–15/mo | Unlimited | ~10 sessions/mo (5-min each) | No watermark, downloads | 1 child profile |
| **Family Plus** | ~$24/mo | Unlimited | More sessions + skip-the-queue | Prints / exports | Multiple profiles, early access |

Trust-wedge mechanics baked in: one genuinely free generation (**no card**), "regenerate free" on
paid outputs, honest "works best with…" guidance, real examples shown before we ever charge.

**Why it's structured this way (the capability tiers underneath):**
- **Image** (Nano Banana / Gemini 3 Pro Image) — stateless, ~zero GPU-hold cost → this is the
  **unlimited free funnel**.
- **Interactive — Navigate** (LingBot, WASD, image-anchored) — the built differentiator.
- **Interactive — Interact** (Odyssey-2, text/magic-button directed) — "direct the painting."
- **Interactive — Cinematic** (Helios) — intros / transitions, no navigation.
- **Video** (Veo / Seedance) — later.

The interactive tiers burn real per-second GPU (~$0.10/min+), so they're **metered premium**, never
flat/unlimited — that's the whole reason the free image tier is the funnel and interactive sits
behind the paid tiers. (LingBot's exact per-second rate is still TBD, so session allotments are
provisional — don't hard-code numbers into the page; keep "sessions/month" copy flexible.)

Interact Studio is the deeper platform the funnel feeds; its own pricing is a separate
conversation and isn't on this landing page.

## 5. What I need from you: the landing page

**Goal of the page:** turn a visitor into a *first magic moment* (Make one → consent → draw → it's
alive → keepsake) and **capture email + parental consent** — while planting the Interact Studio seed
tastefully for later. It's the top of the funnel; its conversion job is "get one drawing brought to
life," not "explain the company."

**Audience & tone.** Parents are the buyer, kids 4–9 are the user. Warm, crafted, trustworthy —
**kid-coded but grown-up**, in the spirit of Lovevery / Tonies / Maisonette / Honest. **NOT**
childish-cartoonish, **NOT** generic AI-SaaS.

**Theme (summary — full tokens in the Stitch brief).** Paper background `#FDFAF3`, near-black ink
`#1A1A1A`, a single terracotta accent `#E85D3A`. Display in **Fraunces** (serif), body in **Inter**.
Generous whitespace, asymmetric editorial layout, hairline dividers, exactly one hand-drawn flourish.
No gradients, no heavy shadowed cards, no emoji icons.

**Structure (five sections + a modal):**
1. **Hero** — "Step inside your drawing." + subhead + a before/after image (crayon drawing beside the
   living world) + one terracotta **"Make one"** button.
2. **"How do you want to start?"** — three numbered editorial entries: 01 Draw on screen · 02 Bring
   one in · 03 Draw in the air. (Order is intentional — screen is the primary v1 path; air-draw last,
   needs a webcam.)
3. **Examples gallery** — 3–4 before/after pairs, including at least one deliberately rough scribble
   so expectations stay honest.
4. **Trust strip** — one line: drawings stay private, webcam stays on device, we don't train on what
   the child makes.
5. **Footer** — Privacy · Delete my drawings · Contact. Wordmark placeholder (name TBD).
- **Parental-consent modal** — fires on the first start tap: "A note for the grown-up," confirm 18+
  and Privacy Notice, calm not legalistic.

**The funnel handoff (where Interact Studio enters the page).** Keep it light and parent-facing — my
recommendation is a quiet moment on the **keepsake/share screen** ("…and there's more your character
can do") and/or a footer link, *not* the hero and *not* anything on the kid-drawing surface. Treat
the exact placement as open — let's decide it together so it matches how we want Interact Studio's
front door to feel.

> **Source of truth for build:** the exact copy and the full design system live in
> **`LANDING_PAGE_STITCH_BRIEF.md`** (paste-ready Google Stitch prompts, final strings, the
> never-do-this guardrail list). **The copy there is final — please don't rewrite it;** if a tool
> paraphrases, paste the exact strings back. This brief is the *why + strategy + tiers*; that brief
> is the *what + pixels*.

## 6. Status & privacy posture

Pre-launch. The navigable-world path is proven and ~80% built; we're assembling the full
draw → render → live → keepsake loop now and validating it with families. It's kid-facing, so we're
**privacy-first from the first line of code**: in-browser capture, data minimization, no third-party
tracking on kid screens, and explicit **no-train contracts with every model provider** (Reactor,
Odyssey, Google). "We contractually never train on your child's art" is itself a brand moat — and it
directly constrains the landing page (hence the quiet, parent-facing funnel handoff above).

## 7. Next step

Grab time and let's lock two things: (1) the **product name / wordmark** so you're not building
around a placeholder, and (2) **where and how overt the Interact Studio handoff is** on the page.
Everything else you can start from the Stitch brief today.
