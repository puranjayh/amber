/**
 * Treating physician is not on the frozen Patient contract. Observed
 * attributions come from optional provider extracts (Synthea providers.csv /
 * DE-SynPUF carrier NPI). Published patients.json has neither. When a file is
 * absent we assign deterministically and the UI says so — never silently.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS, assignPhysician, doctorTalk } from "@/components/hcp/roster";

export type AttributionSource = "observed" | "assigned";

export type PatientPhysician = {
  patientId: string;
  physicianId: string;
  name: string;
  talk: string;
  specialty?: string;
  site: string;
  source: AttributionSource;
  observedId?: string;
};

const Observed = {
  patientId: (v: unknown) => typeof v === "string" && v,
  npi: (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : ""),
  name: (v: unknown) => (typeof v === "string" ? v : ""),
  site: (v: unknown) => (typeof v === "string" ? v : ""),
};

function loadObserved(): Map<string, { id: string; name?: string; site?: string }> {
  const roots = [process.cwd(), join(process.cwd(), "data")];
  const files = [
    "data/synthea/providers.json",
    "data/claims/providers.json",
    "app/_data/providers.json",
  ];
  const out = new Map<string, { id: string; name?: string; site?: string }>();
  for (const rel of files) {
    const path = rel.startsWith("/") ? rel : join(roots[0], rel);
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const rows = Array.isArray(raw) ? raw : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const patientId = Observed.patientId(rec.patientId ?? rec.patient_id);
        const id = Observed.npi(rec.npi ?? rec.providerId ?? rec.provider_id);
        if (!patientId || !id) continue;
        out.set(patientId, {
          id,
          name: Observed.name(rec.name) || undefined,
          site: Observed.site(rec.site) || undefined,
        });
      }
    } catch {
      /* a bad optional file must not invent doctors */
    }
  }
  return out;
}

let cached: Map<string, { id: string; name?: string; site?: string }> | undefined;

function observed(): Map<string, { id: string; name?: string; site?: string }> {
  if (!cached) cached = loadObserved();
  return cached;
}

export function attributeFromObserved(
  patientId: string,
  found: Map<string, { id: string; name?: string; site?: string }>,
): PatientPhysician {
  const hit = found.get(patientId);
  if (hit) {
    const known = PHYSICIANS.find((p) => p.id === hit.id);
    const name = hit.name || known?.name || `NPI ${hit.id}`;
    return {
      patientId,
      physicianId: hit.id,
      name,
      talk: doctorTalk(name),
      specialty: known?.specialty,
      site: hit.site || known?.site || "Observed from claims / Synthea",
      source: "observed",
      observedId: hit.id,
    };
  }
  const physicianId = assignPhysician(patientId);
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  return {
    patientId,
    physicianId,
    name: physician.name,
    talk: doctorTalk(physician.name),
    specialty: physician.specialty,
    site: physician.site,
    source: "assigned",
  };
}

export function attributePatient(patientId: string): PatientPhysician {
  return attributeFromObserved(patientId, observed());
}

export function attributePatients(ids: readonly string[]): PatientPhysician[] {
  return ids.map(attributePatient);
}

export function physiciansFrom(rows: readonly PatientPhysician[]): {
  id: string;
  name: string;
  talk: string;
  site: string;
  observed: number;
  assigned: number;
}[] {
  const byId = new Map<string, { id: string; name: string; talk: string; site: string; observed: number; assigned: number }>();
  for (const row of rows) {
    const cur = byId.get(row.physicianId) ?? {
      id: row.physicianId,
      name: row.name,
      talk: row.talk,
      site: row.site,
      observed: 0,
      assigned: 0,
    };
    if (row.source === "observed") cur.observed += 1;
    else cur.assigned += 1;
    byId.set(row.physicianId, cur);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export { DEFAULT_PHYSICIAN_ID };
