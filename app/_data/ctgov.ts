import { RegistryStudy, type RegistryStudy as RegistryStudyT } from "@/app/_data/schema";

const STUDY = /^NCT\d{8}$/;

/** Live ClinicalTrials.gov record. Throws on transport failure; returns undefined if the body has no status. */
export async function fetchStudy(nctId: string): Promise<RegistryStudyT | undefined> {
  if (!STUDY.test(nctId)) return undefined;
  const url = `https://clinicaltrials.gov/api/v2/studies/${nctId}?fields=NCTId,OverallStatus,LastUpdatePostDate,PrimaryCompletionDate,EnrollmentCount,LocationFacility,LocationCity,LocationState,LocationCountry,LocationGeoPoint`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`clinicaltrials.gov ${res.status} ${nctId}`);
  return parseStudy(nctId, await res.json());
}

export function parseStudy(nctId: string, json: unknown): RegistryStudyT | undefined {
  if (!json || typeof json !== "object") return undefined;
  const root = json as { protocolSection?: unknown; studies?: { protocolSection?: unknown }[] };
  const protocol = root.protocolSection ?? root.studies?.[0]?.protocolSection;
  if (!protocol || typeof protocol !== "object") return undefined;
  const section = protocol as {
    statusModule?: {
      overallStatus?: unknown;
      lastUpdatePostDateStruct?: { date?: unknown };
      primaryCompletionDateStruct?: { date?: unknown };
    };
    designModule?: { enrollmentInfo?: { count?: unknown } };
    contactsLocationsModule?: { locations?: unknown };
  };
  const status = section.statusModule?.overallStatus;
  if (typeof status !== "string" || !status) return undefined;
  const enrollment = section.designModule?.enrollmentInfo?.count;
  const enrollmentCount = typeof enrollment === "number" && Number.isInteger(enrollment) ? enrollment : undefined;
  const last = section.statusModule?.lastUpdatePostDateStruct?.date;
  const completion = section.statusModule?.primaryCompletionDateStruct?.date;
  const locations = Array.isArray(section.contactsLocationsModule?.locations)
    ? section.contactsLocationsModule.locations
    : [];
  const sites = locations.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const loc = row as {
      facility?: unknown;
      city?: unknown;
      state?: unknown;
      country?: unknown;
      geoPoint?: { lat?: unknown; lon?: unknown };
    };
    const facility = typeof loc.facility === "string" ? loc.facility : "";
    const city = typeof loc.city === "string" ? loc.city : "";
    if (!facility && !city) return [];
    const lat = typeof loc.geoPoint?.lat === "number" ? loc.geoPoint.lat : undefined;
    const lon = typeof loc.geoPoint?.lon === "number" ? loc.geoPoint.lon : undefined;
    return [
      {
        facility: facility || city,
        city: city || facility,
        state: typeof loc.state === "string" ? loc.state : undefined,
        country: typeof loc.country === "string" ? loc.country : undefined,
        lat,
        lon,
      },
    ];
  });
  const parsed = RegistryStudy.safeParse({
    nctId,
    overallStatus: status,
    enrollmentCount,
    lastUpdatePostDate: typeof last === "string" ? last : null,
    primaryCompletionDate: typeof completion === "string" ? completion : null,
    sites,
  });
  return parsed.success ? parsed.data : undefined;
}
