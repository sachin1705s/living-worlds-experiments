# Project Handoff: The Drawing Museum
**For Claude Code — Phase 1 Implementation**

---

## What We're Building

A browser-based interactive experience called **The Drawing Museum**. The user walks through a grand museum gallery. On the walls hang a child's hand-drawn paintings in gilded frames. When the user walks toward a painting and crosses a portal threshold, they are transported inside that drawing — a living, navigable world generated in real-time from the drawing as a seed image. A glowing portal inside each drawing world leads to the next one. The loop continues until all drawings have been visited, returning the user to the museum.

This is being entered in the Reactor.inc world generation contest (deadline: Friday May 22, 2026 at 9AM PST).

---

## Phase 1 Scope (This Handoff)

Build only the following. Nothing else.

1. **The museum** — a navigable gallery space the user can walk through
2. **Movement inside the world** — WASD + look controls wired to the LingBot API
3. **Portals** — walking into a portal transitions you into a drawing world, and back out again

Not in Phase 1 (do later): Polaroid mechanic, end screen, download/share, music, mobile support.

---

## Research Task — Do This First

Before writing any implementation code, Claude Code must research and confirm the following. Check the Reactor docs at `https://docs.reactor.inc/llms.txt` first to get the full documentation index, then read the relevant pages.

### Questions to answer:

**1. Can LingBot accept a seed image as input?**
From our reading of the docs, `set_image` accepts a `FileRef` from `uploadFile`. Confirm this is correct and that it accepts standard image formats (PNG/JPEG). Confirm the image anchors the visual style of the generated world.

**2. Can Helios be used for the museum itself, or is LingBot sufficient for both?**
Helios is a 14B real-time long video generation model (T2V, I2V, V2V). LingBot is a navigable world model with WASD controls. The question is:
- Is LingBot alone sufficient to generate both the museum AND the drawing worlds?
- Or should Helios generate the museum as a higher-quality cinematic backdrop while LingBot handles the drawing worlds (which need navigation)?
- Check if Helios has a Reactor SDK integration or if it's only accessible via a separate API. Check `https://docs.reactor.inc/model-api-reference/helios/overview` (requires API key — if inaccessible, note that and proceed with LingBot-only architecture).

**3. What is the transition cost of `reset` + new `set_image` + `start`?**
When transitioning between drawing worlds via a portal, we call `reset`, then set new image/prompt, then `start`. What is the expected latency of this cycle? Is there a way to pre-stage the next session to reduce the blank gap?

**4. Does LingBot support running two sessions in parallel?**
If yes, we can pre-load the next drawing world while the user is still in the current one, eliminating transition lag.

Document your findings in a `RESEARCH.md` file before proceeding to implementation.

---

## Architecture

### Tech Stack
- **Frontend**: Vanilla JS + HTML/CSS (no framework — keep it lightweight and fast)
- **World generation**: Reactor JS SDK (`@reactor-team/js-sdk`)
- **Backend**: Node.js + Express (for JWT auth and serving assets)
- **Target**: Desktop browser (Chrome/Firefox), keyboard controls

### Repository Structure
```
drawing-museum/
├── backend/
│   ├── server.js          # Express server, JWT auth endpoint
│   ├── .env.example       # REACTOR_API_KEY
│   └── package.json
├── frontend/
│   ├── index.html         # Main entry
│   ├── style.css          # All styles
│   ├── main.js            # App bootstrap
│   ├── reactor.js         # Reactor SDK wrapper / session manager
│   ├── controls.js        # WASD + look input → LingBot commands
│   ├── portal.js          # Portal proximity detection + transition logic
│   └── drawings/          # Seed images for each drawing world
│       ├── museum.jpg     # Seed image for the museum itself
│       ├── drawing-1.jpg  # Nephew's drawing 1
│       ├── drawing-2.jpg  # Nephew's drawing 2
│       └── drawing-3.jpg  # Nephew's drawing 3
├── RESEARCH.md            # Output of research task above
└── README.md
```

---

## Session State Machine

The app has one LingBot session at a time. The state machine:

