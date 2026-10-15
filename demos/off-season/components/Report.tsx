"use client";

import { ALL_EVIDENCE, type EvidenceId, verdictFor } from "@/lib/case";

export default function Report({
  found,
  total,
  onBack,
  onLeave,
}: {
  found: EvidenceId[];
  total: number;
  onBack: () => void;
  onLeave: () => void;
}) {
  const verdict = verdictFor(found);
  const missed = ALL_EVIDENCE.filter((e) => !found.includes(e.id));

  return (
    <main className="report">
      <p className="grade">
        Adjuster&rsquo;s report · {found.length} of {total} items on file
      </p>
      <h1>{verdict.heading}</h1>
      {verdict.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      {missed.length > 0 && (
        <p style={{ color: "var(--paper-3)", fontSize: 15 }}>
          {missed.length === 1
            ? "One thing on that pier you never looked at."
            : `${missed.length} things on that pier you never looked at.`}{" "}
          The pier is still there.
        </p>
      )}

      <div className="sig">
        <span>Claim MB-4417 · Marrow Bay</span>
        <span>
          <button onClick={onBack} style={{ color: "var(--amber)" }}>
            Go back to the pier
          </button>
          {"  ·  "}
          <button onClick={onLeave}>End the session</button>
        </span>
      </div>
    </main>
  );
}
