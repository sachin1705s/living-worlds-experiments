export async function POST(request: Request) {
  const { sessionId, jwt } = await request.json();
  if (typeof sessionId !== "string" || !sessionId || typeof jwt !== "string" || !jwt) return Response.json({ error: "Session ID required" }, { status: 400 });
  const response = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(15000),
  });
  return Response.json({ ok: response.ok || response.status === 404 }, { status: response.ok || response.status === 404 ? 200 : 502 });
}
