"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CASE } from "@/lib/case";
import { GEMINI_KEY, REACTOR_KEY, readKey, writeKey } from "@/lib/keys";
import { registerShowcaseStop } from "@/components/ShowcaseBridge";

export default function FrontDoor() {
  const router = useRouter();
  
  const [geminiKey, setGeminiKey] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {

    setGeminiKey(readKey(GEMINI_KEY));
    setLoaded(true);
  }, []);

  const ready = true;

  useEffect(() => registerShowcaseStop(async () => {

    setGeminiKey("");
    writeKey(REACTOR_KEY, "");
    writeKey(GEMINI_KEY, "");
  }), []);

  function begin() {

    writeKey(GEMINI_KEY, geminiKey.trim());
    router.push("/case");
  }

  return (
    <main className="door">
      <p className="eyebrow">Claim {CASE.slug} · Marrow Bay pier arcade</p>
      <h1>
        The <em>Off</em>
        <br />
        Season
      </h1>
      <p className="brief">{CASE.brief}</p>

      <div className="rule" />

      <h2>How it works</h2>
      <div className="steps">
        <div className="step">
          <div className="n">01</div>
          <p>
            Every room and every close-up is generated the moment you ask for it — FastH3 renders the
            picture and its sound in one pass. Nothing here is a stock photograph.
          </p>
        </div>
        <div className="step">
          <div className="n">02</div>
          <p>
            Click the labels on the frame. Looking at a thing writes it into the case file; the file is
            the only thing your report is built from.
          </p>
        </div>
        <div className="step">
          <div className="n">03</div>
          <p>
            A harness samples every fourth frame and shows it to Gemini alongside the prompt that asked
            for it. Two bad reads and it rewrites the prompt and rebuilds the shot itself.
          </p>
        </div>
        <div className="step">
          <div className="n">04</div>
          <p>
            Shots you have already seen are kept in the browser, so walking back through the pier costs
            nothing and looks the same as it did the first time.
          </p>
        </div>
      </div>

      <div className="rule" />

      <h2>Optional Gemini key</h2>
      <div className="keys">

        <div className="field">
          <label htmlFor="gk">Gemini API key</label>
          <input
            id="gk"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <p className="hint">
            Drives the frame harness. Leave it empty and the game plays fine — you just won&rsquo;t get
            the second opinion or the automatic reprompt.
          </p>
        </div>
      </div>

      <div className="go">
        <button className="btn" onClick={begin} disabled={!loaded || !ready}>
          Walk the pier
        </button>
        <span className="note">
          {loaded && !ready
            ? "Loading…"
            : "Reactor is provided. The optional Gemini key stays in this tab."}
        </span>
      </div>

      <div className="costnote">
        <b>What this costs you.</b> FastH3 bills for the GPU, not the generation: 70 credits a second
        from the moment the session is ready until you leave — about <b>$0.42 a minute</b>, whether or
        not a clip is building. Sessions are capped at twenty minutes. The footer keeps a running
        meter, and closing the tab ends the session.
      </div>
    </main>
  );
}
