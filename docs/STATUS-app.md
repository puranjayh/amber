# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 03:37 ET

## Done

1. **Landscape** — `/landscape` reads `data/compiled/landscape.json` (300 compiled trials, 150 analytes). Dominant operator per analyte; ink bar = leading threshold. Callout lists the splits (performance_status ≤ 37/32, ANC ≥ 1.5 vs 1500, Hemoglobin 9 vs 90). Fallback `buildLandscape(trials)` if the compiler file is empty.
2. **Payer** — `/payer` split: claims that settle (osimertinib PDE, ILD ICD) vs UNKNOWNs a chart must close. Header: "Claims can rule patients out. Only a chart can rule them in." Stub DE-SynPUF beneficiaries until `data/claims/patients.json` lands; coverage.json is shown when present. Notification card: physician only, never patient/sponsor; no biomarker data to a payer (GINA).

## Queue

3. `?demo=1` — landing Start demo / `/?demo=1` → PT-4401 × NCT07001001. Path: Criteria → Alert → Elasticity → Equity → Market → Landscape → Payer (Eval next).
4. Screen-failures-avoided — 62% × $2,000 (wired on worklist)
5. `/eval` — confusion matrix from `data/eval/results.json`, labelled as model-draft until human
6. Polish — all nine screens at 400px, light and dark

## Blocked

- Compiler `data/compiled/trials.json` in this worktree is still 300 × `needsHumanReview` / empty trees, so the cube stays 203 patients × 3 fixture trials. Landscape is independent and uses the compiler histogram file.
- `data/claims/patients.json` and `data/compiled/coverage.json` are not in this tree yet. Payer will ship against a labelled stub.
- `data/eval/results.json` is not in this tree. Eval will derive from `data/eval/labels.json` (`labeller: model-draft`) until the compiler writes a report.

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts only)
