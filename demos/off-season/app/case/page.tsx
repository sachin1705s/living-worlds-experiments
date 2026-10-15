"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FastH3Provider } from "@reactor-models/fast-h3";
import { GEMINI_KEY, REACTOR_KEY, makeTokenResolver, readKey } from "@/lib/keys";
import Investigation from "@/components/Investigation";

export default function CasePage() {
  const router = useRouter();
  const [reactorKey, setReactorKey] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");

  useEffect(() => {
    setReactorKey("server");
    setGeminiKey(readKey(GEMINI_KEY));
  }, [router]);

  const resolver = useMemo(
    () => (reactorKey ? makeTokenResolver(reactorKey) : undefined),
    [reactorKey],
  );

  if (!resolver || !reactorKey) return null;

  return (
    <FastH3Provider jwtToken={resolver}>
      <Investigation geminiKey={geminiKey} />
    </FastH3Provider>
  );
}
