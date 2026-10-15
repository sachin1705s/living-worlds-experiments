"use client";

import { useEffect } from "react";

export function IdleStopBridge() {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const allowed = [location.origin, "https://worlds-experiments.vercel.app", "http://127.0.0.1:5180", "http://localhost:5180"];
      if (event.source !== window.parent || !allowed.includes(event.origin) || event.data?.type !== "showcase-stop") return;
      window.parent.postMessage({ requestId: event.data.requestId }, event.origin);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return null;
}
