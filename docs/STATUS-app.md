# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 12:12 ET

## Done

Previous queue (landscape → README) still stands.

9. **`/demo`** — four beats: worklist → HCP criteria → elasticity (slider + corpus + market cut) → payer.
10. **Presenter** — space / → advances, ← back, esc exits.
11. **`/preflight`** — deep dive. Exists / parses / contract-valid / non-zero for every file the demo reads.
12. **Empty states** — `source.ts` safeParse; missing files render `MissingData`.
13. **First paint** — `/demo` is `force-static`.

14. **Coverage headline on `/payer`** — reads `data/compiled/coverage.json` only.
15. **Measured bench on the worklist** — 20,420,000 criterion evaluations in 8.76s · 4,000 patients × 233 trials.
16. **Cube on 133 real protocols** — citation flags do not gate. NCT07001001 stays pinned.
17. **Published cube is a subset** — worklist pairs + every patient on the presentation trial.
18. **`/payer` on the real extract** — 1,296 DE-SynPUF × 133 protocols. Claims settle 98 of 1,296.
19. **Smoke** — main flow mounts against published `app/_data/*.json`.
20. **Restructure** — trial portal nav is Patients · Physicians · Elasticity · Payer. `/hcp` and `/patient-portal` are separate portals. Eval / Preflight are utility links, not tabs. `/patient`, `/alert`, `/equity` redirect to `/hcp`. `/landscape` and `/market` redirect to `/elasticity`.
21. **`/hcp`** — Impiricus physician panel. Top 25 by `rank()`, checkboxes + draft outreach (never sent), equity composition vs admitted, per-patient group-hit marks. Click opens the criteria table with both citations. `/patient`, `/alert`, `/equity` redirect here.
22. **`/elasticity`** — one scroll: analyte picker + precomputed slider, corpus distribution (“233 real protocols, 5,105 criteria, no consensus.”), three-trial / six-patient market cut (first-come vs stable). `/landscape` and `/market` redirect here.
23. **`/patient-portal`** — four questions only. Off the main nav. Answers live in `localStorage`.
24. **`/eval`** — reads `data/eval/results.human.json` (30 cells, 83.3% precision, 91.7% recall). Both disagreements named: SYN-19ad9612 INC-2, human UNKNOWN/stale, engine FAIL. Model-draft `app/_data/eval.json` is a separate, labelled section and is never merged in.
25. **Live loop** — `/` `/patient-portal` `/hcp` share one store (Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, otherwise `.data/loop.json`). `rank()` adds `preferenceUnknown` as an explicit UNKNOWN. Seeded 46 two-unknown patients hold the top; PT-4401 starts at #47 and rises into the top 10 when they answer. Poll every 2s. `?demo=static` / `?demo=1` is the old four-screen path. Reset on `/preflight`.
26. **Trial portal tabs** — `/` and `/worklist` are Patients | Physicians. Patients is the ranked list. Physicians is a roster with a readiness bar (eligible / one unknown / several / eliminated), expand-to-patients, select-all, Ask vs grouped enrol nudge, and a per-physician note that survives Reset. Attribution is observed from optional `providers.json` or assigned and labelled. `/hcp` is a separate Impiricus physician portal (own chrome, not a console tab); live panel filters to that physician; enrol nudges with a shared `batchId` render as one card.

## Queue

None in this lane.

## Blocked

- `data/compiled/coverage.json` is still compile-stats; `/payer` waits for the engine to republish the claims figure (5,103 leaves).

## Do not demo

- ANC / albumin / CrCl as sliders — they are listed as inert: the threshold does not bind on this cohort. Only platelets `NCT03838159` INC-6 moves.
- Per-patient group-hit marks — none of the top-25 blocking criteria uniquely exclude that patient's group.
- Coverage chart on `/payer` — pending republish. The 98 / 1,296 settle is real.

## Do not

- Merge to `main`
- Present the live loop as human-validated enrolment — it is a preference + nudge store, and the patient never signs up from the portal
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
- Import `app/_data/generate.ts` or `buildReadModels` from a Next route
