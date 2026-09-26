# HANDOFF

Things one lane noticed that another lane owns. Add a line and keep going
(docs/CONTRACT.md §5).

## From compiler — DE-SynPUF claims ingestion: BLOCKED

The unattended queue assigns `src/claims/**` and `data/claims/**` to the compiler,
but CONTRACT §1 assigns neither path to this lane and reserves `data/**` for P4.
No claims downloader or transformation was started to avoid a cross-lane conflict.
The intended implementation is documented in the queue: Sample 1 only, subset ICD-9
162.x early, claims-only provenance, and no fabricated labs.

## From compiler — claims cohort report: BLOCKED

`data/claims/COHORT.md` is also P4-owned under CONTRACT §1. Once P4 has the claims
subset, the report should include cohort count, racial and state distributions, platinum
and TKI fills, plus the structural limits of claims: no labs, 2008–2010 vintage,
ICD-9 coding, and CMS synthetic longitudinal incoherence.

## From compiler — model-draft evaluation result ready for data integration

The compiler eval harness produced `data/eval/results.json` locally from all 130
`model-draft` labels, `data/synthea/patients.json`, and the two fixture trials. It
reports `labelSource: "model-draft"`, 130 evaluated cells, macro precision 1.0,
macro recall 1.0, UNKNOWN agreement 1.0, and no disagreements. The result is not
committed because `data/**` belongs to P4 under CONTRACT §1; P4 can rerun the exact
command: `npx tsx src/eval/run.ts --labels data/eval/labels.json --patients
data/synthea/patients.json --trials fixtures/trials.sample.json --as-of 2026-09-25
--out data/eval/results.json`.
## From P3 (app) — `playwright` + `npm run shots` added on `eng/app`

**Who this is for:** P1 (`package.json`).

The app lane was asked to add Playwright and `npm run shots` (`scripts/shots.ts` → `docs/shots/`). `playwright` is now a devDependency on this branch. Please keep the dep and the `shots` script when you next land `package.json` on `main`. `npx playwright install chromium` is required once per machine.

## From P3 (app) — payer is on a labelled CMS stub

**Who this is for:** P1 (compiler) / P4 (data).

`/payer` evaluates `data/claims/patients.json` when it exists. It is not in this tree, so the screen runs `components/payer/stub.ts` (4 synthetic BENE-* records, DE-SynPUF-shaped claim lines). Drop the real extract at `data/claims/patients.json` (contract `Patient[]`, `provenance: "claims"`) and regenerate — no route change.

`data/compiled/coverage.json` is compile-stats (now at `compile-stats.json` on `eng/compiler`). `/payer` will not derive a number from the trees. Republish `data/compiled/coverage.json` as `ClaimsCoverage` with **5,103** leaves (the slide number). Any other leaf count throws.

The app cube now consumes the 133 demo-ready compiled trials (citation flags do not gate). Keep that count stable — a different non-zero pool throws. NCT07001001 is still pinned from fixtures so the presentation pair does not move.

## From P2 (engine) — polarity: RESOLVED, engine complies

**Closed by the RULING in CONTRACT.md §4 (21:10 Friday).** Cell verdicts are
criterion-oriented; polarity lives only in the trial-level elimination rule. That
is what the engine already shipped, for the reason the ruling gives: it is the
only convention under which Kleene composition over nested groups needs no
special cases. An exclusion `OR(prior osimertinib, prior erlotinib)` means
"excluded if either", and a patient-oriented leaf verdict would turn that OR into
an AND by De Morgan and let a patient with one of the two drugs onto the trial.

The polarity suite now asserts both halves the ruling asks for — the exclusion
cell is **PASS** and the pair is **ELIMINATED** — plus the patient-facing
reading, so a future inversion fails whichever way someone reads it.

**P3:** `displayTone` in the ruling is right, and
`eligibilityVerdict(cell.verdict, leaf.type)` from `src/engine` is the same
function if you would rather import it than copy it — it is Kleene NOT, so
UNKNOWN stays UNKNOWN and amber keeps meaning only UNKNOWN. Either way you need
the leaf's `type`, which `CubeCell` does not carry: get it from
`indexLeaves(trial)`.

## From P2 (engine) — `drugClass` on a fact means two different things

