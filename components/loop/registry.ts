import type { LoopNudge, LoopState, RegistrySite, RegistryStudy } from "@/app/_data/schema";

export type Audience = "patient" | "physician" | "coordinator";

export type RegistryChange = {
  changeKey: string;
  detail: string;
};

const STATUS_SENTENCE: Record<string, string> = {
  ACTIVE_NOT_RECRUITING: "That status means the study is closed to new patients.",
  RECRUITING: "That status means the study is open to new patients.",
  COMPLETED: "That status means the study has finished.",
  SUSPENDED: "That status means the study is paused.",
  TERMINATED: "That status means the study stopped early.",
  WITHDRAWN: "That status means the study was withdrawn before enrollment.",
  ENROLLING_BY_INVITATION: "That status means the study enrolls only by invitation.",
  NOT_YET_RECRUITING: "That status means the study is not open yet.",
};

/** Statuses worth telling a referring physician about the first time we see them. */
const NOTABLE_ON_FIRST_SIGHT = new Set([
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "SUSPENDED",
  "TERMINATED",
  "WITHDRAWN",
  "ENROLLING_BY_INVITATION",
  "NOT_YET_RECRUITING",
]);

export function statusSentence(status: string): string {
  return STATUS_SENTENCE[status] ?? "The registry does not define that status further.";
}

export function patientUpdateCopy(doctorTalk: string): string {
  return `There's an update on the trial you discussed with ${doctorTalk}. Book a follow-up to hear more.`;
}

export function followUpsPrompted(nudges: readonly LoopNudge[], patientIds: ReadonlySet<string>): number {
  return nudges.filter(
    (nudge) => nudge.kind === "trial_update" && patientIds.has(nudge.patientId) && nudge.held !== true,
  ).length;
}

export type UpdateCard = {
  key: string;
  nctId: string;
  detail: string;
  when: string;
  patients: { id: string; patientId: string; held: boolean }[];
};

export function updateCards(nudges: readonly LoopNudge[], patientIds: ReadonlySet<string>): UpdateCard[] {
  const mine = nudges.filter(
    (nudge) => nudge.kind === "trial_update" && patientIds.has(nudge.patientId) && nudge.status !== "done",
  );
  const groups = new Map<string, UpdateCard>();
  for (const nudge of mine) {
    const key = nudge.changeKey ?? nudge.id;
    const card = groups.get(key) ?? {
      key,
      nctId: nudge.nctId ?? "",
      detail: nudge.detail ?? "A registry change was recorded, but the description was not stored.",
      when: nudge.createdAt,
      patients: [],
    };
    card.patients.push({ id: nudge.id, patientId: nudge.patientId, held: nudge.held === true });
    groups.set(key, card);
  }
  return [...groups.values()];
}

export type PropagationLine = {
  key: string;
  nctId: string;
  detail: string;
  prompted: number;
  waiting: number;
};

/** Trial-level view. The text never includes a patient id. */
export function propagationLines(nudges: readonly LoopNudge[]): PropagationLine[] {
  const rows = nudges.filter((nudge) => nudge.kind === "trial_update" && nudge.status !== "done");
  const groups = new Map<string, PropagationLine>();
  for (const nudge of rows) {
    const key = `${nudge.nctId ?? ""}:${nudge.changeKey ?? nudge.detail ?? nudge.id}`;
    const line = groups.get(key) ?? {
      key,
      nctId: nudge.nctId ?? "",
      detail: nudge.detail ?? "A registry update is with the treating physician.",
      prompted: 0,
      waiting: 0,
    };
    if (nudge.held === true) line.waiting += 1;
    else line.prompted += 1;
    groups.set(key, line);
  }
  return [...groups.values()];
}

export function parseAudience(value: string | null): Audience {
  if (value === "patient" || value === "physician" || value === "coordinator") return value;
  return "patient";
}

export function forAudience(state: LoopState, audience: Audience): LoopState {
  if (audience === "physician") return state;
  const nudges =
    audience === "patient"
      ? state.nudges.map((nudge) =>
          nudge.kind === "trial_update" ? { ...nudge, detail: undefined, changeKey: undefined, nctId: null } : nudge,
        )
      : state.nudges;
  return { ...state, registry: [], nudges };
}

