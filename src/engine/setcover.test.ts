import { describe, expect, it } from "vitest";
import { TIER_WEIGHT } from "@/src/contracts";
import { orderKey, planTestOrders } from "./setcover";
import { fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/** Tier 0 — reflex NGS on tissue already in the building. Weight 1. */
const egfr = leaf({
  id: "INC-egfr",
  predicate: "biomarker",
  analyte: "EGFR",
  operator: "==",
  value: "L858R",
  tier: 0,
  pFavorable: 0.4,
  sourceSpan: "EGFR L858R by validated assay",
});

/** Tier 1 — a blood draw. Weight 2. */
const anc = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  tier: 1,
  pFavorable: 0.9,
  sourceSpan: "ANC >= 1500/uL",
});

/** Tier 2 — imaging. Weight 6. */
const measurable = leaf({
  id: "INC-recist",
  predicate: "staging",
  operator: "==",
  value: "measurable",
  tier: 2,
  pFavorable: 0.8,
  sourceSpan: "At least one RECIST-measurable lesion",
});

/** Tier 4 — a washout. Not for sale at any price. */
const washout = leaf({
  id: "INC-washout",
  predicate: "washout",
  operator: ">=",
  value: 21,
  unit: "days",
  tier: 4,
  sourceSpan: "At least 21 days since the last dose",
});

const adult = leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18, sourceSpan: "Age >= 18" });

const silent = (id: string) => patient({ id, age: 60 });

describe("orderKey", () => {
  it("is shared by two criteria asking the same question of the same patient", () => {
    const strict = { ...egfr, id: "INC-egfr-b", value: "exon19del" };
    expect(orderKey("PT-1", egfr)).toBe(orderKey("PT-1", strict));
  });

  it("differs by patient", () => {
    expect(orderKey("PT-1", egfr)).not.toBe(orderKey("PT-2", egfr));
  });

  it("differs by analyte", () => {
    expect(orderKey("PT-1", egfr)).not.toBe(orderKey("PT-1", anc));
  });

  it("ignores analyte casing and padding", () => {
    expect(orderKey("PT-1", { ...egfr, analyte: "  egfr " })).toBe(orderKey("PT-1", egfr));
  });
});

describe("one order, many answers", () => {
  it("buys EGFR once and unlocks every trial that asks for it", () => {
    const trials = [
      trial({ nctId: "NCT00000001", criteria: [adult, egfr] }),
      trial({ nctId: "NCT00000002", criteria: [adult, { ...egfr, id: "INC-egfr-2" }] }),
      trial({ nctId: "NCT00000003", criteria: [adult, { ...egfr, id: "INC-egfr-3" }] }),
    ];
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 10);
    expect(plan.orders).toHaveLength(1);
    expect(plan.spent).toBe(TIER_WEIGHT[0]);
    expect(plan.pairsUnlocked).toBe(3);
  });

  it("records every criterion a single order answers, with the trials' words", () => {
    const trials = [
      trial({ nctId: "NCT00000001", criteria: [adult, egfr] }),
      trial({ nctId: "NCT00000002", criteria: [adult, { ...egfr, id: "INC-egfr-2" }] }),
    ];
    const order = planTestOrders([silent("PT-1")], trials, ASOF, 10).orders[0];
    expect(order.answers).toEqual([
      { nctId: "NCT00000001", criterionId: "INC-egfr", criterionCitation: "EGFR L858R by validated assay" },
      { nctId: "NCT00000002", criterionId: "INC-egfr-2", criterionCitation: "EGFR L858R by validated assay" },
    ]);
  });

  it("labels an order by its subject and what it costs to get", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr] });
    expect(planTestOrders([silent("PT-1")], [t], ASOF, 10).orders[0].label).toBe(
      "EGFR — existing specimen",
    );
  });

  it("sends the most widely useful orders first", () => {
    const trials = [
      trial({ nctId: "NCT00000001", criteria: [adult, egfr, anc] }),
      trial({ nctId: "NCT00000002", criteria: [adult, { ...egfr, id: "INC-egfr-2" }] }),
    ];
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 10);
    expect(plan.orders.map((o) => o.analyte)).toEqual(["EGFR", "ANC"]);
  });
});

describe("partial progress earns nothing", () => {
  it("does not count a pair with one unknown still open", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr, measurable] });
    // Budget buys the tier-0 order but not the tier-2 scan.
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 2);
    expect(plan.pairsUnlocked).toBe(0);
    expect(plan.pairsRemaining).toBe(1);
    expect(plan.orders).toEqual([]);
    expect(plan.spent).toBe(0);
  });

  it("buys the whole bundle once the budget reaches it", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr, measurable] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, TIER_WEIGHT[0] + TIER_WEIGHT[2]);
    expect(plan.pairsUnlocked).toBe(1);
    expect(plan.spent).toBe(7);
    expect(plan.orders.map((o) => o.analyte ?? o.predicate)).toEqual(["EGFR", "staging"]);
  });
});

