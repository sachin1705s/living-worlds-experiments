"use client";

import type { HarnessSettings, Verdict } from "@/lib/harness";

function fmt(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}`;
}

export default function HarnessPanel({
  settings,
  onChange,
  verdicts,
  sampled,
  busy,
  hasKey,
  repairNote,
  onClear,
}: {
  settings: HarnessSettings;
  onChange: (s: HarnessSettings) => void;
  verdicts: Verdict[];
  sampled: number;
  busy: boolean;
  hasKey: boolean;
  repairNote: { prompt: string; verdict: Verdict } | null;
  onClear: () => void;
}) {
  const set = <K extends keyof HarnessSettings>(k: K, v: HarnessSettings[K]) =>
    onChange({ ...settings, [k]: v });

  return (
    <>
      <h2>
        Harness — {busy ? "reading" : "watching"} · {sampled} frames sampled
      </h2>

      <div className="knobs">
        <div className="switch">
          <span>Harness</span>
          <button data-on={settings.enabled} onClick={() => set("enabled", !settings.enabled)}>
            {settings.enabled ? "On" : "Off"}
          </button>
        </div>
        <div className="switch">
          <span>Observe only</span>
          <button data-on={settings.observeOnly} onClick={() => set("observeOnly", !settings.observeOnly)}>
            {settings.observeOnly ? "Never reprompts" : "May reprompt"}
          </button>
        </div>

        <div className="knob">
          <label htmlFor="sample">
            Sample one frame in <b>{settings.sampleEvery}</b>
          </label>
          <input
            id="sample"
            type="range"
            min={1}
            max={12}
            value={settings.sampleEvery}
            onChange={(e) => set("sampleEvery", Number(e.target.value))}
          />
        </div>

        <div className="knob">
          <label htmlFor="check">
            Send to Gemini every <b>{(settings.checkEveryMs / 1000).toFixed(1)}s</b>
          </label>
          <input
            id="check"
            type="range"
            min={1200}
            max={8000}
            step={200}
            value={settings.checkEveryMs}
            onChange={(e) => set("checkEveryMs", Number(e.target.value))}
          />
        </div>

        <div className="knob">
          <label htmlFor="thr">
            A shot passes at <b>{settings.threshold}</b>
          </label>
          <input
            id="thr"
            type="range"
            min={20}
            max={95}
            value={settings.threshold}
            onChange={(e) => set("threshold", Number(e.target.value))}
          />
        </div>

        <div className="knob">
          <label htmlFor="strikes">
            Rebuild after <b>{settings.strikes}</b> bad reads
          </label>
          <input
            id="strikes"
            type="range"
            min={1}
            max={4}
            value={settings.strikes}
            onChange={(e) => set("strikes", Number(e.target.value))}
          />
        </div>

        <div className="knob">
          <label htmlFor="repairs">
            At most <b>{settings.maxRepairs}</b> rebuilds per shot
          </label>
          <input
            id="repairs"
            type="range"
            min={0}
            max={3}
            value={settings.maxRepairs}
            onChange={(e) => set("maxRepairs", Number(e.target.value))}
          />
        </div>

        <div className="switch">
          <span>Log</span>
          <button onClick={onClear}>Clear</button>
        </div>
      </div>

      {repairNote && (
        <div className="hrow">
          <div className="score" data-verdict="miss">
            ↻
          </div>
          <div>
            <div className="beat">Reprompted · {repairNote.verdict.beat}</div>
            <p className="reading">
              Two reads under {settings.threshold}. The harness rewrote the shot and pushed the rebuild
              to the front of the queue.
            </p>
            <div className="repairnote">
              <b>New prompt</b>
              {repairNote.prompt}
            </div>
          </div>
        </div>
      )}

      {verdicts.length === 0 && hasKey && (
        <p className="empty">
          Nothing scored yet. The harness only reads while a freshly generated shot is on the tracks —
          replays out of the cache are skipped, because they were judged the first time.
        </p>
      )}

      {verdicts.map((v) => (
        <div className="hrow" key={v.id}>
          <div
            className="score"
            data-verdict={v.error ? "error" : v.match >= settings.threshold ? "pass" : "miss"}
          >
            {v.error ? "err" : v.match}
          </div>
          <div>
            <div className="beat">
              {fmt(v.at)} · {v.beat}
              {v.take > 0 ? ` · take ${v.take + 1}` : ""}
            </div>
            <p className="reading">{v.error ?? v.reading}</p>
            {v.missing.length > 0 && (
              <div className="missing">
                {v.missing.map((m) => (
                  <span className="chip" key={m}>
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
