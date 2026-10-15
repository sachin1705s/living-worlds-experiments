/**
 * THE OFF SEASON — case data.
 *
 * Every room is one FastH3 clip; every hotspot is one FastH3 clip. Clips have no
 * memory of each other, so each prompt re-establishes the whole scene from
 * scratch and ends on its own soundscape clause. `intent` is the short,
 * checkable sentence the Gemini harness scores sampled frames against.
 */

export type EvidenceId = string;

export interface Evidence {
  id: EvidenceId;
  title: string;
  /** Case-file prose. Written as the adjuster's own note. */
  note: string;
  kind: "physical" | "document" | "absence";
}

export interface Hotspot {
  id: string;
  /** Letterspaced caps label that sits above the pill. */
  label: string;
  /** The sentence in the pill. */
  action: string;
  /** Percent position over the video frame. */
  x: number;
  y: number;
  /** Where the pill's tail points, for the leader dot. */
  prompt: string;
  intent: string;
  /** A move hotspot walks you somewhere; a look hotspot yields evidence. */
  to?: string;
  evidence?: Evidence;
  /** Evidence ids that must be in the file before this hotspot appears. */
  requires?: EvidenceId[];
}

export interface Room {
  id: string;
  name: string;
  /** Small line under the room name — time, tide, weather. */
  stamp: string;
  prompt: string;
  intent: string;
  hotspots: Hotspot[];
}

export const CASE = {
  title: "The Off Season",
  slug: "MB-4417",
  brief:
    "Marrow Bay pier arcade, the morning after the storm of the fourteenth. The night watchman, Aldous Finn, has not been seen since. The owner filed a four-hundred-thousand claim two days before the weather turned. You are the loss adjuster. Walk the pier and write down what is actually there.",
} as const;

