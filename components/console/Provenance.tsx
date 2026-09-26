import type { Meta } from "@/app/_data/schema";

/** Answers "is this live?" on every screen: which engine call, over what, at which engine version. */
export function Provenance({ meta, call }: { meta: Meta; call: string }) {
  return (
    <p className="font-mono text-[11px] leading-relaxed text-ink-3">
      Engine output · <span className="text-ink-2">{call}</span> over {meta.patients} patients ×{" "}
      {meta.trials} trials, as of {meta.asOf} · engine tree {meta.engineTree} · from{" "}
      {meta.sources.join(", ")}
    </p>
  );
}