```
MUSEUM
  │
  │ (user walks forward N steps → portal threshold)
  ▼
TRANSITIONING (flash → reset → new seed image → start)
  │
  ▼
DRAWING_WORLD_1
  │
  │ (user walks forward N steps → portal threshold)
  ▼
TRANSITIONING
  │
  ▼
DRAWING_WORLD_2
  │
  ...and so on, cycling back to MUSEUM after all drawings
```

Track current state in a simple JS object:

```javascript
const AppState = {
    current: 'MUSEUM',           // 'MUSEUM' | 'DRAWING_1' | 'DRAWING_2' | 'DRAWING_3' | 'TRANSITIONING'
    forwardSteps: 0,             // net forward steps since entering current world
    drawingIndex: 0,             // which drawing world we're in (0-2)
    isTransitioning: false       // prevent double-trigger
};
```

---

## The Worlds

### World 0 — The Museum

This is the connective tissue. A grand gallery space.

```javascript
const MUSEUM_WORLD = {
    seedImage: './drawings/museum.jpg',  // Generate this: a grand museum interior
    prompt: `A grand museum gallery at night. Marble floors reflecting warm golden light. 
             High vaulted ceilings. White walls hung with colorful framed paintings in 
             gilded frames. Soft gallery spotlights. Quiet, reverent atmosphere. 
             The paintings on the walls are children's drawings in ornate frames.`,
    portalPrompt: `Same grand museum gallery. Ahead, one of the paintings on the wall 
                   glows with a warm golden light, shimmering slightly, a portal 
                   drawing you toward it.`
};
```

### Worlds 1–3 — Inside the Drawings

Each drawing world uses the actual drawing as the seed image. The prompt preserves the hand-drawn aesthetic.

```javascript
const DRAWING_WORLDS = [
    {
        id: 'DRAWING_1',
        seedImage: './drawings/drawing-1.jpg',
        name: "Tommy's House",
        prompt: `A living world inside a child's crayon drawing. Preserve the hand-drawn 
                 crayon style exactly — wobbly lines, flat perspective, bright simple colors. 
                 A house with a yellow sun, green scribble grass, blue sky with white puff 
                 clouds. Everything moves gently but stays hand-drawn. Never becomes 
                 photorealistic. The sky stays crayon blue. The grass stays scribbled green.`,
        portalPrompt: `Same crayon drawing world. Ahead, a glowing circular doorway drawn 
                       in crayon — wobbly and hand-drawn — shimmers with golden light. 
                       It is a portal to another drawing world.`
    },
    {
        id: 'DRAWING_2',
        seedImage: './drawings/drawing-2.jpg',
        name: "The Dragon",
        prompt: `A living world inside a child's crayon drawing of a dragon. Hand-drawn 
                 style preserved — thick crayon lines, vivid colors, flat childlike 
                 perspective. The dragon breathes crayon-drawn fire. Crayon mountains 
                 in the background. Everything is alive but drawn, never photorealistic.`,
        portalPrompt: `Same crayon dragon world. A swirling portal drawn in blue crayon 
                       floats ahead — hand-drawn, wobbly, glowing. A gateway to another 
                       world.`
    },
    {
        id: 'DRAWING_3',
        seedImage: './drawings/drawing-3.jpg',
        name: "Space Adventure",
        prompt: `A living world inside a child's crayon drawing of outer space. 
                 Hand-drawn rockets, crayon stars, a smiling drawn sun and moon together 
                 in the sky. Bright simple colors. Everything floats and drifts gently 
                 but stays in the hand-drawn crayon aesthetic throughout.`,
        portalPrompt: `Same crayon space world. A portal drawn in yellow crayon glows 
                       ahead — wobbly stars orbiting it — leading back to the museum.`
    }
];
```

**Important**: The actual seed images (the real drawings) will be provided later. For development, use placeholder images or generate test images. The prompts are the primary driver of aesthetic — the seed image anchors visual identity but the prompt governs style preservation.

---

## LingBot Integration

### Auth Flow

```javascript
// backend/server.js
app.get('/api/token', async (req, res) => {
    const token = await fetchInsecureJwtToken(process.env.REACTOR_API_KEY);
    res.json({ token });
});
```

```javascript
// frontend/reactor.js
async function getToken() {
    const res = await fetch('/api/token');
    const { token } = await res.json();
    return token;
}
```

### Session Manager

```javascript
// frontend/reactor.js

