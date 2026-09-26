# Engine status

Unattended run, 2026-09-26. One line per task.

- **Task 1 — done.** `answerableBy` + `src/engine/coverage.ts` + `data/compiled/coverage.json`.
  Headline: **across 233 lung cancer trials, claims can answer 54.4% of eligibility
  criteria (5,103 criteria); the rest requires a chart.** Conservative — the 875
  "sometimes" criteria count as requiring a chart, upper bound 71.5%. 45 new tests.
- **Task 2 — done.** Benchmark against the 233 real trials → `data/compiled/benchmark.json`.
  **20,420,000 criterion evaluations in 9.09 s** (4,000 patients × 233 trials, full cube,
  Apple M5, single-threaded). Real 200-patient Synthea cohort: 1,021,000 in 0.46 s.
  Optimised 1.32M → 2.19M cells/s (+66%) on real data; verdict counts unchanged.
- **Task 3 — done.** VOI priors resolve from `data/prevalence.json` at evaluation time
  and reach `rank.ts` (already threaded; now proven by tests that the *order* flips, not
  just the cell values). Also threaded into `setcover` and `match`, which rank on
  `pFavorable`/`expectedValue` and were silently using the compiler's guesses. 12 new tests.
- **Task 4 — deferred, code ready.** `data/claims/patients.json` has not landed; the
  compiler lane logged `data/claims/**` as an ownership blocker. `src/engine/claims.ts`
  + 18 tests are written and the emitter will produce `data/claims/evaluation.json` on
  the first run after the file appears. Noted in `docs/HANDOFF.md`.
- **Task 5 — done.** Closed every test gap: **0 unexercised exported values** across the
  lane (was 8). New `index.test.ts` pins the barrel — a missing re-export now fails here
  rather than in another lane's worktree. Direct tests for `replicateCohort`/`timeCube`,
  `matchingFacts`, `eliminatedFromCells`, `toIsoDate`, `PRIOR_DOMAIN`, `PrevalenceFile`,
  `DEFAULT_MIN_CELL_SIZE`, plus equity edges and builder validation.
  Gave `countUnstablePairs` a usable public form (`countBlockingPairs`) — it was exported
  but took a private type, so no other lane could call it.

## Final suite

**784 passing, 2 skipped** (the skips self-activate: `data/claims/patients.json` and the
opt-in benchmark). 28 files. `npx tsc --noEmit` clean across `src/engine`.

## Reports emitted

- `data/compiled/coverage.json` — answerability gap, 233 trials, 5,103 criteria.
- `data/compiled/benchmark.json` — 20,420,000 evaluations in 8.76 s.
- `data/claims/evaluation.json` — pending the cohort; code and emitter ready.

Regenerate with `AMBER_EMIT=1 npm test -- src/engine/emit.test.ts`.
Inputs are overridable: `AMBER_TRIALS`, `AMBER_COHORT`, `AMBER_CLAIMS`, `AMBER_PREVALENCE`.

## Read this before quoting a number

`data/compiled/trials.json` was **overwritten at 03:55 with a failure payload** — 300
records, zero criteria, all flagged. Every report here was computed from
`trials.backtranslated.json` (sha `9df33cee`, 03:33, intact) and records that sha. The
compiled trials are untracked in the `amber-compiler` worktree and exist on no branch, so
these numbers are not yet independently reproducible. Details in `docs/HANDOFF.md`.