describe("the budget", () => {
  const trials = [
    // Cheap and unlocks one pair.
    trial({ nctId: "NCT00000001", criteria: [adult, egfr] }),
    // Expensive and unlocks one pair.
    trial({ nctId: "NCT00000002", criteria: [adult, measurable] }),
  ];

  it("is never exceeded", () => {
    for (const budget of [0, 1, 2, 3, 6, 7, 100]) {
      const plan = planTestOrders([silent("PT-1")], trials, ASOF, budget);
      expect(plan.spent, `budget ${budget}`).toBeLessThanOrEqual(budget);
    }
  });

  it("spends nothing and promises nothing at zero", () => {
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 0);
    expect(plan).toMatchObject({ spent: 0, pairsUnlocked: 0, orders: [], pairsRemaining: 2 });
  });

  it("takes the better value per unit cost first", () => {
    // EGFR: 0.4 expected for weight 1. RECIST: 0.8 expected for weight 6.
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 1);
    expect(plan.orders.map((o) => o.analyte ?? o.predicate)).toEqual(["EGFR"]);
  });

  it("unlocks more as the budget grows, never fewer", () => {
    let previous = -1;
    for (const budget of [0, 1, 2, 4, 7, 20]) {
      const n = planTestOrders([silent("PT-1")], trials, ASOF, budget).pairsUnlocked;
      expect(n).toBeGreaterThanOrEqual(previous);
      previous = n;
    }
  });
});

describe("the two objectives", () => {
  // PT-1 needs one cheap test with a poor prior; PT-2 needs one dear test with a
  // good prior. Which comes first depends on what you are counting.
  const trials = [
    trial({ nctId: "NCT00000001", criteria: [adult, { ...egfr, pFavorable: 0.05 }] }),
    trial({ nctId: "NCT00000002", criteria: [adult, { ...measurable, pFavorable: 0.95 }] }),
  ];

  it("weights by prior under the expected objective", () => {
    // 0.05/1 = 0.05 versus 0.95/6 ≈ 0.158, so the scan wins on expected value.
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 6, { objective: "expected" });
    expect(plan.orders.map((o) => o.analyte ?? o.predicate)).toEqual(["staging"]);
  });

  it("ignores the priors under the pairs objective", () => {
    // 1/1 beats 1/6, so the cheap order wins on raw count.
    const plan = planTestOrders([silent("PT-1")], trials, ASOF, 6, { objective: "pairs" });
    expect(plan.orders.map((o) => o.analyte ?? o.predicate)).toEqual(["EGFR"]);
  });

  it("reports the raw count and the expected count separately", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr, anc] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 20);
    expect(plan.pairsUnlocked).toBe(1);
    expect(plan.expectedPairsUnlocked).toBeCloseTo(0.4 * 0.9, 10);
  });

  it("says out loud that it assumes favourable results", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr] });
    expect(planTestOrders([silent("PT-1")], [t], ASOF, 20).assumesFavourableResults).toBe(true);
  });
});

describe("priors that do not exist", () => {
  const noPrior = { ...egfr, pFavorable: undefined };

  it("counts how many unknowns had to use the default", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, noPrior, anc] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 20);
    expect(plan.unlocked[0].assumedPriors).toBe(1);
    expect(plan.unlocked[0].probability).toBeCloseTo(0.5 * 0.9, 10);
  });

  it("honours a different default", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, noPrior] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 20, { defaultPFavorable: 0.2 });
    expect(plan.unlocked[0].probability).toBeCloseTo(0.2, 10);
  });
});

describe("what no test can buy", () => {
  it("sets a tier-4 pair aside instead of dropping it silently", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr, washout] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 100);
    expect(plan.pairsBlockedByTime).toBe(1);
    expect(plan.pairsUnlocked).toBe(0);
    expect(plan.orders).toEqual([]); // no point buying EGFR for a pair time-locked anyway
  });

  it("never emits a tier-4 order", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, washout] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 1000);
    expect(plan.orders.every((o) => o.tier !== 4)).toBe(true);
  });

  it("ignores an eliminated pair, because no result un-eliminates it", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult, egfr] });
    const child = patient({ id: "PT-KID", age: 9 });
    const plan = planTestOrders([child], [t], ASOF, 100);
    expect(plan).toMatchObject({ pairsUnlocked: 0, pairsRemaining: 0, orders: [] });
  });

  it("counts a pair that is already fully resolved rather than charging for it", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [adult] });
    const plan = planTestOrders([silent("PT-1")], [t], ASOF, 100);
    expect(plan).toMatchObject({ alreadyEnrollable: 1, pairsUnlocked: 0, spent: 0 });
  });

  it("charges one draw for two ANC criteria on the same patient, stale and absent alike", () => {
    // One trial wants ANC within 14 days (the patient's is years old → stale);
    // another wants ANC with no window but a different threshold (→ also open
    // once we redraw). One blood draw answers both.
    const windowed = { ...anc, id: "INC-anc-fresh", maxAgeDays: 14 };
    const otherThreshold = { ...anc, id: "INC-anc-loose", value: 1000, maxAgeDays: 14 };
    const trialsTwo = [
      trial({ nctId: "NCT00000001", criteria: [adult, windowed] }),
      trial({ nctId: "NCT00000002", criteria: [adult, otherThreshold] }),
    ];
    const stale = patient({
      id: "PT-STALE",
      age: 60,
      facts: [
        fact({
          predicate: "lab_value",
          analyte: "ANC",
          value: 900,
          unit: "/uL",
          observedAt: "2024-01-01",
          sourceQuote: "ANC 900/uL",
        }),
      ],
    });
    const plan = planTestOrders([stale], trialsTwo, ASOF, 100);
    expect(plan.orders).toHaveLength(1);
    expect(plan.spent).toBe(TIER_WEIGHT[1]);
    expect(plan.pairsUnlocked).toBe(2);
    expect(plan.orders[0].answers.map((a) => a.criterionId)).toEqual([
      "INC-anc-fresh",
      "INC-anc-loose",
    ]);
  });
});

