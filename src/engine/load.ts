/**
 * Reading the compiler's and data lane's files without trusting their shape.
 *
 * These files are written by other lanes and their envelope changes as those
 * lanes evolve — `data/compiled/trials.json` is currently an array of
 * `{ trial, reviewReasons, sourceText }` wrappers rather than an array of
 * `Trial`. Rather than hard-code one envelope and break on the next push, this
 * unwraps the shapes we have seen and validates every record against the frozen
 * schema.
 *
 * Contract rule 5, per record: a record that fails validation is rejected and
 * reported, never coerced. One bad trial costs that trial, not the whole run.
 *
 * Pure: takes parsed JSON, returns records. The caller reads the file.
 */
import { Patient as PatientSchema, Trial as TrialSchema, type Patient, type Trial } from "@/src/contracts";

export interface LoadResult<T> {
  records: T[];
  rejected: { index: number; id?: string; error: string }[];
  /** Which envelope the loader recognised, for the provenance block in a report. */
  envelope: string;
}

/** Pull the candidate records out of whatever envelope the file uses. */
function unwrap(raw: unknown): { rows: unknown[]; envelope: string } {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (
      first !== null &&
      typeof first === "object" &&
      "trial" in (first as Record<string, unknown>)
    ) {
      return {
        rows: raw.map((r) => (r as Record<string, unknown>).trial),
        envelope: "array of { trial, reviewReasons, sourceText }",
      };
    }
    return { rows: raw, envelope: "array of records" };
  }
  if (raw !== null && typeof raw === "object") {
    for (const key of ["trials", "patients", "records", "data"]) {
      const inner = (raw as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return { rows: inner, envelope: `object with .${key}` };
    }
  }
  throw new TypeError(
    "unrecognised envelope: expected an array of records, an array of " +
      "{ trial, ... } wrappers, or an object with .trials / .patients",
  );
}

function loadWith<T>(
  raw: unknown,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: (string | number | symbol)[]; message: string }[] } } },
  idOf: (row: Record<string, unknown>) => string | undefined,
): LoadResult<T> {
  const { rows, envelope } = unwrap(raw);
  const records: T[] = [];
  const rejected: LoadResult<T>["rejected"] = [];

  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success && parsed.data !== undefined) {
      records.push(parsed.data);
      return;
    }
    rejected.push({
      index,
      id: row !== null && typeof row === "object" ? idOf(row as Record<string, unknown>) : undefined,
      // Keep it short; a full zod dump per bad record buries the signal.
      error:
        parsed.error?.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ") ?? "failed validation",
    });
  });

  return { records, rejected, envelope };
}

/** Compiled trials, however the compiler is currently wrapping them. */
export function loadTrials(raw: unknown): LoadResult<Trial> {
  return loadWith<Trial>(raw, TrialSchema, (row) => row.nctId as string | undefined);
}

/** A patient cohort — Synthea, claims-derived, or hand-built fixtures. */
export function loadPatients(raw: unknown): LoadResult<Patient> {
  return loadWith<Patient>(raw, PatientSchema, (row) => row.id as string | undefined);
}
