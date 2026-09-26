import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compiler envelopes keep the eligibility source text. Objectives, visit
 * schedules, and compensation are not on the Trial object — this is the only
 * place a letter can quote them, and only when the text actually says so.
 */
let cache: Map<string, string> | null = null;

export function protocolSource(nctId: string): string | undefined {
  if (!cache) {
    cache = new Map();
    const path = join(process.cwd(), "data/compiled/trials.json");
    if (!existsSync(path)) return undefined;
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) return undefined;
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const envelope = row as { trial?: { nctId?: string }; nctId?: string; sourceText?: unknown };
      const id = envelope.trial?.nctId ?? envelope.nctId;
      if (id && typeof envelope.sourceText === "string") cache.set(id, envelope.sourceText);
    }
  }
  return cache.get(nctId);
}
