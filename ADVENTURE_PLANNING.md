# The Drawing Adventure — Product Planning Doc

*A planning document for the adventure-loop reframe of the Drawing Museum*
*Created: May 28, 2026*

---

## Part 1 — The Reframe

### The Quote That Changed Everything

> "drew a dragon → fought it → won. a cave opened up behind it. walked in, got teleported to a whole new world. now i can't stop. gotta draw what's next..."

This wasn't a feature request. It was a complete game loop, articulated by a stranger in 25 words. The phrase that matters most: **"gotta draw what's next."** Drawing isn't an input to the app — drawing is how you progress in the game. The pencil is the controller.

### From Tool To Game

| | Old framing (Museum) | New framing (Adventure) |
|---|---|---|
| What is the app? | A creative tool | A game where imagination is the controller |
| What does the drawing do? | Becomes a world to walk through | Unlocks the next chapter of a story |
| Why does the kid come back? | They drew something else | The adventure is in progress |
| Emotional driver | "Preserve and celebrate" | "I can't stop — gotta know what's next" |
| Engagement pattern | One-shot magic moment | Daily compulsive return |
| Business shape | Keepsake product, low frequency | Game product, daily use |
| Likely ceiling | $5-20M | $50-500M+ (Roblox/Minecraft-shaped) |

The museum framing is what we've been building. The adventure framing is what kids actually want. Both are real. The adventure framing is bigger, harder, and more defensible.

### The North Star

**Your imagination is the controller for an endless adventure.** Every drawing the child makes is a move in a story that only they can write. The world cannot continue without them. That's the hook.

---

## Part 2 — The Core Loop

### The Six Beats

```
1. DRAW       → Child draws a character/object on paper, photographs it
2. ENCOUNTER  → The thing appears in the world; something to engage with
3. RESOLVE    → A simple choice; resolution plays out cinematically
4. UNLOCK     → The world expands — a cave opens, a door appears, a bridge forms
5. EXPLORE    → New environment, new mysteries
6. PROMPT     → Something in the new area needs a drawing — back to step 1
```

Each cycle deepens the story and grows the world. The child co-authors an unfolding adventure with the app, where their drawings are the dialogue.

### What Each Beat Looks Like (Concrete Example)

**1. Draw:** Child draws a dragon with crayons on paper. Photographs it.

**2. Encounter:** Child walks through the generated world (existing LingBot architecture). The dragon they drew is *there*, breathing crayon-fire, looking at them.

**3. Resolve:** A simple UI choice appears — "Approach with a sword / Approach with food / Approach with friendship." Child picks "friendship." A scripted sequence plays: dragon tilts its head, sniffs, curls up next to them.

**4. Unlock:** The world updates — behind the now-friendly dragon, a glowing crayon cave entrance has appeared in the rock face.

**5. Explore:** Child walks toward the cave → existing portal mechanic transitions them into a new world (the cave interior, drawn in the same crayon aesthetic).

**6. Prompt:** Inside the cave, a treasure chest sits with three locks. A speech bubble appears: "What's inside the chest? Draw it!" Child grabs paper, draws what they want — a baby dragon, a magic sword, infinite candy, whatever. They upload it. The chest opens to reveal exactly what they drew.

The cycle repeats. The story grows. The kid cannot stop.

### Why "Drawing What's Next" Is The Killer Mechanic

This is the part most easy to overlook. After each new area unlocks, the world contains a *visual prompt* for the next drawing. The world *demands* the child's imagination to continue. The child isn't drawing because they want to use the app — the child is drawing because the dragon needs a friend, the chest needs contents, the river needs a way across.

The drawing isn't the chore that unlocks the play. The drawing IS the play.

---

## Part 3 — What We Already Have

The adventure framing is not a rebuild. It's an evolution of the museum/portals architecture. Most of the technical foundation is already in place.

