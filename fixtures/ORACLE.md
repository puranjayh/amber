# Sample-fixture oracle

`cube.sample.json` is the hand-worked `PairResult[]` for the three demo patients against the three demo trials. Evaluation date **`asOf` = 2026-09-25** (UTC dates). `ageDays` is the whole UTC day difference from `observedAt` to that date.

These patients are synthetic and hand-built. `NCT07001001`, `NCT07001002`, and `NCT07001003` are demo protocols, not registry records.

## How a cell was decided

A fact matches a leaf when `predicate` matches and, if the leaf sets them, `analyte` and `drugClass` match. `patient.age` agrees with the age fact.

1. No matching fact → `UNKNOWN` / `absent`. `chartCitation` is omitted.
2. The leaf sets `maxAgeDays` and every matching fact has `ageDays > maxAgeDays` → `UNKNOWN` / `stale`. The comparison is not applied. A value that would miss the threshold is still `UNKNOWN`, never `FAIL`. `ageDays === maxAgeDays` is fresh.
3. Otherwise the comparison runs on the matching fact:
   - comparison holds → `PASS` / `satisfied`
   - comparison does not hold → `FAIL` / `contradicted`

That polarity is the criterion's own truth value, so nested AND / OR / NOT still use the Kleene tables. An exclusion that is true is `PASS`.

## Pair roll-up

`eliminated` is true when any inclusion cell is `FAIL` or any exclusion cell is `PASS`.

`passCount` / `failCount` / `unknownCount` count cells, one per leaf, in criterion order.

`resolutionCost` sums tier weights over `UNKNOWN` cells: 0→1, 1→2, 2→6, 3→20, 4→30.

`expectedValue` sums `pFavorable / weight` over `UNKNOWN` cells that carry `pFavorable`.

## The three stories

- **PT-4401 × NCT07001001** is the hero pair: exactly two unknowns (EGFR never tested; ECOG 1 recorded 87 days ago, window 28). Not eliminated.
- **PT-4402 × NCT07001001** is a true exclusion: prior osimertinib makes `EXC-1` `PASS`, so the pair is eliminated with `failCount` 0.
- **PT-4408** labs sit outside the window. ANC 820/μL, hemoglobin 8.2 g/dL, and platelets 68 × 10^9/L would miss their thresholds, and the verdict on each is `UNKNOWN` / `stale`.