import { Reactor } from "@reactor-team/js-sdk";

let reactor = null;
let videoElement = null;

export async function initSession(videoEl) {
    videoElement = videoEl;
    reactor = new Reactor({ modelName: "lingbot" });
    
    reactor.on("trackReceived", (name, track, stream) => {
        if (name === "main_video") {
            videoElement.srcObject = stream;
        }
    });
    
    const token = await getToken();
    await reactor.connect(token);
    
    return reactor;
}

export async function loadWorld(world) {
    // Upload seed image
    const imageBlob = await fetch(world.seedImage).then(r => r.blob());
    const imageFile = new File([imageBlob], 'seed.png', { type: 'image/png' });
    const ref = await reactor.uploadFile(imageFile);
    
    await reactor.sendCommand("set_image", { image: ref });
    await reactor.sendCommand("set_prompt", { prompt: world.prompt });
    await reactor.sendCommand("start", {});
}

export async function transitionToWorld(nextWorld, onFlashComplete) {
    await reactor.sendCommand("reset", {});
    onFlashComplete(); // triggers CSS flash overlay
    await loadWorld(nextWorld);
}

export async function swapPrompt(prompt) {
    await reactor.sendCommand("set_prompt", { prompt });
}
```

---

## Controls

Map keyboard input to LingBot movement commands. Use the persistent-state model (not pulses — LingBot requires explicit `idle` to stop).

```javascript
// frontend/controls.js

const keyState = {};

const KEY_MAP = {
    'w': () => reactor.sendCommand("set_movement", { movement: "forward" }),
    's': () => reactor.sendCommand("set_movement", { movement: "back" }),
    'a': () => reactor.sendCommand("set_movement", { movement: "strafe_left" }),
    'd': () => reactor.sendCommand("set_movement", { movement: "strafe_right" }),
    'ArrowLeft':  () => reactor.sendCommand("set_look_horizontal", { look_horizontal: "left" }),
    'ArrowRight': () => reactor.sendCommand("set_look_horizontal", { look_horizontal: "right" }),
    'ArrowUp':    () => reactor.sendCommand("set_look_vertical", { look_vertical: "up" }),
    'ArrowDown':  () => reactor.sendCommand("set_look_vertical", { look_vertical: "down" }),
};

const IDLE_MAP = {
    'w': () => reactor.sendCommand("set_movement", { movement: "idle" }),
    's': () => reactor.sendCommand("set_movement", { movement: "idle" }),
    'a': () => reactor.sendCommand("set_movement", { movement: "idle" }),
    'd': () => reactor.sendCommand("set_movement", { movement: "idle" }),
    'ArrowLeft':  () => reactor.sendCommand("set_look_horizontal", { look_horizontal: "idle" }),
    'ArrowRight': () => reactor.sendCommand("set_look_horizontal", { look_horizontal: "idle" }),
    'ArrowUp':    () => reactor.sendCommand("set_look_vertical", { look_vertical: "idle" }),
    'ArrowDown':  () => reactor.sendCommand("set_look_vertical", { look_vertical: "idle" }),
};

document.addEventListener('keydown', (e) => {
    if (keyState[e.key] || AppState.isTransitioning) return;
    keyState[e.key] = true;
    if (KEY_MAP[e.key]) KEY_MAP[e.key]();
    
    // Track forward steps for portal detection
    if (e.key === 'w') onForwardStep();
    if (e.key === 's') AppState.forwardSteps = Math.max(0, AppState.forwardSteps - 1);
});

document.addEventListener('keyup', (e) => {
    keyState[e.key] = false;
    if (IDLE_MAP[e.key]) IDLE_MAP[e.key]();
});
```

---

## Portal System

### Step Tracking

Since LingBot outputs a video stream (no 3D coordinate system), track portal proximity via net forward steps.

```javascript
// frontend/portal.js

const PORTAL_PROMPT_THRESHOLD = 20;  // show portal in world at this step count
const PORTAL_CROSS_THRESHOLD = 35;   // trigger transition at this step count

