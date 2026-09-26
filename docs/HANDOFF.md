# HANDOFF

Things one lane noticed that another lane owns. Add a line and keep going
(docs/CONTRACT.md §5).

## From P2 (engine) — polarity of `CubeCell.verdict` for exclusion criteria

**Who this is for:** P3 (the criteria table) and P1 (contract + merges).

The engine brief and CONTRACT.md §4 disagree, and a UI built on the wrong one
shows green where it should show red.

- CONTRACT.md §4: *"any inclusion FAIL, or any exclusion PASS → ELIMINATED"* —
  so a cell's verdict answers **"did this criterion's own condition hold"**. A
  patient who HAS had osimertinib gets **PASS** on the exclusion "prior
  osimertinib", and is eliminated.
- The engine brief asks the polarity suite to prove that a fact matching an
  exclusion yields **FAIL** — the patient-facing reading.

**What the engine does:** `CubeCell.verdict` follows CONTRACT.md, because it is
the only polarity in which nested groups compose. An exclusion
`OR(prior osimertinib, prior erlotinib)` means "excluded if either"; flipping
leaves to patient-facing turns that OR into an AND by De Morgan and lets a
patient with one of the two drugs onto the trial.

**What P3 should render:** `eligibilityVerdict(cell.verdict, leaf.type)` from
`src/engine/evaluate.ts`. It negates exclusions so a fired exclusion reads FAIL,
and leaves UNKNOWN alone (it is Kleene NOT), so amber still means UNKNOWN and
nothing else. Do not hand-roll the flip — the leaf's `type` is needed and
`CubeCell` does not carry it; use `indexLeaves(trial)` to look it up.

The polarity suite asserts the patient-facing claim in the brief's own words via
that helper, so both readings are pinned by tests.

**What P1 may want to do:** add one sentence to CONTRACT.md §4 naming the two
polarities, so nobody rediscovers this at 4am. No type change is needed —
`PairResult` and `CubeCell` are untouched and stay frozen.

## From P2 (engine) — `age` criteria cite structured demographics

`Patient.age` is a record field, not a narrative sentence, so an `age` leaf
usually has no `Fact` to quote. Rather than report every age criterion as
UNKNOWN — which would bury the real unknowns — the engine cites the
demographics field and says so in the text:
`age 64 (structured demographics, PT-4417)`. It is not dressed up as a chart
quote. If P4 puts a real `age` fact in a fixture, that fact and its own
`sourceQuote` win.

## From P2 (engine) — devDependency added: `vitest` ^3

`vitest` 5 requires `@types/node` >= 22 and the repo pins `^20`, so 3.x is the
version that resolves without touching a shared type dependency. Adds
`vitest.config.ts` (the `@/` alias, mirroring tsconfig) and `test` /
`test:watch` scripts to `package.json`. Both root files — flagged here because
they are outside the engine lane.
