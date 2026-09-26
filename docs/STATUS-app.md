# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 08:40 ET

## Done

Previous queue (landscape → README) still stands.

9. **`/demo`** — one scroll, no nine-item menu. Worklist (featured 6, hero pinned) → criteria for PT-4401 × NCT07001001 with both amber rows open → “what does that one number cost?” → elasticity → equity → market. Reuses Worklist, CriteriaTable, ElasticityView, EquityBars, MarketGraph.
10. **Presenter** — space / → advances, ← back, esc exits (page stays, whole story visible). Fixed beat chip. Click any worklist row or the cost button to jump a beat.
11. **`/preflight`** — exists / parses / contract-valid / non-zero for every file the demo reads. Optional upstream listed separately (`n/a` if missing). Does not import `source.ts`. Currently 14/14 required green.
12. **Empty states** — `source.ts` safeParse; every route that needs a file renders `MissingData` instead of crashing or `notFound()`.
13. **First paint** — `/demo` is `force-static`. Later beats are in the first HTML and hidden with CSS (`display: none`). No `loading.tsx`, no spinner, no client fetch.

14. **Coverage headline on `/payer`** — derived from the 233 compiled trees (5,105 leaves). Conservative 54.5% (washout + contraindication = 875 ambiguous, counted as chart). Upper bound 71.6%. Exclusions 62.4% vs inclusions 45.4%. Bars: prior_therapy / comorbidity / diagnosis / age 100%; lab / biomarker / ECOG / staging 0%.
15. **Measured bench on the worklist** — 20,420,000 criterion evaluations in 8.76s · 4,000 patients × 233 trials. Says "measured", not "up to".

Nine deep-dive routes are unchanged.

## Queue

None in this lane.

## Blocked

- Compiled trees are still `needsHumanReview`; the cube stays 203 × 3 fixtures. Coverage walks the 233 trees anyway.
- `data/claims/patients.json` missing — payer split is still the stub. `data/compiled/coverage.json` is compile-stats, not the claims figure; we derive the figure from the trees.
- Eval is model-draft.

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
