/**
 * Shared loop state. Next API routes and server pages read this; the browser
 * never talks to Postgres. Supabase when env is set, otherwise a local file
 * so three portals on one `next dev` still share one store.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LoopNudge,
  LoopPreference,
  LoopState,
  PhysicianNote,
  RegistrySnapshot,
  ReleaseSetting,
  type LoopNudge as LoopNudgeT,
  type LoopPreference as LoopPreferenceT,
  type LoopState as LoopStateT,
  type NudgeKind,
  type LoopRole,
  type NudgeStatus,
  type PhysicianNote as PhysicianNoteT,
  type PortalAnswers,
  type RegistrySnapshot as RegistrySnapshotT,
  type ReleaseSetting as ReleaseSettingT,
} from "./schema";

const FILE = join(process.cwd(), ".data/loop.json");

function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

function supabaseKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || undefined;
}

export function loopBackend(): LoopStateT["backend"] {
  return supabaseUrl() && supabaseKey() ? "supabase" : "file";
}

function empty(): LoopStateT {
  return { backend: loopBackend(), preferences: [], nudges: [], notes: [], registry: [], releases: [] };
}

type FileShape = {
  preferences: unknown;
  nudges: unknown;
  notes?: unknown;
  registry?: unknown;
  releases?: unknown;
};

function readFile(): LoopStateT {
  if (!existsSync(FILE)) return empty();
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as FileShape;
    const preferences = Array.isArray(raw.preferences)
      ? raw.preferences.flatMap((row) => {
          const one = LoopPreference.safeParse(row);
          return one.success ? [one.data] : [];
        })
      : [];
    const nudges = Array.isArray(raw.nudges)
      ? raw.nudges.flatMap((row) => {
          const one = LoopNudge.safeParse(row);
          return one.success ? [one.data] : [];
        })
      : [];
    const notes = Array.isArray(raw.notes)
      ? raw.notes.flatMap((row) => {
          const one = PhysicianNote.safeParse(row);
          return one.success ? [one.data] : [];
        })
      : [];
    const registry = Array.isArray(raw.registry)
      ? raw.registry.flatMap((row) => {
          const one = RegistrySnapshot.safeParse(row);
          return one.success ? [one.data] : [];
        })
      : [];
    const releases = Array.isArray(raw.releases)
      ? raw.releases.flatMap((row) => {
          const one = ReleaseSetting.safeParse(row);
          return one.success ? [one.data] : [];
        })
      : [];
    return { backend: "file", preferences, nudges, notes, registry, releases };
  } catch {
    return empty();
  }
}

function writeFile(state: LoopStateT): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(
    FILE,
    JSON.stringify(
      {
        preferences: state.preferences,
        nudges: state.nudges,
        notes: state.notes,
        registry: state.registry,
        releases: state.releases,
      },
      null,
      2,
    ),
  );
}

type PrefRow = {
  patient_id: string;
  max_travel_minutes: number;
  max_visits_per_month: number;
  accepts_placebo: boolean;
  driver: string;
  updated_at: string;
};

type NudgeRow = {
  id: string;
  kind: string;
  from_role: string;
  to_role: string;
  patient_id: string;
  nct_id: string | null;
  status: string;
  created_at: string;
  batch_id?: string | null;
  detail?: string | null;
  held?: boolean | null;
  change_key?: string | null;
};

type NoteRow = {
  physician_id: string;
  text: string;
  updated_at: string;
};

function fromPrefRow(row: PrefRow): LoopPreferenceT {
  return LoopPreference.parse({
    patientId: row.patient_id,
    maxTravelMinutes: row.max_travel_minutes,
    maxVisitsPerMonth: row.max_visits_per_month,
    acceptsPlacebo: row.accepts_placebo,
    driver: row.driver,
    updatedAt: row.updated_at,
  });
}

function toPrefRow(row: LoopPreferenceT): PrefRow {
  return {
    patient_id: row.patientId,
    max_travel_minutes: row.maxTravelMinutes,
    max_visits_per_month: row.maxVisitsPerMonth,
    accepts_placebo: row.acceptsPlacebo,
    driver: row.driver,
    updated_at: row.updatedAt,
  };
}

function fromNudgeRow(row: NudgeRow): LoopNudgeT {
  return LoopNudge.parse({
    id: row.id,
    kind: row.kind,
    fromRole: row.from_role,
    toRole: row.to_role,
    patientId: row.patient_id,
    nctId: row.nct_id,
    status: row.status,
    createdAt: row.created_at,
    batchId: row.batch_id ?? undefined,
    detail: row.detail ?? undefined,
    held: row.held ?? undefined,
    changeKey: row.change_key ?? undefined,
  });
}

function toNudgeRow(row: LoopNudgeT): NudgeRow {
  return {
    id: row.id,
    kind: row.kind,
    from_role: row.fromRole,
    to_role: row.toRole,
    patient_id: row.patientId,
    nct_id: row.nctId,
    status: row.status,
    created_at: row.createdAt,
    batch_id: row.batchId ?? null,
    detail: row.detail ?? null,
    held: row.held ?? false,
    change_key: row.changeKey ?? null,
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error("supabase env missing");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`supabase ${res.status} ${path}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function readSupabase(): Promise<LoopStateT> {
  const [prefs, nudges, notes] = await Promise.all([
    rest<PrefRow[]>("preferences?select=*&order=updated_at.asc"),
    rest<NudgeRow[]>("nudges?select=*&order=created_at.asc"),
    rest<NoteRow[]>("physician_notes?select=*"),
  ]);
  const file = readFile();
  return {
    backend: "supabase",
    preferences: prefs.map(fromPrefRow),
    nudges: nudges.map(fromNudgeRow),
    notes: notes.map((row) =>
      PhysicianNote.parse({
        physicianId: row.physician_id,
        text: row.text,
        updatedAt: row.updated_at,
      }),
    ),
    registry: file.registry,
    releases: file.releases,
  };
}

async function trySupabase<T>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.warn("supabase loop store unavailable, using .data/loop.json", error);
    return fallback();
  }
}

export async function loadLoop(): Promise<LoopStateT> {
  if (loopBackend() === "supabase") {
    return trySupabase(readSupabase, readFile);
  }
  return readFile();
}

export async function replacePreferences(rows: LoopPreferenceT[]): Promise<void> {
  if (loopBackend() === "supabase") {
    await trySupabase(
      async () => {
        await rest("preferences?patient_id=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } });
        if (rows.length) {
          await rest("preferences", { method: "POST", body: JSON.stringify(rows.map(toPrefRow)) });
        }
      },
      () => {
        writeFile({ ...readFile(), preferences: rows });
      },
    );
    return;
  }
  writeFile({ ...readFile(), preferences: rows });
}

function writePrefFile(row: LoopPreferenceT): LoopPreferenceT {
  const current = readFile();
  const preferences = current.preferences.filter((p) => p.patientId !== row.patientId).concat(row);
  writeFile({ ...current, preferences });
  return row;
}

export async function upsertPreference(row: LoopPreferenceT): Promise<LoopPreferenceT> {
  if (loopBackend() === "supabase") {
    return trySupabase(async () => {
      const saved = await rest<PrefRow[]>("preferences", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toPrefRow(row)),
      });
      return fromPrefRow(saved[0] ?? toPrefRow(row));
    }, () => writePrefFile(row));
  }
  return writePrefFile(row);
}

function writeNudgeFile(row: LoopNudgeT): LoopNudgeT {
  const current = readFile();
  writeFile({ ...current, nudges: [...current.nudges, row] });
  return row;
}

export async function insertNudge(row: LoopNudgeT): Promise<LoopNudgeT> {
  if (loopBackend() === "supabase") {
    return trySupabase(async () => {
      const saved = await rest<NudgeRow[]>("nudges", { method: "POST", body: JSON.stringify(toNudgeRow(row)) });
      return fromNudgeRow(saved[0] ?? toNudgeRow(row));
    }, () => writeNudgeFile(row));
  }
  return writeNudgeFile(row);
}

function patchNudgeFile(id: string, status: NudgeStatus): LoopNudgeT | undefined {
  const current = readFile();
  const nudges = current.nudges.map((n) => (n.id === id ? { ...n, status } : n));
  writeFile({ ...current, nudges });
  return nudges.find((n) => n.id === id);
}

export async function updateNudgeStatus(id: string, status: NudgeStatus): Promise<LoopNudgeT | undefined> {
  if (loopBackend() === "supabase") {
    return trySupabase(async () => {
      const saved = await rest<NudgeRow[]>(`nudges?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return saved[0] ? fromNudgeRow(saved[0]) : undefined;
    }, () => patchNudgeFile(id, status));
  }
  return patchNudgeFile(id, status);
}

export async function markNudges(
  patientId: string,
  kind: NudgeKind,
  status: NudgeStatus,
): Promise<void> {
  const state = await loadLoop();
  const hits = state.nudges.filter((n) => n.patientId === patientId && n.kind === kind && n.status !== "done");
  for (const hit of hits) await updateNudgeStatus(hit.id, status);
}

export async function clearLoop(): Promise<void> {
  const keep = (await loadLoop()).notes;
  const wiped = { ...empty(), notes: keep };
  if (loopBackend() === "supabase") {
    await trySupabase(async () => {
      await Promise.all([
        rest("preferences?patient_id=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } }),
        rest("nudges?id=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } }),
      ]);
      const file = readFile();
      writeFile({ ...file, registry: [], releases: [] });
    }, () => writeFile(wiped));
    return;
  }
  writeFile(wiped);
}

export async function saveRegistry(registry: RegistrySnapshotT[], nudges: LoopNudgeT[]): Promise<void> {
  const current = await loadLoop();
  const next: LoopStateT = { ...current, registry, nudges: [...current.nudges, ...nudges] };
  if (loopBackend() === "supabase") {
    await trySupabase(
      async () => {
        if (nudges.length) {
          await rest("nudges", { method: "POST", body: JSON.stringify(nudges.map(toNudgeRow)) });
        }
        const file = readFile();
        writeFile({ ...file, registry });
      },
      () => writeFile(next),
    );
    return;
  }
  writeFile(next);
}

export async function setNudgeHeld(id: string, held: boolean): Promise<void> {
  const apply = () => {
    const current = readFile();
    writeFile({
      ...current,
      nudges: current.nudges.map((row) => (row.id === id ? { ...row, held } : row)),
    });
  };
  if (loopBackend() === "supabase") {
    await trySupabase(async () => {
      await rest(`nudges?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ held }),
      });
    }, apply);
    return;
  }
  apply();
}

export async function saveReleases(releases: ReleaseSettingT[]): Promise<void> {
  const current = readFile();
  writeFile({ ...current, releases });
}

export function preferenceFromAnswers(patientId: string, answers: PortalAnswers, at: string): LoopPreferenceT {
  return LoopPreference.parse({
    patientId,
    maxTravelMinutes: answers.maxTravelMinutes,
    maxVisitsPerMonth: answers.maxExtraVisitsPerMonth,
    acceptsPlacebo: answers.acceptsPlacebo,
    driver: answers.driver,
    updatedAt: at,
  });
}

export function newNudge(input: {
  kind: NudgeKind;
  fromRole: LoopRole;
  toRole: LoopRole;
  patientId: string;
  nctId?: string | null;
  batchId?: string;
}): LoopNudgeT {
  return LoopNudge.parse({
    id: crypto.randomUUID(),
    kind: input.kind,
    fromRole: input.fromRole,
    toRole: input.toRole,
    patientId: input.patientId,
    nctId: input.nctId ?? null,
    status: "pending",
    createdAt: new Date().toISOString(),
    batchId: input.batchId,
  });
}

function writeNoteFile(row: PhysicianNoteT): PhysicianNoteT {
  const current = readFile();
  const notes = current.notes.filter((n) => n.physicianId !== row.physicianId).concat(row);
  writeFile({ ...current, notes });
  return row;
}

export async function upsertNote(row: PhysicianNoteT): Promise<PhysicianNoteT> {
  if (loopBackend() === "supabase") {
    return trySupabase(async () => {
      const saved = await rest<NoteRow[]>("physician_notes", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          physician_id: row.physicianId,
          text: row.text,
          updated_at: row.updatedAt,
        }),
      });
      const one = saved[0];
      return one
        ? PhysicianNote.parse({ physicianId: one.physician_id, text: one.text, updatedAt: one.updated_at })
        : row;
    }, () => writeNoteFile(row));
  }
  return writeNoteFile(row);
}

export function parseLoopState(json: unknown): LoopStateT {
  const parsed = LoopState.safeParse(json);
  return parsed.success ? { ...parsed.data, backend: loopBackend() } : empty();
}