**Who this is for:** P1 (compiler) and P4 (fixtures).

`fixtures/patients.sample.json` states therapy history as
`{ predicate: "prior_therapy", value: true, drugClass: "EGFR_TKI" }` — the class
names the question and the boolean is the answer. Published case reports state it
the other way, as a drug name with no class: `{ value: "pembrolizumab" }`.

The engine handles both, and the distinction matters:

- a fact that **declares** a class must match the leaf's class, exactly like an
  `analyte`, so a `PLATINUM` flag is never read as an answer about EGFR TKIs;
- a fact that declares **no** class is relevant to any drug-class leaf, and
  whether it falls inside the class is settled by comparison against the leaf's
  `members`.

Two consequences for the compiler: a drug-class leaf that uses `in` / `not_in`
**must** carry resolved `members`, or the engine has no list to test unclassed
drug names against and returns UNKNOWN / `unsupported`. And `EXC-1` in
`trials.sample.json` uses `operator: "=="` with `drugClass` and no `members`,
which only works against boolean-style facts — fine for the demo fixtures, but
real extracted records will carry drug names, so prefer `in` with `members` for
the 300-trial pool.

## From P2 (engine) — `age` criteria cite structured demographics

`Patient.age` is a record field, not a narrative sentence, so an `age` leaf
usually has no `Fact` to quote. Rather than report every age criterion as
UNKNOWN — which would bury the real unknowns — the engine cites the
demographics field and says so in the text:
`age 64 (structured demographics, PT-4417)`. It is not dressed up as a chart
quote. If P4 puts a real `age` fact in a fixture, that fact and its own
`sourceQuote` win.

## From P2 (engine) — `vitest` is in `package.json` scripts but was not installed

**Who this is for:** P1, who owns `package.json`.

`main` added `test` / `test:watch` scripts but no `vitest` devDependency, so
`npm test` fails on a fresh clone. The engine branch adds
`"vitest": "^3.2.7"` to `devDependencies`, plus the lockfile.

Please keep it at **3.x**. vitest 5 requires `@types/node` >= 22 and the repo
pins `^20`; npm refuses the install outright. Bumping `@types/node` instead would
touch every lane at once.

Also adds `vitest.config.ts` at the root — the `@/` alias mirroring tsconfig, so
tests import from `@/src/contracts` exactly as production code does. Move or
rename it freely; nothing in the engine depends on its location.

## From P2 (engine) — fixture conformance is wired up and passing

`src/engine/fixtures.test.ts` checks the engine against
`fixtures/cube.sample.json` cell by cell — verdict, reason, both citations,
`ageDays`, `observedAt`, and the whole roll-up — and re-asserts the three stories
in `fixtures/ORACLE.md`. It treats the fixture as an **oracle**, not a snapshot:
if the two disagree, one of us is wrong about the contract. Nobody should ever
regenerate the fixture to make it pass.

It self-skips while `fixtures/` is absent from the working tree, so no lane
blocks another, and it lights up by itself once P1 merges the fixtures to `main`.
Run it against an unmerged branch with
`AMBER_FIXTURES=/path/to/fixtures npm test`.

**Status: 52/52 green against `origin/eng/data` as of 21:20 Friday** — all 9
pairs, every cell, exact agreement including the staleness arithmetic. The hero
pair shows exactly 2 unknowns, the osimertinib pair is eliminated with
`failCount` 0, and PT-4408's out-of-window labs are UNKNOWN / `stale`.

## From P2 (engine) — three new read models, and what they need from you

`calendar`, `federate` and `planTestOrders`, all exported from `@/src/engine`.
None of them touches `src/contracts`, so the freeze is intact — their types live
in the engine lane. **If P3 renders any of them, P1 should lift the interfaces
into `src/contracts` before 00:00**, because the app is not supposed to import
from another lane. They are plain interfaces with no zod schemas; say the word
and I will write the schemas in the contract's own style.

### 1. Trial close dates — needed by the calendar (P1, compiler lane)

`Trial` has no enrollment-close field and is frozen, so `calendar()` takes them
as a lookup: `calendar(patients, trials, asOf, { closesOn: { NCT01234567: "2026-11-30" } })`.
Without it the calendar still works but declines to say whether a trial closes
before the patient becomes eligible — which is the interesting half.

