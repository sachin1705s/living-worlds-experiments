# RESEARCH.md — The Drawing Museum, Phase 1

Source: Reactor docs at `https://docs.reactor.inc` (access-gated; authenticated 2026-05-21).
Pages read and cached under `docs-cache/`:

- `llms.txt`
- `model-api-reference/lingbot/overview.md`
- `model-api-reference/lingbot/prompt-guide.md`
- `model-api-reference/helios/overview.md`
- `examples/navigable-lingbot-world.md`

---

## TL;DR

- Use **LingBot for everything** (museum + drawing worlds). Helios cannot do WASD navigation; using it for the museum would break the "walk toward a painting" premise.
- `set_image` accepts a `FileRef` from `uploadFile`. PNG/JPEG fine. Seed image fixes visual identity; prompt steers the rest. **Confirmed.**
- The handoff's portal flow assumes `set_image` can be called mid-generation on LingBot. **It cannot.** LingBot's `set_image` is only valid in `WAITING`. Portal transitions must go through `reset` → upload-or-reuse → `set_image` → `set_prompt` → `start`.
- **Parallel sessions are not a documented feature.** The SDK exposes a `ConflictError` "thrown when model is already in use by another session," which strongly implies one LingBot session per account at a time. Treat pre-staging as not available; mask the transition with the flash overlay instead. Pre-uploading the seed images at boot is supported and reduces the visible gap.
- Several handoff details need correction before coding (auth function name, command compatibility, portal prompt wording, default resolution). Captured below.

---

## Question 1 — Does LingBot accept a seed image as input?

**Yes.** From `model-api-reference/lingbot/overview.md`:

> `set_image` — `image: FileRef` (from `uploadFile`). Decodes the uploaded file and caches it as the seed image. Rejects non-image MIME types with `command_error`. Emits `image_accepted` then `conditions_ready`.

The seed image is one of LingBot's three simultaneous inputs (seed image + control signals + text prompt). Prompt-guide is explicit: **the seed image fixes the visual identity of the world; the prompt steers the rest.** Default output resolution is **480 × 832** (portrait — note this for our `<video>` aspect ratio).

The end-to-end pattern (from the navigable-world tutorial) is:

```ts
const ref = await uploadFile(seedFile);                 // File or Blob
await sendCommand("set_image", { image: ref });
await sendCommand("set_prompt", { prompt: BASE_PROMPT }); // ≤ 1000 chars
await sendCommand("start", {});
```

Both a prompt and a seed image are required before `start`; otherwise `start` fails with `command_error`. No text-only mode on LingBot.

---

## Question 2 — Helios for the museum, LingBot for the drawings?

**Recommendation: LingBot for both. Drop Helios from Phase 1.**

Helios (`model-api-reference/helios/overview.md`) is interactive video generation with prompt swaps and image-to-video conditioning, but its interactive surface is `set_prompt` / `schedule_prompt` / `set_image` — **there is no WASD or look control.** Helios produces a non-navigable stream. The "walk through the museum gallery toward the paintings" mechanic Phase 1 requires cannot be implemented on Helios.

Both models ship in the same `@reactor-team/js-sdk` — you switch by passing a different `modelName` to `Reactor` / `ReactorProvider`. Auth, lifecycle, and event plumbing are shared. So the question is purely a creative one (Helios cinematic vs LingBot navigable), and the answer is forced by the spec.

Helios is worth keeping in mind as a Phase 2 option (e.g., a non-interactive cinematic intro flythrough before handing control to LingBot for the museum), but not now.

---

## Question 3 — Transition cost of `reset` + new `set_image` + `start`

**There is no published latency number.** What the docs do tell us, and what it implies for our portal:

**Lifecycle constraint that contradicts the handoff.** The LingBot overview lists, for the `GENERATING` state:

> Valid commands during generation: `set_prompt`, the movement and look setters, `set_rotation_speed_deg`, `pause`, and `reset`.

