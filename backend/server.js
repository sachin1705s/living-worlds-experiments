import express from "express";
import cors from "cors";
import "dotenv/config";
import { einsteinRoutes } from "./einstein-routes.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.all("/api/token", async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) return res.sendStatus(405);
  res.set("Cache-Control", "no-store");
  const apiKey = process.env.REACTOR_API_KEY;
  const model = req.body?.model || "reactor/lingbot";
  if (!["reactor/lingbot", "reactor/visko-orbis-stable", "reactor/sana-streaming", "reactor/vidu-s2-editing", "reactor/vidu-s2-avatar"].includes(model)) {
    return res.status(400).json({ error: "Unsupported model" });
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(500).json({ error: "REACTOR_API_KEY not set" });
  }
  try {
    const r = await fetch("https://api.reactor.inc/tokens", {
      method: "POST",
      headers: { "Reactor-API-Key": apiKey.trim(), "Content-Type": "application/json" },
      body: JSON.stringify({ authorization_details: [{ type: "session", resources: { models: { match: [model] } }, constraints: { max_sessions: 1, max_session_duration_seconds: 300 } }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: "Reactor rejected the token request. Check your key and account access." });
    }
    const { jwt } = await r.json();
    res.json({ jwt });
  } catch (e) {
    res.status(502).json({ error: "Unable to contact Reactor. Please retry." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(einsteinRoutes);

app.post("/api/reactor/session/end", async (req, res) => {
  const { sessionId, jwt: apiKey } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey || typeof sessionId !== "string" || !sessionId) {
    return res.status(400).json({ error: "Session token and session ID required" });
  }
  try {
    const response = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok && response.status !== 404) return res.status(502).json({ error: "Unable to confirm session termination" });
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "Unable to confirm session termination" });
  }
});


export default app;

if (!process.env.VERCEL) app.listen(PORT, () => {
  console.log(`token broker listening on http://localhost:${PORT}`);
});