| Required for adventure loop | Already built? |
|---|---|
| Walking through a generated world (WASD + look) | ✅ LingBot integration done |
| World generation from a seed image | ✅ Working in contest demo |
| Portal-as-transition between worlds | ✅ Built in Phase 1 (cave/door/bridge are reskins of the portal) |
| `reset` + new seed + `start` cycle | ✅ Working |
| Style-preservation prompting | ✅ Pattern established |
| Side-by-side keepsake artifact | 🟡 Planned (use as "save your adventure moment") |

What's new and what needs building is in Part 4.

---

## Part 4 — What's New To Build

Three additions to the existing architecture. None require new model providers; all are buildable on the current Reactor LingBot foundation with creative prompt engineering and a thin game-state layer above it.

### A. The Encounter System

The genuinely new technical work. Making the drawn character feel present and interactive.

**Honest constraint:** LingBot can't do true real-time NPC behavior — chunk-boundary delay and prompt steering aren't fast enough for game-feel input. So encounters are **scripted, not simulated**. Wizard-of-Oz behind the curtain. A 7-year-old experiencing the magic will not notice.

**The pattern:**
1. Child walks toward the character → prompt steers character into frame prominently
2. Encounter trigger: simple 2-3 button choice UI appears ("Approach with sword / food / friendship")
3. Choice determines which of 2-3 scripted prompt sequences plays
4. Each sequence is a series of 2-4 prompt swaps that cinematically resolve the encounter
5. Resolution complete → world prompt swaps to reveal the unlock (cave, door, bridge)

**Implementation skeleton:**
```javascript
const encounter = {
  triggerWorld: 'DRAGON_FOREST',
  choices: [
    {
      label: "Approach with friendship",
      sequence: [
        "...same crayon world... the child holds out an open hand toward the dragon",
        "...same crayon world... the dragon lowers its head curiously",
        "...same crayon world... the dragon nuzzles into the child's hand, friendly now",
        "...same crayon world... behind the dragon, a glowing crayon cave entrance has opened"
      ],
      unlocks: 'CAVE_ENTRANCE'
    },
    // ... two more choices, each with their own narrative arc and unlock
  ]
};
```

The encounter feels like agency. Mechanically it's a branching script. That's enough.

### B. The "Draw What's Next" Mechanic

The compulsion loop. After each unlock, the world contains a visual prompt for what to draw next.

**Components needed:**
- A library of starting prompts per environment type (cave, forest, sky, underwater, castle, space, etc.) — start with ~20 hand-authored
- An in-world UI element that surfaces the current prompt clearly (speech bubble, glowing object, NPC dialogue)
- An "upload your drawing" trigger that doesn't require leaving the world (camera/file picker overlay)
- A prompt-swap pattern that incorporates the uploaded drawing into the existing world state

**Prompt library examples by environment:**

*Forest:*
- "A creature is hiding behind that tree — what is it?"
- "Something is glowing in the bushes — draw what's making the light"
- "A bird is trapped in a net — what could help free it?"

*Cave:*
- "There's a treasure chest with three locks — draw what's inside"
- "Something is sleeping deep in the cave — what wakes when you touch it?"
- "A pool of glowing water — what climbs out of it?"

*Sky world:*
- "You need wings to reach the cloud kingdom — draw your wings"
- "A floating island in the distance — what bridge could reach it?"
- "Something is falling from the clouds — what catches it?"

*Underwater:*
- "A friendly creature wants to guide you — draw it"
- "There's a door at the bottom of the sea — draw the key"
- "Something glows under the sand — draw what's buried"

The prompt library can start hand-authored. Over time prompts can be dynamically generated based on the story so far.

### C. The Story Persistence System

The compulsion loop only works if the story persists between sessions. Without this, the magic resets every time the child closes the app. With it, opening the app means walking back into an adventure that has been waiting.