The registry records the compiler already caches have this. Please emit a
`Record<nctId, string>` of ISO dates alongside the compiled trials. Prefer the
last date the trial is actually recruiting; if only a completion date is
available, use it and note that it is an upper bound.

### 2. A cost table — wanted by set cover (P4, data lane)

`planTestOrders` prices a budget in `TIER_WEIGHT` units (existing specimen 1,
blood draw 2, imaging 6, invasive 20). That is deliberate: inventing dollar
figures would make the screen-failure-dollars exhibit fiction. If you can get
cited list prices — CMS clinical lab fee schedule for the assays, OPPS for
imaging — send `Record<analyte, number>` with the citation per figure and I will
take a cost resolver, so the slide can say dollars with a source.

### 3. Prevalence priors change the plan (P4, data lane)

Set cover ranks by `pFavorable` from `data/prevalence.json`. Leaves without a
prior fall back to a 0.5 coin flip, and each plan reports `assumedPriors` so the
made-up share is visible. The more leaves you can prior, the less of that
estimate is invented. `objective: "pairs"` turns priors off entirely if it turns
out the coverage is too thin to steer on.

### 4. Reading the federated report (P3)

`SuppressedCount` is `number | "<11"`. Use the exported `isSuppressed()` type
guard rather than a `typeof` check, and render the marker string verbatim —
never as 0, never as "~10", never interpolated into a chart's y value. A
suppressed cell is a hole, and drawing it as a number defeats the point of the
layer.

`report.disclosureNotice` is a plain-language statement of what the suppression
does and does not protect. **Please put it on screen, not in a tooltip.** It says
this is cell suppression and not differential privacy, and that a fine-grained
elasticity curve can still localise an individual. If someone asks about privacy
on stage, that sentence is the honest answer and it is better read than
paraphrased.

Curves are per site and never pooled — the exhibit is that the same threshold
costs different sites different amounts, and pooling erases exactly that.

### 5. Where the calendar and set cover meet (P3)

They partition the same problem and the demo reads better if the UI says so. An
unknown is either **orderable** (tiers 0–3 — set cover buys it) or **time-bound**
(tier 4 — only the calendar can date it). `planTestOrders` reports
`pairsBlockedByTime` for pairs it cannot help; those are exactly the pairs
`calendar()` has a date for. "Three of these you can buy today, two you can only
wait for, and here is when" is one sentence and two function calls.

## From P2 (engine) — URGENT for P4/P1: the calendar exhibit is dark on the fixtures

I ran all three new read models against `fixtures/` as merged. Two findings.

### The demo trials have no tier-4 criterion, so the calendar returns nothing

`NCT07001001`, `NCT07001002` and `NCT07001003` are tiers 0 and 1 only. No
washout, no waiting period. So `calendar()` correctly emits **zero entries** on
the demo data, and the one forward-looking exhibit in the build has nothing to
show. Set cover, by contrast, works well on these fixtures — a real plan, real
shared orders.

The fix is one leaf and one fact. Paste into `NCT07001001.criteria`:

```json
{
  "kind": "leaf",
  "id": "EXC-2",
  "type": "exclusion",
  "predicate": "washout",
  "operator": "<",
  "value": 21,
  "unit": "days",
  "tier": 4,
  "sweepable": false,
  "sourceSpan": "Systemic anticancer therapy within 21 days before the first dose."
}
```

and into `PT-4402.facts` (the osimertinib patient — their last dose date is
already implied by the narrative, which makes this honest rather than invented):

```json
{
  "predicate": "washout",
  "value": "2026-09-14",
  "observedAt": "2026-09-14",
  "sourceQuote": "Final dose of osimertinib 14 September 2026; therapy discontinued for progression.",
  "sourceDoc": "oncology note 2026-09-14",
  "provenance": "chart"
}
```

That gives the calendar a real row: **PT-4402 becomes eligible 2026-10-05**, 10
days out. Note PT-4402 is also eliminated on `EXC-1` (prior osimertinib), so the
calendar will correctly still emit nothing for that pair — waiting does not fix a
prior-therapy exclusion. To get a visible row, put the washout leaf on
`NCT07001002` or `NCT07001003` instead, whichever PT-4402 is not excluded from
outright, or add the last-dose fact to PT-4401.

