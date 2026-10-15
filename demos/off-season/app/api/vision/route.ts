import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM = `You are a shot supervisor watching frames come off a real-time video model.

You are given the prompt that was sent to the model, a one-line INTENT describing what those frames must show, and one to three frames sampled from the clip in playback order.

Judge only what is visibly in the frames. Do not be generous, and do not invent detail you cannot see. A frame that is black, mush, a smeared repeat of the previous frame, or a plausible but different scene is a failure.

Reply with JSON only, no prose and no code fence:
{
  "match": <integer 0-100, how well the frames satisfy the INTENT>,
  "reading": "<one short sentence: what is actually on screen>",
  "missing": ["<intent elements absent or wrong, at most three, each 2-6 words>"],
  "repair": "<a rewritten prompt for the video model, at most 700 characters, or null>"
}

Scoring: 85-100 the intent is on screen; 60-84 recognisable but an element is missing or wrong; 30-59 the right kind of scene but not this one; 0-29 wrong, black, or degraded.

The repair prompt: only when match is under 70. Rewrite the original prompt so the model cannot miss the intent — lead with the single element that failed, keep the setting, camera and sound clauses concrete and present tense, never mention frames, scores, retries or the word prompt, and never ask for on-screen text.`;

interface VisionBody {
  apiKey?: string;
  prompt?: string;
  intent?: string;
  frames?: string[];
}

export async function POST(req: NextRequest) {
  let body: VisionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const { apiKey, prompt, intent, frames } = body;
  if (!apiKey) {
    return NextResponse.json({ error: "No Gemini key." }, { status: 400 });
  }
  if (!frames?.length) {
    return NextResponse.json({ error: "No frames to look at." }, { status: 400 });
  }

  const parts: Record<string, unknown>[] = [
    { text: `${SYSTEM}\n\nPROMPT SENT TO THE MODEL:\n${prompt}\n\nINTENT:\n${intent}\n\nFRAMES (playback order):` },
    ...frames.slice(0, 3).map((data) => ({
      inline_data: { mime_type: "image/jpeg", data },
    })),
  ];

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Gemini." }, { status: 502 });
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Gemini refused (${res.status}). ${text.slice(0, 240)}` },
      { status: res.status },
    );
  }

  const payload = JSON.parse(text);
  const raw: string =
    payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  // Defensive: the model is asked for bare JSON but a fence costs nothing to strip.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const verdict = JSON.parse(cleaned);
    return NextResponse.json({
      match: Math.max(0, Math.min(100, Number(verdict.match) || 0)),
      reading: String(verdict.reading ?? "").slice(0, 240),
      missing: Array.isArray(verdict.missing) ? verdict.missing.slice(0, 3).map(String) : [],
      repair: verdict.repair ? String(verdict.repair).slice(0, 780) : null,
    });
  } catch {
    return NextResponse.json(
      { error: `Gemini did not return JSON: ${cleaned.slice(0, 200)}` },
      { status: 502 },
    );
  }
}
