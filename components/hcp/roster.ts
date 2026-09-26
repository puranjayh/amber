/**
 * Treating physician is not on Patient (contracts frozen). This roster is a
 * deterministic demo assignment for the Impiricus channel — not extracted data.
 */

export type Physician = { id: string; name: string; specialty: string; site: string };

export const PHYSICIANS: readonly Physician[] = [
  { id: "hcp-rahman", name: "Aisha Rahman, MD", specialty: "Medical oncology", site: "Community oncology" },
  { id: "hcp-okonkwo", name: "James Okonkwo, MD", specialty: "Hematology", site: "County cancer clinic" },
  { id: "hcp-vasquez", name: "Elena Vasquez, MD", specialty: "Thoracic oncology", site: "Regional medical center" },
] as const;

export const DEFAULT_PHYSICIAN_ID = PHYSICIANS[0].id;

/** Hand-built fixture patients stay on the presentation physician. */
export function doctorTalk(name: string): string {
  const last = name.replace(/, MD$/, "").trim().split(/\s+/).at(-1);
  return last ? `Dr ${last}` : "your doctor";
}

export function doctorFor(patientId: string): { id: string; name: string; talk: string; specialty: string; site: string } {
  const id = assignPhysician(patientId);
  const physician = PHYSICIANS.find((p) => p.id === id) ?? PHYSICIANS[0];
  return {
    id: physician.id,
    name: physician.name,
    talk: doctorTalk(physician.name),
    specialty: physician.specialty,
    site: physician.site,
  };
}

export function assignPhysician(patientId: string): string {
  if (/^PT-\d+$/.test(patientId)) return DEFAULT_PHYSICIAN_ID;
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) {
    hash = (hash * 31 + patientId.charCodeAt(i)) >>> 0;
  }
  return PHYSICIANS[hash % PHYSICIANS.length].id;
}