`set_image` is **not** in that list. You can only set the image while in `WAITING` (after `connect` or after `reset`). The handoff's `transitionToWorld()` does `reset → set image → start`, which matches this constraint — keep that ordering. But we cannot, e.g., swap the seed image without resetting first.

**Cost components per portal crossing:**

1. `set_movement: idle` — chunk-aligned, applies at next chunk boundary.
2. `reset` — clears prompt + image + `started` flag; emits `generation_reset`. The stream stops.
3. `uploadFile` for the next seed image — network upload of the file. **Avoid in the hot path** by pre-uploading every seed image at app boot and caching the `FileRef`s.
4. `set_image` — decode + cache; emits `image_accepted` then `conditions_ready`.
5. `set_prompt` — store; emits `prompt_accepted` then `conditions_ready`.
6. `start` — emits `generation_started`; first chunk then has to be generated before any frame is visible.

The dominant terms are (3), if not pre-uploaded, and (6) first-chunk latency. The docs do not name a number for either, so we will measure during development. The flash overlay in the handoff is the right design — it hides whatever the real number turns out to be.

**Pre-staging trick that *is* supported:** at app boot, upload all four seed images (`museum`, `drawing-1`, `drawing-2`, `drawing-3`) and store the returned `FileRef`s. Transitions then skip step (3) entirely.

**Drift caveat that affects portal pacing.** From the prompt guide:

> The model retains roughly **300 generated chunks** before resetting back to the seed image. Long sessions naturally drift toward the seed.

That's our session ceiling. With chunks ≈ 33 frames each at adaptive fps, this is many minutes — not a Phase 1 concern, but worth noting for tuning `PORTAL_CROSS_THRESHOLD`.

---

## Question 4 — Can LingBot run two sessions in parallel?

**Not as a documented feature; treat as unsupported.**

The SDK exposes:

```ts
// Thrown when model is already in use by another session
class ConflictError extends Error {}
```

That's the only mention of multi-session behavior in the docs. The pattern strongly suggests one active LingBot session per account/token at a time. There's no `preloadSession`, no "warm next session" API, no example of two `Reactor` instances sharing a backend.

**Implication for the portal:** we cannot start generating the next world while still in the current one. The transition gap is real and must be hidden by the white flash + a loading affordance. Pre-uploading seed images is the only true latency mitigation available.

If we want to ask the Reactor team whether a second short-lived connection is permitted for warm-up, do that out-of-band before the deadline; the docs don't authorize it.

---

## Other findings worth fixing in the handoff before coding

These are small but they will bite us if we copy the handoff verbatim into code.

1. **Auth helper doesn't exist.** The handoff calls `fetchInsecureJwtToken(REACTOR_API_KEY)`. There is no such helper in the docs. The actual flow (from `llms.txt`):

   ```ts
   const r = await fetch("https://api.reactor.inc/tokens", {
     method: "POST",
     headers: { "Reactor-API-Key": process.env.REACTOR_API_KEY! },
   });
   const { jwt } = await r.json();
   ```

   Backend exchanges API key for a short-lived JWT; never expose the API key to the browser.

2. **`reactor.uploadFile` is on the imperative instance**, not a separate import. The handoff's `await reactor.uploadFile(imageFile)` is correct; the React-API equivalent is `s.uploadFile` from `useReactor`.

3. **Dedupe `set_movement` / `set_look_*` before sending.** The tutorial is explicit: "the server treats every call as a state change, so re-firing the same state burns a round trip." The handoff's `controls.js` re-fires on every keydown without checking `keyState[e.key]` for the *intent* state — fine for the WASD dedupe (it returns early if already pressed), but the handoff's KEY_MAP also re-fires `set_movement: forward` every time `w` retriggers across key-repeat. Add a `lastMovement` guard like the tutorial does.

4. **Two-key combos need a movement stack.** Press W, press A while W is held, release A → user expects to keep going forward. The tutorial uses a LIFO stack; the handoff's controls don't. We should adopt the stack pattern.

