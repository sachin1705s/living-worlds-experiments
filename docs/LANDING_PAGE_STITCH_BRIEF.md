# Landing Page — Google Stitch Design Brief

*Paste-ready prompts + copy for designing the Drawing-to-Live landing page in Google Stitch.
Working title only — product name is TBD. Last updated 2026-05-30.*

---

## How to use this doc

1. In Stitch, start in **light mode**, mobile + desktop.
2. Set the **theme** first (§2) so every generation inherits the right type/color/mood.
3. Paste the **master prompt** (§3) to generate the full page in one pass.
4. Refine screen-by-screen using the **section prompts** (§4) — each has the exact copy embedded.
5. Keep the **"never do this" list** (§6) handy; if Stitch drifts into generic-SaaS territory, paste the relevant guardrail back in.

The copy here is final. Don't let Stitch rewrite it — if it paraphrases, paste the exact strings back.

---

## 1. Product in one line (context for Stitch)

A web experience where a child's drawing becomes a living world they can step into and explore.
Audience: parents (the buyer) of kids aged 4–9 (the user). Tone: warm, crafted, trustworthy —
**kid-coded but grown-up**, in the spirit of Lovevery, Tonies, Maisonette, Honest. NOT childish-cartoonish,
NOT generic AI-SaaS.

---

## 2. Theme spec (set this in Stitch first)

**Mood:** warm, editorial, handcrafted, calm, premium-but-playful. Like a beautifully designed
children's-brand site, not a tech startup.

**Color**
- Background / "paper": warm off-white `#FDFAF3`
- Ink / text: near-black `#1A1A1A`
- Accent (one only): terracotta `#E85D3A`, darker hover `#C44726`
- Muted text: `#1A1A1A` at 55% opacity
- No gradients. No second accent. No glassmorphism. No drop-shadow-heavy cards.

**Type**
- Display / headlines: **Fraunces** (a characterful, slightly soft serif). Large, tight leading.
- Body / UI: **Inter** (clean humanist sans).
- Do not set everything in one font. The serif/sans contrast carries the "crafted" feel.

**Layout principles**
- Generous whitespace. Asymmetric, editorial — not centered-card templates.
- Separate sections with hairline rules or whitespace, not boxed cards with heavy shadows.
- One — and only one — hand-drawn element (a crayon-style underline under a single word, or a
  small scribbled arrow). Used once, with intent. Signals craft.
- Rounded but restrained corners (8–16px), never pill-everything.

**Responsive:** design mobile-first (most parents arrive on phones), then desktop. On desktop the
hero is asymmetric (text left, image right, slightly off-axis).

---

## 3. Master prompt (paste to generate the whole page)

> Design a warm, editorial landing page for a product that turns a child's drawing into a living
> world they can step into. Audience is parents of young kids; tone is crafted and trustworthy like
> Lovevery or Tonies, not a tech startup and not cartoonish. Light mode. Background warm off-white
> #FDFAF3, text near-black #1A1A1A, a single terracotta accent #E85D3A. Headlines in Fraunces serif,
> body in Inter. Generous whitespace, asymmetric layout, hairline dividers between sections, no heavy
> shadowed cards, no gradients, no emoji icons.
>
> The page has five sections, top to bottom:
> 1. A hero: large headline "Step inside your drawing." with a one-line subhead, and a side-by-side
>    image showing a child's crayon drawing next to a frame of the living world it became.
> 2. "How do you want to start?" — three numbered editorial entries (01, 02, 03), each a short title
>    and one line of description, separated by hairline rules. Not three identical cards.
> 3. An examples gallery: a heading and 3–4 before/after image pairs (drawing → world).
> 4. A single-line trust strip about privacy.
> 5. A minimal footer: three text links.
>
> Use real editorial hierarchy and lots of breathing room. One small hand-drawn crayon underline
> under the word "drawing" in the hero headline is the only decorative flourish.

---

## 4. Section-by-section prompts + final copy

