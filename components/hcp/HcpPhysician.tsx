import Link from "next/link";
import { PHYSICIANS } from "./roster";

export function HcpPhysician({
  physicianId,
  counts,
}: {
  physicianId: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]" role="navigation" aria-label="Logged-in physician">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Logged in as</span>
      {PHYSICIANS.map((p) => {
        const on = p.id === physicianId;
        const n = counts[p.id] ?? 0;
        return (
          <Link
            key={p.id}
            href={`/hcp?physician=${encodeURIComponent(p.id)}`}
            aria-current={on ? "page" : undefined}
            className={`rounded-md border px-2 py-1 ${
              on ? "border-ink bg-ink text-surface" : "border-line text-ink hover:bg-canvas"
            }`}
          >
            {p.name}
            <span className={on ? "text-surface/70" : "text-ink-3"}> · {n}</span>
          </Link>
        );
      })}
    </div>
  );
}