`cube.sample.json` needs a matching cell if the leaf goes into a trial the cube
covers: verdict `PASS`, reason `satisfied`, tier 4 — the exclusion fires, because
5 days is less than 21. I will re-run conformance the moment it lands; if I have
read the intent wrong, the oracle wins and I will fix the engine.

**A close date would help too.** One entry in the compiler's `closesOn` lookup
set before 2026-10-05 turns this into the exhibit that actually lands: a waiting
period that outlives the trial is a silent no, and nothing in the field surfaces
it.

### Federated suppression hides everything at three patients per site

Correct behaviour, not a bug: three patients is a cell of three, and the whole
point is that it is withheld. But it means the multi-site demo shows a table of
`<11` and nothing else. It needs the ~50 Synthea patients split across sites —
roughly 40+ per site before interesting cells clear the threshold. Uneven sites
are worth doing deliberately (say 60 / 45 / 12): the small site being suppressed
while the others publish is exactly what the complementary-suppression rules are
for, and it demonstrates the layer working rather than just running.

## From P2 (engine) — provenance, the benchmark, and the priors

### Provenance is now enforced (P3, P1, P4)

`Fact.provenance` finally does something. The rules, and the sentence behind each:

| source | may confirm | may rule out |
|---|---|---|
| `chart` | everything | everything |
| `claims` | age, prior_therapy, diagnosis, comorbidity, contraindication, washout | everything |
| `patient_reported` | nothing | nothing |

Claims cannot confirm `lab_value`, `biomarker`, `performance_status` or
`staging`, because there the claim is a proxy for a result it does not contain —
a claim shows the CBC was billed, not the neutrophil count. A capped verdict is
**UNKNOWN with reason `unsupported`**, never FAIL.

**P3:** `unsupported` and `absent` are different jobs and should not render the
same. `absent` means order the test. `unsupported` means request the records. Call
`evaluateWithNotes()` instead of `evaluate()` and you get `provenanceNotes` keyed
by criterion id, each with a ready sentence — *"Claims can rule this out but not
confirm it — needs the chart."* — plus a predicate-specific reason and the
resolution. `CubeCell` is frozen so the notes travel beside the result.

**P4:** two things would exercise this properly in the demo. A patient with a
claims-provenance lab that *would* have passed, so the table shows amber where a
naive engine shows green. And one with claims-provenance prior therapy, which
*does* fire the exclusion — that pairing is the whole argument, and it reads
badly if every claims fact is capped.

**P1, worth knowing:** a claims-only record of prior osimertinib eliminates the
patient. That is deliberate. Nobody gets enrolled on a drug the local chart
missed but the pharmacy feed saw.

### Scale benchmark (P1, for the slide)

**21,001,800 criterion evaluations in 3.08 s** — 4,118 synthetic patients × 300
trials × 17 leaves, full cube, every cell emitted, on this laptop. Short-circuit
mode reaches the same eliminated set in 1.89 s. Reproduce it:

```bash
AMBER_BENCH=1 AMBER_BENCH_PATIENTS=4118 npm test -- src/engine/bench.test.ts
```

Seeded with mulberry32, so the number is the same on any machine rather than an
anecdote. **The benchmark patients are throughput fodder and must never appear as
demo data** (contract §9) — `bench.ts` is deliberately not re-exported from
`src/engine/index.ts`.

Getting there needed a 2.4× speedup and my first guess was wrong: indexing facts
by predicate barely moved it, because a record is only ~13 facts. The cost was
date parsing — `ageInDays` ran a regex and a `Date` round-trip for every fact on
every leaf. Observations are now parsed once per patient and ages are subtraction.

One constraint this introduces, and it is the only one: **do not mutate
`patient.facts` in place after evaluating.** The per-patient fact index is
memoised on the patient object. Nothing in the engine mutates, and the contract
treats facts as extracted evidence, but a lane that rewrote a fact array
in-place between calls would see a stale index.

### The prevalence file (P4) — two asks

Against the merged file: 18 usable keys, 0 rejected rows, 1 refused entry. It is
good data and the citations are all there.