describe("across a cohort", () => {
  const trials = [
    trial({ nctId: "NCT00000001", criteria: [adult, egfr] }),
    trial({ nctId: "NCT00000002", criteria: [adult, { ...egfr, id: "INC-egfr-2" }, measurable] }),
  ];
  const cohort = [silent("PT-1"), silent("PT-2"), silent("PT-3")];

  it("prefers breadth across patients when the budget is tight", () => {
    // Three tier-0 orders unlock three pairs; one scan would unlock one.
    const plan = planTestOrders(cohort, trials, ASOF, 3);
    expect(plan.pairsUnlocked).toBe(3);
    expect(plan.orders.every((o) => o.tier === 0)).toBe(true);
    expect(new Set(plan.orders.map((o) => o.patientId)).size).toBe(3);
  });

  it("keys orders per patient — one patient's NGS does not answer another's", () => {
    const plan = planTestOrders(cohort, trials, ASOF, 100);
    const egfrOrders = plan.orders.filter((o) => o.analyte === "EGFR");
    expect(egfrOrders).toHaveLength(3);
    expect(new Set(egfrOrders.map((o) => o.patientId)).size).toBe(3);
  });

  it("finds leaves nested inside groups", () => {
    const nested = trial({
      nctId: "NCT00000003",
      criteria: [adult, group("AND", [group("OR", [egfr])])],
    });
    expect(planTestOrders([silent("PT-1")], [nested], ASOF, 10).pairsUnlocked).toBe(1);
  });

  it("accounts for every non-eliminated pair exactly once", () => {
    const plan = planTestOrders(cohort, trials, ASOF, 4);
    expect(plan.pairsUnlocked + plan.pairsRemaining + plan.alreadyEnrollable + plan.pairsBlockedByTime).toBe(
      cohort.length * trials.length,
    );
  });
});

describe("plan shape and purity", () => {
  const trials = [
    trial({ nctId: "NCT00000001", criteria: [adult, egfr, anc] }),
    trial({ nctId: "NCT00000002", criteria: [adult, measurable] }),
  ];
  const cohort = [silent("PT-2"), silent("PT-1")];

  it("is deterministic", () => {
    expect(planTestOrders(cohort, trials, ASOF, 12)).toEqual(
      planTestOrders(cohort, trials, ASOF, 12),
    );
  });

  it("gives the same plan whatever order the cohort arrives in", () => {
    const a = planTestOrders(cohort, trials, ASOF, 12);
    const b = planTestOrders([...cohort].reverse(), trials, ASOF, 12);
    expect(a.orders.map((o) => o.key).sort()).toEqual(b.orders.map((o) => o.key).sort());
    expect(a.pairsUnlocked).toBe(b.pairsUnlocked);
    expect(a.spent).toBe(b.spent);
  });

  it("does not mutate its inputs", () => {
    const before = JSON.stringify([cohort, trials]);
    planTestOrders(cohort, trials, ASOF, 12);
    expect(JSON.stringify([cohort, trials])).toBe(before);
  });

  it("spends exactly the sum of the orders it emitted", () => {
    const plan = planTestOrders(cohort, trials, ASOF, 12);
    expect(plan.orders.reduce((sum, o) => sum + o.cost, 0)).toBe(plan.spent);
  });

  it("only claims pairs whose whole requirement was bought", () => {
    const plan = planTestOrders(cohort, trials, ASOF, 5);
    const bought = new Set(plan.orders.map((o) => o.key));
    for (const u of plan.unlocked) {
      for (const key of u.resolvedBy) expect(bought.has(key)).toBe(true);
    }
  });

  it("is empty-input safe", () => {
    expect(planTestOrders([], [], ASOF, 100)).toMatchObject({
      spent: 0,
      orders: [],
      unlocked: [],
      pairsUnlocked: 0,
    });
  });
});
