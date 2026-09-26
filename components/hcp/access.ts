/** A physician opens a chart only when that patient is already on their panel. */
export function doctorMayOpen(
  patientId: string | undefined,
  panel: ReadonlySet<string>,
): "closed" | "open" | "denied" {
  if (!patientId) return "closed";
  return panel.has(patientId) ? "open" : "denied";
}

export function doctorQuery(args: {
  physicianId: string;
  patientId?: string;
  trialId?: string;
  demo?: "1" | "static" | null;
}): string {
  const q = new URLSearchParams();
  if (args.demo) q.set("demo", args.demo);
  q.set("physician", args.physicianId);
  if (args.patientId) q.set("patient", args.patientId);
  if (args.trialId) q.set("trial", args.trialId);
  return `/doctor?${q}`;
}