**1. `egfr-t790m-resistance` is refused.** Its population is "Acquired resistance
after a first-generation EGFR TKI", which is not a cohort the engine can size, so
it is recorded in `unusable` rather than being misused. Adding one field fixes it:

```json
"conditionalOn": "egfr-mutation"
```

…on any row that is a share rather than a prevalence. That also retires the prose
heuristic currently used to detect the `ex19del` and `L858R` shares (it looks for
"share of" in `population`), which works but is exactly the kind of thing that
breaks when wording changes.

**2. Resistance mutations fall back to the gene-level prior and overstate.**
`NCT07001002 INC-4` asks for `EGFR in [T790M, C797S]`. Neither resolves, so it
falls through to "any EGFR mutation" = 0.1399 — far too high for resistance
mutations in an unselected cohort. The engine says so in `basis` rather than
hiding it, but a cited absolute figure for T790M and C797S would be better.

**On the 0.5 default:** a leaf with no entry gets 0.5, which is the least
informative honest choice and also a hazard — it outranks a cited 0.024, so an
unpriored criterion beats a well-sourced rare one. `fallbackCount()` reports how
many criteria fell back. The more you can prior, the less of the VOI ranking is
invented.

### A note for the eval lane (Codex)

`evaluate()` now takes `priors` and there is `evaluateWithNotes()`. If the eval
harness compares engine output to human labels, run it **without** `priors` unless
the labellers were looking at the same prevalence figures — otherwise the
`pFavorable` column is comparing against numbers the human never saw. Verdicts and
reasons are unaffected either way; priors only touch `pFavorable` and
`expectedValue`.
## From P3 (app) — `npm test` skips every app test

**Who this is for:** P1, who owns the root config.

Root `vitest.config.ts` has `include: ["src/**/*.test.ts"]`, so tests under
`components/**` never run under `npm test`. Please widen it to
`["src/**/*.test.ts", "components/**/*.test.ts"]`. Until then the app lane runs
`npx vitest run -c components/vitest.config.ts`; delete that file once the root
include covers it.

## From P3 (app) — derived read models need fixtures, not engine imports

**Who this is for:** P2 (engine) and P4 (fixtures).

The app may import only `src/contracts` and must render from `fixtures/*.json`,
so it cannot call `sweep()`, `equityAudit()` or `match()` itself. Please ship
their output as fixtures, computed by the engine over the sample cohort:

- `fixtures/elasticity.sample.json` — `{ nctId, criterionId, points: ElasticityPoint[] }`
  per sweepable leaf (the bare `ElasticityPoint[]` has no criterion reference)
- `fixtures/equity.sample.json` — `EquityRow[]`, per trial
- `fixtures/assignment.sample.json` — `Assignment[]`, one per mode
  (`adhoc`, `stable`, `stable_dap`)

Until they land the app uses a hand-written, clearly labelled placeholder in
`app/_data/`.

## From P3 (app) — generation step imports the engine; needs a build hook

**Who this is for:** P1, who owns `package.json` and `docs/CONTRACT.md`.

On instruction, every number the app shows now comes from the engine.
`app/_data/generate.ts` imports `@/src/engine` **read-only** (same terms as
`src/eval` in §10), runs it over `fixtures/`, `data/patients.json` /
`data/synthea/patients.json` when present, and `data/compiled/trials.json`
(compiler `{ trial, sourceText, failure }` wrappers are unwrapped; flagged or
empty trees are dropped per §4). It writes `app/_data/*.json`. The Next app
itself still imports only `src/contracts` and reads those JSON files.
`components/generated.test.ts` fails if the committed JSON drifts from a fresh
engine run, so it cannot be hand-edited.

**Compiled corpus as of this note:** all 300 rows in `data/compiled/trials.json`
are `needsHumanReview: true` with empty `criteria` (compiler schema-recursion
errors). They correctly enter the demo pool as zero trials. The 200 Synthea
patients live at `data/synthea/patients.json`, not `data/patients.json`.

Please:

- amend §10 to list `app/_data/generate.ts` alongside `src/eval` as a permitted
  read-only engine import;