5. **`state` is the source of truth.** Subscribe once to `state` messages and derive UI from `running`, `has_prompt`, `has_image`, `current_chunk`, `current_action`. The handoff tracks transitions ad-hoc via `AppState`; we should still hold local state for portal-step counting and target world, but the *Reactor* facts (is it running, what's the current chunk) should come from `state`. Use `waitForEvent('generation_started')` is fine, but also gate "hide flash" on `running === true` from `state` as a fallback.

6. **`chunk_complete` vs Helios's `state`-emits-each-chunk.** On LingBot, `state` also emits after every `chunk_complete`. Use it; you don't need a separate `chunk_complete` handler for style re-anchoring. The handoff's "every 10 chunks re-send the base prompt" idea is fine — drive it off `current_chunk` from `state`.

7. **Portal prompt wording risk.** The portal prompt for the museum says *"a portal drawing you toward it"* and the drawing-1 portal says *"floats ahead — hand-drawn, wobbly, glowing"*. "Drawing you toward it" is borderline-imperative motion language — the prompt-guide warns against camera verbs (*pan, push in, fly through*). "Drawing you toward it" isn't a camera verb per se but it implies camera motion. Safer: describe the portal as a *static glowing object directly ahead*, and let the user's forward key + the natural near-plane resolve carry the "approaching" feel. Same fix for the other portal prompts.

8. **All prompts must obey the LingBot recipe.** The handoff's prompts are decent but skip the **sensation** slot (the single most-skipped, most-load-bearing anchor per the prompt guide) and use mood stacks (e.g., *"Quiet, reverent atmosphere"* is one phrase, OK; *"bright simple colors"* + *"playful"* + *"hand-drawn"* across multiple sentences risks a mood stack). Recommend a pre-implementation pass that rewrites each prompt against the **`{{world}}. {{sensation}}. {{event}}[, {{motion_resolution}}]. {{mood}}.`** template with all 7 traversal anchors present. 2–4 sentences, ≤ 1000 chars.

9. **Strafing has known issues.** From runtime caveats: *"Heavy A/D pressure tends to displace the camera off the centred subject."* Keep strafing brief or design scenes around forward motion. Our portal logic counts forward steps anyway, so this is fine — but expect A/D to feel weird in the drawing worlds. Acceptable for Phase 1.

10. **Default output is portrait (480×832).** The handoff's CSS uses `width:100vw; height:100vh; object-fit:cover`, which will heavily crop a portrait stream on a landscape monitor. Consider `object-fit: contain` with black letterbox bars, or accept the crop and acknowledge it. (`ReactorView` defaults to `"contain"`.) Pick deliberately.

---

## What to change in Phase 1 vs the handoff, concretely

Carry into implementation:

- All four seed images uploaded once at boot; cache `FileRef` per world ID.
- Single `Reactor` instance; never try to spin up a second.
- Transitions: `set_movement: idle` → show flash → `reset` → `set_image(cached_ref)` → `set_prompt(base_prompt)` → `start` → wait for `state.running === true` → hide flash → reset `forwardSteps`.
- Drive UI off the `state` message; track `current_chunk` from state for the periodic style re-anchor.
- Controls: dedupe with `lastMovement`/`lastLookH`/`lastLookV` guards; movement LIFO stack for two-key combos.
- Backend `/api/token` POSTs to `https://api.reactor.inc/tokens` with the `Reactor-API-Key` header; returns `{ jwt }`.
- Rewrite the world prompts against the LingBot template (sensation slot, ≤ 1000 chars, no camera verbs, one mood phrase, all 7 anchors) before wiring them.
- Choose `object-fit: contain` for `#world-video` unless we deliberately want crop.

Deferred (not Phase 1):

- Parallel-session pre-warm. Not documented; ask the Reactor team if we have time.
- Helios cinematic intro. Possible Phase 2 polish.
