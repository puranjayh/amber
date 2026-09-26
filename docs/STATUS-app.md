# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 03:41 ET

## Done

1. **Landscape** — `/landscape` reads `data/compiled/landscape.json` (300 compiled trials, 150 analytes). Dominant operator; ink bar = leading threshold. No-consensus callout: performance_status ≤ 37/32, ANC 1.5 vs 1500, Hemoglobin 9 vs 90.
2. **Payer** — `/payer` split. Stub DE-SynPUF until `data/claims/patients.json`. Coverage.json renders when present. GINA line on screen.
3. **`?demo=1`** — Start demo / `/?demo=1` → PT-4401 × NCT07001001. Path through Eval.
4. **Screen-failures-avoided** — 203 screened · 126 expected at 62% · 122 avoided · $244,000.
5. **Eval** — `/eval` matrix + disagreements. `labelSource: model-draft` is the first thing on the page. Perfect agreement here is expected (labels are model-draft) and is not shown as a human grade.

## Queue

6. Polish — all nine screens at 400px, light and dark.

## Blocked

- This worktree's `data/compiled/trials.json` is still 300 × `needsHumanReview` / empty trees. Cube stays 203 × 3 fixtures. Landscape uses the compiler histogram file independently.
- `data/claims/patients.json` and `data/compiled/coverage.json` missing — payer is on the labelled stub.
- `data/eval/results.json` missing — eval derives from `data/eval/labels.json` (`labeller: model-draft`).

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