- add to `package.json` scripts:
  `"generate": "vite-node --config vitest.config.ts app/_data/generate.ts"` and
  `"prebuild": "npm run generate"` (vite-node already ships with vitest; no new
  dependency).

## From P2 (engine) — unattended run 2026-09-26: three blockers, one urgent

### 1. URGENT, P1: `data/compiled/trials.json` was overwritten mid-run and is now empty

At 03:33 the file held 300 records, 233 with compiled criteria, 5,103 criteria
total. At 03:55 it was rewritten to 1.5 MB with the envelope
`{ failure, sourceText, trial }`, **every trial has zero criteria and
`needsHumanReview: true`**. A compiler run is failing and has clobbered its own
good output.

`data/compiled/trials.backtranslated.json` (sha `9df33cee`, 03:33) is intact —
300 records, 233 with criteria, 5,105 criteria — and is what every engine report
in this run was computed from. The sha256 of the exact input is recorded in each
report so the numbers can be re-verified.

Two things needed:

1. **Recover `trials.json`.** The 03:55 write looks like a failure path writing
   over the success path rather than beside it.
2. **Commit the compiled trials.** They are currently untracked (`?? data/compiled/`)
   in the `amber-compiler` worktree and exist on no branch, so nothing downstream
   is reproducible and a single bad run destroys the artifact. The engine reports
   in `data/compiled/` are committed and reference an input that is not.

### 2. P1/P4: `data/claims/patients.json` has not landed — task deferred, code ready

The compiler lane recorded `src/claims/**` and `data/claims/**` as an ownership
blocker. The analysis is written, tested and wired anyway:
`claimsCohortEvaluation` in `src/engine/claims.ts`, 18 tests against synthetic
claims-provenance cohorts. The emitter skips itself while the file is absent and
will write `data/claims/evaluation.json` on the first run after it appears:

```bash
AMBER_EMIT=1 npm test -- src/engine/emit.test.ts
```

What it will report: pairs definitively excluded by claims alone, pairs confirmed
eligible (expected at or near zero — that is the finding, not a gap), undetermined
pairs, mean and median unresolved criteria per pair, and every cell by reason. It
checks the provenance mix first and puts a warning in its own headline if the
cohort turns out to carry non-claims facts, because then the figures describe
something other than a claims feed.

### 3. P1: back-translation is flagging every trial

In `trials.backtranslated.json` all 300 records have `needsHumanReview: true`. Per
contract rule 5 that empties the demo pool. The coverage report therefore leads
with all 233 trials that have criteria and reports the demo-pool subset separately;
on the pre-back-translation file the demo pool was 63 trials at 62.3% coverage.
Most flags read `"<ID> sourceSpan near-verbatim"`, which is a citation-fidelity
warning rather than a wrong criterion tree — worth deciding whether it should gate
the demo pool at all.

### 4. P3: two new reports you can render

- `data/compiled/coverage.json` — the answerability gap, with `byPredicate`,
  `byType`, `perTrial` (233 rows, sorted worst-covered first) and a ten-band
  `distribution` for a histogram. Empty bands are kept deliberately: a gap in the
  shape is information.
- `data/compiled/benchmark.json` — throughput, with the machine and input shas.

Both carry a generated `headline` string. Render that rather than recomputing a
percentage in the UI, so the slide and the data cannot drift.

### 5. P1: `data/claims/evaluation.json` now lands in your lane — decide who writes it

CONTRACT §12 (03:55) granted `data/claims/**` to the compiler lane, after I was
asked to emit `data/claims/evaluation.json`. The emitter is written and skips
itself while `data/claims/patients.json` is absent, so **nothing has been written
into your lane and nothing will be until that file exists**. Before it does, pick
one:

- **You run it.** `AMBER_EMIT=1 npm test -- src/engine/emit.test.ts` once the
  cohort is in place. No engine change needed.
- **Grant the one path.** Add `data/claims/evaluation.json` to the engine lane in
  §1 and I will emit it.
- **Move the output.** Say where — `data/compiled/claims-evaluation.json` sits in
  your lane too but keeps the claims cohort and the engine's reading of it apart.

Defaulting to the first, since it needs no contract change.

### 6. On §13 (the 100% eval) — the engine side of that warning

