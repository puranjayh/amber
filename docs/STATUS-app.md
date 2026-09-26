# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 04:10 ET

## Done

Previous queue (landscape → README) still stands.

9. **`/demo`** — one scroll, no nine-item menu. Worklist (featured 6, hero pinned) → criteria for PT-4401 × NCT07001001 with both amber rows open → “what does that one number cost?” → elasticity → equity → market. Reuses Worklist, CriteriaTable, ElasticityView, EquityBars, MarketGraph.
10. **Presenter** — space / → advances, ← back, esc exits (page stays, whole story visible). Fixed beat chip. Click any worklist row or the cost button to jump a beat.
11. **`/preflight`** — exists / parses / contract-valid / non-zero for every file the demo reads. Optional upstream listed separately (`n/a` if missing). Does not import `source.ts`. Currently 14/14 required green.
12. **Empty states** — `source.ts` safeParse; every route that needs a file renders `MissingData` instead of crashing or `notFound()`.
13. **First paint** — `/demo` is `force-static`. Later beats are in the first HTML and hidden with CSS (`display: none`). No `loading.tsx`, no spinner, no client fetch.

Nine deep-dive routes are unchanged.

## Queue

None in this lane.

## Blocked

- Same as before: compiled trees still `needsHumanReview`; claims and coverage files missing; eval is model-draft.

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
