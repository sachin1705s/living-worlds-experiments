# Kahani app

Kahani is the Directing-mode HappyOyster client for the Panchatantra story
experience. The client is scaffolded with the official `create-reactor-app`
template and served by the small Express/Vite server in `server.js`.

## Run locally

```sh
npm install
cp .env.example .env
# add the server-side credentials to .env
npm run dev
```

Open <http://localhost:5175>. The server-side `REACTOR_API_KEY` is exchanged
for a cached, Directing-scoped session JWT at `POST /api/token`; it is never
included in the browser bundle. The server-side `POST /api/director` call keeps
the Gemini key off the client, returns strict director JSON, and logs each
classification. Spoken lines use Gemini speech. Run the real 20-row director gate with `npm run test:director`
after placing a valid `GEMINI_API_KEY` in `.env`.

The reusable directing world setup is `npm run world:create`. It creates the
world straight from the authored prompt in `../docs/data/story.md` (no
`firstFrameImage`/style-anchor image is sent to `createWorld()`), saves the
opaque capability to `.world-id`, and attaches that same id on later runs —
it never silently creates a new world when `.world-id` already exists. The
command launches a temporary Vite page in headless Chrome for the real
one-travel/instruction smoke check, including video/audio and
executed-instruction checks. Use `npm run world:recreate`
(`create-or-attach-world.js --recreate`) to explicitly build a fresh world
from a revised prompt; it only overwrites `.world-id` once the new build
succeeds.

The Vite HMR websocket defaults to `24679` so it can run alongside the other
Reactor examples; the world smoke runner selects a temporary free HMR port.
