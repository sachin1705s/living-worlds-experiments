"use client";

import { ALL_EVIDENCE, type EvidenceId } from "@/lib/case";

export default function CaseFile({ found }: { found: EvidenceId[] }) {
  const kept = ALL_EVIDENCE.filter((e) => found.includes(e.id));
  // Newest first: the file reads like a notebook, most recent note on top.
  const ordered = [...kept].sort((a, b) => found.indexOf(b.id) - found.indexOf(a.id));

  return (
    <>
      <h2>
        Case file — {kept.length} of {ALL_EVIDENCE.length}
      </h2>
      {ordered.length === 0 ? (
        <p className="empty">
          Nothing in it yet. Click the labels on the frame; anything you actually look at gets written
          down here, and the report at the end is built from this page and nothing else.
        </p>
      ) : (
        ordered.map((e) => (
          <article className="entry" key={e.id}>
            <div className="top">
              <span className="name">{e.title}</span>
              <span className="kind">{e.kind}</span>
            </div>
            <p>{e.note}</p>
          </article>
        ))
      )}
    </>
  );
}