export function onForwardStep() {
    if (AppState.isTransitioning) return;
    AppState.forwardSteps++;
    
    // Swap to portal prompt when approaching
    if (AppState.forwardSteps === PORTAL_PROMPT_THRESHOLD) {
        const world = getCurrentWorld();
        swapPrompt(world.portalPrompt);
    }
    
    // Trigger transition when crossing portal
    if (AppState.forwardSteps >= PORTAL_CROSS_THRESHOLD) {
        crossPortal();
    }
}
```

### Portal Transition

```javascript
// frontend/portal.js

export async function crossPortal() {
    if (AppState.isTransitioning) return;
    AppState.isTransitioning = true;
    
    // 1. Stop movement
    await reactor.sendCommand("set_movement", { movement: "idle" });
    
    // 2. Show portal flash overlay
    showFlash();
    
    // 3. Determine next world
    const nextWorld = getNextWorld(); // cycles: museum → d1 → d2 → d3 → museum
    
    // 4. Reset and load next world (happens during flash)
    await transitionToWorld(nextWorld, () => {});
    
    // 5. Wait for generation_started
    await waitForEvent('generation_started');
    
    // 6. Hide flash
    hideFlash();
    
    // 7. Reset step counter and state
    AppState.forwardSteps = 0;
    AppState.current = nextWorld.id;
    AppState.isTransitioning = false;
}

function getNextWorld() {
    const order = ['MUSEUM', 'DRAWING_1', 'DRAWING_2', 'DRAWING_3'];
    const currentIndex = order.indexOf(AppState.current);
    const nextIndex = (currentIndex + 1) % order.length;
    const nextId = order[nextIndex];
    
    if (nextId === 'MUSEUM') return MUSEUM_WORLD;
    return DRAWING_WORLDS[nextIndex - 1];
}
```

### Flash Overlay

```css
/* style.css */
#portal-flash {
    position: fixed;
    inset: 0;
    background: white;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.4s ease;
    z-index: 100;
}

#portal-flash.visible {
    opacity: 1;
}
```

```javascript
function showFlash() {
    document.getElementById('portal-flash').classList.add('visible');
}
function hideFlash() {
    document.getElementById('portal-flash').classList.remove('visible');
}
```

---

## UI Layout

The video stream is fullscreen. Minimal UI overlaid:

```html
<!-- index.html -->
<body>
    <!-- LingBot video stream — fullscreen -->
    <video id="world-video" autoplay muted playsinline></video>
    
    <!-- Portal flash overlay -->
    <div id="portal-flash"></div>
    
    <!-- World name indicator (bottom left) -->
    <div id="world-label">The Museum</div>
    
    <!-- Controls hint (bottom right, fades after 5s) -->
    <div id="controls-hint">
        WASD — Move &nbsp;|&nbsp; Arrow Keys — Look
    </div>
    
    <!-- Loading state (shown during transition) -->
    <div id="loading-overlay">
        <span id="loading-text">Stepping through the portal...</span>
    </div>
</body>
```

```css
body {
    margin: 0;
    background: black;
    overflow: hidden;
}

#world-video {
    width: 100vw;
    height: 100vh;
    object-fit: cover;
}

#world-label {
    position: fixed;
    bottom: 24px;
    left: 24px;
    font-family: 'Patrick Hand', cursive; /* handwritten feel */
    font-size: 18px;
    color: white;
    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
    z-index: 10;
}

#controls-hint {
    position: fixed;
    bottom: 24px;
    right: 24px;
    font-family: monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.6);
    z-index: 10;
}

#loading-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.5);
    color: white;
    font-family: 'Patrick Hand', cursive;
    font-size: 24px;
    z-index: 50;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
}

