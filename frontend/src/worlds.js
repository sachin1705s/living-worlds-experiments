// World definitions for The Drawing Museum.
//
// Each prompt follows LingBot's traversal recipe from the docs:
//   - starts with "The video presents…"
//   - 2-4 sentences, ≤ 1000 chars
//   - 7 traversal anchors: POV, body, near plane, mid plane, far plane,
//     atmosphere, sensation
//   - one mood phrase (not three)
//   - no camera verbs ("pan", "zoom", "fly through", etc.)
//
// Portal prompts describe the *same* world with a glowing portal directly
// ahead, anchored to the base scene so geometry is preserved.
//
// Hold-prompts mirror the base sentence count and anchor density; they are
// full re-prompts, not deltas.

export const WORLDS = {
  MUSEUM: {
    id: "MUSEUM",
    name: "The Museum",
    seedImage: "/drawings/museum.jpg",
    prompt:
      "The video presents a first-person walk through a hushed marble museum gallery at night. Polished travertine floor mirrors your footfalls and cool stone exhales a faint chill against bare hands at your sides. Ahead, a long row of gilded gold frames hangs at eye level on cream walls, each holding a child's bright crayon drawing, their wax colors catching warm overhead spotlights. Vaulted plaster ceilings recede into soft amber shadow above. Reverent late-night quiet.",
    portalPrompt:
      "The video presents a first-person walk through a hushed marble museum gallery at night, polished travertine floor reflecting warm spotlights. Directly ahead and filling more of the frame, one gilded gold frame radiates a soft golden glow that spills onto the surrounding cream wall, its child's crayon drawing shimmering as if alive, paint surface rippling with warm light. The other paintings recede into peripheral amber shadow, cool stone exhaling a faint chill against bare hands at your sides. Vaulted plaster ceilings above. Hushed expectant warmth.",
    holds: {},
  },

  DRAWING_1: {
    id: "DRAWING_1",
    name: "Tommy's House",
    seedImage: "/drawings/drawing-1.jpg",
    prompt:
      "The video presents a first-person walk across thick wax-crayon grass toward a child's drawing of a yellow house with a red triangle roof and a single black-framed window. Underfoot the green scribbled grass feels waxy and bumpy, paper texture rasping faintly at the soles. The wobbly yellow crayon sun in the upper corner pulses with crude rays, white puff clouds drifting against flat crayon-blue sky, and the brown crayon door of the house grows clearer as you approach. Bright childlike joy.",
    portalPrompt:
      "The video presents a first-person walk across thick wax-crayon grass toward a child's drawing of a yellow house with a red triangle roof. Underfoot the green scribbled grass feels waxy and bumpy, paper texture rasping faintly at the soles. The brown crayon door of the house glows with thick gold and orange crayon strokes, a wobbly ring of yellow rays scrawled around its edge, its outline pulsing in childish light directly ahead. Yellow sun in the upper corner against crayon-blue sky, white puff clouds drifting. Bright childlike wonder.",
    holds: {
      1: {
        label: "Sunset",
        prompt:
          "The video presents a first-person walk across thick wax-crayon grass toward a child's drawing of a yellow house with a red triangle roof. The wobbly sun in the corner has swelled into a huge orange crayon disc, the sky around it streaked in heavy pink, orange, and purple crayon bands. Long crayon shadows scrawl across the green scribbled grass underfoot, waxy and bumpy. The yellow house glows warm against the deepening sky, its brown door ahead. Hushed childlike evening.",
      },
      2: {
        label: "Rain",
        prompt:
          "The video presents a first-person walk across thick wax-crayon grass toward a child's drawing of a yellow house with a red triangle roof. Heavy diagonal blue crayon lines slash across the entire scene as crayon rain, pooling into wobbly blue puddles on the green grass that rasp underfoot. The yellow sun has been overdrawn in heavy grey scribbles, white puff clouds turned dark and heavy. The yellow house glows softly through the storm. Cozy childlike rainfall.",
      },
    },
  },

  DRAWING_2: {
    id: "DRAWING_2",
    name: "The Dragon",
    seedImage: "/drawings/drawing-2.jpg",
    prompt:
      "The video presents a first-person flight on the back of a child's drawing of a green crayon dragon, scribbled scales bumpy and waxy beneath your hands as you grip thick black-outlined spikes along its neck. Wind buffets your face and crayon-drawn feather lines flicker past your cheeks. Below, jagged purple-and-grey crayon mountains rise in flat childlike perspective, the dragon's huge green wings beating in scrawled half-circles to either side, and ahead a flat orange crayon sun grows steadily larger against crayon-blue sky. Bold childlike adventure.",
    portalPrompt:
      "The video presents a first-person flight on the back of a green crayon dragon, scribbled scales bumpy beneath your gripping hands. Directly ahead, suspended in the crayon-blue sky and filling more of the frame, hangs a wobbly ring of swirling blue and purple crayon strokes, a child's drawn portal, its center glowing with shimmering golden scribble light. Jagged purple mountains below in flat childlike perspective, the dragon's wings beating in scrawled half-circles to either side, wind buffeting your face. Bold magical childlike adventure.",
    holds: {
      1: {
        label: "Fire",
        prompt:
          "The video presents a first-person flight on the back of a green crayon dragon, scribbled scales bumpy beneath your hands gripping thick black-outlined spikes. The dragon's head swings forward and a thick ribbon of red, orange, and yellow crayon fire erupts from its mouth, scrawled flames curling upward in childish loops, hot wax-warm air buffeting your face. Jagged purple mountains below and crayon-blue sky ahead, fire reflecting in scrawled orange streaks across green wing membranes. Bold fiery childlike triumph.",
      },
      2: {
        label: "Dive",
        prompt:
          "The video presents a first-person flight on the back of a green crayon dragon, scribbled scales bumpy beneath your hands gripping thick black-outlined spikes. The dragon tips its head and shoulders downward, wings sweeping back in heavy crayon curves, wind whipping crayon-line feathers hard past your cheeks. Jagged purple mountains rush up toward you, the crayon-blue sky tilting overhead, the dragon's huge green back angled steeply beneath you. Rushing childlike thrill.",
      },
    },
  },

  DRAWING_3: {
    id: "DRAWING_3",
    name: "Space Adventure",
    seedImage: "/drawings/drawing-3.jpg",
    prompt:
      "The video presents a first-person drift through a child's crayon drawing of outer space, hands floating weightlessly in front of you in a chunky white spacesuit drawn in heavy white crayon. Ahead, a smiling crayon sun and crescent moon share the same patch of inky black sky, scribbled yellow stars scattered around them. Below your feet a red crayon rocket trails wobbly yellow flame lines, drifting gently sideways, while pink and orange planet circles drift in the distance. Cold weightless childlike wonder.",
    portalPrompt:
      "The video presents a first-person drift through a child's crayon drawing of outer space in a chunky white crayon spacesuit, hands floating in front of you. Directly ahead, a wobbly ring of bright yellow crayon strokes hangs against the inky black sky, scrawled stars orbiting its rim in childish circles, its center glowing with warm golden scribble light. Smiling crayon sun and crescent moon share the sky to one side, red rocket drifting below trailing wobbly yellow flame lines. Hushed magical childlike wonder.",
    holds: {
      1: {
        label: "Meteors",
        prompt:
          "The video presents a first-person drift through a child's crayon drawing of outer space, hands floating in a chunky white crayon spacesuit. Streaks of bright orange and red crayon meteors slash diagonally across the inky black sky in scribbled lines, scrawled fire-tails trailing behind each, the smiling crayon sun watching from one corner. Yellow stars scattered around, red rocket drifting below trailing wobbly flame lines. Vivid childlike awe.",
      },
      2: {
        label: "Spin",
        prompt:
          "The video presents a first-person drift through a child's crayon drawing of outer space in a chunky white spacesuit, the inky black sky and scribbled yellow stars wheeling slowly in a circle around you. Smiling crayon sun and crescent moon tumble lazily across the frame, red crayon rocket and pink-and-orange planet circles drifting past on every side. Hushed weightless childlike delight.",
      },
    },
  },
};

export const WORLD_ORDER = ["MUSEUM", "DRAWING_1", "DRAWING_2", "DRAWING_3"];

export function nextWorldId(currentId) {
  const i = WORLD_ORDER.indexOf(currentId);
  return WORLD_ORDER[(i + 1) % WORLD_ORDER.length];
}
