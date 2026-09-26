import type { PortalAnswers } from "@/app/_data/schema";
import { PortalAnswers as PortalSchema } from "@/app/_data/schema";

export const PORTAL_STORAGE_KEY = "amber.portal.v1";

export type PortalStore = Record<string, PortalAnswers>;

export function parsePortalStore(raw: string | null): PortalStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PortalStore = {};
    for (const [id, value] of Object.entries(parsed)) {
      const one = PortalSchema.safeParse(value);
      if (one.success && id) out[id] = one.data;
    }
    return out;
  } catch {
    return {};
  }
}

export function readPortalStore(): PortalStore {
  if (typeof localStorage === "undefined") return {};
  try {
    return parsePortalStore(localStorage.getItem(PORTAL_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writePortalAnswers(patientId: string, answers: PortalAnswers): PortalStore {
  const next = { ...readPortalStore(), [patientId]: answers };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function readPortalAnswers(patientId: string): PortalAnswers | undefined {
  return readPortalStore()[patientId];
}
