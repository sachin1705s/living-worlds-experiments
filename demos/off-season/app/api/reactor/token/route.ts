import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN_LIFETIME_SECONDS = 3600;
const MODEL = "reactor/fast-h3";

export async function POST(req: NextRequest) {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Server connection is not configured." }, { status: 503 });

  let res: Response;
  try {
    res = await fetch("https://api.reactor.inc/tokens", {
      method: "POST",
      headers: { "Reactor-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: TOKEN_LIFETIME_SECONDS,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: [MODEL] } },
            constraints: { max_sessions: 1, max_session_duration_seconds: 300 },
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Reactor." }, { status: 502 });
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Reactor refused the key (${res.status}). ${text.slice(0, 300)}` },
      { status: res.status },
    );
  }

  const { jwt, expires_at } = JSON.parse(text);
  return NextResponse.json(
    { jwt, expires_at },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