§13 is right and there is an engine-side corollary worth recording. `evaluate()`
now takes `priors`, and the prevalence file only moves `pFavorable` and
`expectedValue` — never a verdict or a reason. So:

- A confusion matrix over verdicts is unaffected by priors. Run it either way.
- Any metric that touches `pFavorable` must state whether priors were wired in,
  because the same pair scores differently. With the cited file a KRAS arm scores
  0.2887 where the compiler had guessed 0.01.

And the class-imbalance point in §13 has a number from this lane: on the real
233-trial pool against the Synthea cohort, **69% of all cells are UNKNOWN**
(14,135,500 of 20,420,000 at the 4,000-patient scale). An accuracy figure over
that distribution is dominated by one class, exactly as §13 says. `cellsByReason`
in the claims report breaks UNKNOWN into `absent`, `stale` and `unsupported`,
which are three different actions and worth reporting separately rather than as
one bar.

## From P2 (engine) — coverage.json is now the single source of truth for answerability

### The published numbers (regenerate, do not recompute)

`data/compiled/coverage.json`, built from the committed corpus at sha256
`2539c315…` (300 records, 233 with criteria, **5,105 criteria**):

| figure | value |
|---|---|
| answerable from claims (lower bound) | **54.4%** |
| upper bound, counting the ambiguous middle | 71.6% |
| inclusions | 45.3% |
| exclusions | 62.4% |
| diagnosis | 99.7% (582 of 584) |
| age · prior_therapy · comorbidity | 100% |
| staging · contraindication · washout · performance_status · lab_value · biomarker | 0% |

### P3: why yours differed, and what to change

Your `components/payer/coverage.ts` reported 54.5% / diagnosis 100% / inclusions
45.4%. After fixing two bugs on my side the gap is down to **exactly two leaves**,
and on those two the engine is right:

- `NCT06660407 INC-5` — "Extracranial lesion ≥ 3 cm", filed under `diagnosis`.
- `NCT06371482 INC-9` — "survival ≥ 6 months", filed under `diagnosis`.

Both are measurements wearing a coded predicate. A claim shows the scan was
billed, not the lesion size, and nobody bills a life expectancy. Classifying by
predicate alone counts them as claims-answerable and overstates coverage.

**The fix:** read `coverage.json` instead of calling `buildClaimsCoverage`. It
carries an `assertions` block for exactly this:

```ts
// fail the build, not the demo, if the app and the report disagree
assert(report.assertions.criteria === 5105);
assert(report.assertions.corpusSha256 === expectedCorpusSha);
```

If you would rather keep computing in the app, import `answerableBy` from
`@/src/engine` rather than reimplementing the predicate sets — it has the
measurement override and a test that it and the evaluation-time ceiling never
diverge. Please do not keep a second copy of the rules either way.

`upperRate` is unchanged at 71.6%, so the two-bound framing on the payer slide
still holds.

### Two bugs this reconciliation found, both now fixed

1. **`indexLeaves` deduplicates by criterion id, and I was counting with it.**
   `NCT07631624` is a two-cohort protocol whose arms were numbered independently,
   so it has two `INC-1` and two `INC-2`. Coverage was reporting 5,103 criteria
   against the true 5,105 — which would have failed the very leaf-count assertion
   this file now asks you to make. Counting now uses `allLeaves`.

2. **The measurement override misfired on demographics.** `NCT05334329 INC-3` is
   `age` with `analyte: "age"`, `unit: "years"`, and was being called
   claims-unanswerable. An enrolment file carries date of birth. The override now
   skips `age`, and skips any analyte that merely restates its predicate.

### P1: duplicate criterion ids are a correctness bug, not a cosmetic one

`duplicateLeafIds()` is exported and `coverage.json` lists the offenders — one
trial today, `NCT07631624`.

This needs fixing upstream because **the engine's roll-up looks cells up by id**.
`evaluate` emits a cell per leaf occurrence, but `eliminatedFromCells` and
`rollUp` read `byId.get(node.id)`, so with a collision both tree positions see
whichever cell was written last and the trial verdict can come out wrong. It is
not wrong for `NCT07631624` as it happens — all four leaves are inclusions that
the hero patient satisfies — but it is luck, not design.

