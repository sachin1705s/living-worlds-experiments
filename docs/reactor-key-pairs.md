# Reactor key pairs

Each experiment has a server-only JSON array containing its primary and backup API keys. The browser receives only a short-lived JWT scoped to that experiment's model. Drawing's two modes share one pair.

| Experiment | Environment variable | Supplied key positions |
| --- | --- | --- |
| Drawing to live | `REACTOR_DRAWING_KEYS` | 1–2 |
| Einstein's Chalkboard | `REACTOR_EINSTEIN_KEYS` | 3–4 |
| Tech Roast | `REACTOR_ROAST_KEYS` | 5–6 |
| Stylized Worlds | `REACTOR_STYLIZED_KEYS` | 7–8 |
| Check Your Drip | `REACTOR_DRIP_KEYS` | 9–10 |
| News Studio | `REACTOR_NEWS_KEYS` | 11–12 |
| Kahani | `REACTOR_KAHANI_KEYS` | 13–14 |
| Unassigned reserves | `REACTOR_RESERVED_KEYS` | 15–16 |

Store values in the ignored local `.env`, the relevant Vercel project's encrypted production variables, and GitHub Actions secrets. Never use a `VITE_` or `NEXT_PUBLIC_` prefix for a key. GitHub secrets are a separate copy: changing them does not automatically change Vercel variables.

A new session tries the primary key once. A session-capacity rejection triggers cleanup and one attempt with the backup. It does not retry billing, authentication or network failures. Once connected, the token stays fixed until the session ends. There is no timer that probes the primary and no switch back while a backup session is active. Both keys being unavailable ends that startup attempt with an error.

Back cancels startup, waits for any in-flight session creation to settle and disconnects using the original session credentials. The showcase waits for the demo's acknowledgement before removing its iframe. A cleanup error retains the frame and offers another Back attempt. Unload beacons provide best-effort cleanup if the tab itself closes; provider-side five-minute session limits bound sessions abandoned by a browser/network crash.

All 16 supplied keys were authenticated with `/me` and belong to the same account. Key rotation cannot increase an account-wide concurrency limit or create more provider GPU capacity.

Validation:

```sh
node --test scripts/test-reactor-pool.mjs scripts/test-session-stop.mjs scripts/test-token-pairs.mjs
npm --prefix frontend run build
npm --prefix demos/kahani run build
npm --prefix demos/news-studio run build
```
