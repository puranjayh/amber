import type { LoopNudge } from "@/app/_data/schema";
import { propagationLines } from "./registry";

/** Coordinator view of registry updates. Patient ids are not rendered. */
export function Propagation({ nudges }: { nudges: readonly LoopNudge[] }) {
  const lines = propagationLines(nudges);
  if (lines.length === 0) return null;
  return (
    <aside
      className="rounded-md border border-line bg-surface px-3 py-3 sm:px-4"
      aria-label="Registry updates"
    >
      <p className="text-[11px] font-medium text-ink-3">Registry updates</p>
      <ul className="mt-2 space-y-2">
        {lines.map((line) => (
          <li key={line.key} className="text-[13px] leading-relaxed text-ink">
            <span className="font-mono text-[13px]">{line.nctId}</span>
            <span className="mt-0.5 block text-ink-2">{line.detail}</span>
            <span className="mt-0.5 block text-[13px] text-ink">
              {line.prompted === 1
                ? "1 follow-up prompted"
                : `${line.prompted} follow-ups prompted`}
              {line.waiting > 0 ? `, ${line.waiting} waiting on the physician` : ""}.
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
