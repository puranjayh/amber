/**
 * ClinicalTrials.gov v2 ingestion for the offline compiler pipeline.
 *
 * This module deliberately only fetches and caches protocol records. It never
 * evaluates a patient or makes an eligibility decision.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const CTGOV_STUDIES_URL = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;

export const RawClinicalTrial = z.object({
  protocolSection: z.object({
    identificationModule: z.object({
      nctId: z.string().regex(/^NCT\d{8}$/),
      briefTitle: z.string(),
    }),
    designModule: z.object({
      studyType: z.string(),
      phases: z.array(z.string()).optional(),
    }),
    conditionsModule: z.object({
      conditions: z.array(z.string()).optional(),
    }).optional(),
    eligibilityModule: z.object({
      eligibilityCriteria: z.string().min(1).optional(),
    }).optional(),
  }),
});

export type RawClinicalTrial = z.infer<typeof RawClinicalTrial>;

const ClinicalTrialsPage = z.object({
  studies: z.array(RawClinicalTrial),
  nextPageToken: z.string().optional(),
  totalCount: z.number().int().nonnegative().optional(),
});

export type FetchLike = typeof fetch;

export interface FetchTrialsOptions {
  /** Maximum records retained; 300 is the demo-pool target in the contract. */
  limit?: number;
  fetchImpl?: FetchLike;
}

/**
 * Fetch recruiting, interventional lung-cancer studies, following every page
 * token until `limit` eligible records are collected. The API response is
 * validated before it crosses into the pipeline.
 */
export async function fetchRecruitingLungCancerTrials({
  limit = 300,
  fetchImpl = fetch,
}: FetchTrialsOptions = {}): Promise<RawClinicalTrial[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const studies: RawClinicalTrial[] = [];
  let pageToken: string | undefined;

  while (studies.length < limit) {
    const params = new URLSearchParams({
      "query.cond": "Lung Cancer",
      "filter.overallStatus": "RECRUITING|NOT_YET_RECRUITING|ENROLLING_BY_INVITATION|ACTIVE_NOT_RECRUITING",
      // CT.gov's advanced filter syntax keeps the pool interventional.
      "filter.advanced": "AREA[StudyType]INTERVENTIONAL",
      pageSize: String(Math.min(PAGE_SIZE, limit - studies.length)),
      format: "json",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetchImpl(`${CTGOV_STUDIES_URL}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov returned ${response.status} ${response.statusText}`);
    }

    const page = ClinicalTrialsPage.parse(await response.json());
    for (const study of page.studies) {
      // The server-side filter is authoritative, but retain the guard against
      // a malformed or changed response before any cache is created.
      if (study.protocolSection.designModule.studyType === "INTERVENTIONAL") {
        studies.push(study);
      }
      if (studies.length === limit) break;
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  return studies;
}

export async function cacheRawTrials(
  trials: RawClinicalTrial[],
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(trials, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const outFlag = process.argv.indexOf("--out");
  const limitFlag = process.argv.indexOf("--limit");
  const outputPath = outFlag >= 0 && process.argv[outFlag + 1]
    ? resolve(process.argv[outFlag + 1])
    : resolve(process.cwd(), "data/raw/clinicaltrials-lung-cancer-recruiting.json");
  const limit = limitFlag >= 0 && process.argv[limitFlag + 1]
    ? Number(process.argv[limitFlag + 1])
    : 300;

  const trials = await fetchRecruitingLungCancerTrials({ limit });
  await cacheRawTrials(trials, outputPath);
  console.log(`Fetched and cached ${trials.length} studies at ${outputPath}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