Cheapest correct fix is at compile time: make criterion ids unique within a
trial, e.g. suffix the cohort (`INC-1`, `INC-1b`) or prefix the arm. Until then
the pipeline check I am adding asserts the set is empty and names the trial, so
this fails loudly rather than silently.

### The corpus is committed on `eng/compiler` but not on `main`

`data/compiled/trials.json` exists on `origin/eng/compiler` (blob `b48833c3`,
content sha256 `2539c315`) and on no other branch. Every engine report references
that sha, so until it reaches `main` the numbers are traceable but not
independently reproducible from a clean checkout. Please merge it.

Note also: the sha `189c8b35` I was given does not match anything in the repo or
either worktree. The corpus I used is `2539c315`; if `189c8b35` is a different
run, say so and I will regenerate.

## From P2 (engine) — fidelity review: the compiler's accuracy, measured

`src/verify/` builds and ingests a hand-review of compiled trees against protocol
prose. `data/eval/fidelity-sheet.json` is cut and waiting for a reviewer.

**Why this and not the eval harness.** The eval harness asks whether the engine
evaluates a tree correctly. The engine is deterministic with 791 tests, so that is
close to tautological — it mostly proves the engine agrees with itself. The
unmeasured risk is in the compiler: a protocol that said "A or B" compiling into a
tree demanding both. Every downstream number inherits that silently.

**The sheet:** 77 rows. 37 from the flagged trials, 40 drawn uniformly at random
(seed 20260926) from the 3,764 criteria of the 196 unflagged trials — a 1.1%
sample. Deterministic: same corpus, same seed, same 77 rows, so two reviewers grade
the same sheet.

**To review:** open the file and for each row read `sourceSpans`, then
`compiledPlainEnglish`, then set `faithful` to true or false and put a short phrase
in `failureMode`. `instructions` in the file carries the suggested vocabulary. Then:

```bash
AMBER_EMIT=1 npm test -- src/verify/emit.test.ts   # re-cut the sheet
```

### Three things a reader should know before quoting the number

1. **The two strata are drawn differently, on purpose.** All 37 flagged trials
   contribute one criterion each, chosen *because it looked suspicious*; the
   unflagged 40 are uniform. So "the detector caught X of Y errors" is true of the
   sample and overstates the corpus, because flagged criteria are oversampled about
   90x. `ingestFidelity` reports the sample figures as the headline and a reweighted
   `corpusEstimate` beside them, with a Wilson interval on the base rate — the
   counts are small enough that a normal interval would go negative.

2. **I could not localise the flag, and did not pretend to.** The compiler's
   semantic flag is trial-level and names no criterion. A disjunction-marker
   heuristic matches all 37 flagged trials but also 166 of 196 unflagged ones, so it
   is far looser than whatever the compiler used. Reviewing one criterion per
   flagged trial means that if a trial's real error sits in a criterion I did not
   surface, it counts as a miss — which makes the detector look *worse* than it is,
   not better.

3. **63 of the 100 review-queue entries are not findings.** They are the
   back-translation run's 403 after it exhausted its API credits, written into
   `semanticReasons`. `flaggedTrialIds` filters them out; the genuine flags are the
   37 that read "possible structural alternative has no OR group". P1 may want to
   separate infrastructure failures from semantic findings at the source, because
   anything reading that field naively will report 100 flagged trials.

### What the sheet already shows, before anyone reviews it

Two patterns are visible in the rendered rows and both look like real compiler
defects worth a look regardless of the review:

- **Dropped qualifiers.** `NCT03693014 INC-10`: "Prior palliative **or curative
  radiotherapy** must be completed at least 14 days prior" compiled to "at least 14
  days since the last dose". Both the disjunction and the fact that it is
  *radiotherapy specifically* are gone.
- **Undecomposed prose.** A number of leaves carry a whole protocol sentence as a
  string value or as a bare `true` — `"Women who are pregnant or lactating"` with
  `value: true`. The tree asserts only "that sentence holds", which the engine
  cannot evaluate against any fact. These will read as `flag: "…"` on the sheet.

### Lane note for P1

`src/verify/**` is not assigned in CONTRACT §1. I built it there as directed.
Please record ownership — engine lane is the natural home since it imports
`@/src/engine` and nothing else, but it is your call.