**Data model:**
```javascript
const Adventure = {
  childProfile: { firstName: 'Tommy', age: 6 },
  parentAccount: { /* COPPA consent record */ },
  
  storyState: {
    currentChapter: 4,
    currentWorld: 'CRYSTAL_CAVE',
    unlockedAreas: ['FOREST', 'DRAGON_FOREST', 'CAVE_ENTRANCE', 'CRYSTAL_CAVE'],
    
    drawings: [
      { id, uploadedAt, originalImageUrl, roleInStory: 'dragon', chapter: 2 },
      { id, uploadedAt, originalImageUrl, roleInStory: 'chest_contents', chapter: 3 },
      // ...
    ],
    
    encountersResolved: [
      { encounterId, choice, outcome, chapter: 2 },
    ],
    
    currentPrompt: "Something glows under the sand — draw what's buried"
  }
};
```

**Home screen states:**
- First-time: "Begin your adventure" — onboarding, first drawing prompt
- Returning: "Continue your adventure" — shows the last frame from where they left off, the current prompt, and a "Pick up where you left off" button
- Gallery: "Your story so far" — chronological view of all drawings + the moment each one unlocked in the world

**Why this matters for the business:**
After three months a child has a library of 50 drawings, all connected, all part of *their* adventure. That's a saved game they can't replicate elsewhere. Switching cost is enormous. This is the real moat.

---

## Part 5 — How This Changes The Business

### Engagement Pattern Shift

**Old:** Open → wow → close → forget. Re-engagement requires the child happening to draw something else.

**New:** Open → return to story in progress → must know what's next → can't stop drawing. Daily use, compounding investment.

This is the same shift that made Webkinz, Tamagotchi, Roblox, and Minecraft category-defining products. None of them are "tools." All of them are games with persistent state that demand return.

### Pricing Implications

The keepsake framing supports ~$10/month. The game framing supports more, because parents pay differently for "the thing my kid begs to use every day" vs. "the keepsake I generated once."

Revised tier suggestion (TBD validate with users):

- **Free:** 1 chapter to try (one encounter + one unlock + one drawing prompt), then paywall
- **Adventure ($14.99/mo or $119/yr):** Unlimited adventuring, story persists, save all drawings, share moments
- **Family Plus ($24.99/mo or $199/yr):** Multiple child profiles, parent dashboard, story export as illustrated storybook PDF, share adventure with grandparents

### The Snapshot/Story/World Tiers — Where Do They Fit?

The previous tiered offering doesn't go away. It evolves to support the adventure:

- **Snapshot:** "Save this moment" — a single beautiful frame from your adventure as a keepsake
- **Story:** "Watch this chapter again" — a short video replay of a key encounter (the dragon resolution, the chest opening)
- **World:** No longer a tier — it's the medium itself, what the entire adventure plays out in

The shareable keepsake mechanic stays. It just becomes "share a moment from my adventure" instead of "share a world I made."

### Marketing Reframe

**Old pitch:** "Turn your child's drawing into a world you can walk through." (Adult-focused, keepsake-driven)

**New pitch:** "Your child draws a dragon. They face the dragon. They win. A cave opens behind it. Now they have to draw what's inside."

The new pitch reads like a movie trailer for the child's imagination. It is also exactly what the person on social media wrote, unprompted, when they saw the demo. That's a sign the framing writes itself.

---

## Part 6 — The Roadmap

Three phases, each shippable independently, each building on the previous. The existing museum/portals architecture is the foundation; nothing in it is wasted.

### Phase A — Prove One Loop (2-4 weeks)

Goal: ship one complete adventure loop, end-to-end, with one drawing.

- Pick one starter drawing scenario (dragon recommended — emotionally rich, simple to script)
- Build the encounter UI (2-3 choice buttons over the video stream)
- Script the 3 resolution sequences (prompt swap sequences for each choice)
- Script the unlock (cave appears in the world)
- Wire the unlock to the existing portal mechanic
- Build the in-world prompt UI ("What's inside the chest? Draw it!")
- Build the upload-from-within-the-experience flow
- Wire the uploaded drawing as the new seed image for the next world

**Done when:** A child can upload a dragon drawing, encounter the dragon, choose a resolution, watch it play out, walk through the cave portal, see a prompt, draw the answer on paper, photograph it, and have it appear in the next world.

This is the proof of magic. One complete loop. Build this and demo it before anything else.

### Phase B — Make It A Game (1-2 months)

