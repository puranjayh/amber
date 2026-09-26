import { describe, expect, it } from "vitest";
import {
  complementarySuppression,
  federate,
  isSuppressed,
  suppress,
  type SiteCohort,
} from "./federated";
import { fact, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

const ancFloor = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  tier: 1,
  sweepable: true,
  sweepRange: [1000, 2000],
  sweepStep: 500,
  sourceSpan: "ANC >= 1500/uL",
});

const T = trial({ nctId: "NCT00000001", criteria: [ancFloor] });

/** `n` patients whose ANC is `value`, so eligibility counts are exact. */
const cohort = (prefix: string, n: number, value: number, race = "White") =>
  Array.from({ length: n }, (_, i) =>
    patient({
      id: `${prefix}-${i}`,
      age: 60,
      race,
      facts: [
        fact({
          predicate: "lab_value",
          analyte: "ANC",
          value,
          unit: "/uL",
          observedAt: "2026-09-20",
          sourceQuote: `ANC ${value}/uL`,
        }),
      ],
    }),
  );

const site = (siteId: string, patients: ReturnType<typeof cohort>): SiteCohort => ({
  siteId,
  patients,
});

describe("suppress", () => {
  it("withholds anything between 1 and the threshold", () => {
    for (let n = 1; n <= 10; n++) expect(suppress(n)).toBe("<11");
  });

  it("publishes the threshold itself and above", () => {
    expect(suppress(11)).toBe(11);
    expect(suppress(4000)).toBe(4000);
  });

  it("publishes zero, which reveals nobody", () => {
    expect(suppress(0)).toBe(0);
  });

  it("carries the threshold in the marker so it cannot be misread", () => {
    expect(suppress(3, 20)).toBe("<20");
    expect(suppress(25, 20)).toBe(25);
  });

  it("narrows for a caller rendering a table", () => {
    expect(isSuppressed(suppress(3))).toBe(true);
    expect(isSuppressed(suppress(300))).toBe(false);
  });
});

describe("complementarySuppression", () => {
  it("hides nothing when every part is large", () => {
    expect(complementarySuppression([50, 60, 70])).toEqual({ hide: new Set(), hideTotal: false });
  });

  it("drags in the next smallest part so a hidden cell cannot be subtracted out", () => {
    // 5 alone would be recoverable as total - 60 - 70.
    const { hide, hideTotal } = complementarySuppression([5, 60, 70]);
    expect(hide).toEqual(new Set([0, 1])); // 60 is the smallest published
    expect(hideTotal).toBe(false);
  });

  it("does not drag in anything when two parts are already hidden", () => {
    const { hide } = complementarySuppression([5, 6, 70]);
    expect(hide).toEqual(new Set([0, 1]));
  });

  it("withholds the total when there is nothing to pair a hidden cell with", () => {
    expect(complementarySuppression([5])).toEqual({ hide: new Set([0]), hideTotal: true });
    expect(complementarySuppression([5, 0, 0])).toEqual({
      hide: new Set([0]),
      hideTotal: true,
    });
  });

  it("does not count a zero as cover — it reveals nobody and hides nobody", () => {
    const { hide, hideTotal } = complementarySuppression([0, 5, 90]);
    expect(hide).toEqual(new Set([1, 2]));
    expect(hideTotal).toBe(false);
  });

  it("leaves the published parts genuinely un-recoverable", () => {
    const parts = [5, 60, 70];
    const { hide } = complementarySuppression(parts);
    const total = parts.reduce((a, b) => a + b, 0);
    const published = parts.filter((_, i) => !hide.has(i)).reduce((a, b) => a + b, 0);
    const hiddenSum = total - published;
    // More than one value is hidden, so the residual does not pin any single one.
    expect(hide.size).toBeGreaterThan(1);
    expect(hiddenSum).toBeGreaterThan(Math.max(...[...hide].map((i) => parts[i])));
  });
});

describe("federate — counts", () => {
  it("reports screened, eligible and eliminated per site", () => {
    const sites = [
      site("SITE-A", [...cohort("A-hi", 30, 3000), ...cohort("A-lo", 20, 900)]),
      site("SITE-B", [...cohort("B-hi", 40, 3000), ...cohort("B-lo", 15, 900)]),
    ];
    const report = federate(sites, [T], ASOF);
    expect(report.trials[0].bySite).toEqual([
      { siteId: "SITE-A", counts: { screened: 50, eligible: 30, eliminated: 20 } },
      { siteId: "SITE-B", counts: { screened: 55, eligible: 40, eliminated: 15 } },
    ]);
  });

  it("pools across sites", () => {
    const sites = [
      site("SITE-A", [...cohort("A-hi", 30, 3000), ...cohort("A-lo", 20, 900)]),
      site("SITE-B", [...cohort("B-hi", 40, 3000), ...cohort("B-lo", 15, 900)]),
    ];
    expect(federate(sites, [T], ASOF).trials[0].pooled).toEqual({
      screened: 105,
      eligible: 70,
      eliminated: 35,
    });
  });

  it("echoes asOf, the threshold and the site list, so a report is self-describing", () => {
    const report = federate([site("SITE-A", cohort("A", 30, 3000))], [T], ASOF);
    expect(report).toMatchObject({ asOf: ASOF, minCellSize: 11, siteIds: ["SITE-A"] });
    expect(report.disclosureNotice).toMatch(/not differential privacy/);
  });

  it("is deterministic and does not mutate the cohorts", () => {
    const sites = [site("SITE-A", cohort("A", 30, 3000))];
    const before = JSON.stringify(sites);
    expect(federate(sites, [T], ASOF)).toEqual(federate(sites, [T], ASOF));
    expect(JSON.stringify(sites)).toBe(before);
  });

  it("is empty-input safe", () => {
    expect(federate([], [], ASOF).trials).toEqual([]);
    expect(federate([site("SITE-A", [])], [T], ASOF).trials[0].pooled).toEqual({
      screened: 0,
      eligible: 0,
      eliminated: 0,
    });
  });
});

