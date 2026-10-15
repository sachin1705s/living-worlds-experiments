"use client";

// The fixed shell: header on top, control sidebar beside the content screen —
// the layout every Reactor example uses, and it never changes shape. Nothing
// here navigates or goes full screen: useWorldSession() reduces the SDK's
// authoritative snapshot to one AppView (lib/view.ts) and the two regions
// switch what they show off it, so the page always mirrors the session's
// state machine.
//
// The experience mode is fixed for the life of a session (each mode is its own
// Reactor model), so the pending intent — and the mode it implies — is owned
// here, above the provider, and the provider is keyed on the mode: picking a
// world of the other experience remounts a fresh session. Nothing connects
// until you hit Connect or pick a world.

import { useCallback, useEffect, useState } from "react";
import type { WorldIntent } from "@/lib/worlds";
import { LiveClientProvider } from "@/components/happy-oyster/ho-client";
import { useWorldSession } from "@/components/happy-oyster/use-world-session";
import { KidStoryShell } from "@/components/kid/KidStoryShell";

export function HappyOysterApp() {
  // Kahani's first model is Directing; the server token is scoped to exactly
  // this model, so the provider must never mount an Adventure session.
  const mode = "directing" as const;
  const [intent, setIntent] = useState<WorldIntent | null>(null);

  const run = useCallback((next: WorldIntent) => {
    if (next.mode !== "directing") return;
    setIntent(next);
  }, []);
  const clearIntent = useCallback(() => setIntent(null), []);

  return (
    <LiveClientProvider mode={mode} key={mode}>
      <Shell intent={intent} onRun={run} onClearIntent={clearIntent} />
    </LiveClientProvider>
  );
}

const SHOWCASE_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5180",
  "http://localhost:5180",
  "https://worlds-experiments.vercel.app",
  "https://livingworlds.in",
  "https://www.livingworlds.in",
];

function isLocalShowcase(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function Shell({
  intent,
  onRun,
  onClearIntent,
}: {
  intent: WorldIntent | null;
  onRun: (intent: WorldIntent) => void;
  onClearIntent: () => void;
}) {
  const session = useWorldSession({ intent, onRun, onClearIntent });

  useEffect(() => {
    const allowed = new Set(
      [location.origin, import.meta.env.VITE_SHOWCASE_ORIGIN, ...SHOWCASE_ORIGINS].filter(Boolean),
    );
    async function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== "showcase-stop") return;
      if (!allowed.has(event.origin) && !isLocalShowcase(event.origin)) return;
      try {
        await Promise.race([
          session.client.disconnect(),
          new Promise((resolve) => window.setTimeout(resolve, 1200)),
        ]);
      } catch {
        // The showcase still needs the ack so Back can return to the grid.
      }
      onClearIntent();
      event.source.postMessage({ requestId: event.data.requestId }, event.origin);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onClearIntent, session.client]);

  const backToExperiments = useCallback(() => {
    if (window.parent === window) {
      const showcase = import.meta.env.VITE_SHOWCASE_ORIGIN || "http://localhost:5180";
      window.location.assign(`${showcase.replace(/\/$/, "")}/showcase.html`);
      return;
    }
    window.parent.postMessage({ type: "showcase-back" }, "*");
  }, []);

  return <KidStoryShell session={session} onBackToExperiments={backToExperiments} />;
}
