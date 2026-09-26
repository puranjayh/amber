# STATUS — app lane (`eng/app`)

Last updated: 2026-09-26 04:00 ET

## Done

1. **Landscape** — `/landscape` reads `data/compiled/landscape.json` (300 compiled trials, 150 analytes). Dominant operator; ink bar = leading threshold. No-consensus callout: performance_status ≤ 37/32, ANC 1.5 vs 1500, Hemoglobin 9 vs 90.
2. **Payer** — `/payer` split. Stub DE-SynPUF until `data/claims/patients.json`. Coverage.json renders when present. GINA line on screen.
3. **`?demo=1`** — Start demo / `/?demo=1` → PT-4401 × NCT07001001. Path through Eval.
4. **Screen-failures-avoided** — 203 screened · 126 expected at 62% · 122 avoided · $244,000.
5. **Eval** — `/eval` matrix + disagreements. `labelSource: model-draft` is the first thing on the page. Perfect agreement here is expected (labels are model-draft) and is not shown as a human grade.
6. **Polish** — nine screens at 400px, light and dark. No page-level horizontal overflow. Dark tokens via `prefers-color-scheme`. Nav scrolls. Landscape bars capped so the no-consensus callout stays the slide.
7. **Shots** — `npm run shots` (`scripts/shots.ts`, Playwright) writes 36 PNGs to `docs/shots/` (9 routes × 1440/390 × light/dark). Reuses a running `next dev`. Worklist is captured without `?demo=1` (that flag redirects to /patient).
8. **README** — replaced the create-next-app stub. Thesis, mermaid (compiler → engine → cube → read models), run, synthetic disclosure, prior art, gallery.

## Queue

None in this lane. Swap payer/eval inputs when compiler files land.

## Blocked

- This worktree's `data/compiled/trials.json` is still 300 × `needsHumanReview` / empty trees. Cube stays 203 × 3 fixtures. Landscape uses the compiler histogram file independently.
- `data/claims/patients.json` and `data/compiled/coverage.json` missing — payer is on the labelled stub.
- `data/eval/results.json` missing — eval derives from `data/eval/labels.json` (`labeller: model-draft`).

## Do not

- Merge to `main`
- Import `@/src/engine` from a route (generate.ts / eval.ts only)