describe("federate — suppression in practice", () => {
  it("withholds a small eliminated count, and its partner, so neither is recoverable", () => {
    // 100 screened at each of two sites; site A eliminates 5, site B eliminates 4.
    const sites = [
      site("SITE-A", [...cohort("A-hi", 95, 3000), ...cohort("A-lo", 5, 900)]),
      site("SITE-B", [...cohort("B-hi", 96, 3000), ...cohort("B-lo", 4, 900)]),
    ];
    const report = federate(sites, [T], ASOF);
    for (const row of report.trials[0].bySite) {
      expect(row.counts.screened).toBe(100); // safe on its own
      expect(row.counts.eliminated).toBe("<11");
      // Published eligible would give eliminated away by subtraction.
      expect(row.counts.eligible).toBe("<11");
    }
  });

  it("withholds the pooled total when only one site's cell is small", () => {
    // Site A eliminates 5; site B eliminates 40. Publishing pooled 45 and
    // site B's 40 would pin site A at 5.
    const sites = [
      site("SITE-A", [...cohort("A-hi", 95, 3000), ...cohort("A-lo", 5, 900)]),
      site("SITE-B", [...cohort("B-hi", 60, 3000), ...cohort("B-lo", 40, 900)]),
    ];
    const report = federate(sites, [T], ASOF);
    const [a, b] = report.trials[0].bySite;
    expect(a.counts.eliminated).toBe("<11");
    // Either site B is dragged in, or the pooled total goes. Both close the gap;
    // assert the gap is closed rather than which way it was done.
    const pooledHidden = isSuppressed(report.trials[0].pooled.eliminated);
    const siblingHidden = isSuppressed(b.counts.eliminated);
    expect(pooledHidden || siblingHidden).toBe(true);
  });

  it("withholds the pooled total for a lone site, where there is no sibling to pair with", () => {
    const sites = [site("SITE-A", [...cohort("A-hi", 95, 3000), ...cohort("A-lo", 5, 900)])];
    const report = federate(sites, [T], ASOF);
    expect(report.trials[0].bySite[0].counts.eliminated).toBe("<11");
    expect(report.trials[0].pooled.eliminated).toBe("<11");
    expect(report.trials[0].pooled.eligible).toBe("<11");
  });

  it("withholds a whole tiny site rather than describing it", () => {
    const sites = [
      site("SITE-TINY", cohort("T", 3, 3000)),
      site("SITE-BIG", cohort("B", 500, 3000)),
    ];
    const counts = federate(sites, [T], ASOF).trials[0].bySite[0].counts;
    expect(counts.screened).toBe("<11");
    expect(counts.eligible).toBe("<11");
  });

  it("never publishes a number below the threshold anywhere in the report", () => {
    const sites = [
      site("SITE-A", [...cohort("A-hi", 7, 3000), ...cohort("A-lo", 5, 900)]),
      site("SITE-B", [...cohort("B-hi", 40, 3000), ...cohort("B-lo", 3, 900)]),
      site("SITE-C", cohort("C", 200, 3000)),
    ];
    const report = federate(sites, [T], ASOF);
    const numbers: number[] = [];
    JSON.stringify(report, (k, v) => {
      if (typeof v === "number" && k !== "threshold" && k !== "minCellSize") numbers.push(v);
      return v;
    });
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) expect(n === 0 || n >= 11).toBe(true);
  });

  it("honours a different threshold end to end", () => {
    const sites = [site("SITE-A", [...cohort("A-hi", 100, 3000), ...cohort("A-lo", 15, 900)])];
    const report = federate(sites, [T], ASOF, { minCellSize: 20 });
    expect(report.minCellSize).toBe(20);
    expect(report.trials[0].bySite[0].counts.eliminated).toBe("<20");
    expect(report.trials[0].bySite[0].counts.screened).toBe(115);
  });
});