Goal: turn the single loop into a continuous adventure with 8-12 chapters.

- Build the prompt library across 6-8 environment types (forest, cave, sky, underwater, castle, space, desert, ocean)
- Author 12-15 encounter scripts, each with 2-3 choices
- Design the environment tree (which unlocks lead to which environments)
- Build the world-update prompt system (incorporating uploaded drawings into the current world state)
- Add a "moment" capture for each encounter resolution (becomes a sharable artifact)
- First version of story persistence (local storage acceptable for this phase)

**Done when:** A child can play through a 30-minute adventure with multiple drawings, multiple encounters, branching paths, and a clear sense of progression.

### Phase C — Make It Persist (2-3 months)

Goal: account system, persistent stories, return engagement.

- COPPA-compliant parent account + child profile system
- Server-side story state persistence
- "Continue your adventure" home screen
- Drawings gallery as a chronological story
- "Export your story" as a printable illustrated PDF storybook (huge keepsake + share asset)
- Parent dashboard (visibility into what the child is doing, time limits, delete-all)
- The grandparent share link (read-only viewer of the child's adventure)

**Done when:** A child can close the app, return three days later, see their adventure waiting, and pick up exactly where they left off. Parents can see what their child has built and share it.

### Phase D — Onward

Decisions to make after the first three phases are live and validated:

- **Companion layer (Interact Studio convergence):** Characters from the adventure become talking companions the child can converse with. Hardest, most regulated, biggest unlock.
- **Multi-child / social:** Other children's adventures visible. Friends visit your adventure. Roblox-shaped network effects.
- **Adventure marketplace:** Curated adventure starting points authored by the team or other creators. Lower bar to entry than "draw something to start."
- **Physical product:** Printed storybooks, framed side-by-sides, drawing kits with adventure prompts on them, eventually subscription boxes.

---

## Part 7 — Open Design Questions

These need to be answered before or during Phase A. None are blockers but all matter for execution quality.

### 7.1 — How Does The Child Resolve An Encounter?

Three options, each with tradeoffs:

- **Button choice (recommended for v1):** 2-3 clearly labeled choices appear over the video. Simple, accessible to non-readers if iconified, deterministic. Fastest to ship.
- **Drawing-based resolution:** Child draws a sword/food/flower on paper to indicate their choice. More immersive (drawing as input again), but adds a step and requires recognition.
- **Voice-based resolution:** Child speaks ("be nice to the dragon!"). Most natural, but raises COPPA voice-data complexity.

V1 ships with buttons. Later phases can experiment with drawing-based resolution as a premium feature.

### 7.2 — How Do We Avoid Violence?

The original quote said "fought it → won." A 6-year-old means something very different by "fought" than an adult does. We should not ship combat mechanics.

The product principle: every encounter is resolved through *connection*, not violence. The child:
- Befriends the dragon (feeds it, plays with it, sings to it)
- Outsmarts the obstacle (drawing a key, a bridge, a friend)
- Helps the character (the trapped bird, the lost creature)

This is also a positioning asset — "the AI app where kids' imagination solves problems through kindness" reads as a meaningful differentiator to parents and teachers.

### 7.3 — How Long Is A Session?

Honest answer: this needs user research. Kids' sessions on Toca Boca, Roblox, etc. range from 10 minutes to hours. The right session length for this product is whatever a complete encounter-resolve-unlock-prompt cycle takes (probably 8-15 minutes). Sessions can be one cycle or many.

Design implication: every cycle must be a satisfying complete unit. No mid-cycle save states that leave a kid hanging without resolution.

### 7.4 — How Does The Child Know What To Do?

Kids 4-10 vary enormously in reading ability. UI must support:
- Visual cues over text (glowing objects, pointing arrows, character animations)
- Voiceover for all prompts ("There's a treasure chest. Draw what's inside!")
- Simple icon-based choices, not paragraph descriptions

Voiceover specifically — a warm, friendly narrator voice (consistent across the adventure) reading every prompt out loud removes the literacy gate. This is a Phase A or B addition.

### 7.5 — What If The Kid Just Wants To Free-Roam?

Not every kid wants a directed story. Some want to explore, build, and create without adventure structure.

Solution: keep both modes.
- **Adventure mode:** the loop described in this doc, default for new users
- **Free Play mode:** the original museum/portals experience, drawings as worlds without encounters

The Free Play mode is what we already built. It doesn't go away. It becomes the alternative for kids and parents who want the keepsake/exploration experience without the game structure.

---

## Part 8 — Risks

### 8.1 — Engagement Risk

The compulsion loop is also the addiction risk. Kids who "can't stop" is great for engagement but bad for ethics. We must build in healthy use mechanics from day one:
- Soft session limits with parent-configurable defaults
- "Take a break" prompts after 30-45 minutes
- Daily time caps that the parent sets, not the kid
- Visible time-spent display in the parent dashboard

This is ethically required and a marketing asset. Parents are increasingly cautious about engagement-maximizing kid apps. "Designed for short, healthy sessions" is a positioning advantage.

### 8.2 — Story Drift Risk

LingBot's hand-drawn aesthetic preservation degrades over long sessions. With persistent adventures spanning many sessions and worlds, the aesthetic drift compounds. Mitigations:
- Aggressive style re-anchoring (every 5-10 chunks)
- Periodic full prompt resets at chapter boundaries
- Test heavily — this is the most likely place the experience breaks at scale

### 8.3 — Drawing Quality Variability

Some kids draw beautifully. Some draw scribbles. The encounter system must work for both. A scribble-dragon must still feel like a dragon in the world. This is mostly a prompt-engineering problem — explicitly telling LingBot that the input is a child's drawing in any state and the world should treat it as the thing it represents, no matter how rough.

### 8.4 — Encounter Variety Burnout

If every encounter is "drew a thing → friendship/sword/food choice → unlock," kids will tire of it. Phase B must introduce variety: puzzles, riddles, multi-step resolutions, encounters that require multiple drawings, drawings that change the environment rather than unlock a new one.

### 8.5 — Computational Cost

A persistent adventure means many more world generations per child per month than the museum model. Snapshot/Story tiers were partly designed to subsidize the expensive World tier. With adventures being all-World-tier-all-the-time, unit economics must be modeled carefully before pricing.

---

## Part 9 — Decision Framework

Before committing to this reframe fully, three questions to answer:

1. **Does this feel like the product you want to build?** The adventure framing is a bigger product, a harder product, and a more compulsive one. It changes what you tell investors, parents, and what kids do with the app. If it lights you up, that matters more than spec-sheet comparisons.

2. **Can the museum framing coexist?** Yes — Free Play mode preserves it. The adventure becomes the default; the museum is an alternate mode. No work is wasted.

3. **What does Phase A cost?** Probably 2-4 weeks of focused work on top of the existing architecture. That's a real but bounded investment to prove or disprove the entire premise. The downside of trying is small; the downside of not trying — and watching someone else build it — is much larger.

---

## Part 10 — Next Steps

If proceeding:

1. **Choose the v1 encounter** — pick the one drawing scenario for the proof-of-magic build. Dragon recommended for emotional richness and broad recognition.
2. **Script the three resolutions** — write the LingBot prompt sequences for each choice. Test them in isolation.
3. **Design the encounter UI** — wireframe the choice overlay. Keep it minimal — 2-3 buttons over the video stream.
4. **Build Phase A** — single complete loop, end-to-end, demoable in 4 weeks.
5. **Show it to the same person who wrote the quote** — and to 10 other parents and 10 kids. Validate the magic.

If not proceeding (or doing this later): note this doc and continue with the Snapshot/Story/World plan as described in HANDOFF_v2.md. The reframe can wait — but it should be considered the most important strategic question on the table.

---

## References

- HANDOFF_v2.md — current technical handoff for tiered product
- PROJECT_VISION.md — strategic doc including Interact Studio convergence
- HANDOFF.md — original contest-era Phase 1 handoff (museum + portals code)
- Original quote that sparked this doc: posted publicly in response to the contest demo, May 2026
