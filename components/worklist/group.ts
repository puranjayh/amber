import type { LoopNudge, PortalAnswers } from "@/app/_data/schema";
import { prefsStated } from "@/components/loop/rank";

export function splitForNudge(
  selected: readonly string[],
  prefs: Record<string, PortalAnswers | undefined>,
): { missing: string[]; reachable: string[] } {
  const missing = selected.filter((id) => !prefsStated(prefs[id]));
  const reachable = selected.filter((id) => prefsStated(prefs[id]));
  return { missing, reachable };
}

export type EnrolGroup = {
  key: string;
  batchId?: string;
  nctIds: string[];
  patientIds: string[];
  status: LoopNudge["status"];
  createdAt: string;
  ids: string[];
};

export function enrolCopy(count: number, nctIds: readonly string[]): string {
  const unique = [...new Set(nctIds.filter(Boolean))];
  const n = count === 1 ? "1 of your patients" : `${count} of your patients`;
  if (unique.length === 1) return `Trial coordinator flagged ${n} for ${unique[0]}.`;
  if (unique.length === 0) return `Trial coordinator flagged ${n}.`;
  const rest = unique.length - 1;
  return `Trial coordinator flagged ${n} for ${unique[0]} and ${rest} other trial${rest === 1 ? "" : "s"}.`;
}

export function groupEnrolNudges(nudges: readonly LoopNudge[], physicianPatients: ReadonlySet<string>): EnrolGroup[] {
  const mine = nudges.filter(
    (n) => n.kind === "enrol_patient" && n.status !== "done" && physicianPatients.has(n.patientId),
  );
  const buckets = new Map<string, LoopNudge[]>();
  for (const n of mine) {
    const key = n.batchId ?? n.id;
    const list = buckets.get(key) ?? [];
    list.push(n);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .map(([key, rows]) => ({
      key,
      batchId: rows[0]?.batchId,
      nctIds: [...new Set(rows.map((r) => r.nctId).filter((id): id is string => Boolean(id)))],
      patientIds: [...new Set(rows.map((r) => r.patientId))],
      status: rows.some((r) => r.status === "pending") ? "pending" : rows[0]!.status,
      createdAt: rows.map((r) => r.createdAt).sort()[0] ?? "",
      ids: rows.map((r) => r.id),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