describe("federate — curves", () => {
  const sites = [
    site("SITE-A", [
      ...cohort("A-hi", 40, 3000, "White"),
      ...cohort("A-mid", 30, 1600, "Black or African American"),
      ...cohort("A-lo", 20, 1100, "Black or African American"),
    ]),
    site("SITE-B", [...cohort("B-hi", 60, 3000, "White"), ...cohort("B-lo", 25, 1100, "White")]),
  ];

  it("emits one curve per site per sweepable criterion, never a pooled one", () => {
    const report = federate(sites, [T], ASOF);
    expect(report.curves.map((c) => `${c.siteId}/${c.criterionId}`)).toEqual([
      "SITE-A/INC-anc",
      "SITE-B/INC-anc",
    ]);
  });

  it("carries the trial's own words on every curve", () => {
    for (const c of federate(sites, [T], ASOF).curves) {
      expect(c.label).toBe("ANC >= 1500/uL");
    }
  });

  it("shows the same threshold costing the two sites different amounts", () => {
    const report = federate(sites, [T], ASOF);
    const a = report.curves.find((c) => c.siteId === "SITE-A")!;
    const b = report.curves.find((c) => c.siteId === "SITE-B")!;
    // Thresholds 1000 / 1500 / 2000.
    expect(a.points.map((p) => p.eligibleCount)).toEqual([90, 70, 40]);
    expect(b.points.map((p) => p.eligibleCount)).toEqual([85, 60, 60]);
  });

  it("breaks each point down by subgroup", () => {
    const a = federate(sites, [T], ASOF).curves.find((c) => c.siteId === "SITE-A")!;
    expect(a.points[1].bySubgroup).toEqual({
      "Black or African American": 30,
      White: 40,
    });
  });

  it("suppresses a small subgroup and its partner within a point", () => {
    const small = [
      site("SITE-A", [
        ...cohort("A-hi", 40, 3000, "White"),
        ...cohort("A-few", 4, 3000, "Asian"),
      ]),
    ];
    const point = federate(small, [T], ASOF).curves[0].points[0];
    expect(point.bySubgroup.Asian).toBe("<11");
    expect(point.bySubgroup.White).toBe("<11"); // else Asian = eligible - White
  });

  it("suppresses excludedByThisAlone when it is small", () => {
    const sparse = [
      site("SITE-A", [...cohort("A-hi", 40, 3000, "White"), ...cohort("A-lo", 3, 1100, "White")]),
    ];
    const points = federate(sparse, [T], ASOF).curves[0].points;
    expect(points[1].excludedByThisAlone).toBe("<11");
  });

  it("restricts the curves when asked", () => {
    const second = { ...ancFloor, id: "INC-plt", analyte: "platelets", sourceSpan: "Platelets" };
    const two = trial({ nctId: "NCT00000001", criteria: [ancFloor, second] });
    const report = federate(sites, [two], ASOF, {
      criterionIds: { NCT00000001: ["INC-plt"] },
    });
    expect(new Set(report.curves.map((c) => c.criterionId))).toEqual(new Set(["INC-plt"]));
  });

  it("refuses an unknown criterion id rather than emitting nothing", () => {
    expect(() =>
      federate(sites, [T], ASOF, { criterionIds: { NCT00000001: ["INC-nope"] } }),
    ).toThrow(/no criterion INC-nope/);
  });

  it("emits no curve for a criterion the compiler did not mark sweepable", () => {
    const notSweepable = trial({
      nctId: "NCT00000002",
      criteria: [{ ...ancFloor, sweepable: false }],
    });
    expect(federate(sites, [notSweepable], ASOF).curves).toEqual([]);
  });
});

describe("nothing record-level crosses the wire", () => {
  const sites = [
    site("SITE-A", [...cohort("A-hi", 40, 3000, "White"), ...cohort("A-lo", 12, 900, "Asian")]),
    site("SITE-B", cohort("B", 30, 3000, "White")),
  ];

  it("contains no patient id", () => {
    const report = JSON.stringify(federate(sites, [T], ASOF));
    for (const s of sites) {
      for (const p of s.patients) expect(report).not.toContain(p.id);
    }
  });

  it("contains no chart quote, source document or observation date", () => {
    const report = JSON.stringify(federate(sites, [T], ASOF));
    for (const s of sites) {
      for (const p of s.patients) {
        for (const f of p.facts) {
          expect(report).not.toContain(f.sourceQuote);
          expect(report).not.toContain(f.sourceDoc);
          expect(report).not.toContain(f.observedAt);
        }
      }
    }
  });

  it("carries no cells, verdicts or reasons — only counts", () => {
    const report = federate(sites, [T], ASOF);
    const text = JSON.stringify(report);
    for (const k of ["cells", "verdict", "reason", "chartCitation", "facts", "patientId"]) {
      expect(text).not.toContain(k);
    }
  });

  it("keeps the protocol citation, which is public text", () => {
    expect(JSON.stringify(federate(sites, [T], ASOF))).toContain("ANC >= 1500/uL");
  });
});
