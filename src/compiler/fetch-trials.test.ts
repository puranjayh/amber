import assert from "node:assert/strict";
import test from "node:test";
import { fetchRecruitingLungCancerTrials } from "@/src/compiler/fetch-trials";

test("fetchRecruitingLungCancerTrials follows page tokens and keeps interventional studies", async () => {
  const requested: string[] = [];
  const pages = [
    {
      studies: [
        { protocolSection: { identificationModule: { nctId: "NCT00000001", briefTitle: "One" }, designModule: { studyType: "INTERVENTIONAL" } } },
        { protocolSection: { identificationModule: { nctId: "NCT00000002", briefTitle: "Two" }, designModule: { studyType: "OBSERVATIONAL" } } },
      ],
      nextPageToken: "next",
    },
    {
      studies: [
        { protocolSection: { identificationModule: { nctId: "NCT00000003", briefTitle: "Three" }, designModule: { studyType: "INTERVENTIONAL" } } },
      ],
    },
  ];
  const fetchImpl = (async (input: string | URL) => {
    requested.push(String(input));
    return new Response(JSON.stringify(pages.shift()), { status: 200 });
  }) as typeof fetch;

  const trials = await fetchRecruitingLungCancerTrials({ limit: 2, fetchImpl });
  assert.deepEqual(trials.map((trial) => trial.protocolSection.identificationModule.nctId), ["NCT00000001", "NCT00000003"]);
  assert.match(requested[0], /filter\.advanced=AREA%5BStudyType%5DINTERVENTIONAL/);
  assert.match(requested[1], /pageToken=next/);
});
