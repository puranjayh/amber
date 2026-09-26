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

/** A chart is its own page, still inside the doctor portal. */
export function doctorChartPath(args: {
  physicianId: string;
  patientId: string;
  trialId?: string;
  demo?: "1" | "static" | null;
}): string {
  const q = new URLSearchParams();
  if (args.demo) q.set("demo", args.demo);
  q.set("physician", args.physicianId);
  if (args.trialId) q.set("trial", args.trialId);
  const s = q.toString();
  return `/doctor/patient/${encodeURIComponent(args.patientId)}${s ? `?${s}` : ""}`;
}

/** Trial-portal patient detail. */
export function trialPatientPath(
  patientId: string,
  opts?: { trialId?: string; demo?: "1" | "static" | null },
): string {
  const q = new URLSearchParams();
  if (opts?.demo) q.set("demo", opts.demo);
  if (opts?.trialId) q.set("trial", opts.trialId);
  const s = q.toString();
  return `/patient/${encodeURIComponent(patientId)}${s ? `?${s}` : ""}`;
}

/** Printable patient letter. Same query as the chart, different page. */
export function documentQuery(args: {
  physicianId: string;
  patientId: string;
  trialId: string;
  demo?: "1" | "static" | null;
}): string {
  const q = new URLSearchParams();
  if (args.demo) q.set("demo", args.demo);
  q.set("physician", args.physicianId);
  q.set("patient", args.patientId);
  q.set("trial", args.trialId);
  return `/doctor/document?${q}`;
}
