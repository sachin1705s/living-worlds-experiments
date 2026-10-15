"use client";

import type { EvidenceId, Hotspot, Room } from "@/lib/case";

export default function Hotspots({
  room,
  found,
  onPick,
  activeBeat,
}: {
  room: Room;
  found: EvidenceId[];
  onPick: (h: Hotspot) => void;
  activeBeat: string;
}) {
  const visible = room.hotspots.filter(
    (h) => !h.requires || h.requires.every((id) => found.includes(id)),
  );

  return (
    <div className="hotspots">
      {visible.map((h, i) => {
        const seen = Boolean(h.evidence && found.includes(h.evidence.id));
        return (
          <button
            key={`${room.id}-${h.id}`}
            className="hotspot"
            data-kind={h.to ? "move" : "look"}
            data-found={seen}
            style={{
              left: `${h.x}%`,
              top: `${h.y}%`,
              animationDelay: `${120 + i * 70}ms`,
            }}
            onClick={() => onPick(h)}
            aria-label={h.action}
            title={activeBeat}
          >
            <span className="label">{h.label}</span>
            <span className="pill">{seen ? `${h.action} (again)` : h.action}</span>
          </button>
        );
      })}
    </div>
  );
}
