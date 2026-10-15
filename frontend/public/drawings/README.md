# Seed images

Drop four images here before running `npm run dev`:

- `museum.jpg` &mdash; a museum gallery interior. Anchors the museum world.
- `drawing-1.jpg` &mdash; a child's crayon drawing of a house. Anchors `Tommy's House`.
- `drawing-2.jpg` &mdash; a child's crayon drawing of a dragon. Anchors `The Dragon`.
- `drawing-3.jpg` &mdash; a child's crayon drawing of outer space. Anchors `Space Adventure`.

LingBot accepts PNG or JPEG. The seed image fixes visual identity for the generated world; the text prompts in `src/worlds.js` steer everything else.

`.jpg` extension is what the code looks for, but the SDK uploads the actual bytes so the format is what matters. If you want to use PNGs, rename or update the `seedImage` paths in `src/worlds.js`.
