# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 11:40 ET

## Done

Previous queue (landscape → README) still stands.

9. **`/demo`** — one scroll, no nine-item menu. Worklist (featured 6, hero pinned) → criteria for PT-4401 × NCT07001001 with both amber rows open → “what does that one number cost?” → elasticity → equity → market. Reuses Worklist, CriteriaTable, ElasticityView, EquityBars, MarketGraph.
10. **Presenter** — space / → advances, ← back, esc exits (page stays, whole story visible). Fixed beat chip. Click any worklist row or the cost button to jump a beat.
11. **`/preflight`** — exists / parses / contract-valid / non-zero for every file the demo reads. Optional upstream listed separately (`n/a` if missing). Does not import `source.ts`. Currently 15/15 required once `hcp.json` is generated.
12. **Empty states** — `source.ts` safeParse; every route that needs a file renders `MissingData` instead of crashing or `notFound()`.
13. **First paint** — `/demo` is `force-static`. Later beats are in the first HTML and hidden with CSS (`display: none`). No `loading.tsx`, no spinner, no client fetch.

14. **Coverage headline on `/payer`** — reads `data/compiled/coverage.json` only. Compile-stats → pending. A claims figure whose leaf count is not 5,103 throws. Never derived from the trees.
15. **Measured bench on the worklist** — 20,420,000 criterion evaluations in 8.76s · 4,000 patients × 233 trials. Says "measured", not "up to".
16. **Cube on 133 real protocols** — citation flags no longer gate. `data/compiled/trials.json` demo pool must be 133 or generate throws. NCT07001001 stays pinned. Worklist says "Evaluated against 133 real trial protocols."
17. **Published cube is a subset** — generate.ts (vite-node, one-off) evaluates the full 203 × 134 and writes only worklist pairs + every patient on the presentation trial. `source.ts` reads that JSON with `fs` so Next never statically imports the cube. `buildReadModels` throws if `NEXT_RUNTIME` is set.
18. **`/payer` on the real extract** — 1,296 DE-SynPUF beneficiaries × **133 real protocols**. Claims settle **98 of 1,296** (112 drug-fill rows: carboplatin 61, cisplatin 16, pemetrexed 15, docetaxel 20). Only exclusion `==` / `in` cells count. Part B platinum/taxane/pemetrexed alias as `chemotherapy`. Fixture trio is no longer the scoring set.
19. **Deep-dive smoke** — each route mounts against published `app/_data/*.json`. Compiled trees reuse `INC-1`; row keys are tree paths. Slider/mode/citation state resets when the sweep, assignment, or sections change.
20. **`/hcp`** — Impiricus physician panel. `rank()` output grouped by a deterministic treating-physician roster (contracts have no physician field). Click a patient: live trials ranked by worth-it-ness (expected value / (tier cost + travel + phase visit load)). Portal answers overlay the ranking; the channel never contacts a patient.
21. **`/patient-portal`** — four questions only (travel, extra visits, placebo, who drives). No medical facts, no outbound contact. Answers live in `localStorage` and feed `/hcp`.

Nine deep-dive routes are unchanged. HCP + portal are a separate channel.

## Queue

None in this lane.

## Blocked

- `data/compiled/coverage.json` is still compile-stats; `/payer` waits for the engine to republish the claims figure (5,103 leaves).
- Eval is model-draft.

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
- Import `app/_data/generate.ts` or `buildReadModels` from a Next route
