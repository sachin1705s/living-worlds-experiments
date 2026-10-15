---
date: 2026-05-29
topic: odyssey-interact-mode
---

# Odyssey-2 Interact Mode Integration

## Problem Frame

The product offers two ways to bring a child's drawing to life: Navigate (WASD exploration via LingBot) and Interact (directing the world with magic commands via Odyssey-2). The Navigate path is ~80% built. Interact mode is entirely greenfield — no SDK wired, no token endpoint, no UI. This document specifies what Interact mode does, how it integrates alongside Navigate mode, and where its scope ends.

---

## Actors

- A1. Child: uploads a drawing, selects a mode, watches the world and taps magic buttons.
- A2. Parent/guardian: accompanies the child per COPPA requirements; primary audience for the optional free-text input.
- A3. Odyssey-2 API: receives the seed image and text prompts; returns a live WebRTC video stream of the animated world.

---

## Key Flows

- F1. **Interact session start**
  - **Trigger:** User selects "Interact" on the mode picker after uploading a drawing.
  - **Actors:** A1, A2, A3
  - **Steps:**
    1. Frontend requests an Odyssey token from the backend token endpoint.
    2. Frontend initializes the Odyssey SDK with the token.
    3. Frontend uploads the drawing and seeds it as the world start state.
    4. Odyssey-2 returns a WebRTC stream; frontend attaches it to the shared `<video>` element.
    5. Magic button row and optional text input appear; 5-minute countdown begins.
  - **Outcome:** The drawing is alive and responsive to prompts. Child (with parent) can direct what happens.
  - **Covered by:** R1, R3, R4, R5, R8, R9, R11

- F2. **Magic button action**
  - **Trigger:** Child (or parent) taps a magic button during an active Interact session.
  - **Actors:** A1, A3
  - **Steps:**
    1. Frontend sends the server-defined prompt string mapped to that button to Odyssey.
    2. Odyssey modifies the world stream to reflect the action.
  - **Outcome:** The world changes visibly in response within a few seconds of the tap.
  - **Covered by:** R6, R7

---

## Requirements

**Mode selection**

- R1. Before any GPU session starts, the user selects Navigate (LingBot) or Interact (Odyssey) on a mode picker screen.
- R2. The user's uploaded drawing seeds both modes; the same image file is used regardless of which mode is selected.
- R3. Mode selection is presented after image upload and before any session is initiated; no session starts until a mode is confirmed.

**Interact mode — session lifecycle**

- R4. Interact mode authenticates via a backend-issued Odyssey token; the Odyssey API key is never sent to the browser.
- R5. The uploaded drawing is provided to Odyssey as the world seed image before generation starts.
- R6. Interact mode enforces a 5-minute user-facing time cap; a visible countdown timer is displayed throughout the session.
- R7. When the session ends (timer expiry, user action, or error), the user is offered the option to switch to Navigate mode.

**Interact mode — interaction surface**

- R8. The primary interaction surface is a row of preset magic buttons with kid-friendly action labels (e.g., "Make it dance!", "Add butterflies!", "Sunrise!", "Make it rain!").
- R9. Magic button labels and their associated Odyssey prompt strings are product-defined, not user-authored; no child-generated text is sent to Odyssey when only magic buttons are used.
- R10. A secondary "Say something else..." text input is available and is labeled as intended for a parent or guardian.
- R11. Tapping a magic button or submitting the text input sends the corresponding prompt to the active Odyssey session and the world responds in-stream.

**Video output**

- R12. Both Navigate and Interact modes share the same `<video>` element; starting a new session replaces `srcObject` with the incoming WebRTC track.
- R13. Video is displayed with `object-fit: contain` to avoid cropping Odyssey's native output resolution.

**Session management**

- R14. Only one GPU session (LingBot or Odyssey) runs at a time per browser tab; the previous session is terminated before a new one can start.
- R15. If the user re-enters a mode after a completed session, the drawing image does not need to be re-uploaded; the same file reference is reused.

---

## Success Criteria

- A child watching their drawing in Interact mode sees it visibly change when a parent taps a magic button — the connection between tap and world response is clear.
- Navigate and Interact sessions never run concurrently in the same browser tab.
- An implementer reading this doc can move to `/ce-plan` without inventing any user-facing behavior, session lifecycle rules, or scope boundaries.

---

## Scope Boundaries

- Voice input is not in scope; magic buttons and the parent text input are the complete interaction surface.
- Content moderation for the text input field is not built in this version; text is forwarded to Odyssey as-is.
- Switching modes while a session is actively running is not supported; mode is chosen once before session start.
- The museum / multiple-paintings experience is not part of this integration (deferred to ~2026-06-04 per prior decision).
- Per-session billing visibility (credits consumed, cost) is not exposed to users in this version.

---

## Key Decisions

- **Separate `odyssey.js` module, not a unified adapter**: LingBot and Odyssey have fundamentally different command surfaces (movement commands vs. text prompts). A shared abstraction at MVP scale creates indirection without meaningful shared behavior. `odyssey.js` mirrors the structure of `reactor.js` with completely different contents.
- **One session at a time**: Concurrent LingBot + Odyssey sessions were rejected to keep GPU cost and session management simple. Mode is chosen once per visit.
- **Magic buttons as primary surface**: Preset prompts keep child-generated content off the wire, which reduces COPPA exposure. Free text is secondary and parent-framed.
- **Text input is not moderated client-side**: The product's COPPA obligation is that the text field is labeled for parent/guardian use. Server-side moderation is a future concern.

---

## Dependencies / Assumptions

- Odyssey-2 accepts an image upload as the world seed (confirmed).
- Odyssey-2 delivers video via WebRTC (confirmed), allowing the same `<video>` element to receive the stream.
- Odyssey-2 has a JS/TS SDK installable via npm (confirmed).
- Odyssey-2 requires a backend token exchange; the API key must not reach the browser (confirmed).
- Odyssey applies its own session duration limits; the 5-minute product cap must not exceed any Odyssey hard cap.
- Magic button prompt copy will need a final pass before launch; placeholder labels are acceptable during implementation.

---

## Outstanding Questions

### Resolve Before Planning

*(none — the user is well-versed with the Odyssey SDK and can resolve SDK-level specifics during planning)*

### Deferred to Planning

- [Affects R4][Needs research] What is the Odyssey SDK npm package name and version, and what is the token exchange endpoint URL and request format?
- [Affects R5][Needs research] How does Odyssey image upload work — is it the same `uploadFile → FileRef` pattern as the Reactor SDK, or a different mechanism (e.g., a URL or base64 in the session init call)?
- [Affects R6][Needs research] Does Odyssey impose a hard session duration cap? If so, the product 5-minute timer must be set at or below that cap.
- [Affects R8][Technical] Finalize the magic button labels and their associated Odyssey prompt strings. Placeholders are acceptable for initial implementation.
- [Affects R11][Technical] Is sending a magic button prompt the same API call as sending a text input prompt, or does Odyssey distinguish between them?

---

## Next Steps

-> `/ce-plan` for structured implementation planning
