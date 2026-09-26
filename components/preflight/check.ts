import type { z } from "zod";

export type FileCheck = {
  path: string;
  required: boolean;
  exists: boolean;
  ok: boolean;
  rows: number;
  error?: string;
};

export function countRows(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    if (Array.isArray(rec.analytes)) return rec.analytes.length;
    if (typeof rec.evaluatedCells === "number") return rec.evaluatedCells;
    if (typeof rec.beneficiaries === "number") return rec.beneficiaries;
    if (Array.isArray(rec.settled) || Array.isArray(rec.needs)) {
      return (rec.settled?.length ?? 0) + (rec.needs?.length ?? 0);
    }
    if (Array.isArray(rec.physicians)) {
      return rec.physicians.reduce((n, p) => {
        const patients = (p as { patients?: unknown }).patients;
        return n + (Array.isArray(patients) ? patients.length : 0);
      }, 0);
    }
    if (typeof rec.patients === "number") return rec.patients;
  }
  return 0;
}

export function checkPayload(args: {
  path: string;
  required: boolean;
  raw: string | null;
  schema: z.ZodType;
  rows?: (data: unknown) => number;
}): FileCheck {
  const { path, required, raw, schema, rows = countRows } = args;
  if (raw === null) {
    return {
      path,
      required,
      exists: false,
      ok: !required,
      rows: 0,
      error: required ? "missing" : "missing — fallback in use",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { path, required, exists: true, ok: false, rows: 0, error: "not JSON" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    return {
      path,
      required,
      exists: true,
      ok: false,
      rows: 0,
      error: `${issue?.message ?? "invalid"}${where}`,
    };
  }
  const n = rows(result.data);
  if (n === 0) {
    return { path, required, exists: true, ok: false, rows: 0, error: "empty" };
  }
  return { path, required, exists: true, ok: true, rows: n };
}

export function ready(checks: FileCheck[]): boolean {
  return checks.filter((c) => c.required).every((c) => c.ok);
}
