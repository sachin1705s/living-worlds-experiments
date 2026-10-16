# Livingworlds route

The `experiments/index.html` page embeds the independently hosted showcase. Copy this directory's `experiments` folder into the existing Livingworlds static deployment and merge the following rule into its `vercel.json` rewrites without replacing existing routes:

```json
{ "source": "/experiments", "destination": "/experiments/index.html" }
```

The main project uses the repository-root `vercel.json`. Deploy `demos/news-studio` as a separate Next.js project. Configure `REACTOR_API_KEY` as a server-side secret in both deployments, and `GEMINI_API_KEY` for the main backend and News Studio. No secret values should be committed or placed in public frontend environment variables.

Kahani deploys from `demos/kahani` to `worlds-experiments-kahani.vercel.app`.
Its Vercel configuration serves the Vite build and the Express API separately.
Set `REACTOR_API_KEY`, `GEMINI_API_KEY`, `KAHANI_WORLD_ID` (a completed story
world), and a random `KAHANI_STATE_SECRET` in production. The signed playthrough
state travels with director requests so serverless instances can continue the
same story. The local server continues to use `.world-id`.

The showcase uses `VITE_KAHANI_URL` when configured, otherwise its production
Kahani URL. The outer iframe must allow microphone access for spoken decisions.
All three projects should connect to `sachin1705s/living-worlds-experiments`,
production branch `main`, with roots `.`, `demos/news-studio`, and `demos/kahani`.
