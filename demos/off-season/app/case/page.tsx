"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FastH3Provider } from "@reactor-models/fast-h3";
import { makeTokenResolver } from "@/lib/keys";
import Investigation from "@/components/Investigation";

export default function CasePage() {
  const router = useRouter();
  const [reactorKey, setReactorKey] = useState<string | null>(null);

  useEffect(() => {
    setReactorKey("server");
  }, [router]);

  const resolver = useMemo(
    () => (reactorKey ? makeTokenResolver(reactorKey) : undefined),
    [reactorKey],
  );

  if (!resolver || !reactorKey) return null;

  return (
    <FastH3Provider jwtToken={resolver}>
      <Investigation />
    </FastH3Provider>
  );
}