export function diffRegistry(
  prev: RegistryStudy | undefined,
  next: RegistryStudy,
  origin?: { lat: number; lon: number },
): RegistryChange[] {
  if (!prev) {
    if (!NOTABLE_ON_FIRST_SIGHT.has(next.overallStatus)) return [];
    const when = next.lastUpdatePostDate ?? "an unknown date";
    const completion = next.primaryCompletionDate
      ? ` Primary completion date listed: ${next.primaryCompletionDate}.`
      : "";
    const sites =
      next.sites.length === 1
        ? " The registry lists 1 site."
        : next.sites.length > 1
          ? ` The registry lists ${next.sites.length} sites.`
          : "";
    return [
      {
        changeKey: `status:${next.overallStatus}@${next.lastUpdatePostDate ?? "undated"}`,
        detail: `ClinicalTrials.gov lists this study as ${next.overallStatus}, last updated ${when}. ${statusSentence(next.overallStatus)}${completion}${sites}`,
      },
    ];
  }

  const changes: RegistryChange[] = [];
  if (prev.overallStatus !== next.overallStatus) {
    const when = next.lastUpdatePostDate ?? "an unknown date";
    changes.push({
      changeKey: `status:${prev.overallStatus}->${next.overallStatus}@${next.lastUpdatePostDate ?? "undated"}`,
      detail: `Status on ClinicalTrials.gov moved from ${prev.overallStatus} to ${next.overallStatus}, last updated ${when}. ${statusSentence(next.overallStatus)}`,
    });
  }
  if (
    prev.primaryCompletionDate &&
    next.primaryCompletionDate &&
    prev.primaryCompletionDate !== next.primaryCompletionDate
  ) {
    changes.push({
      changeKey: `completion:${prev.primaryCompletionDate}->${next.primaryCompletionDate}`,
      detail: `Primary completion date moved from ${prev.primaryCompletionDate} to ${next.primaryCompletionDate}.`,
    });
  }
  const seen = new Set(prev.sites.map(siteKey));
  for (const site of next.sites) {
    if (seen.has(siteKey(site))) continue;
    changes.push({
      changeKey: `site:${siteKey(site)}`,
      detail: siteSentence(prev.sites, site, origin),
    });
  }
  return changes;
}

function siteKey(site: RegistrySite): string {
  return `${site.facility}|${site.city}|${site.state ?? ""}`.toLowerCase();
}

function siteSentence(previous: readonly RegistrySite[], site: RegistrySite, origin?: { lat: number; lon: number }): string {
  const place = [site.facility, site.city, site.state].filter(Boolean).join(", ");
  if (origin && site.lat !== undefined && site.lon !== undefined) {
    const km = haversineKm(origin, { lat: site.lat, lon: site.lon });
    const prior = previous
      .filter((row) => row.lat !== undefined && row.lon !== undefined)
      .map((row) => haversineKm(origin, { lat: row.lat!, lon: row.lon! }));
    const closest = prior.length ? Math.min(...prior) : undefined;
    if (closest !== undefined && km + 0.5 < closest) {
      return `A new site is listed: ${place}. It is about ${Math.round(km)} km away, nearer than the previous closest site (${Math.round(closest)} km).`;
    }
  }
  return `A new site is listed: ${place}.`;
}

export function statusLine(status: string): string {
  const meaning = statusSentence(status)
    .replace(/^That status means the study is /i, "")
    .replace(/^That status means the study /i, "")
    .replace(/\.$/, "");
  return `${status} — ${meaning}`;
}

export function nearestSite(
  sites: readonly RegistrySite[],
  origin: { lat: number; lon: number },
): { site: RegistrySite; km: number } | undefined {
  let best: { site: RegistrySite; km: number } | undefined;
  for (const site of sites) {
    if (site.lat === undefined || site.lon === undefined) continue;
    const km = haversineKm(origin, { lat: site.lat, lon: site.lon });
    if (!best || km < best.km) best = { site, km };
  }
  return best;
}

/** Rough drive at 50 mph. Under three hours stays a distance; past that, the hours matter. */
export function distancePhrase(km: number): string {
  const miles = Math.max(1, Math.round(km * 0.621371));
  const hours = Math.round(miles / 50);
  const mileWord = miles === 1 ? "mile" : "miles";
  if (hours >= 3) return `about ${miles} ${mileWord}, roughly ${hours} hours`;
  return `about ${miles} ${mileWord}`;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