#loading-overlay.visible {
    opacity: 1;
    pointer-events: all;
}
```

---

## Environment Setup

```bash
# .env.example
REACTOR_API_KEY=your_key_here
PORT=3001
```

```json
// backend/package.json
{
  "name": "drawing-museum-backend",
  "scripts": {
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "@reactor-team/js-sdk": "latest"
  }
}
```

```json
// frontend/package.json
{
  "name": "drawing-museum-frontend",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@reactor-team/js-sdk": "latest"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

---

## Seed Images — Placeholder Strategy

The actual drawings from the nephew are not yet available. For development:

1. Generate placeholder seed images using any image generation tool:
   - Museum: a photo or render of a museum interior
   - Drawing 1: a simple crayon-style house drawing (can generate or hand-draw and photograph)
   - Drawing 2: a simple crayon dragon
   - Drawing 3: a simple crayon space scene

2. Place them in `frontend/drawings/` as `museum.jpg`, `drawing-1.jpg`, `drawing-2.jpg`, `drawing-3.jpg`

3. The prompts are designed to work with minimal seed images — they carry most of the stylistic weight.

---

## Known Challenges to Handle

**Chunk boundary delay**: LingBot applies movement/prompt commands at chunk boundaries, not instantly. This means key taps can feel slightly delayed. Acceptable for Phase 1. If it feels bad, investigate the hold-prompt pattern in the LingBot docs.

**Portal step count tuning**: The `PORTAL_PROMPT_THRESHOLD` (20) and `PORTAL_CROSS_THRESHOLD` (35) values are estimates. Tune these during testing — they depend on how fast the world appears to move per step. The goal is: user walks for a meaningful amount of time, sees the portal appear ahead of them, walks toward it, crosses.

**Style drift**: LingBot may gradually drift away from the crayon aesthetic as generation continues. If this happens, periodically re-send the base prompt to reinforce the style. Wire this to the `chunk_complete` event — every N chunks, re-send the base prompt.

```javascript
reactor.on("message", (msg) => {
    if (msg.type === "chunk_complete") {
        if (msg.data.chunk_index % 10 === 0 && !AppState.isTransitioning) {
            // Re-anchor the style every 10 chunks
            reactor.sendCommand("set_prompt", { 
                prompt: getCurrentWorld().prompt 
            });
        }
    }
});
```

---

## Phase 2 Preview (Don't Build Yet)

After Phase 1 is working, the next additions will be:

- **Polaroid mechanic**: capture a frame on portal exit, collect one per drawing world
- **End screen**: display all Polaroids + original drawings as a strip
- **Download / Share**: export the Polaroid strip as an image, share to X
- **Music**: ambient audio per world (museum = classical, drawing worlds = playful)
- **Mobile support**: touch controls replacing WASD

---

## Success Criteria for Phase 1

Phase 1 is done when:

- [ ] LingBot session initializes and video stream displays fullscreen
- [ ] WASD moves through the museum world
- [ ] Arrow keys look around
- [ ] Walking forward long enough triggers the portal prompt (glow appears in world)
- [ ] Crossing the portal threshold triggers flash → transition → new drawing world
- [ ] The drawing world visually looks like it's generated from the drawing (crayon aesthetic preserved)
- [ ] Walking forward in the drawing world eventually transitions back (or to next drawing)
- [ ] The cycle completes: Museum → Drawing 1 → Drawing 2 → Drawing 3 → Museum
- [ ] No crashes or stuck states during transitions
- [ ] Research findings documented in RESEARCH.md

---

## References

- Reactor JS SDK docs: https://docs.reactor.inc/overview
- LingBot overview: https://docs.reactor.inc/model-api-reference/lingbot/overview
- LingBot prompt guide: https://docs.reactor.inc/model-api-reference/lingbot/prompt-guide
- Helios overview: https://docs.reactor.inc/model-api-reference/helios/overview
- Full docs index: https://docs.reactor.inc/llms.txt
- Navigable LingBot world tutorial: https://docs.reactor.inc/examples/navigable-lingbot-world
- Reactor API reference: https://docs.reactor.inc/api-reference/overview
- CityWalk (prior work, same developer): https://github.com/guanyu-gerry-tao/2026-world-model-hackathon
- Yume (reference project, similar concept on World Labs): https://devpost.com/software/yume-d0w8fe

---

*Handoff prepared: May 21, 2026*
*Contest deadline: May 22, 2026 9AM PST*
*Phase 1 target: working portal loop with LingBot navigation*
