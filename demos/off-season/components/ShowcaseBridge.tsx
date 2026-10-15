"use client";

import { useEffect } from "react";

const handlers = new Set<() => Promise<unknown>>();
let stopping: Promise<void> | null = null;

export function registerShowcaseStop(handler: () => Promise<unknown>) {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

export function ShowcaseBridge() {
  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      const allowed = [window.location.origin, "https://livingworlds.in", "https://www.livingworlds.in", "https://worlds-experiments.vercel.app",process.env.NEXT_PUBLIC_SHOWCASE_ORIGIN, "http://127.0.0.1:5180", "http://localhost:5180"].filter(Boolean);
      if (event.source !== window.parent || !allowed.includes(event.origin) || event.data?.type !== "showcase-stop") return;
      try {
        if (!stopping) stopping = Promise.all([...handlers].map((handler) => handler())).then(() => {}).finally(() => { stopping = null; });
        await stopping;
        window.parent.postMessage({ requestId: event.data.requestId }, event.origin);
      } catch (error) {
        window.parent.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : "Could not confirm disconnect." }, event.origin);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return null;
}