### Section 1 — Hero
**Prompt:**
> A hero section, asymmetric on desktop: headline and subhead on the left, a side-by-side
> before/after image on the right (a child's crayon drawing beside a frame of the generated world).
> Headline in large Fraunces serif. A single primary terracotta button below the subhead. A small
> hand-drawn crayon underline under the word "drawing" in the headline.

**Copy (exact):**
- Headline: **Step inside your drawing.**
- Subhead: *Bring one in, or make a new one on screen or in the air. We'll bring it to life so you can walk through it.*
- Primary button: **Make one**
- (Button scrolls to Section 2.)

### Section 2 — "How do you want to start?"
**Prompt:**
> A section titled "How do you want to start?" with three numbered entries (01, 02, 03) stacked
> vertically, each with a large serif number, a short bold title, and one line of muted description,
> separated by thin hairline rules. Editorial, not card-based. Each entry is clickable.

**Copy (exact):**
- Section title: **How do you want to start?**
- **01 · Draw on screen** — Use a finger, a stylus, or a mouse.
- **02 · Bring one in** — A photo or a scan of a drawing you've already made.
- **03 · Draw in the air** — Point your finger at your camera and draw. *(needs a camera)*

*(Order is intentional: "Draw on screen" is the primary v1 path; air-draw last because it needs a webcam.)*

### Section 3 — Examples gallery
**Prompt:**
> A gallery section with a heading, a one-line subhead, and a row (grid on mobile) of 3–4
> before/after image pairs — each pair shows a child's drawing on the left and a frame of its living
> world on the right, with a small caption. Include at least one deliberately rough, scribbly drawing
> so expectations stay honest.

**Copy (exact):**
- Heading: **Drawings, brought to life.**
- Subhead: *We keep what makes them yours — wobbles, smudges, three-legged dogs.*
- Caption format (per pair): *"[Child's name]'s [thing], age [n]"* (e.g. "Mia's dragon, age 6")

### Section 4 — Trust strip
**Prompt:**
> A slim, single-line trust strip on a subtly tinted band, centered, with one inline text link.
> Quiet and reassuring, not loud.

**Copy (exact):**
- *Drawings stay private. Webcam stays on your device. We don't train on what your child makes.* — **Privacy notice**

### Section 5 — Footer
**Prompt:**
> A minimal footer: a small wordmark placeholder on the left, three plain text links on the right,
> a hairline rule above. No newsletter form, no social icon wall.

**Copy (exact):**
- Links: **Privacy** · **Delete my drawings** · **Contact**
- (Wordmark: leave a placeholder — product name TBD.)

---

## 5. Parental consent modal (separate screen in Stitch)

Fires when a parent taps any start option the first time. Design it as its own modal/overlay.

**Prompt:**
> A small centered modal over a dimmed page: warm off-white card, rounded corners, a serif title, a
> short paragraph, and two buttons — one solid terracotta primary, one quiet text button. Calm and
> reassuring, not a scary legal wall.

**Copy (exact):**
- Title: **A note for the grown-up.**
- Body: *Continue to confirm you're 18 or older and you've read our Privacy Notice. We only collect the drawing your child makes — nothing else.*
- Primary button: **I'm a grown-up. Continue.**
- Secondary: **Maybe later**
- Extra line (only when the user chose "Draw in the air"): *We'll ask for camera access on the next page so we can see your hand.*

---

## 6. Never do this (anti-AI-slop guardrails)

If Stitch produces any of these, regenerate with the guardrail pasted back in:
- ❌ Emoji icons anywhere
- ❌ Three identical shadowed cards as the hero or the start section
- ❌ Gradient buttons or gradient backgrounds
- ❌ A stock "smiling child + tablet" hero illustration
- ❌ Everything set in one sans-serif font
- ❌ Generic CTAs like "Get Started" / "Sign Up Free" / "Learn More"
- ❌ Dark-mode toggle, animated stat counters, logo cloud, "Trusted by" bar
- ❌ More than one hand-drawn/decorative flourish
- ❌ Rewriting the copy — use the exact strings above

---

## 7. Microcopy bank (for later screens)

- Loading: *Bringing it to life.* → after ~10s: *Almost ready.*
- Webcam unavailable: *No webcam found. Try drawing on screen instead.*
- Generation failed: *Something went wrong bringing it to life. Try again?*
- Session ending (5-min cap): *The world is getting sleepy… saving your keepsake.*
- Keepsake ready: *Here's [name]'s world. Keep it or share it.*
