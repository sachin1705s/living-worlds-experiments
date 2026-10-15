# Livingworlds route

The `experiments/index.html` page embeds the independently hosted showcase. Copy this directory's `experiments` folder into the existing Livingworlds static deployment and merge the following rule into its `vercel.json` rewrites without replacing existing routes:

```json
{ "source": "/experiments", "destination": "/experiments/index.html" }
```

The main project uses the repository-root `vercel.json`. Deploy `demos/off-season` and `demos/news-studio` as separate Next.js projects. Configure `REACTOR_API_KEY` as a server-side secret in all three deployments, and `GEMINI_API_KEY` for the main backend and News Studio. No secret values should be committed or placed in public frontend environment variables.
