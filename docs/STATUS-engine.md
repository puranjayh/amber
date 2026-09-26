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