export const ROOMS: Room[] = [
  {
    id: "boardwalk",
    name: "The Boardwalk",
    stamp: "06:40 — tide going out",
    prompt:
      "A shuttered seaside amusement pier at dawn after a storm, flat grey-green light, wet boards strewn with kelp and broken slats. A padlocked chain-link gate stands under a dead neon arch, salt-bleached and unlit. Slow push-in, eye-level, medium wide, shallow depth of field. Gulls, wind singing in the cables, the flat boom of surf under the deck, a loose sign banging.",
    intent:
      "a wet, storm-wrecked seaside pier at grey dawn with a chain-link gate under a dead neon arch, camera pushing slowly in",
    hotspots: [
      {
        id: "chain",
        label: "Gate chain",
        action: "Look at the chain.",
        x: 44,
        y: 58,
        prompt:
          "Extreme close-up of a heavy rusted chain and padlock hanging on a wet chain-link gate at a storm-wrecked seaside pier, flat grey dawn light, salt corrosion crusting the links, one link cut clean through with bright bare metal at the cut. Static macro shot, shallow depth of field, the sea out of focus behind. Wind, distant surf, the chain ticking against the wire.",
        intent:
          "a macro shot of a rusted chain and padlock on a wet gate, one link cut open with bright unweathered metal at the cut",
        evidence: {
          id: "chain",
          title: "The cut link",
          kind: "physical",
          note: "Cut, not forced. The metal at the cut is bright and unweathered — hours old, not days. Both cut ends hang on the inside of the gate. Whoever closed the croppers was standing on the pier when they did it.",
        },
      },
      {
        id: "stormkit",
        label: "Storm kit",
        action: "Check the storm kit.",
        x: 74,
        y: 71,
        prompt:
          "A stack of sandbags and a coil of rope under a lashed blue tarp beside a boarded kiosk on a storm-wrecked seaside pier at grey dawn. A hand lifts one corner of the tarp: the sand beneath is pale and dry. Static medium close shot, eye-level, shallow depth of field. Wind snapping the tarp, gulls, surf under the boards.",
        intent:
          "sandbags under a tarp on a wet pier at dawn, a hand lifting the tarp corner to show dry sand underneath",
        evidence: {
          id: "stormkit",
          title: "Dry sand",
          kind: "absence",
          note: "Six sandbags, still tarped, still dry. The watchman's storm procedure is pinned in the booth and it begins with the sandbags. On the worst night in nine years, Finn never opened the kit.",
        },
      },
      {
        id: "to-booth",
        label: "Ticket booth",
        action: "Try the ticket booth.",
        x: 17,
        y: 47,
        to: "booth",
        prompt: "",
        intent: "",
      },
    ],
  },
  {
    id: "booth",
    name: "The Ticket Booth",
    stamp: "06:51 — the glass is fogged from inside",
    prompt:
      "Inside a cramped seaside arcade ticket booth at dawn, grey light through salt-fogged glass, a scarred wooden counter, a hook of keys on the wall, a hardbacked ledger lying open, a dead bar heater, paint peeling in curls. Slow pan across the counter, close, shallow depth of field. Wind pressing on the glass, a fluorescent tube ticking, gulls and surf outside.",
    intent:
      "the cramped interior of a seaside ticket booth at dawn: fogged glass, a wooden counter, keys on a hook, an open ledger, camera panning slowly",
    hotspots: [
      {
        id: "ledger",
        label: "The ledger",
        action: "Read the logbook.",
        x: 52,
        y: 64,
        prompt:
          "Close-up of an open handwritten logbook on a scarred wooden counter in a seaside ticket booth at dawn, grey light, pages buckled with damp, a ballpoint lying in the gutter, ruled columns of small careful handwriting. A hand turns a single page and stops. Static overhead close shot, shallow depth of field. Paper rustle, wind against glass, distant surf.",
        intent:
          "an overhead close-up of an open handwritten ruled logbook on a wooden counter, a hand turning one page",
        evidence: {
          id: "ledger",
          title: "The last entry",
          kind: "document",
          note: "Finn's hand, on the hour, nine years of it without a gap. 23:40 — genny off, all clear, MV car still in lot. Then nothing. The 00:40 line is ruled and empty. MV is Merrick Vale. The owner's car was still in the lot at midnight.",
        },
      },
      {
        id: "keys",
        label: "Key hook",
        action: "Take stock of the keys.",
        x: 78,
        y: 36,
        prompt:
          "Close-up of two rings of keys hanging on a brass hook on the peeling wall of a seaside ticket booth at dawn, grey light. One ring is worn to a shine and heavy with labelled tags; the other is small, bright and barely used, with a brass fob. Static close shot, shallow depth of field, slight handheld drift. Wind against glass, keys ticking together, distant surf.",
        intent:
          "a close-up of two key rings on a hook — one worn and heavy, one small and bright with a brass fob",
        evidence: {
          id: "keys",
          title: "Two sets",
          kind: "physical",
          note: "Two rings on a hook built for one. Finn's, worn smooth and tagged in his hand. And a second set, barely used, with a brass fob stamped M.V. The owner's keys do not live in the booth. They live on the owner.",
        },
      },
      {
        id: "to-floor",
        label: "Arcade doors",
        action: "Push through to the floor.",
        x: 24,
        y: 52,
        to: "floor",
        prompt: "",
        intent: "",
      },
      {
        id: "back-boardwalk",
        label: "Boardwalk",
        action: "Step back outside.",
        x: 8,
        y: 84,
        to: "boardwalk",
        prompt: "",
        intent: "",
      },
    ],
  },
  {
    id: "floor",
    name: "The Arcade Floor",
    stamp: "07:04 — something is still drawing power",
    prompt:
      "A dead seaside amusement arcade at dawn, long rows of unlit cabinets under a low ceiling, dust sheets half pulled off, a dark wet patch spreading across patterned carpet, grey light from a doorway at the far end. One single cabinet glows, lit and running its attract loop. Slow dolly down the aisle toward the lit machine, eye-level, wide. Water dripping inside, the machine's tinny loop, wind, surf under the floor.",
    intent:
      "a dark arcade floor of unlit cabinets at dawn with exactly one machine lit and glowing, camera dollying down the aisle toward it",
    hotspots: [
      {
        id: "cabinet",
        label: "Lit cabinet",
        action: "Approach the one live machine.",
        x: 57,
        y: 44,
        prompt:
          "Close-up of a single glowing arcade cabinet running its attract loop in a pitch-dark seaside arcade, its light spilling on dusty glass and patterned carpet, every other cabinet dead around it. Slow push-in to the screen, eye-level, shallow depth of field. A tinny looping jingle, an electrical hum, water dripping somewhere behind, surf under the floor.",
        intent:
          "a single glowing arcade cabinet running an attract loop in an otherwise pitch-dark arcade, camera pushing in",
        evidence: {
          id: "cabinet",
          title: "Power on",
          kind: "physical",
          note: "One cabinet lit in a building whose generator the log says died at 23:40. This row runs off the mains spur to the back office. Somebody wanted the back office live and did not care that a claw machine came with it.",
        },
      },
      {
        id: "tokens",
        label: "Spilled tokens",
        action: "Read the spill.",
        x: 33,
        y: 76,
        prompt:
          "Close-up of hundreds of brass arcade tokens fanned across dark patterned carpet in a dim seaside arcade, an emptied hopper on its side, the spread wide and thrown rather than heaped. Two tokens are pressed flat into the carpet pile by a heavy boot print. Static low angle, shallow depth of field. A faint machine hum, dripping water, muffled surf.",
        intent:
          "brass arcade tokens spread wide across dark carpet from a tipped hopper, with a boot print pressed into the pile",
        evidence: {
          id: "tokens",
          title: "The spill",
          kind: "physical",
          note: "A hopper emptied in a fan, not a heap — thrown, or struck at speed. Two tokens are trodden flat into the carpet by a boot heel several sizes larger than the pair I will find in the maze.",
        },
      },
      {
        id: "trail",
        label: "The carpet",
        action: "Follow the wet trail.",
        x: 71,
        y: 82,
        prompt:
          "Low tracking shot along a dark stripe pressed into dusty patterned arcade carpet, the nap combed flat in one direction by something heavy and soaked being dragged, running away from the camera toward a mirrored doorway at the end of the aisle. Slow low forward tracking, wide, shallow depth of field. Dripping water, a distant machine hum, surf beneath the floor.",
        intent:
          "a low tracking shot following a dark dragged stripe in arcade carpet toward a mirrored doorway",
        evidence: {
          id: "trail",
          title: "The trail",
          kind: "physical",
          note: "A stripe in the carpet nap runs from the spill to the mirror maze entrance. Something heavy and soaked was dragged, not carried. It stops dead at the maze door.",
        },
      },
      {
        id: "to-maze",
        label: "Maze entrance",
        action: "Enter the mirror maze.",
        x: 86,
        y: 47,
        to: "maze",
        prompt: "",
        intent: "",
      },
      {
        id: "to-office",
        label: "Office door",
        action: "Try the office door.",
        x: 13,
        y: 43,
        to: "office",
        requires: ["cabinet"],
        prompt: "",
        intent: "",
      },
      {
        id: "back-booth",
        label: "Ticket booth",
        action: "Back to the booth.",
        x: 8,
        y: 88,
        to: "booth",
        prompt: "",
        intent: "",
      },
    ],
  },
  {
    id: "maze",
    name: "The Mirror Maze",
    stamp: "07:19 — the boards are hollow here",
    prompt:
      "Inside a derelict seaside mirror maze at dawn, a dim corridor of mirrored panels in painted frames, dust and salt filming the glass, reflections receding into darkness, one panel cracked in a long diagonal. Slow handheld walk forward, medium, shallow depth of field. Footsteps on hollow boards, glass ticking in its frames, muffled surf beneath the floor, a low electrical hum.",
    intent:
      "a dim corridor of dusty mirrored panels receding into darkness, one cracked diagonally, camera walking slowly forward handheld",
    hotspots: [
      {
        id: "boots",
        label: "A pair of boots",
        action: "Look at the boots.",
        x: 40,
        y: 80,
        prompt:
          "Close-up of a pair of black rubber boots standing side by side on hollow boards against the base of a dusty mirrored wall in a dim derelict mirror maze, squared neatly heel to heel, dry inside, reflected twice in the glass behind. Static low close shot, shallow depth of field. Hollow boards, glass ticking, muffled surf below.",
        intent:
          "a pair of rubber boots set neatly side by side against a mirrored wall, reflected in the glass",
        evidence: {
          id: "boots",
          title: "Finn's boots",
          kind: "physical",
          note: "Rubber boots, size nine, set side by side and squared to the wall the way a careful man leaves them at his own front door. Bone dry inside. A man who walked out of these was not running from anything.",
        },
      },
      {
        id: "panel",
        label: "Cracked panel",
        action: "Test the cracked panel.",
        x: 66,
        y: 46,
        prompt:
          "A tall mirrored panel cracked in a long diagonal swings inward on a hidden hinge in a dim derelict mirror maze, opening onto the head of a dark timber service stair going down, cold air and grey light rising through it. Slow push-in through the opening panel, medium, shallow depth of field. A hinge groaning, glass ticking, surf and dripping water rising from below.",
        intent:
          "a cracked mirrored panel swinging inward like a door to reveal a dark stair going down",
        evidence: {
          id: "panel",
          title: "The service door",
          kind: "physical",
          note: "The cracked panel swings. Behind it a timber service stair drops to the underdeck — on none of the plans filed with the policy. Fresh scrape marks on the treads, going down.",
        },
      },
      {
        id: "cigarette",
        label: "On the floor",
        action: "Pick up the cigarette.",
        x: 20,
        y: 88,
        prompt:
          "Extreme close-up of a single cigarette smoked down to its filter and ground out on dusty hollow boards in a dim derelict mirror maze, ash scattered in a smear, mirrored panels blurred behind. A gloved hand enters and lifts it. Static macro shot, shallow depth of field. Hollow boards creaking, glass ticking, muffled surf below.",
        intent:
          "a macro shot of a cigarette butt crushed out on dusty floorboards, a gloved hand picking it up",
        evidence: {
          id: "cigarette",
          title: "Filter-tip",
          kind: "physical",
          note: "One cigarette, smoked to the filter, ground out on the boards inside a building Finn kept swept. The medical attached to the policy gives him lungs like a choirboy. Vale gets through forty a day, and this is his brand.",
        },
      },
      {
        id: "to-under",
        label: "Service stair",
        action: "Take the stair down.",
        x: 88,
        y: 60,
        to: "under",
        requires: ["panel"],
        prompt: "",
        intent: "",
      },
      {
        id: "back-floor",
        label: "Arcade floor",
        action: "Back to the floor.",
        x: 8,
        y: 88,
        to: "floor",
        prompt: "",
        intent: "",
      },
    ],
  },
  {
    id: "office",
    name: "The Back Office",
    stamp: "07:33 — the only warm room on the pier",
    prompt:
      "A cramped seaside arcade back office at dawn, a steel desk under a bare bulb, a filing cabinet standing open, a wall of faded framed pier photographs, a green floor safe with its door ajar, a waxed coat slung over the chair back dripping onto grey lino. Slow push-in from the doorway, medium, shallow depth of field. A fluorescent hum, water dripping on lino, wind working at the roof, faint surf.",
    intent:
      "a cramped office at dawn with a steel desk, an open filing cabinet, a green safe standing ajar and a wet coat on the chair, camera pushing in from the doorway",
    hotspots: [
      {
        id: "claim",
        label: "On the desk",
        action: "Read the paperwork.",
        x: 47,
        y: 62,
        prompt:
          "Close-up of carbon-copy insurance paperwork spread on a steel desk under a bare bulb in a cramped office, typed columns and a fountain-pen signature across the foot of the page, a coffee ring on one corner. A hand slides the top sheet aside. Static overhead close shot, shallow depth of field. A fluorescent hum, paper sliding on steel, dripping water, faint surf.",
        intent:
          "an overhead close-up of typed carbon-copy paperwork with a handwritten signature on a steel desk, a hand moving the top sheet",
        evidence: {
          id: "claim",
          title: "The claim",
          kind: "document",
          note: "A carbon of the claim, signed by Merrick Vale on the twelfth — two clear days before the storm. Fire and storm cover, raised in August from eighty thousand to four hundred. The arcade turned over eleven thousand across the whole of last season.",
        },
      },
      {
        id: "safe",
        label: "The safe",
        action: "Look inside the safe.",
        x: 76,
        y: 80,
        prompt:
          "Close-up of a green steel floor safe standing open in a cramped office under a bare bulb, the interior empty, a clean rectangle in the dust on the shelf where a cash box sat, the paint around the dial unmarked. Slow push-in to the open door, low angle, shallow depth of field. A fluorescent hum, the door swinging on its hinge, dripping water, faint surf.",
        intent:
          "an open empty green floor safe with a clean rectangle in the dust on its shelf, camera pushing in",
        evidence: {
          id: "safe",
          title: "An empty float",
          kind: "absence",
          note: "The float safe is open and empty, with a clean rectangle in the dust where the cash box stood. No scars on the door, no marks around the dial. Whoever emptied it had the combination and all the time in the world.",
        },
      },
      {
        id: "coat",
        label: "The coat",
        action: "Touch the coat.",
        x: 22,
        y: 55,
        prompt:
          "Close-up of a heavy waxed coat slung over the back of an office chair under a bare bulb, water beading along its hem and falling in slow drips onto grey lino, a dark spreading patch on the floor beneath. Static close shot, shallow depth of field. A fluorescent hum, steady drips on lino, wind at the roof, faint surf.",
        intent:
          "a close-up of a wet waxed coat on a chair back, water dripping from the hem into a puddle on lino",
        evidence: {
          id: "coat",
          title: "Still dripping",
          kind: "physical",
          note: "A waxed coat over the chair, still shedding water onto the lino four hours after high water in an unheated room. That coat was worn tonight — long after Finn ruled his last line, and long after anybody had business on this pier.",
        },
      },
      {
        id: "back-floor-2",
        label: "Arcade floor",
        action: "Back to the floor.",
        x: 8,
        y: 88,
        to: "floor",
        prompt: "",
        intent: "",
      },
    ],
  },
  {
    id: "under",
    name: "Under the Pier",
    stamp: "07:58 — dead low water",
    prompt:
      "The underside of a storm-battered seaside pier at dead low tide, a forest of barnacled pilings, wet ribbed sand and standing pools, grey dawn light striping down through the gaps in the boards overhead. A small wooden dinghy lies tied to a piling. Slow low tracking shot between the pilings, wide, shallow depth of field. Surf, water dripping from the deck above, rope creaking, gulls echoing under the boards.",
    intent:
      "under a pier at low tide: barnacled pilings, wet sand, light striping down through the boards, a small dinghy tied up, camera tracking low",
    hotspots: [
      {
        id: "cans",
        label: "Stacked cans",
        action: "Count the cans.",
        x: 30,
        y: 58,
        prompt:
          "Close-up of nine red twenty-litre jerry cans stacked dry above the tide line and lashed to a barnacled piling under a seaside pier at low tide, a coil of blue rope and a bundle of oily rag beside them, grey light striping down through the boards above. Slow push-in, low angle, shallow depth of field. Surf, dripping water, rope creaking, gulls echoing under the deck.",
        intent:
          "a stack of red jerry cans lashed to a piling under a pier with rope and rags beside them",
        evidence: {
          id: "cans",
          title: "Nine cans",
          kind: "physical",
          note: "Nine twenty-litre cans, stacked dry above the tide line and lashed off, with blue rope and a bundle of rag. This pier is timber, creosote and ninety years old. It would have gone up like a match, and the storm would have carried the blame.",
        },
      },
      {
        id: "watch",
        label: "On the piling",
        action: "Take the watch.",
        x: 63,
        y: 40,
        prompt:
          "Extreme close-up of a steel wristwatch hung by its intact strap on a nail at chest height in a barnacled timber piling under a seaside pier at low tide, salt water beaded on the glass, the hands stopped, grey light behind. Static macro shot, shallow depth of field. Surf, dripping water, gulls echoing under the deck.",
        intent:
          "a macro shot of a steel wristwatch hanging by its unbroken strap from a nail in a barnacled piling",
        evidence: {
          id: "watch",
          title: "Finn's watch",
          kind: "physical",
          note: "A steel watch looped over a nail at chest height, where anyone coming down that stair would meet it at eye level. Stopped at 00:52. The strap is not broken, not cut, not stretched. He took it off and hung it up.",
        },
      },
      {
        id: "dinghy",
        label: "The dinghy",
        action: "Search the dinghy.",
        x: 82,
        y: 74,
        prompt:
          "Close-up of a small wooden dinghy grounded on wet sand under a seaside pier at low tide, tied to a piling with a neat bowline, an outboard tilted clear, two sets of wet footprints in the bilge water, one much larger than the other. Slow push-in over the gunwale, high angle, shallow depth of field. Surf, water slapping the hull, rope creaking, gulls under the deck.",
        intent:
          "a small wooden dinghy on wet sand tied to a piling, camera looking down over the gunwale into the wet bilge",
        evidence: {
          id: "dinghy",
          title: "The tender",
          kind: "physical",
          note: "Tied off with a bowline a watchman would tie, half a tank left, and two sets of wet prints in the bilge — one size nine, one a good deal bigger. It went out with two aboard and it came back with two. And it is still here.",
        },
      },
      {
        id: "back-maze",
        label: "Service stair",
        action: "Climb back up.",
        x: 8,
        y: 88,
        to: "maze",
        prompt: "",
        intent: "",
      },
    ],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export const ALL_EVIDENCE: Evidence[] = ROOMS.flatMap((r) =>
  r.hotspots.map((h) => h.evidence).filter((e): e is Evidence => Boolean(e)),
);

export const START_ROOM = "boardwalk";

/** The report you can file depends only on what you actually wrote down. */
export interface Verdict {
  grade: string;
  heading: string;
  body: string[];
}

export function verdictFor(found: EvidenceId[]): Verdict {
  const has = (id: string) => found.includes(id);
  const n = found.length;

  const closing = [
    "Nobody died on this pier.",
    "Merrick Vale meant to burn it. The cans are lashed dry under his own deck, the claim was signed two days ahead of the weather, the cover was quadrupled in August on a business that turned eleven thousand, and his keys are on the booth hook because he was still here at midnight with his coat on.",
    "Aldous Finn found the cans. He did not telephone anybody. He emptied the float he had counted every night for nine years, cut the chain from the inside, set his boots against the wall, hung his watch where the next man down the stair could not miss it, and went out in the tender with Vale — and came back with him, and let him go home.",
    "The prints in the bilge say two out and two back. The dry sand says the storm was never the point. Finn left Vale standing in the middle of his own arson, with a missing watchman on top of it, and walked off the pier a free man with the takings in his coat.",
    "Recommendation: repudiate the claim in full. Refer Vale to the police for attempted arson and fraud. As to Finn — he is not missing. He is gone, which is a different word, and no business of this office.",
  ];

  if (n >= 13 && has("cans") && has("claim") && has("watch") && has("dinghy")) {
    return { grade: "A", heading: "Report filed — complete", body: closing };
  }
  if (n >= 9) {
    return {
      grade: "B",
      heading: "Report filed — strong, circumstantial",
      body: [
        "The pier will not burn now and the claim will not be paid, and that is most of the job.",
        has("cans")
          ? "The cans under the deck are enough on their own to hold the payout for a year while the police take their turn at Vale."
          : "Without whatever is under that deck the fire theory stays a theory, and a theory is not a repudiation.",
        has("boots") || has("watch")
          ? "What is left over is Finn, and the way his things were set down. Boots squared to a wall. A watch hung, not dropped. Those are not the leavings of a man who was taken. But I cannot prove where he went, because I did not walk the whole pier."
          : "What is left over is Finn, and I have nothing on him but an empty line in a ledger.",
        "Recommendation: decline the claim pending investigation. Reserve the file. There is more down there than I wrote up.",
      ],
    };
  }
  if (n >= 5) {
    return {
      grade: "C",
      heading: "Report filed — suspicious, unproven",
      body: [
        "Enough is wrong here to stop the cheque and not enough to say why.",
        "A chain cut from the inside. Sand that nobody laid on the worst night in nine years. A man's hand in a ledger stopping mid-shift.",
        "None of it names anybody. I walked out of the arcade with the half of the pier I could see and left the half I could not.",
        "Recommendation: hold the claim. Send somebody back, and send them under the deck.",
      ],
    };
  }
  return {
    grade: "D",
    heading: "Report filed — inconclusive",
    body: [
      "I stood on a wet pier for an hour and wrote down almost nothing.",
      "The gate was open. The watchman was not there. Beyond that this file says what the claim form says, which is whatever Merrick Vale wanted it to say.",
      "Recommendation: none available. Go back. Open things.",
    ],
  };
}
