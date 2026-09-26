# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 08:55 ET

## Done

Previous queue (landscape → README) still stands.

9. **`/demo`** — one scroll, no nine-item menu. Worklist (featured 6, hero pinned) → criteria for PT-4401 × NCT07001001 with both amber rows open → “what does that one number cost?” → elasticity → equity → market. Reuses Worklist, CriteriaTable, ElasticityView, EquityBars, MarketGraph.
10. **Presenter** — space / → advances, ← back, esc exits (page stays, whole story visible). Fixed beat chip. Click any worklist row or the cost button to jump a beat.
11. **`/preflight`** — exists / parses / contract-valid / non-zero for every file the demo reads. Optional upstream listed separately (`n/a` if missing). Does not import `source.ts`. Currently 14/14 required green.
12. **Empty states** — `source.ts` safeParse; every route that needs a file renders `MissingData` instead of crashing or `notFound()`.
13. **First paint** — `/demo` is `force-static`. Later beats are in the first HTML and hidden with CSS (`display: none`). No `loading.tsx`, no spinner, no client fetch.

14. **Coverage headline on `/payer`** — reads `data/compiled/coverage.json` only. Compile-stats → pending. A claims figure whose leaf count is not 5,103 throws. Never derived from the trees.
15. **Measured bench on the worklist** — 20,420,000 criterion evaluations in 8.76s · 4,000 patients × 233 trials. Says "measured", not "up to".
16. **Cube on 133 real protocols** — citation flags no longer gate. `data/compiled/trials.json` demo pool must be 133 or generate throws. NCT07001001 stays pinned so PT-4401's presentation pair is stable. Worklist says "Evaluated against 133 real trial protocols."

Nine deep-dive routes are unchanged.

## Queue

None in this lane.

## Blocked

- `data/claims/patients.json` missing — payer split is still the stub. `data/compiled/coverage.json` is still compile-stats; `/payer` waits for the engine to republish the claims figure (5,103 leaves).
- Eval is model-draft.

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
